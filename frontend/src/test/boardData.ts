import type { Board } from "../api/boards";
import type { BoardData, Card, Label, ListWithCards, Member } from "../board/model";

// Small builders for board-page tests.

export function card(id: number, listId: number, extra: Partial<Card> = {}): Card {
  return {
    id,
    list_id: listId,
    board_id: 1,
    title: `Card ${id}`,
    description: null,
    position: 0,
    created_at: "2026-11-01T00:00:00Z",
    archived_at: null,
    due_at: null,
    due_complete: false,
    label_ids: [],
    assignee_ids: [],
    comment_count: 0,
    checklist_done: 0,
    checklist_total: 0,
    ...extra,
  };
}

export function list(id: number, name: string, cards: Card[] = []): ListWithCards {
  return {
    id,
    board_id: 1,
    name,
    position: 0,
    created_at: "2026-11-01T00:00:00Z",
    archived_at: null,
    cards,
  };
}

export function boardInfo(extra: Partial<Board> = {}): Board {
  return {
    id: 1,
    name: "Launch",
    description: null,
    created_at: "2026-11-01T00:00:00Z",
    closed_at: null,
    starred: false,
    role: "owner",
    list_count: 0,
    card_count: 0,
    ...extra,
  };
}

export const LABELS: Label[] = [
  { id: 10, board_id: 1, name: "Bug", color: "red" },
  { id: 11, board_id: 1, name: "", color: "green" },
];

export const MEMBERS: Member[] = [
  { user_id: 1, email: "alice@example.com", role: "owner" },
  { user_id: 2, email: "bob@example.com", role: "editor" },
];

export function boardData(
  lists: ListWithCards[],
  extra: Partial<BoardData> = {},
): BoardData {
  return { board: boardInfo(), lists, labels: LABELS, members: MEMBERS, ...extra };
}
