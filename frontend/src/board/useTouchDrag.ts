import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

import { edgeSpeed, HOLD_MS, isSwipe, type Point } from "./touch";

export interface TouchDragHandlers<T> {
  /** The press became a pick-up. `element` is the one the finger is on. */
  onStart: (item: T, element: HTMLElement) => void;
  /** The finger moved (or the page scrolled under it) while holding. */
  onMove: (item: T, at: Point) => void;
  /** The finger was lifted while holding. */
  onDrop: (item: T, at: Point) => void;
  /** The browser took the touch over (or the item went away) while holding. */
  onCancel: (item: T) => void;
}

/**
 * Touch dragging (D13), with pointer events: a press held for HOLD_MS picks
 * the item up, so a tap still clicks and a swipe still scrolls. While held, a
 * copy of the item follows the finger, the page doesn't scroll under it, and
 * any scroller the finger is near the edge of scrolls. Mouse and pen are left
 * to the browser's own drag and drop. Returns the `onPointerDown` to put on
 * each item: `start(item, event)`.
 */
export function useTouchDrag<T>(handlers: TouchDragHandlers<T>) {
  // The handlers of the latest render, because a drag outlives the render it
  // started in.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  // Ends the press in progress, if any (only one finger drags at a time).
  const active = useRef<(() => void) | null>(null);
  useEffect(() => () => active.current?.(), []);

  return function start(item: T, event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType !== "touch" || active.current) return;
    // Only this item, not one it sits inside.
    event.stopPropagation();
    const element = event.currentTarget;
    const pointerId = event.pointerId;
    const from = { x: event.clientX, y: event.clientY };
    let at = from;
    let held = false;
    let ghost: HTMLElement | null = null;
    let frame = 0;
    const timer = setTimeout(pickUp, HOLD_MS);

    function pickUp() {
      held = true;
      window.getSelection?.()?.removeAllRanges();
      ghost = makeGhost(element);
      latest.current.onStart(item, element);
      scrollLoop();
    }

    function onMove(moved: PointerEvent) {
      if (moved.pointerId !== pointerId) return;
      at = { x: moved.clientX, y: moved.clientY };
      if (!held) {
        if (isSwipe(from, at)) end();
        return;
      }
      if (ghost)
        ghost.style.transform = `translate(${at.x - from.x}px, ${at.y - from.y}px)`;
      latest.current.onMove(item, at);
    }

    function onUp(up: PointerEvent) {
      if (up.pointerId !== pointerId) return;
      if (held) {
        at = { x: up.clientX, y: up.clientY };
        latest.current.onDrop(item, at);
        swallowNextClick();
      }
      end();
    }

    function onCancel(cancelled: PointerEvent) {
      if (cancelled.pointerId !== pointerId) return;
      if (held) latest.current.onCancel(item);
      end();
    }

    // While held, the finger moves the item, not the page.
    function noScroll(touch: TouchEvent) {
      if (held) touch.preventDefault();
    }
    // A long press would otherwise open the browser's menu for a link or text.
    function noMenu(menu: Event) {
      menu.preventDefault();
    }

    function scrollLoop() {
      if (typeof requestAnimationFrame !== "function") return;
      frame = requestAnimationFrame(() => {
        // Scrolling moves the page under a still finger: where it lands changes.
        if (scrollNear(at)) latest.current.onMove(item, at);
        scrollLoop();
      });
    }

    function end() {
      clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
      ghost?.remove();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", noScroll);
      window.removeEventListener("contextmenu", noMenu);
      active.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    // Not passive, or preventDefault() couldn't stop the scroll.
    window.addEventListener("touchmove", noScroll, { passive: false });
    window.addEventListener("contextmenu", noMenu);
    active.current = end;
  };
}

/**
 * A copy of the item (the whole card, list or checklist row, not just the
 * part pressed) laid over the page where it is, for the finger to carry.
 */
function makeGhost(element: HTMLElement): HTMLElement {
  const source =
    element.closest<HTMLElement>("[data-card], [data-list], [data-sort-id]") ?? element;
  const box = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.classList.add("touch-ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.style.left = `${box.left}px`;
  ghost.style.top = `${box.top}px`;
  ghost.style.width = `${box.width}px`;
  document.body.append(ghost);
  return ghost;
}

/**
 * Scrolls whatever the finger is near the edge of: the innermost scroller
 * under it for each axis (a list's cards, then the lanes, then the page).
 * Returns whether anything moved.
 */
function scrollNear(at: Point): boolean {
  const under = document.elementFromPoint?.(at.x, at.y) ?? null;
  let doneX = false;
  let doneY = false;
  for (let element = under; element; element = element.parentElement) {
    const page = element === document.scrollingElement;
    const style = getComputedStyle(element);
    const box = page
      ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
      : element.getBoundingClientRect();
    if (!doneX && (page || /auto|scroll/.test(style.overflowX))) {
      const before = element.scrollLeft;
      element.scrollLeft += edgeSpeed(at.x, box.left, box.right);
      doneX = element.scrollLeft !== before;
    }
    if (!doneY && (page || /auto|scroll/.test(style.overflowY))) {
      const before = element.scrollTop;
      element.scrollTop += edgeSpeed(at.y, box.top, box.bottom);
      doneY = element.scrollTop !== before;
    }
  }
  return doneX || doneY;
}

/**
 * Lifting the finger after a drag can still send a click to what's under it
 * (a card's link would open): the next one, within a moment, is dropped.
 */
function swallowNextClick() {
  const swallow = (click: MouseEvent) => {
    click.preventDefault();
    click.stopPropagation();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(
    () => window.removeEventListener("click", swallow, { capture: true }),
    500,
  );
}
