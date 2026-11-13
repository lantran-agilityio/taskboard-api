import { describe, expect, it } from "vitest";

import { boardData, boardInfo, card, list } from "../test/boardData";
import {
  applyEvent,
  dueState,
  followUp,
  replaceCard,
  type BoardData,
  type BoardEvent,
} from "./model";

function event(type: string, data: object): BoardEvent {
  return { type, board_id: 1, actor_id: 2, data };
}

function shape(data: BoardData): Record<string, number[]> {
  return Object.fromEntries(data.lists.map((l) => [l.name, l.cards.map((c) => c.id)]));
}

const START = boardData([
  list(1, "To do", [
    card(100, 1),
    card(101, 1, { label_ids: [10], assignee_ids: [2] }),
  ]),
  list(2, "Done", [card(200, 2)]),
]);

describe("applyEvent", () => {
  it("merges board changes, keeping the caller's own fields", () => {
    const starred = { ...START, board: boardInfo({ starred: true, role: "editor" }) };

    const next = applyEvent(
      starred,
      event("board.closed", {
        board: { id: 1, name: "Renamed", closed_at: "2026-11-11T00:00:00Z" },
      }),
    );

    expect(next.board).toMatchObject({
      name: "Renamed",
      starred: true,
      role: "editor",
    });
    expect(next.board.closed_at).toBe("2026-11-11T00:00:00Z");
  });

  it("adds a list in board order", () => {
    const next = applyEvent(
      START,
      event("list.created", { list: list(3, "Doing"), list_ids: [1, 3, 2] }),
    );

    expect(Object.keys(shape(next))).toEqual(["To do", "Doing", "Done"]);
  });

  it("renames a list and keeps its cards", () => {
    const next = applyEvent(
      START,
      event("list.updated", {
        list: { ...list(1, "Backlog"), cards: undefined },
        list_ids: [2, 1],
      }),
    );

    expect(shape(next)).toEqual({ Done: [200], Backlog: [100, 101] });
  });

  it.each(["list.archived", "list.deleted"])("drops the list on %s", (type) => {
    const next = applyEvent(START, event(type, { list_id: 1, list_ids: [2] }));

    expect(shape(next)).toEqual({ Done: [200] });
  });

  it("reorders cards after a sort", () => {
    const next = applyEvent(
      START,
      event("list.sorted", { lists: [{ list_id: 1, card_ids: [101, 100] }] }),
    );

    expect(shape(next)["To do"]).toEqual([101, 100]);
  });

  it("adds a card", () => {
    const next = applyEvent(
      START,
      event("card.created", {
        card: card(102, 1),
        lists: [{ list_id: 1, card_ids: [100, 101, 102] }],
      }),
    );

    expect(shape(next)["To do"]).toEqual([100, 101, 102]);
  });

  it("moves a card between lists, with its new details", () => {
    const moved = card(100, 2, { title: "Shipped" });

    const next = applyEvent(
      START,
      event("card.updated", {
        card: moved,
        lists: [
          { list_id: 1, card_ids: [101] },
          { list_id: 2, card_ids: [100, 200] },
        ],
      }),
    );

    expect(shape(next)).toEqual({ "To do": [101], Done: [100, 200] });
    expect(next.lists[1]?.cards[0]?.title).toBe("Shipped");
  });

  it.each([
    ["card.archived", { card: card(100, 1), lists: [{ list_id: 1, card_ids: [101] }] }],
    [
      "card.deleted",
      { card_id: 100, title: "Card 100", lists: [{ list_id: 1, card_ids: [101] }] },
    ],
  ])("drops the card on %s", (type, data) => {
    expect(shape(applyEvent(START, event(type, data)))["To do"]).toEqual([101]);
  });

  it("ignores a card whose list isn't shown (an archived list)", () => {
    const next = applyEvent(
      START,
      event("card.created", {
        card: card(900, 9),
        lists: [{ list_id: 9, card_ids: [900] }],
      }),
    );

    expect(shape(next)).toEqual(shape(START));
  });

  it("is idempotent: the same event twice gives the same board", () => {
    const created = event("card.created", {
      card: card(102, 1),
      lists: [{ list_id: 1, card_ids: [100, 101, 102] }],
    });

    expect(applyEvent(applyEvent(START, created), created)).toEqual(
      applyEvent(START, created),
    );
  });

  it("adds, changes and deletes labels, taking deleted ones off cards", () => {
    let next = applyEvent(
      START,
      event("label.created", {
        label: { id: 12, board_id: 1, name: "UX", color: "blue" },
      }),
    );
    next = applyEvent(
      next,
      event("label.updated", {
        label: { id: 10, board_id: 1, name: "Defect", color: "red" },
      }),
    );
    expect(next.labels.map((l) => l.name)).toEqual(["Defect", "", "UX"]);

    next = applyEvent(next, event("label.deleted", { label_id: 10, name: "Defect" }));

    expect(next.labels.map((l) => l.id)).toEqual([11, 12]);
    expect(next.lists[0]?.cards[1]?.label_ids).toEqual([]);
  });

  it("adds and updates members, and unassigns removed ones", () => {
    let next = applyEvent(
      START,
      event("member.added", {
        member: { user_id: 3, email: "c@x.co", role: "viewer" },
      }),
    );
    next = applyEvent(
      next,
      event("member.updated", {
        member: { user_id: 2, email: "bob@example.com", role: "viewer" },
      }),
    );
    expect(next.members.map((m) => [m.user_id, m.role])).toEqual([
      [1, "owner"],
      [2, "viewer"],
      [3, "viewer"],
    ]);

    next = applyEvent(next, event("member.removed", { user_id: 2 }));

    expect(next.members.map((m) => m.user_id)).toEqual([1, 3]);
    expect(next.lists[0]?.cards[1]?.assignee_ids).toEqual([]);
  });

  it("changes my own role on the board when the event is about me", () => {
    const start = boardData([], { board: boardInfo({ role: "editor" }) });
    const demoted = event("member.updated", {
      member: { user_id: 2, email: "bob@example.com", role: "viewer" },
    });

    // About someone else (I'm 1): my role stays.
    expect(applyEvent(start, demoted, 1).board.role).toBe("editor");
    // About me (I'm 2).
    expect(applyEvent(start, demoted, 2).board.role).toBe("viewer");
  });

  it("leaves the board alone for events it doesn't apply", () => {
    expect(
      applyEvent(START, event("comment.updated", { comment: { card_id: 100 } })),
    ).toBe(START);
  });
});

describe("followUp", () => {
  it.each([
    ["comment.created", { comment: { card_id: 100 } }, { kind: "card", cardId: 100 }],
    ["comment.deleted", { comment_id: 5, card_id: 100 }, { kind: "card", cardId: 100 }],
    [
      "checklist.deleted",
      { card_id: 101, checklist_id: 3 },
      { kind: "card", cardId: 101 },
    ],
    [
      "checklist_item.updated",
      { card_id: 101, item: {} },
      { kind: "card", cardId: 101 },
    ],
    ["list.restored", { list: list(5, "Back"), list_ids: [1, 5] }, { kind: "reload" }],
    ["card.updated", { card: card(100, 1), lists: [] }, null],
  ])("%s → %j", (type, data, expected) => {
    expect(followUp(event(type, data))).toEqual(expected);
  });

  it("replaceCard puts a re-read card in place", () => {
    const next = replaceCard(START, card(101, 1, { comment_count: 3 }));

    expect(next.lists[0]?.cards[1]?.comment_count).toBe(3);
  });
});

describe("dueState", () => {
  const NOW = new Date("2026-11-11T12:00:00Z").getTime();

  it.each([
    [{}, null],
    [{ due_at: "2026-11-10T12:00:00Z" }, "overdue"],
    [{ due_at: "2026-11-10T12:00:00Z", due_complete: true }, "complete"],
    [{ due_at: "2026-11-11T20:00:00Z" }, "soon"],
    [{ due_at: "2026-11-15T12:00:00Z" }, "upcoming"],
    [{ due_complete: true }, null],
  ])("%j is %s", (extra, expected) => {
    expect(dueState(card(1, 1, extra), NOW)).toBe(expected);
  });
});
