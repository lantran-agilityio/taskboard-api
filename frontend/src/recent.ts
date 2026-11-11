// Recently opened boards, per user, kept in this browser only. Storage can
// throw (private windows, blocked site data); then there's simply no history.

const LIMIT = 8;

function key(userId: number): string {
  return `taskboard.recent.${userId}`;
}

export function recentIds(userId: number): number[] {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(key(userId)) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => Number.isInteger(id))
      : [];
  } catch {
    return [];
  }
}

/** Puts the board first, without repeats, keeping the newest LIMIT. */
export function recordVisit(userId: number, boardId: number): void {
  const ids = [boardId, ...recentIds(userId).filter((id) => id !== boardId)];
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(ids.slice(0, LIMIT)));
  } catch {
    // Not recorded; the home screen just won't list it.
  }
}
