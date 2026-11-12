import { describe, expect, it } from "vitest";

import { boardData, card, list } from "../test/boardData";
import {
  addCard,
  addList,
  changeCard,
  moveCard,
  moveList,
  removeCard,
  removeList,
  renameList,
  setCards,
} from "./edits";
import type { BoardData } from "./model";

const START = boardData([
  list(1, "A", [card(10, 1), card(11, 1), card(12, 1)]),
  list(2, "B", [card(20, 2)]),
  list(3, "C"),
]);

function shape(data: BoardData): Record<string, number[]> {
  return Object.fromEntries(data.lists.map((l) => [l.name, l.cards.map((c) => c.id)]));
}

describe("local edits", () => {
  it("moves a list", () => {
    expect(Object.keys(shape(moveList(START, 3, 0)))).toEqual(["C", "A", "B"]);
    expect(Object.keys(shape(moveList(START, 1, 2)))).toEqual(["B", "C", "A"]);
  });

  it("moves a card within its list", () => {
    expect(shape(moveCard(START, 10, 1, 2)).A).toEqual([11, 12, 10]);
    expect(shape(moveCard(START, 12, 1, 0)).A).toEqual([12, 10, 11]);
  });

  it("moves a card to another list, which may be empty", () => {
    const next = moveCard(START, 11, 2, 0);

    expect(shape(next)).toEqual({ A: [10, 12], B: [11, 20], C: [] });
    expect(next.lists[1]?.cards[0]?.list_id).toBe(2);
    expect(shape(moveCard(START, 11, 3, 5)).C).toEqual([11]);
  });

  it("leaves the board alone for unknown ids", () => {
    expect(moveCard(START, 99, 2, 0)).toBe(START);
    expect(moveCard(START, 10, 99, 0)).toBe(START);
    expect(moveList(START, 99, 0)).toBe(START);
  });

  it("renames a list and changes a card", () => {
    expect(renameList(START, 2, "Done").lists[1]?.name).toBe("Done");
    expect(
      changeCard(START, 20, { due_complete: true }).lists[1]?.cards[0]?.due_complete,
    ).toBe(true);
  });

  it("removes a list or a card", () => {
    expect(Object.keys(shape(removeList(START, 1)))).toEqual(["B", "C"]);
    expect(shape(removeCard(START, 11)).A).toEqual([10, 12]);
  });

  it("adds a list or a card at the end, once", () => {
    const withList = addList(START, list(4, "D"));
    expect(Object.keys(shape(withList))).toEqual(["A", "B", "C", "D"]);
    expect(addList(withList, list(4, "D"))).toBe(withList);

    const withCard = addCard(START, card(13, 1));
    expect(shape(withCard).A).toEqual([10, 11, 12, 13]);
    expect(addCard(withCard, card(13, 1))).toBe(withCard);
  });

  it("sets a list's cards after a sort", () => {
    expect(
      shape(setCards(START, 1, [card(12, 1), card(10, 1), card(11, 1)])).A,
    ).toEqual([12, 10, 11]);
  });
});
