import { describe, expect, it } from "vitest";

import { EDGE, MAX_SPEED, SLOP, edgeSpeed, isSwipe } from "./touch";

describe("isSwipe", () => {
  it("allows a little wobble while holding", () => {
    expect(isSwipe({ x: 0, y: 0 }, { x: SLOP, y: 0 })).toBe(false);
    expect(isSwipe({ x: 0, y: 0 }, { x: 0, y: SLOP + 1 })).toBe(true);
    expect(isSwipe({ x: 0, y: 0 }, { x: 8, y: 8 })).toBe(true);
  });
});

describe("edgeSpeed", () => {
  it("is 0 in the middle", () => {
    expect(edgeSpeed(500, 0, 1000)).toBe(0);
    expect(edgeSpeed(EDGE, 0, 1000)).toBe(0);
  });

  it("scrolls back near the start and on near the end, faster closer in", () => {
    expect(edgeSpeed(EDGE - 1, 0, 1000)).toBeLessThan(0);
    expect(edgeSpeed(0, 0, 1000)).toBe(-MAX_SPEED);
    expect(edgeSpeed(1000 - EDGE / 2, 0, 1000)).toBe(MAX_SPEED / 2);
    expect(edgeSpeed(1000, 0, 1000)).toBe(MAX_SPEED);
  });

  it("goes no faster past the edge", () => {
    expect(edgeSpeed(-200, 0, 1000)).toBe(-MAX_SPEED);
    expect(edgeSpeed(1300, 0, 1000)).toBe(MAX_SPEED);
  });

  it("never scrolls a scroller too small to have edges", () => {
    expect(edgeSpeed(0, 0, EDGE)).toBe(0);
    expect(edgeSpeed(0, 0, 0)).toBe(0);
  });
});
