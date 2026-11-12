import { describe, expect, it } from "vitest";

import { dropIndex, isNoMove } from "./dnd";

// Three cards, 40px tall with 8px gaps: middles at 20, 68 and 116.
const CARDS = [
  { start: 0, size: 40 },
  { start: 48, size: 40 },
  { start: 96, size: 40 },
];

describe("dropIndex", () => {
  it.each([
    [5, 0],
    [19, 0],
    [21, 1],
    [70, 2],
    [117, 3],
    [500, 3],
  ])("pointer at %i lands at %i", (pointer, index) => {
    expect(dropIndex(CARDS, pointer)).toBe(index);
  });

  it("drops into an empty list at 0", () => {
    expect(dropIndex([], 300)).toBe(0);
  });
});

describe("isNoMove", () => {
  it("is true only for the same list and position", () => {
    expect(isNoMove(1, 2, 1, 2)).toBe(true);
    expect(isNoMove(1, 2, 1, 0)).toBe(false);
    expect(isNoMove(1, 0, 2, 0)).toBe(false);
  });
});
