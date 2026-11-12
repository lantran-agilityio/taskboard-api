import type { Card, List } from "../board/model";
import type { Board } from "./boards";
import { apiFetch } from "./client";
import type { ActivityEntry, Page } from "./comments";

// The board menu: about, activity, archived items, closing the board.

/** null clears the description; editors and the owner may change it. */
export function setBoardDescription(
  token: string,
  boardId: number,
  description: string | null,
): Promise<Board> {
  return apiFetch<Board>(`/boards/${boardId}`, {
    method: "PATCH",
    json: { description },
    token,
  });
}

/** The owner closes a board: read-only for everyone until reopened. */
export function closeBoard(token: string, boardId: number): Promise<Board> {
  return apiFetch<Board>(`/boards/${boardId}/close`, { method: "POST", token });
}

export type ActivityKind = "all" | "comments";

/** The board's log, newest first; kind=comments keeps only comment entries. */
export function listBoardActivity(
  token: string,
  boardId: number,
  kind: ActivityKind,
  before?: number,
): Promise<Page<ActivityEntry>> {
  const query = new URLSearchParams();
  if (kind === "comments") query.set("kind", "comments");
  if (before !== undefined) query.set("before", String(before));
  const text = query.toString();
  return apiFetch<Page<ActivityEntry>>(
    `/boards/${boardId}/activity${text ? `?${text}` : ""}`,
    {
      token,
    },
  );
}

/** Archived cards of the board's active lists, most recently archived first. */
export function listArchivedCards(token: string, boardId: number): Promise<Card[]> {
  return apiFetch<Card[]>(`/boards/${boardId}/cards?archived=true`, { token });
}

/** Archived lists, most recently archived first. */
export function listArchivedLists(token: string, boardId: number): Promise<List[]> {
  return apiFetch<List[]>(`/boards/${boardId}/lists?archived=true`, { token });
}

/** Back where it was on the board (or at the end), with its cards. */
export function restoreList(token: string, listId: number): Promise<List> {
  return apiFetch<List>(`/lists/${listId}/restore`, { method: "POST", token });
}

/** Deletes the list and its cards for good; only offered for archived lists (D2). */
export function deleteList(token: string, listId: number): Promise<void> {
  return apiFetch<void>(`/lists/${listId}`, { method: "DELETE", token });
}
