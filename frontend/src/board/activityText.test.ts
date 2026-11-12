import { describe as group, expect, it } from "vitest";

import type { ActivityEntry } from "../api/comments";
import { card, LABELS, list, MEMBERS } from "../test/boardData";
import { describe, dueWords, previousStates, type Context } from "./activityText";

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
    expect(states.get(item.id)).toEqual(BASE);
    expect(states.get(moved.id)).toEqual(BASE);
  });
});
