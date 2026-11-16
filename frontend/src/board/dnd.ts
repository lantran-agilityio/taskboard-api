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

/**
 * `dropIndex()` for elements on the page: the dragged one (`skip`) is left
 * out, and the others' boxes are read along `axis` (x for lists, y for cards
 * and checklist rows). Shared by mouse and touch dragging.
 */
export function indexAmong(
  elements: Iterable<HTMLElement>,
  skip: (element: HTMLElement) => boolean,
  axis: "x" | "y",
  pointer: number,
): number {
  const others: Span[] = [];
  for (const element of elements) {
    if (skip(element)) continue;
    const box = element.getBoundingClientRect();
    others.push(
      axis === "x"
        ? { start: box.left, size: box.width }
        : { start: box.top, size: box.height },
    );
  }
  return dropIndex(others, pointer);
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
