// Local versions of the board edits, applied to the screen before the API
// answers ("optimistic" updates). If the API refuses, the page reloads the
// board, so these never have to be undone by hand. Pure functions, like
// model.ts.

import type { BoardData, Card, List, ListWithCards } from "./model";

function moveWithin<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return items;
  next.splice(to, 0, item);
  return next;
}

/** Moves a list to a 0-based position among the board's lists. */
export function moveList(data: BoardData, listId: number, position: number): BoardData {
  const from = data.lists.findIndex((list) => list.id === listId);
  if (from < 0) return data;
  return { ...data, lists: moveWithin(data.lists, from, position) };
}

/** Moves a card to a 0-based position in a list (its own or another). */
export function moveCard(
  data: BoardData,
  cardId: number,
  toListId: number,
  position: number,
): BoardData {
  const card = data.lists.flatMap((list) => list.cards).find((c) => c.id === cardId);
  if (!card || !data.lists.some((list) => list.id === toListId)) return data;
  const moved: Card = { ...card, list_id: toListId };
  return {
    ...data,
    lists: data.lists.map((list) => {
      const others = list.cards.filter((c) => c.id !== cardId);
      if (list.id !== toListId)
        return others.length === list.cards.length ? list : { ...list, cards: others };
      const cards = [...others];
      cards.splice(Math.min(position, cards.length), 0, moved);
      return { ...list, cards };
    }),
  };
}

export function renameList(data: BoardData, listId: number, name: string): BoardData {
  return {
    ...data,
    lists: data.lists.map((list) => (list.id === listId ? { ...list, name } : list)),
  };
}

export function changeCard(
  data: BoardData,
  cardId: number,
  change: Partial<Card>,
): BoardData {
  return {
    ...data,
    lists: data.lists.map((list) =>
      list.cards.some((card) => card.id === cardId)
        ? {
            ...list,
            cards: list.cards.map((card) =>
              card.id === cardId ? { ...card, ...change } : card,
            ),
          }
        : list,
    ),
  };
}

/** Takes a list off the board (archived): its cards go with it. */
export function removeList(data: BoardData, listId: number): BoardData {
  return { ...data, lists: data.lists.filter((list) => list.id !== listId) };
}

/** Takes a card off the board (archived). */
export function removeCard(data: BoardData, cardId: number): BoardData {
  return {
    ...data,
    lists: data.lists.map((list) =>
      list.cards.some((card) => card.id === cardId)
        ? { ...list, cards: list.cards.filter((card) => card.id !== cardId) }
        : list,
    ),
  };
}

/** A new list at the end (no-op if its event already put it there). */
export function addList(data: BoardData, list: List): BoardData {
  if (data.lists.some((other) => other.id === list.id)) return data;
  const added: ListWithCards = { ...list, cards: [] };
  return { ...data, lists: [...data.lists, added] };
}

/** A new card at the end of its list (no-op if its event already put it there). */
export function addCard(data: BoardData, card: Card): BoardData {
  if (data.lists.some((list) => list.cards.some((other) => other.id === card.id)))
    return data;
  return {
    ...data,
    lists: data.lists.map((list) =>
      list.id === card.list_id ? { ...list, cards: [...list.cards, card] } : list,
    ),
  };
}

/** A list's cards in a new order (after a sort): the API's answer, as is. */
export function setCards(data: BoardData, listId: number, cards: Card[]): BoardData {
  return {
    ...data,
    lists: data.lists.map((list) => (list.id === listId ? { ...list, cards } : list)),
  };
}
