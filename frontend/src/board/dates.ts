// Dates for the card dialog's picker and the card front (R-DATE-01, R-DATE-03).
// Days are "YYYY-MM-DD" strings in the browser's time zone, so they compare
// as strings; the API gets instants (ISO strings in UTC).

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "2026-11-12" and "16:08" for a date-time, in the browser's time zone. */
export function localParts(date: Date): { day: string; time: string } {
  return {
    day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

/** The day `days` after (or before, if negative) a "YYYY-MM-DD" day. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00`);
  date.setDate(date.getDate() + days);
  return localParts(date).day;
}

/** A start date is the start of its day, so it compares with a due date-time. */
export function startOfDay(day: string): string {
  return new Date(`${day}T00:00`).toISOString();
}

export function atTime(day: string, time: string): string {
  return new Date(`${day}T${time}`).toISOString();
}

/** The API writes "…:00Z" and the browser "…:00.000Z": compare the instants. */
export function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

/** "Nov 18" */
export function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Nov 20, 5:00 PM" */
export function dayAndTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The card's dates in a few words: "Nov 18 – Nov 20, 5:00 PM", "Starts Nov 18"
 * (or "Started" once it's begun), "Nov 20, 5:00 PM", or null with neither.
 * `due` formats the due date (with or without its time).
 */
export function datesText(
  card: { start_at: string | null; due_at: string | null },
  due: (iso: string) => string = dayAndTime,
  now: number = Date.now(),
): string | null {
  if (card.start_at && card.due_at)
    return `${shortDay(card.start_at)} – ${due(card.due_at)}`;
  if (card.start_at) {
    const begun = new Date(card.start_at).getTime() <= now;
    return `${begun ? "Started" : "Starts"} ${shortDay(card.start_at)}`;
  }
  return card.due_at ? due(card.due_at) : null;
}

/** The picker's state: each date is on or off, with its day (and the due time). */
export interface DatesForm {
  hasStart: boolean;
  startDay: string;
  hasDue: boolean;
  dueDay: string;
  dueTime: string;
}

/**
 * The form after one change, kept in order: a start after the due date moves
 * the due date to the next day, and a due date before the start moves the
 * start to the day before, as the observed product does. The same day is fine
 * (a start is the beginning of its day).
 */
export function keepInOrder(form: DatesForm, changed: "start" | "due"): DatesForm {
  if (!form.hasStart || !form.hasDue || form.startDay <= form.dueDay) return form;
  return changed === "start"
    ? { ...form, dueDay: addDays(form.startDay, 1) }
    : { ...form, startDay: addDays(form.dueDay, -1) };
}

export interface DatesChange {
  start_at?: string | null;
  due_at?: string | null;
}

/** What to send: only the dates that differ from the card's; null clears one. */
export function datesChange(
  card: { start_at: string | null; due_at: string | null },
  form: DatesForm,
): DatesChange {
  const startAt = form.hasStart && form.startDay ? startOfDay(form.startDay) : null;
  const dueAt =
    form.hasDue && form.dueDay && form.dueTime
      ? atTime(form.dueDay, form.dueTime)
      : null;
  const change: DatesChange = {};
  if (!sameInstant(startAt, card.start_at)) change.start_at = startAt;
  if (!sameInstant(dueAt, card.due_at)) change.due_at = dueAt;
  return change;
}
