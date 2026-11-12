import type { Card, Label, Member, Snapshot } from "../board/model";
import { apiFetch } from "./client";

/** The board with its active lists and their active cards, in one request. */
export function getSnapshot(token: string, boardId: number): Promise<Snapshot> {
  return apiFetch<Snapshot>(`/boards/${boardId}/snapshot`, { token });
}

export function getLabels(token: string, boardId: number): Promise<Label[]> {
  return apiFetch<Label[]>(`/boards/${boardId}/labels`, { token });
}

/** The owner first, then the members. */
export function getMembers(token: string, boardId: number): Promise<Member[]> {
  return apiFetch<Member[]>(`/boards/${boardId}/members`, { token });
}

export function getCard(token: string, cardId: number): Promise<Card> {
  return apiFetch<Card>(`/cards/${cardId}`, { token });
}
