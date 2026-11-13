// Reordering one sequence (a card's checklists, a checklist's items): the new
// order and positions, and what to announce at each step of a keyboard move
// (R-CHECK-06, D13). Plain functions, tested without a browser.

/** The ids with `id` taken out and put back at `index` (clamped to the ends). */
export function moveId(ids: number[], id: number, index: number): number[] {
  const rest = ids.filter((other) => other !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** The things in their new order, with positions 0..n-1 again, as the API keeps them. */
export function moveTo<T extends { id: number; position: number }>(
  things: T[],
  id: number,
  index: number,
): T[] {
  const byId = new Map(things.map((thing) => [thing.id, thing]));
  return moveId(
    things.map((thing) => thing.id),
    id,
    index,
  ).map((thingId, position) => ({ ...byId.get(thingId)!, position }));
}

/**
 * Where a move among the visible items lands in the full sequence, when some
 * are hidden (ticked items, R-CHECK-03): just before the visible item it was
 * dropped in front of, or just after the last visible one. With nothing
 * hidden it's `index` itself.
 */
export function fullIndex(
  allIds: number[],
  visibleIds: number[],
  id: number,
  index: number,
): number {
  const shownOthers = visibleIds.filter((other) => other !== id);
  const allOthers = allIds.filter((other) => other !== id);
  const before = shownOthers[index];
  if (before !== undefined) return allOthers.indexOf(before);
  const last = shownOthers.at(-1);
  return last === undefined ? allOthers.length : allOthers.indexOf(last) + 1;
}

/** A keyboard move in progress: what's held, where it started and where it is now. */
export interface Held {
  id: number;
  from: number;
  index: number;
}

export type Step = "pick" | "move" | "drop" | "cancel";

/** What a screen reader hears at each step; positions are counted from 1. */
export function announce(
  step: Step,
  name: string,
  index: number,
  total: number,
): string {
  const at = `position ${index + 1} of ${total}`;
  switch (step) {
    case "pick":
      return `Picked up ${name}, ${at}. Use the up and down arrows to move it, Space to drop it, Escape to cancel.`;
    case "move":
      return `${name}, ${at}.`;
    case "drop":
      return `Dropped ${name} at ${at}.`;
    case "cancel":
      return `Cancelled. ${name} is back at ${at}.`;
  }
}
