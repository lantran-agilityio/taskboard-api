import { apiFetch } from "./client";

export interface ChecklistItem {
  id: number;
  checklist_id: number;
  text: string;
  done: boolean;
  position: number;
  created_at: string;
  /** Its own assignee (a board member) and due date (R-CHECK-05). */
  assignee_id: number | null;
  due_at: string | null;
}

/** Any of an item's fields; leaving one out keeps it, null clears it. */
export interface ItemChange {
  text?: string;
  done?: boolean;
  assignee_id?: number | null;
  due_at?: string | null;
}

/** A card's checklist with its items, in order (as the API reads it). */
export interface Checklist {
  id: number;
  card_id: number;
  title: string;
  position: number;
  created_at: string;
  items: ChecklistItem[];
}

export function listChecklists(token: string, cardId: number): Promise<Checklist[]> {
  return apiFetch<Checklist[]>(`/cards/${cardId}/checklists`, { token });
}

export function createChecklist(
  token: string,
  cardId: number,
  title: string,
): Promise<Checklist> {
  return apiFetch<Checklist>(`/cards/${cardId}/checklists`, {
    method: "POST",
    json: { title },
    token,
  });
}

export function renameChecklist(
  token: string,
  checklistId: number,
  title: string,
): Promise<Checklist> {
  return apiFetch<Checklist>(`/checklists/${checklistId}`, {
    method: "PATCH",
    json: { title },
    token,
  });
}

export function deleteChecklist(token: string, checklistId: number): Promise<void> {
  return apiFetch<void>(`/checklists/${checklistId}`, { method: "DELETE", token });
}

export function createItem(
  token: string,
  checklistId: number,
  text: string,
): Promise<ChecklistItem> {
  return apiFetch<ChecklistItem>(`/checklists/${checklistId}/items`, {
    method: "POST",
    json: { text },
    token,
  });
}

export function updateItem(
  token: string,
  itemId: number,
  change: ItemChange,
): Promise<ChecklistItem> {
  return apiFetch<ChecklistItem>(`/checklist-items/${itemId}`, {
    method: "PATCH",
    json: change,
    token,
  });
}

export function deleteItem(token: string, itemId: number): Promise<void> {
  return apiFetch<void>(`/checklist-items/${itemId}`, { method: "DELETE", token });
}
