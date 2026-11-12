// Where a dragged list or card lands, from the pointer and the items' boxes.
// Plain functions, so the maths is tested without a browser.

export interface Span {
  start: number; // left (lists) or top (cards)
  size: number; // width or height
}

/**
 * The 0-based position the dragged item would take among the others. Pass
 * the spans of the other items (not the dragged one), in order: the item goes
 * before the first one whose middle is past the pointer.
 */
export function dropIndex(others: Span[], pointer: number): number {
  const index = others.findIndex((span) => pointer < span.start + span.size / 2);
  return index === -1 ? others.length : index;
}

/** A position that changes nothing (the same list, the same place) needs no request. */
export function isNoMove(
  fromList: number,
  fromIndex: number,
  toList: number,
  toIndex: number,
): boolean {
  return fromList === toList && fromIndex === toIndex;
}
