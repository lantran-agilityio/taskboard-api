import type { Card, List } from "../board/model";
import type { Board } from "./boards";
import { apiFetch } from "./client";

// The board page's changes. Positions are 0-based, as the API takes them;
// the forms show them from 1.

export type SortBy = "created_desc" | "created_asc" | "title";

export function renameBoard(
  token: string,
  boardId: number,
  name: string,
): Promise<Board> {
  return apiFetch<Board>(`/boards/${boardId}`, {
    method: "PATCH",
    json: { name },
    token,
  });
}

export function createList(
  token: string,
  boardId: number,
  name: string,
): Promise<List> {
  return apiFetch<List>(`/boards/${boardId}/lists`, {
    method: "POST",
    json: { name },
    token,
  });
}

export function updateList(
  token: string,
  listId: number,
  change: { name?: string; position?: number },
): Promise<List> {
  return apiFetch<List>(`/lists/${listId}`, { method: "PATCH", json: change, token });
}

export function archiveList(token: string, listId: number): Promise<List> {
  return apiFetch<List>(`/lists/${listId}/archive`, { method: "POST", token });
}

/** Reorders the list's cards once; returns them in the new order. */
export function sortList(token: string, listId: number, by: SortBy): Promise<Card[]> {
  return apiFetch<Card[]>(`/lists/${listId}/sort`, {
    method: "POST",
    json: { by },
    token,
  });
}

export function createCard(
  token: string,
  listId: number,
  title: string,
): Promise<Card> {
  return apiFetch<Card>(`/lists/${listId}/cards`, {
    method: "POST",
    json: { title },
    token,
  });
}

export function updateCard(
  token: string,
  cardId: number,
  change: { due_complete?: boolean; list_id?: number; position?: number },
): Promise<Card> {
  return apiFetch<Card>(`/cards/${cardId}`, { method: "PATCH", json: change, token });
}

export function archiveCard(token: string, cardId: number): Promise<Card> {
  return apiFetch<Card>(`/cards/${cardId}/archive`, { method: "POST", token });
}
