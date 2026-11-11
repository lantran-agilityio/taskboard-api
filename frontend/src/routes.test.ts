import { describe, expect, it } from "vitest";

import { hashFor, parseHash } from "./routes";

describe("parseHash", () => {
  it.each([
    ["#home", { name: "home" }],
    ["#board-12", { name: "board", id: 12 }],
    ["#card-345", { name: "card", id: 345 }],
  ])("reads %s", (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });

  it.each([
    "",
    "#",
    "#nope",
    "#board-",
    "#board-0",
    "#board-07",
    "#board-x",
    "#card-1-2",
  ])("sends %j home", (hash) => {
    expect(parseHash(hash)).toEqual({ name: "home" });
  });

  it("round-trips with hashFor", () => {
    for (const hash of ["#home", "#board-3", "#card-9"]) {
      expect(hashFor(parseHash(hash))).toBe(hash);
    }
  });
});
