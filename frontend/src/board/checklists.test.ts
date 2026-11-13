import { describe, expect, it } from "vitest";

import type { Checklist, ChecklistItem } from "../api/checklists";
import { applyChecklistEvent, progress } from "./checklists";
import type { BoardEvent } from "./model";

function item(
  id: number,
  checklistId: number,
  done = false,
  position = 0,
): ChecklistItem {
  return {
    id,
    checklist_id: checklistId,
    text: `Item ${id}`,
    done,
    position,
    created_at: "2026-11-13T00:00:00Z",
  };
}

function checklist(id: number, items: ChecklistItem[] = [], position = 0): Checklist {
  return {
    id,
    card_id: 100,
    title: `List ${id}`,
    position,
    created_at: "2026-11-13T00:00:00Z",
    items,
  };
}

function event(type: string, data: object): BoardEvent {
  return { type, board_id: 1, actor_id: 2, data: { card_id: 100, ...data } };
}

describe("applyChecklistEvent", () => {
  it("adds a checklist, in the event's order, and twice is the same as once", () => {
    const start = [checklist(1)];
    const created = event("checklist.created", {
      checklist: checklist(2, [], 1),
      checklist_ids: [1, 2],
    });
    const once = applyChecklistEvent(start, created);
    expect(once.map((one) => one.id)).toEqual([1, 2]);
    expect(applyChecklistEvent(once, created)).toEqual(once);
  });

  it("renames or moves a checklist", () => {
    const start = [checklist(1), checklist(2, [], 1)];
    const moved = applyChecklistEvent(
      start,
      event("checklist.updated", {
        checklist: { ...checklist(2), title: "Renamed" },
        checklist_ids: [2, 1],
      }),
    );
    expect(moved.map((one) => one.title)).toEqual(["Renamed", "List 1"]);
  });

  it("removes a deleted checklist", () => {
    const start = [checklist(1), checklist(2, [], 1)];
    const after = applyChecklistEvent(
      start,
      event("checklist.deleted", {
        checklist_id: 1,
        title: "List 1",
        checklist_ids: [2],
      }),
    );
    expect(after.map((one) => one.id)).toEqual([2]);
  });

  it("adds, ticks and deletes items", () => {
    let lists = [checklist(1, [item(10, 1)])];
    lists = applyChecklistEvent(
      lists,
      event("checklist_item.created", {
        item: item(11, 1, false, 1),
        item_ids: [10, 11],
      }),
    );
    lists = applyChecklistEvent(
      lists,
      event("checklist_item.updated", { item: item(10, 1, true), item_ids: [10, 11] }),
    );
    expect(lists[0]?.items.map((one) => [one.id, one.done])).toEqual([
      [10, true],
      [11, false],
    ]);
    lists = applyChecklistEvent(
      lists,
      event("checklist_item.deleted", { checklist_id: 1, item_id: 10, item_ids: [11] }),
    );
    expect(lists[0]?.items.map((one) => one.id)).toEqual([11]);
  });

  it("ignores other events", () => {
    const start = [checklist(1)];
    expect(applyChecklistEvent(start, event("card.updated", {}))).toBe(start);
  });
});

describe("progress", () => {
  it("rounds the percentage, and is 0 for an empty checklist", () => {
    expect(progress(checklist(1))).toEqual({ done: 0, total: 0, percent: 0 });
    expect(progress(checklist(1, [item(1, 1, true), item(2, 1), item(3, 1)]))).toEqual({
      done: 1,
      total: 3,
      percent: 33,
    });
  });
});
