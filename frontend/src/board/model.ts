// The board page's data and how each realtime event changes it. Plain
// functions, no React: the page keeps a BoardData in state and runs every
// event through applyEvent().

import type { Board, BoardRole } from "../api/boards";

export type LabelColor = "green" | "yellow" | "orange" | "red" | "purple" | "blue";

export interface Label {
  id: number;
  board_id: number;
  name: string;
  color: LabelColor;
}

export interface Member {
  user_id: number;
  email: string;
  role: BoardRole;
}

export interface Card {
  id: number;
  list_id: number;
  title: string;
  description: string | null;
  position: number | null;
  created_at: string;
  archived_at: string | null;
  due_at: string | null;
  due_complete: boolean;
  label_ids: number[];
  assignee_ids: number[];
  comment_count: number;
  checklist_done: number;
  checklist_total: number;
}

export interface List {
  id: number;
  board_id: number;
  name: string;
  position: number | null;
  created_at: string;
  archived_at: string | null;
}

export interface ListWithCards extends List {
  cards: Card[];
}

/** What GET /boards/{id}/snapshot returns. */
export interface Snapshot {
  board: Board;
  lists: ListWithCards[];
}

export interface BoardData {
  board: Board;
  lists: ListWithCards[]; // active lists in board order, active cards in list order
  labels: Label[];
  members: Member[];
}

export interface BoardEvent {
  type: string;
  board_id: number;
  actor_id: number;
  // Each event type has its own shape; the cases below read what they need.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

interface CardOrder {
  list_id: number;
  card_ids: number[];
}

/** Lists in the order of ids; lists not in ids (archived, deleted) drop out. */
function orderLists(lists: ListWithCards[], ids: number[]): ListWithCards[] {
  const byId = new Map(lists.map((list) => [list.id, list]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Every card on the board, by id, wherever it is now. */
function allCards(lists: ListWithCards[]): Map<number, Card> {
  return new Map(lists.flatMap((list) => list.cards.map((card) => [card.id, card])));
}

/** Gives each named list exactly the cards in its order, taken from pool. */
function applyCardOrders(
  lists: ListWithCards[],
  orders: CardOrder[],
  pool: Map<number, Card>,
): ListWithCards[] {
  const byList = new Map(orders.map((order) => [order.list_id, order.card_ids]));
  return lists.map((list) => {
    const ids = byList.get(list.id);
    if (!ids) return list;
    return { ...list, cards: ids.flatMap((id) => pool.get(id) ?? []) };
  });
}

function upsertList(lists: ListWithCards[], list: List): ListWithCards[] {
  const existing = lists.find((item) => item.id === list.id);
  const merged = { ...list, cards: existing?.cards ?? [] };
  return existing
    ? lists.map((item) => (item.id === list.id ? merged : item))
    : [...lists, merged];
}

function upsert<T>(items: T[], item: T, same: (a: T, b: T) => boolean): T[] {
  return items.some((other) => same(other, item))
    ? items.map((other) => (same(other, item) ? item : other))
    : [...items, item];
}

function mapCards(
  lists: ListWithCards[],
  change: (card: Card) => Card,
): ListWithCards[] {
  return lists.map((list) => ({ ...list, cards: list.cards.map(change) }));
}

/** The board after one event. Returns the same object for events it ignores. */
export function applyEvent(data: BoardData, event: BoardEvent): BoardData {
  const d = event.data;
  switch (event.type) {
    case "board.updated":
    case "board.closed":
    case "board.reopened":
      // Events leave out the per-user fields (starred, role) and the counts.
      return { ...data, board: { ...data.board, ...d.board } };

    case "list.created":
    case "list.updated":
    case "list.restored":
      return { ...data, lists: orderLists(upsertList(data.lists, d.list), d.list_ids) };
    case "list.archived":
    case "list.deleted":
      return { ...data, lists: orderLists(data.lists, d.list_ids) };
    case "list.sorted":
      return {
        ...data,
        lists: applyCardOrders(data.lists, d.lists, allCards(data.lists)),
      };

    case "card.created":
    case "card.updated":
    case "card.restored":
    case "card.archived":
    case "card.deleted": {
      const pool = allCards(data.lists);
      if (d.card) pool.set(d.card.id, d.card); // the card's new state; orders place it
      return { ...data, lists: applyCardOrders(data.lists, d.lists, pool) };
    }

    case "label.created":
    case "label.updated":
      return { ...data, labels: upsert(data.labels, d.label, (a, b) => a.id === b.id) };
    case "label.deleted":
      return {
        ...data,
        labels: data.labels.filter((label) => label.id !== d.label_id),
        lists: mapCards(data.lists, (card) =>
          card.label_ids.includes(d.label_id)
            ? { ...card, label_ids: card.label_ids.filter((id) => id !== d.label_id) }
            : card,
        ),
      };

    case "member.added":
    case "member.updated":
      return {
        ...data,
        members: upsert(data.members, d.member, (a, b) => a.user_id === b.user_id),
      };
    case "member.removed":
      // Leaving a board also unassigns that person from its cards.
      return {
        ...data,
        members: data.members.filter((member) => member.user_id !== d.user_id),
        lists: mapCards(data.lists, (card) =>
          card.assignee_ids.includes(d.user_id)
            ? {
                ...card,
                assignee_ids: card.assignee_ids.filter((id) => id !== d.user_id),
              }
            : card,
        ),
      };

    default:
      return data;
  }
}

/** What the page must fetch after an event that the event alone can't apply. */
export type FollowUp = { kind: "card"; cardId: number } | { kind: "reload" } | null;

export function followUp(event: BoardEvent): FollowUp {
  const d = event.data;
  switch (event.type) {
    // A restored list comes back with its cards, which the event doesn't carry.
    case "list.restored":
      return { kind: "reload" };
    // Comment and checklist counts: re-read the card rather than add or
    // subtract, so an event that arrives twice can't count twice.
    case "comment.created":
    case "comment.deleted":
      return { kind: "card", cardId: d.comment?.card_id ?? d.card_id };
    case "checklist.created":
    case "checklist.deleted":
    case "checklist_item.created":
    case "checklist_item.updated":
    case "checklist_item.deleted":
      return { kind: "card", cardId: d.card_id };
    default:
      return null;
  }
}

/** Puts a re-read card in place (it may have moved since the event). */
export function replaceCard(data: BoardData, card: Card): BoardData {
  return {
    ...data,
    lists: mapCards(data.lists, (other) => (other.id === card.id ? card : other)),
  };
}

export type DueState = "complete" | "overdue" | "soon" | "upcoming";

const DAY = 24 * 60 * 60 * 1000;

/** The card front's due badge, as in the prototype: done wins, then overdue. */
export function dueState(card: Card, now: number = Date.now()): DueState | null {
  if (!card.due_at) return null;
  if (card.due_complete) return "complete";
  const due = new Date(card.due_at).getTime();
  if (due < now) return "overdue";
  return due - now < DAY ? "soon" : "upcoming";
}
