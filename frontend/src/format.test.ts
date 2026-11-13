import { describe, expect, it } from "vitest";

import { plural, timeAgo } from "./format";

const NOW = new Date("2026-11-11T12:00:00Z");

describe("timeAgo", () => {
  it.each([
    ["2026-11-11T11:59:30Z", "just now"],
    ["2026-11-11T11:55:00Z", "5 minutes ago"],
    ["2026-11-11T09:00:00Z", "3 hours ago"],
    ["2026-11-10T12:00:00Z", "yesterday"],
    ["2026-11-08T12:00:00Z", "3 days ago"],
    ["2026-10-11T12:00:00Z", "last month"],
  ])("%s is %s", (iso, expected) => {
    expect(timeAgo(iso, NOW)).toBe(expected);
  });
});

describe("plural", () => {
  it.each([
    [0, "0 cards"],
    [1, "1 card"],
    [2, "2 cards"],
  ])("%i reads %s", (count, words) => {
    expect(plural(count, "card")).toBe(words);
  });
});
