import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

import { dropIndex, type Span } from "./dnd";
import { announce, moveId, type Held } from "./reorder";

/**
 * Moving one item of a sequence with the keyboard (D13): Space or Enter on its
 * handle picks it up, the up and down arrows move it (on screen only), Space or
 * Enter drops it, which calls `onDrop` once, and Escape puts it back. Each step
 * is announced through `announcement`, for a polite live region.
 */
export function useReorder({
  ids,
  name,
  onDrop,
}: {
  ids: number[];
  /** What to call an item when announcing it. */
  name: (id: number) => string;
  onDrop: (id: number, index: number) => void;
}) {
  const [held, setHeld] = useState<Held | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Each item's handle, so focus can follow the item as it moves on screen.
  const handles = useRef(new Map<number, HTMLElement>());

  // The order to show: the held item where it's been moved to.
  // (If it was deleted meanwhile, by someone else, the plain order.)
  const order = held && ids.includes(held.id) ? moveId(ids, held.id, held.index) : ids;

  useEffect(() => {
    if (held) handles.current.get(held.id)?.focus();
  }, [held]);

  function onKeyDown(id: number) {
    return (event: KeyboardEvent<HTMLElement>) => {
      const total = ids.length;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (!held) {
          const from = ids.indexOf(id);
          setHeld({ id, from, index: from });
          setAnnouncement(announce("pick", name(id), from, total));
        } else if (held.id === id) {
          setHeld(null);
          setAnnouncement(announce("drop", name(id), held.index, total));
          if (held.index !== held.from) onDrop(id, held.index);
        }
      } else if (
        held?.id === id &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")
      ) {
        event.preventDefault();
        const index = Math.max(
          0,
          Math.min(total - 1, held.index + (event.key === "ArrowUp" ? -1 : 1)),
        );
        setHeld({ ...held, index });
        setAnnouncement(announce("move", name(id), index, total));
      } else if (held?.id === id && event.key === "Escape") {
        // Escape cancels the move here, not the dialog around it.
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        setHeld(null);
        setAnnouncement(announce("cancel", name(id), held.from, total));
      }
    };
  }

  /** Props for an item's handle: its keys and a ref for focus. */
  function handleProps(id: number) {
    return {
      onKeyDown: onKeyDown(id),
      "aria-pressed": held?.id === id,
      ref: (element: HTMLElement | null) => {
        if (element) handles.current.set(id, element);
        else handles.current.delete(id);
      },
    };
  }

  return { order, held, announcement, handleProps };
}

/**
 * Mouse dragging within one vertical sequence, with the browser's own drag and
 * drop (as cards and lists do). Items carry `data-sort-id`; the container
 * works out where the dragged one would land among the others, by their
 * middles (`dropIndex()`), and calls `onDrop` with that 0-based position.
 * Another sequence's drag passes through untouched, so nested sequences (items
 * inside checklists) each handle only their own.
 */
export function useDragSort(onDrop: (id: number, index: number) => void) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  function indexAt(container: HTMLElement, pointer: number): number {
    const others: Span[] = [];
    for (const element of container.querySelectorAll<HTMLElement>(
      ":scope > [data-sort-id]",
    )) {
      if (Number(element.dataset.sortId) === dragId) continue;
      const box = element.getBoundingClientRect();
      others.push({ start: box.top, size: box.height });
    }
    return dropIndex(others, pointer);
  }

  function end() {
    setDragId(null);
    setDropAt(null);
  }

  return {
    dragId,
    dropAt,
    itemProps(id: number) {
      return {
        "data-sort-id": id,
        draggable: true,
        onDragStart: (event: DragEvent<HTMLElement>) => {
          // Only this item, not a sequence it sits inside.
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(id));
          setDragId(id);
        },
        onDragEnd: end,
      };
    },
    containerProps: {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (dragId === null) return;
        event.preventDefault(); // allows the drop
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        setDropAt(indexAt(event.currentTarget, event.clientY));
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (dragId === null) return;
        event.preventDefault();
        event.stopPropagation();
        const index = indexAt(event.currentTarget, event.clientY);
        const id = dragId;
        end();
        onDrop(id, index);
      },
    },
  };
}
