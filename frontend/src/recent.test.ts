import { describe, expect, it, vi } from "vitest";

import { recentIds, recordVisit } from "./recent";

describe("recently opened boards", () => {
  it("lists the newest first, without repeats", () => {
    recordVisit(1, 10);
    recordVisit(1, 20);
    recordVisit(1, 10);

    expect(recentIds(1)).toEqual([10, 20]);
  });

  it("keeps the newest eight", () => {
    for (let id = 1; id <= 10; id++) recordVisit(1, id);

    expect(recentIds(1)).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
  });

  it("is kept per user", () => {
    recordVisit(1, 10);
    recordVisit(2, 20);

    expect(recentIds(1)).toEqual([10]);
    expect(recentIds(2)).toEqual([20]);
  });

  it("ignores junk in storage", () => {
    window.localStorage.setItem("taskboard.recent.1", '{"not": "a list"}');
    expect(recentIds(1)).toEqual([]);
    window.localStorage.setItem("taskboard.recent.1", '[3, "x", 1.5, 4]');
    expect(recentIds(1)).toEqual([3, 4]);
  });

  it("works without storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => recordVisit(1, 10)).not.toThrow();
    expect(recentIds(1)).toEqual([]);
  });
});
