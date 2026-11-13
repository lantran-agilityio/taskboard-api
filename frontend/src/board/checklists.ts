import type { Checklist, ChecklistItem } from "../api/checklists";
import type { BoardEvent } from "./model";

// A card's checklists as the dialog shows them, and pure ways to change them.
// Events carry the new state (and the new order), so applying one twice, or
// after the API's own answer, gives the same checklists.

function byIds<T extends { id: number }>(things: T[], ids: number[] | undefined): T[] {
  if (!ids) return things;
  const index = new Map(ids.map((id, position) => [id, position]));
  return things
    .filter((thing) => index.has(thing.id))
    .sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
}

/** Puts a checklist in (or replaces it); `order` is the card's checklist ids. */
export function putChecklist(
  checklists: Checklist[],
  checklist: Checklist,
  order?: number[],
): Checklist[] {
  const others = checklists.filter((other) => other.id !== checklist.id);
  const next = [...others, checklist];
  return order ? byIds(next, order) : next.sort((a, b) => a.position - b.position);
}

export function removeChecklist(checklists: Checklist[], id: number): Checklist[] {
  return checklists.filter((checklist) => checklist.id !== id);
}

/** Puts an item into its checklist (or replaces it); `order` is the checklist's item ids. */
export function putItem(
  checklists: Checklist[],
  item: ChecklistItem,
  order?: number[],
): Checklist[] {
  return checklists.map((checklist) => {
    if (checklist.id !== item.checklist_id) return checklist;
    const next = [...checklist.items.filter((other) => other.id !== item.id), item];
    return {
      ...checklist,
      items: order ? byIds(next, order) : next.sort((a, b) => a.position - b.position),
    };
  });
}

export function changeItem(
  checklists: Checklist[],
  itemId: number,
  change: Partial<ChecklistItem>,
): Checklist[] {
  return checklists.map((checklist) => ({
    ...checklist,
    items: checklist.items.map((item) =>
      item.id === itemId ? { ...item, ...change } : item,
    ),
  }));
}

export function removeItem(checklists: Checklist[], itemId: number): Checklist[] {
  return checklists.map((checklist) => ({
    ...checklist,
    items: checklist.items.filter((item) => item.id !== itemId),
  }));
}

/** A checklist or checklist item event, applied to one card's checklists. */
export function applyChecklistEvent(
  checklists: Checklist[],
  event: BoardEvent,
): Checklist[] {
  const d = event.data;
  switch (event.type) {
    case "checklist.created":
    case "checklist.updated":
      return putChecklist(checklists, d.checklist, d.checklist_ids);
    case "checklist.deleted":
      return byIds(removeChecklist(checklists, d.checklist_id), d.checklist_ids);
    case "checklist_item.created":
    case "checklist_item.updated":
      return putItem(checklists, d.item, d.item_ids);
    case "checklist_item.deleted":
      return removeItem(checklists, d.item_id);
    default:
      return checklists;
  }
}

/** Done and total items, and the whole percentage (0 for an empty checklist). */
export function progress(checklist: Checklist): {
  done: number;
  total: number;
  percent: number;
} {
  const total = checklist.items.length;
  const done = checklist.items.filter((item) => item.done).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}
