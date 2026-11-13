import { describe, expect, it } from "vitest";

import {
  addDays,
  datesChange,
  datesText,
  keepInOrder,
  sameInstant,
  startOfDay,
  type DatesForm,
} from "./dates";

const form: DatesForm = {
  hasStart: true,
  startDay: "2026-11-18",
  hasDue: true,
  dueDay: "2026-11-20",
  dueTime: "17:00",
};

describe("addDays", () => {
  it("crosses month ends both ways", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-01", -1)).toBe("2026-11-30");
  });
});

describe("keepInOrder", () => {
  it("leaves dates in order alone, the same day included", () => {
    expect(keepInOrder(form, "start")).toBe(form);
    const sameDay = { ...form, startDay: "2026-11-20" };
    expect(keepInOrder(sameDay, "start")).toBe(sameDay);
  });

  it("moves the due date to the day after a later start", () => {
    expect(keepInOrder({ ...form, startDay: "2026-11-25" }, "start")).toEqual({
      ...form,
      startDay: "2026-11-25",
      dueDay: "2026-11-26",
    });
  });

  it("moves the start to the day before an earlier due date", () => {
    expect(keepInOrder({ ...form, dueDay: "2026-11-10" }, "due")).toEqual({
      ...form,
      startDay: "2026-11-09",
      dueDay: "2026-11-10",
    });
  });

  it("ignores a date that's off", () => {
    const noDue = { ...form, hasDue: false, startDay: "2026-11-25" };
    expect(keepInOrder(noDue, "start")).toBe(noDue);
  });
});

describe("datesChange", () => {
  it("sends only what changed, with null for a date turned off", () => {
    const card = { start_at: startOfDay("2026-11-18"), due_at: null };
    expect(datesChange(card, form)).toEqual({
      due_at: new Date("2026-11-20T17:00").toISOString(),
    });
    expect(datesChange(card, { ...form, hasStart: false, hasDue: false })).toEqual({
      start_at: null,
    });
  });

  it("treats the API's and the browser's spelling of an instant as the same", () => {
    const iso = startOfDay("2026-11-18");
    const apiSpelling = iso.replace(".000Z", "Z");
    expect(sameInstant(iso, apiSpelling)).toBe(true);
    expect(
      datesChange({ start_at: apiSpelling, due_at: null }, { ...form, hasDue: false }),
    ).toEqual({});
  });
});

describe("datesText", () => {
  const start = startOfDay("2026-11-18");
  const due = new Date("2026-11-20T17:00").toISOString();

  it("shows a range, a start alone, or a due date alone", () => {
    expect(datesText({ start_at: start, due_at: due })).toBe(
      "Nov 18 – Nov 20, 5:00 PM",
    );
    expect(datesText({ start_at: null, due_at: due })).toBe("Nov 20, 5:00 PM");
    expect(datesText({ start_at: null, due_at: null })).toBeNull();
  });

  it("says whether a lone start has begun", () => {
    const before = new Date(start).getTime() - 1;
    expect(datesText({ start_at: start, due_at: null }, undefined, before)).toBe(
      "Starts Nov 18",
    );
    expect(datesText({ start_at: start, due_at: null }, undefined, before + 1)).toBe(
      "Started Nov 18",
    );
  });
});
