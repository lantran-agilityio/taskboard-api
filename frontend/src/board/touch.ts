// Touch dragging (R-CARD-12, R-LIST-09, R-CHECK-06, D13): when a press
// becomes a pick-up, and how fast to scroll near an edge. Plain functions,
// tested without a browser; useTouchDrag.ts does the events.

/** How long a press must be held before it picks the item up. */
export const HOLD_MS = 400;
/** How far the finger may wander while holding before the press counts as a swipe. */
export const SLOP = 10;
/** How close to a scroller's edge, in pixels, the finger starts scrolling it. */
export const EDGE = 48;
/** The fastest edge scroll, in pixels per frame (at the very edge). */
export const MAX_SPEED = 16;

export interface Point {
  x: number;
  y: number;
}

/** Whether the finger has moved far enough that it's scrolling, not holding. */
export function isSwipe(from: Point, to: Point): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > SLOP;
}

/**
 * How far to scroll along one axis this frame, for a finger at `pointer` in a
 * scroller spanning `start` to `end`: negative near the start, positive near
 * the end, faster the closer it is, and 0 in the middle. A scroller too small
 * to have two edge zones never scrolls this way.
 */
export function edgeSpeed(pointer: number, start: number, end: number): number {
  if (end - start < EDGE * 2) return 0;
  const speed = (depth: number) =>
    Math.ceil(MAX_SPEED * Math.min(1, Math.max(0, depth) / EDGE));
  if (pointer < start + EDGE) return -speed(start + EDGE - pointer);
  if (pointer > end - EDGE) return speed(pointer - (end - EDGE));
  return 0;
}
