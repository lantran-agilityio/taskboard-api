import { describe, expect, it } from "vitest";

import { boardInfo, card, list } from "../test/boardData";
import { isMoved, pickCard, pickList, preview, step, words } from "./boardKeys";
import type { ListWithCards } from "./model";

function lists(): ListWithCards[] {
  return [
    list(1, "To do", [
      card(100, 1, { title: "Brief" }),
      card(101, 1, { title: "Venue" }),
    ]),
    list(2, "Doing", [card(200, 2, { title: "Budget" })]),
    list(3, "Done", []),
  ];
}

describe("step", () => {
  it("moves a card up and down within its list, stopping at the ends", () => {
    const held = pickCard(lists(), 100)!;
    expect(step(lists(), held, "ArrowUp")).toBe(held);
    const down = step(lists(), held, "ArrowDown");
    expect(down).toMatchObject({ list: 1, index: 1 });
    expect(step(lists(), down, "ArrowDown")).toBe(down);
  });

  it("moves a card into the neighbouring list, keeping its place as far as it can", () => {
    const venue = pickCard(lists(), 101)!;
    const doing = step(lists(), venue, "ArrowRight");
    expect(doing).toMatchObject({ list: 2, index: 1 });
    const done = step(lists(), doing, "ArrowRight");
    expect(done).toMatchObject({ list: 3, index: 0 });
    expect(step(lists(), done, "ArrowRight")).toBe(done);
    expect(step(lists(), venue, "ArrowLeft")).toBe(venue);
  });

  it("moves a list left and right only", () => {
    const doing = pickList(lists(), 2)!;
    expect(step(lists(), doing, "ArrowLeft")).toMatchObject({ index: 0 });
    expect(step(lists(), doing, "ArrowUp")).toBe(doing);
    const last = step(lists(), doing, "ArrowRight");
    expect(step(lists(), last, "ArrowRight")).toBe(last);
  });
});

describe("isMoved", () => {
  it("is false until the item has left its place", () => {
    const held = pickCard(lists(), 100)!;
    expect(isMoved(held)).toBe(false);
    expect(isMoved(step(lists(), step(lists(), held, "ArrowRight"), "ArrowLeft"))).toBe(
      false,
    );
    expect(isMoved(step(lists(), held, "ArrowRight"))).toBe(true);
  });
});

describe("preview", () => {
  it("shows the board as it would be after the drop", () => {
    const data = { board: boardInfo(), lists: lists(), labels: [], members: [] };
    const held = step(lists(), pickCard(lists(), 100)!, "ArrowRight");
    const shown = preview(data, held).lists;
    expect(shown[0]!.cards.map((c) => c.title)).toEqual(["Venue"]);
    expect(shown[1]!.cards.map((c) => c.title)).toEqual(["Brief", "Budget"]);
  });
});

describe("words", () => {
  it("names the card's list and counts it among that list's cards", () => {
    const held = pickCard(lists(), 100)!;
    expect(words(lists(), held, "pick")).toMatch(
      /^Picked up Brief, position 1 of 2 in To do\./,
    );
    const moved = step(lists(), held, "ArrowRight");
    expect(words(lists(), moved, "move")).toBe("Brief, position 1 of 2 in Doing.");
    expect(words(lists(), moved, "cancel")).toBe(
      "Cancelled. Brief is back at position 1 of 2 in To do.",
    );
  });

  it("counts a list among the board's lists", () => {
    const held = step(lists(), pickList(lists(), 1)!, "ArrowRight");
    expect(words(lists(), held, "drop")).toBe("Dropped To do at position 2 of 3.");
  });
});
