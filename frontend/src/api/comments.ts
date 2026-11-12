import { apiFetch } from "./client";

export interface Comment {
  id: number;
  card_id: number;
  author_id: number;
  body: string;
  created_at: string;
  edited_at: string | null;
}

/** An entry in a board's activity log: an event's type and data, and who caused it. */
export interface ActivityEntry {
  id: number;
  type: string;
  actor_id: number;
  // Each event type has its own shape (see app/realtime/events.py).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  created_at: string;
}

/** One page, newest first; pass next_before as `before` for the next (older) one. */
export interface Page<T> {
  items: T[];
  next_before: number | null;
}

function pageQuery(params: Record<string, number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export function listComments(
  token: string,
  cardId: number,
  before?: number,
): Promise<Page<Comment>> {
  return apiFetch<Page<Comment>>(`/cards/${cardId}/comments${pageQuery({ before })}`, {
    token,
  });
}

export function getComment(token: string, commentId: number): Promise<Comment> {
  return apiFetch<Comment>(`/comments/${commentId}`, { token });
}

export function createComment(
  token: string,
  cardId: number,
  body: string,
): Promise<Comment> {
  return apiFetch<Comment>(`/cards/${cardId}/comments`, {
    method: "POST",
    json: { body },
    token,
  });
}

export function updateComment(
  token: string,
  commentId: number,
  body: string,
): Promise<Comment> {
  return apiFetch<Comment>(`/comments/${commentId}`, {
    method: "PATCH",
    json: { body },
    token,
  });
}

export function deleteComment(token: string, commentId: number): Promise<void> {
  return apiFetch<void>(`/comments/${commentId}`, { method: "DELETE", token });
}

/** One card's history: the board's activity log filtered by card_id. */
export function listCardActivity(
  token: string,
  boardId: number,
  cardId: number,
  before?: number,
): Promise<Page<ActivityEntry>> {
  return apiFetch<Page<ActivityEntry>>(
    `/boards/${boardId}/activity${pageQuery({ card_id: cardId, before })}`,
    { token },
  );
}
