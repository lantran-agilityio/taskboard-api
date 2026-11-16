// Touch dragging in tests. jsdom has no PointerEvent, so Testing Library would
// fall back to a plain Event and drop pointerType and the coordinates; and no
// layout, so the test says what's under the finger (`elementFromPoint`).

import { act, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

import { HOLD_MS } from "../board/touch";

class PointerEventWithType extends MouseEvent {
  pointerType: string;
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "mouse";
    this.pointerId = init.pointerId ?? 1;
  }
}

export function installFakePointer() {
  vi.stubGlobal("PointerEvent", PointerEventWithType);
}

function at(x: number, y: number) {
  return { pointerType: "touch", pointerId: 1, clientX: x, clientY: y };
}

/** One finger. Uses fake timers from `down` to `up`, to hold without waiting. */
export const finger = {
  down(element: Element, x = 0, y = 0) {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.pointerDown(element, at(x, y));
  },
  /** Keeps still long enough to pick the item up. */
  hold() {
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
  },
  /** Moves to (x, y), over `under` (what the page would have there). */
  move(x: number, y: number, under: Element = document.body) {
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => under,
    });
    fireEvent.pointerMove(document.body, at(x, y));
  },
  up(x: number, y: number) {
    fireEvent.pointerUp(document.body, at(x, y));
    vi.useRealTimers();
  },
};
