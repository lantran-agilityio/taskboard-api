import { apiFetch } from "./client";

export type BoardRole = "owner" | "editor" | "viewer";

export interface Board {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  closed_at: string | null;
  starred: boolean;
  role: BoardRole;
  list_count: number;
  card_count: number;
}

/** Open boards in creation order, or closed ones, most recently closed first. */
export function listBoards(token: string, { closed = false } = {}): Promise<Board[]> {
  return apiFetch<Board[]>(closed ? "/boards?closed=true" : "/boards", { token });
}

export function createBoard(token: string, name: string): Promise<Board> {
  return apiFetch<Board>("/boards", { method: "POST", json: { name }, token });
}

export function setStarred(
  token: string,
  boardId: number,
  starred: boolean,
): Promise<void> {
  return apiFetch<void>(`/boards/${boardId}/star`, {
    method: starred ? "PUT" : "DELETE",
    token,
  });
}

export function reopenBoard(token: string, boardId: number): Promise<Board> {
  return apiFetch<Board>(`/boards/${boardId}/reopen`, { method: "POST", token });
}

export function deleteBoard(token: string, boardId: number): Promise<void> {
  return apiFetch<void>(`/boards/${boardId}`, { method: "DELETE", token });
}
