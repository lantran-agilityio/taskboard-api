import type { Card, Label, LabelColor, List } from "../board/model";
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

/** Any of the card's fields; leaving one out keeps it, null clears it. */
export interface CardChange {
  title?: string;
  description?: string | null;
  due_at?: string | null;
  due_complete?: boolean;
  label_ids?: number[];
  assignee_ids?: number[];
  list_id?: number;
  position?: number;
}

export function updateCard(
  token: string,
  cardId: number,
  change: CardChange,
): Promise<Card> {
  return apiFetch<Card>(`/cards/${cardId}`, { method: "PATCH", json: change, token });
}

export function archiveCard(token: string, cardId: number): Promise<Card> {
  return apiFetch<Card>(`/cards/${cardId}/archive`, { method: "POST", token });
}

export function restoreCard(token: string, cardId: number): Promise<Card> {
  return apiFetch<Card>(`/cards/${cardId}/restore`, { method: "POST", token });
}

/** Deletes for good; only offered for archived cards (D2). */
export function deleteCard(token: string, cardId: number): Promise<void> {
  return apiFetch<void>(`/cards/${cardId}`, { method: "DELETE", token });
}

export interface LabelChange {
  name?: string;
  color?: LabelColor;
}

export function createLabel(
  token: string,
  boardId: number,
  label: { name: string; color: LabelColor },
): Promise<Label> {
  return apiFetch<Label>(`/boards/${boardId}/labels`, {
    method: "POST",
    json: label,
    token,
  });
}

export function updateLabel(
  token: string,
  labelId: number,
  change: LabelChange,
): Promise<Label> {
  return apiFetch<Label>(`/labels/${labelId}`, {
    method: "PATCH",
    json: change,
    token,
  });
}

export function deleteLabel(token: string, labelId: number): Promise<void> {
  return apiFetch<void>(`/labels/${labelId}`, { method: "DELETE", token });
}
