// Moving cards and lists with the keyboard (R-CARD-13, R-LIST-09, D13). The
// board page holds one of these while something is picked up, shows the board
// as it would be (`preview`), and saves only on the drop. Plain functions,
// tested without a browser.

import * as local from "./edits";
import type { BoardData, ListWithCards } from "./model";
import { announce, type Step } from "./reorder";

export type BoardHeld =
  | {
      kind: "card";
      id: number;
      fromList: number;
      fromIndex: number;
      /** Where it is now: a list and a 0-based position among that list's other cards. */
      list: number;
      index: number;
    }
  | { kind: "list"; id: number; from: number; index: number };

export function pickCard(lists: ListWithCards[], cardId: number): BoardHeld | null {
  for (const list of lists) {
    const index = list.cards.findIndex((card) => card.id === cardId);
    if (index >= 0) {
      return {
        kind: "card",
        id: cardId,
        fromList: list.id,
        fromIndex: index,
        list: list.id,
        index,
      };
    }
  }
  return null;
}

export function pickList(lists: ListWithCards[], listId: number): BoardHeld | null {
  const index = lists.findIndex((list) => list.id === listId);
  return index < 0 ? null : { kind: "list", id: listId, from: index, index };
}

/** The other cards in a list: where a held card can go is 0..their count. */
function othersIn(lists: ListWithCards[], listId: number, cardId: number): number {
  return (
    lists.find((list) => list.id === listId)?.cards.filter((c) => c.id !== cardId)
      .length ?? 0
  );
}

/**
 * One arrow key. A card goes up and down within its list, and left and right
 * into the neighbouring list, keeping its place as far as the list allows. A
 * list goes left and right. Anything else, or a move past an end, changes nothing.
 */
export function step(lists: ListWithCards[], held: BoardHeld, key: string): BoardHeld {
  if (held.kind === "list") {
    const by = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
    const index = Math.max(0, Math.min(lists.length - 1, held.index + by));
    return index === held.index ? held : { ...held, index };
  }
  if (key === "ArrowUp" || key === "ArrowDown") {
    const last = othersIn(lists, held.list, held.id);
    const index = Math.max(
      0,
      Math.min(last, held.index + (key === "ArrowUp" ? -1 : 1)),
    );
    return index === held.index ? held : { ...held, index };
  }
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const at = lists.findIndex((list) => list.id === held.list);
    const next = lists[at + (key === "ArrowLeft" ? -1 : 1)];
    if (!next) return held;
    return {
      ...held,
      list: next.id,
      index: Math.min(held.index, othersIn(lists, next.id, held.id)),
    };
  }
  return held;
}

/** Whether dropping now changes anything (so needs a request). */
export function isMoved(held: BoardHeld): boolean {
  return held.kind === "list"
    ? held.index !== held.from
    : held.list !== held.fromList || held.index !== held.fromIndex;
}

/** The board as it would be if the held thing were dropped now. */
export function preview(data: BoardData, held: BoardHeld): BoardData {
  return held.kind === "list"
    ? local.moveList(data, held.id, held.index)
    : local.moveCard(data, held.id, held.list, held.index);
}

/** What to announce for a step, from the board as it is (not the preview). */
export function words(lists: ListWithCards[], held: BoardHeld, at: Step): string {
  const back = at === "cancel";
  if (held.kind === "list") {
    const name = lists.find((list) => list.id === held.id)?.name ?? "";
    return announce(at, name, back ? held.from : held.index, lists.length);
  }
  const title =
    lists.flatMap((list) => list.cards).find((card) => card.id === held.id)?.title ??
    "";
  const listId = back ? held.fromList : held.list;
  const listName = lists.find((list) => list.id === listId)?.name ?? "";
  return announce(
    at,
    title,
    back ? held.fromIndex : held.index,
    othersIn(lists, listId, held.id) + 1,
    listName,
  );
}
