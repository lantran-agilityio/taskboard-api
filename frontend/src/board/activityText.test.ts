import { describe as group, expect, it } from "vitest";

import type { ActivityEntry } from "../api/comments";
import { card, LABELS, list, MEMBERS } from "../test/boardData";
import {
  describe,
  dueWords,
  listsWithHistory,
  plainExcerpt,
  previousStates,
  type Context,
} from "./activityText";
import { boardInfo } from "../test/boardData";

const CONTEXT: Context = {
  lists: [list(1, "To do"), list(2, "Doing")],
  labels: LABELS,
  members: MEMBERS,
  myId: 1,
};

let nextId = 1;
function entry(type: string, data: object): ActivityEntry {
  return { id: nextId++, type, actor_id: 2, data, created_at: "2026-11-12T08:00:00Z" };
}

const BASE = card(100, 1, { title: "Brief", position: 0 });

function updated(change: object) {
  return describe(
    entry("card.updated", { card: { ...BASE, ...change } }),
    BASE,
    CONTEXT,
  );
}

group("describe", () => {
  it.each([
    [{ list_id: 2 }, "moved this card from To do to Doing"],
    [{ position: 3 }, "moved this card within To do"],
    [{ title: "Plan" }, "renamed this card from “Brief” to “Plan”"],
    [{ due_complete: true }, "marked this card done"],
    [
      { due_at: "2026-11-20T10:00:00Z" },
      `set the due date to ${dueWords("2026-11-20T10:00:00Z")}`,
    ],
    [{ description: "Why" }, "changed the description"],
    [{ label_ids: [10] }, "added the label “Bug”"],
    [{ label_ids: [11] }, "added the green label"],
    [{ assignee_ids: [1] }, "joined this card"],
    [{ assignee_ids: [2] }, "added bob@example.com to this card"],
    [
      { list_id: 2, due_complete: true },
      "moved this card from To do to Doing, marked this card done",
    ],
  ])("an update of %j reads %j", (change, words) => {
    expect(updated(change)).toBe(words);
  });

  it("says what was removed", () => {
    const before = {
      ...BASE,
      label_ids: [10],
      assignee_ids: [1, 2],
      due_at: "2026-11-20T10:00:00Z",
    };
    const after = { ...BASE };

    expect(describe(entry("card.updated", { card: after }), before, CONTEXT)).toBe(
      "removed the due date, removed the label “Bug”, left this card, removed bob@example.com from this card",
    );
  });

  it("falls back when there's nothing to compare with", () => {
    expect(describe(entry("card.updated", { card: BASE }), null, CONTEXT)).toBe(
      "updated this card",
    );
  });

  it.each([
    ["card.created", { card: BASE }, "added this card to To do"],
    [
      "card.created",
      { card: { ...BASE, list_id: 9 } },
      "added this card to an archived list",
    ],
    ["card.archived", { card: BASE }, "archived this card"],
    ["card.restored", { card: BASE }, "sent this card to the board"],
    [
      "checklist.created",
      { card_id: 100, checklist: { title: "Launch" } },
      "added the checklist “Launch”",
    ],
    [
      "checklist.deleted",
      { card_id: 100, title: "Launch" },
      "deleted the checklist “Launch”",
    ],
    [
      "checklist_item.created",
      { card_id: 100, item: { text: "Goals", done: false } },
      "added “Goals” to a checklist",
    ],
    [
      "checklist_item.updated",
      { card_id: 100, item: { text: "Goals", done: true } },
      "completed “Goals”",
    ],
    [
      "checklist_item.deleted",
      { card_id: 100, text: "Goals" },
      "deleted “Goals” from a checklist",
    ],
  ])("%s reads %j", (type, data, words) => {
    expect(describe(entry(type, data), null, CONTEXT)).toBe(words);
  });
});

group("previousStates", () => {
  it("gives each entry the card as the entry before it left it", () => {
    const created = entry("card.created", { card: BASE });
    const item = entry("checklist_item.created", { card_id: 100, item: { text: "x" } });
    const moved = entry("card.updated", { card: { ...BASE, list_id: 2 } });
    // Newest first, as the API pages them.
    const states = previousStates([moved, item, created]);

    expect(states.get(created.id)).toBeNull();
    // A checklist item isn't the card: it has no previous card state.
    expect(states.get(item.id)).toBeNull();
    expect(states.get(moved.id)).toEqual(BASE);
  });

  it("starts a board's history at its creation, so its first rename has the old name", () => {
    const created = entry("board.created", { board: { name: "Launch" } });
    const renamed = entry("board.updated", { board: { name: "Big launch" } });

    expect(previousStates([renamed, created]).get(renamed.id)).toEqual({
      name: "Launch",
    });
  });
});

group("the board's log", () => {
  const BOARD_CONTEXT: Context = { ...CONTEXT, cardTitles: new Map([[100, "Brief"]]) };

  function board(type: string, data: object, previous: unknown = null, actor = 2) {
    return describe(
      { id: nextId++, type, actor_id: actor, data, created_at: "2026-11-12T08:00:00Z" },
      previous,
      BOARD_CONTEXT,
      "board",
    );
  }

  it.each([
    ["card.created", { card: BASE }, null, "added “Brief” to To do"],
    [
      "card.updated",
      { card: { ...BASE, list_id: 2 } },
      BASE,
      "moved “Brief” from To do to Doing",
    ],
    [
      "card.updated",
      { card: { ...BASE, title: "Plan" } },
      BASE,
      "renamed the card “Brief” to “Plan”",
    ],
    [
      "card.updated",
      { card: { ...BASE, label_ids: [10] } },
      BASE,
      "added the label “Bug” to “Brief”",
    ],
    ["card.updated", { card: { ...BASE, assignee_ids: [1] } }, BASE, "joined “Brief”"],
    ["card.archived", { card: BASE }, null, "archived “Brief”"],
    ["card.deleted", { card_id: 100, title: "Brief" }, null, "deleted “Brief”"],
    [
      "comment.created",
      { comment: { card_id: 100, body: "Looks  **good**" } },
      null,
      "commented on “Brief”: Looks good",
    ],
    [
      "comment.deleted",
      { comment_id: 5, card_id: 999 },
      null,
      "deleted a comment on a card",
    ],
    [
      "checklist.created",
      { card_id: 100, checklist: { title: "Launch" } },
      null,
      "added the checklist “Launch” to “Brief”",
    ],
    ["list.created", { list: list(3, "Later") }, null, "added the list “Later”"],
    [
      "list.updated",
      { list: list(1, "Backlog") },
      list(1, "To do"),
      "renamed the list “To do” to “Backlog”",
    ],
    ["list.archived", { list: list(1, "To do") }, null, "archived the list “To do”"],
    ["list.deleted", { list_id: 1, name: "To do" }, null, "deleted the list “To do”"],
    [
      "list.sorted",
      { list: list(1, "To do"), by: "title" },
      null,
      "sorted the cards in “To do”",
    ],
    [
      "label.created",
      { label: { id: 12, name: "UX", color: "blue" } },
      null,
      "created the label “UX”",
    ],
    [
      "label.updated",
      { label: { id: 10, name: "Defect", color: "red" } },
      { id: 10, name: "Bug", color: "red" },
      "renamed the label “Bug” to “Defect”",
    ],
    ["label.deleted", { label_id: 10, name: "" }, null, "deleted the label “unnamed”"],
    [
      "member.added",
      { member: { user_id: 3, email: "c@x.co", role: "viewer" } },
      null,
      "added c@x.co to the board as viewer",
    ],
    [
      "member.updated",
      { member: { user_id: 3, email: "c@x.co", role: "editor" } },
      null,
      "made c@x.co an editor",
    ],
    [
      "member.removed",
      { user_id: 1 },
      null,
      "removed alice@example.com from the board",
    ],
    [
      "board.updated",
      { board: { name: "Big launch" } },
      boardInfo(),
      "renamed the board from “Launch” to “Big launch”",
    ],
    [
      "board.updated",
      { board: { ...boardInfo(), description: "Why" } },
      boardInfo(),
      "changed the board's description",
    ],
    ["board.created", { board: boardInfo() }, null, "created the board"],
    ["board.closed", { board: boardInfo() }, null, "closed the board"],
    ["board.reopened", { board: boardInfo() }, null, "reopened the board"],
  ])("%s reads %j", (type, data, previous, words) => {
    expect(board(type, data, previous)).toBe(words);
  });

  it("says someone left when they removed themselves", () => {
    expect(board("member.removed", { user_id: 2 }, null, 2)).toBe("left the board");
  });

  it("keeps each card's and list's previous state apart", () => {
    const first = {
      id: 1,
      type: "card.created",
      actor_id: 2,
      created_at: "",
      data: { card: BASE },
    };
    const other = {
      id: 2,
      type: "card.created",
      actor_id: 2,
      created_at: "",
      data: { card: card(101, 1) },
    };
    const listMade = {
      id: 3,
      type: "list.created",
      actor_id: 2,
      created_at: "",
      data: { list: list(5, "A") },
    };
    const moved = {
      id: 4,
      type: "card.updated",
      actor_id: 2,
      created_at: "",
      data: { card: { ...BASE, list_id: 2 } },
    };
    const renamed = {
      id: 5,
      type: "list.updated",
      actor_id: 2,
      created_at: "",
      data: { list: list(5, "B") },
    };

    const states = previousStates([renamed, moved, listMade, other, first]);

    expect(states.get(4)).toEqual(BASE);
    expect(states.get(5)).toEqual(list(5, "A"));
    expect(states.get(2)).toBeNull();
  });
});

group("plainExcerpt", () => {
  it.each([
    ["Draft is **ready**", "Draft is ready"],
    ["_soft_ and `code`", "soft and code"],
    ["see [the sheet](https://example.com)", "see the sheet"],
    ["- one\n- two", "one two"],
    ["# Title\n\ntext", "Title text"],
  ])("%j reads %j", (input, plain) => {
    expect(plainExcerpt(input)).toBe(plain);
  });

  it("shortens long text", () => {
    expect(plainExcerpt("x".repeat(200), 10)).toBe(`${"x".repeat(9)}…`);
  });
});

group("listsWithHistory", () => {
  it("names archived lists from the log, keeping the board's own lists", () => {
    const entries = [
      {
        id: 2,
        type: "list.archived",
        actor_id: 1,
        created_at: "",
        data: { list: list(5, "Someday") },
      },
      {
        id: 1,
        type: "list.created",
        actor_id: 1,
        created_at: "",
        data: { list: list(5, "Later") },
      },
    ];

    const lists = listsWithHistory([list(1, "To do")], entries);

    expect(lists.map((item) => [item.id, item.name])).toEqual([
      [1, "To do"],
      [5, "Someday"],
    ]);
  });
});
