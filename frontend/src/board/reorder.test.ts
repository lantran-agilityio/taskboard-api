import { describe, expect, it } from "vitest";

import { announce, fullIndex, moveId, moveTo } from "./reorder";

describe("moveId", () => {
  it("puts the id at the index among the others, clamped to the ends", () => {
    expect(moveId([1, 2, 3, 4], 4, 0)).toEqual([4, 1, 2, 3]);
    expect(moveId([1, 2, 3, 4], 1, 2)).toEqual([2, 3, 1, 4]);
    expect(moveId([1, 2, 3], 2, 9)).toEqual([1, 3, 2]);
    expect(moveId([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
  });
});

describe("moveTo", () => {
  it("reorders and renumbers positions from 0", () => {
    const things = [
      { id: 1, position: 0 },
      { id: 2, position: 1 },
      { id: 3, position: 2 },
    ];
    expect(moveTo(things, 3, 0)).toEqual([
      { id: 3, position: 0 },
      { id: 1, position: 1 },
      { id: 2, position: 2 },
    ]);
  });
});

describe("fullIndex", () => {
  const all = [1, 2, 3, 4, 5];

  it("is the index itself when nothing is hidden", () => {
    expect(fullIndex(all, all, 5, 1)).toBe(1);
  });

  it("lands before the visible item it was dropped in front of", () => {
    // 2 and 3 are hidden; 5 is dropped in front of 4.
    expect(fullIndex(all, [1, 4, 5], 5, 1)).toBe(3);
  });

  it("lands after the last visible item when dropped at the end", () => {
    expect(fullIndex(all, [1, 4, 5], 1, 2)).toBe(4);
    expect(fullIndex([1, 2], [1], 1, 0)).toBe(1);
  });
});

describe("announce", () => {
  it("counts positions from 1", () => {
    expect(announce("move", "Close-up", 0, 3)).toBe("Close-up, position 1 of 3.");
    expect(announce("drop", "Close-up", 2, 3)).toBe(
      "Dropped Close-up at position 3 of 3.",
    );
    expect(announce("cancel", "Close-up", 1, 3)).toBe(
      "Cancelled. Close-up is back at position 2 of 3.",
    );
    expect(announce("pick", "Close-up", 1, 3)).toMatch(
      /^Picked up Close-up, position 2 of 3\./,
    );
  });
});
