// Activity in plain words: a card's history in its dialog (R-ACTIVITY-02,
// scope "card": "moved this card…") and the whole board's log in the board
// menu (R-ACTIVITY-01, scope "board": "moved “Brief”…"). Events carry the new
// state of a card, list, label or board, not what changed, so an update is
// described by comparing it with the state the previous entry about the same
// thing left. Plain functions, tested on their own.

import type { ActivityEntry } from "../api/comments";
import type { Board } from "../api/boards";
import type { Card, Label, List, Member } from "./model";

export type Scope = "card" | "board";

export interface Context {
  lists: List[];
  labels: Label[];
  members: Member[];
  /** The user reading: "joined this card" rather than their own email. */
  myId: number;
  /** Titles of the board's cards, for events that only carry a card's id. */
  cardTitles?: Map<number, string>;
}

function quoted(text: string): string {
  return `“${text}”`;
}

function listName(context: Context, listId: number): string {
  return context.lists.find((list) => list.id === listId)?.name ?? "an archived list";
}

function labelName(label: Pick<Label, "name" | "color"> | undefined): string {
  if (!label) return "a deleted label";
  return label.name ? `the label ${quoted(label.name)}` : `the ${label.color} label`;
}

function labelById(context: Context, labelId: number): string {
  return labelName(context.labels.find((item) => item.id === labelId));
}

function person(context: Context, userId: number): string {
  return (
    context.members.find((member) => member.user_id === userId)?.email ?? "someone"
  );
}

function cardTitle(context: Context, cardId: number | undefined): string {
  const title = cardId === undefined ? undefined : context.cardTitles?.get(cardId);
  return title ? quoted(title) : "a card";
}

/** A comment's text without its Markdown, cut to a short line. */
export function plainExcerpt(text: string, length = 120): string {
  const plain = text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) → text
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.|>)\s+/gm, "") // headings, bullets, quotes
    .replace(/[*_`~]/g, "") // emphasis and code marks
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > length ? `${plain.slice(0, length - 1)}…` : plain;
}

/**
 * The board's lists, plus lists the log mentions that aren't on the board any
 * more (archived), named as the newest entry about them left them.
 */
export function listsWithHistory(lists: List[], entries: ActivityEntry[]): List[] {
  const known = new Set(lists.map((list) => list.id));
  const extra = new Map<number, List>();
  for (const entry of entries) {
    const list = entry.data?.list as List | undefined;
    // Entries are newest first: the first mention is the latest name.
    if (list && !known.has(list.id) && !extra.has(list.id)) extra.set(list.id, list);
  }
  return [...lists, ...extra.values()];
}

export function dueWords(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** What changed between two states of a card, as phrases. */
function cardChanges(
  before: Card,
  after: Card,
  context: Context,
  scope: Scope,
): string[] {
  // In the card's own history it's "this card"; on the board, its title.
  const it = scope === "card" ? "this card" : quoted(after.title);
  const onIt = scope === "card" ? "" : ` on ${it}`;
  const toIt = scope === "card" ? "" : ` to ${it}`;
  const fromIt = scope === "card" ? "" : ` from ${it}`;
  const words: string[] = [];
  if (before.list_id !== after.list_id) {
    words.push(
      `moved ${it} from ${listName(context, before.list_id)} to ${listName(context, after.list_id)}`,
    );
  } else if (
    before.position !== after.position &&
    before.position !== null &&
    after.position !== null
  ) {
    words.push(`moved ${it} within ${listName(context, after.list_id)}`);
  }
  if (before.title !== after.title) {
    words.push(
      scope === "card"
        ? `renamed this card from ${quoted(before.title)} to ${quoted(after.title)}`
        : `renamed the card ${quoted(before.title)} to ${quoted(after.title)}`,
    );
  }
  if (before.due_complete !== after.due_complete) {
    words.push(after.due_complete ? `marked ${it} done` : `marked ${it} not done`);
  }
  if (before.due_at !== after.due_at) {
    words.push(
      after.due_at
        ? `set the due date${onIt} to ${dueWords(after.due_at)}`
        : `removed the due date${fromIt}`,
    );
  }
  if ((before.description ?? "") !== (after.description ?? "")) {
    words.push(
      after.description
        ? `changed the description${onIt}`
        : `removed the description${fromIt}`,
    );
  }
  for (const id of after.label_ids.filter(
    (label) => !before.label_ids.includes(label),
  )) {
    words.push(`added ${labelById(context, id)}${toIt}`);
  }
  for (const id of before.label_ids.filter(
    (label) => !after.label_ids.includes(label),
  )) {
    words.push(`removed ${labelById(context, id)}${fromIt}`);
  }
  for (const id of after.assignee_ids.filter(
    (user) => !before.assignee_ids.includes(user),
  )) {
    words.push(
      id === context.myId ? `joined ${it}` : `added ${person(context, id)} to ${it}`,
    );
  }
  for (const id of before.assignee_ids.filter(
    (user) => !after.assignee_ids.includes(user),
  )) {
    words.push(
      id === context.myId ? `left ${it}` : `removed ${person(context, id)} from ${it}`,
    );
  }
  return words;
}

function listChanges(before: List, after: List): string[] {
  const words: string[] = [];
  if (before.name !== after.name) {
    words.push(`renamed the list ${quoted(before.name)} to ${quoted(after.name)}`);
  }
  if (
    before.position !== after.position &&
    before.position !== null &&
    after.position !== null
  ) {
    words.push(`moved the list ${quoted(after.name)}`);
  }
  return words;
}

function boardChanges(before: Board, after: Board): string[] {
  const words: string[] = [];
  if (before.name !== after.name) {
    words.push(
      `renamed the board from ${quoted(before.name)} to ${quoted(after.name)}`,
    );
  }
  if ((before.description ?? "") !== (after.description ?? "")) {
    words.push(
      after.description
        ? "changed the board's description"
        : "removed the board's description",
    );
  }
  return words;
}

/**
 * What an entry says happened. `previous` is the card, list, label or board
 * as the entry before it (in time) about the same thing left it, if that
 * entry is loaded.
 */
export function describe(
  entry: ActivityEntry,
  // The previous state's shape depends on the entry's type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previous: any,
  context: Context,
  scope: Scope = "card",
): string {
  const d = entry.data;
  // Update events carry the old values of what changed: they win over the
  // state rebuilt from earlier entries, which may not be loaded yet.
  const state = d?.card ?? d?.list ?? d?.label ?? d?.board;
  if (d?.previous && state) previous = { ...state, ...d.previous };
  const card =
    scope === "card" ? "this card" : quoted(d.card?.title ?? d.title ?? "a card");
  // Comments and checklists only say which card by id.
  const onCard =
    scope === "card"
      ? ""
      : ` on ${cardTitle(context, d.card_id ?? d.comment?.card_id)}`;
  const toCard = scope === "card" ? "" : ` to ${cardTitle(context, d.card_id)}`;
  const fromCard = scope === "card" ? "" : ` from ${cardTitle(context, d.card_id)}`;
  switch (entry.type) {
    case "card.created":
      return `added ${card} to ${listName(context, d.card.list_id)}`;
    case "card.updated": {
      const words = previous ? cardChanges(previous, d.card, context, scope) : [];
      return words.length > 0 ? words.join(", ") : `updated ${card}`;
    }
    case "card.archived":
      return `archived ${card}`;
    case "card.restored":
      return `sent ${card} to the board`;
    case "card.deleted":
      return `deleted ${card}`;

    case "comment.created":
      return `commented${onCard}: ${plainExcerpt(d.comment.body)}`;
    case "comment.updated":
      return `edited a comment${onCard}`;
    case "comment.deleted":
      return `deleted a comment${onCard}`;

    case "checklist.created":
      return `added the checklist ${quoted(d.checklist.title)}${toCard}`;
    case "checklist.updated":
      return `changed the checklist ${quoted(d.checklist.title)}${onCard}`;
    case "checklist.deleted":
      return `deleted the checklist ${quoted(d.title)}${fromCard}`;
    case "checklist_item.created":
      return `added ${quoted(d.item.text)} to a checklist${onCard}`;
    case "checklist_item.updated":
      return d.item.done
        ? `completed ${quoted(d.item.text)}${onCard}`
        : `changed ${quoted(d.item.text)}${onCard}`;
    case "checklist_item.deleted":
      return `deleted ${quoted(d.text)} from a checklist${onCard}`;

    case "list.created":
      return `added the list ${quoted(d.list.name)}`;
    case "list.updated": {
      const words = previous ? listChanges(previous, d.list) : [];
      return words.length > 0
        ? words.join(", ")
        : `changed the list ${quoted(d.list.name)}`;
    }
    case "list.archived":
      return `archived the list ${quoted(d.list.name)}`;
    case "list.restored":
      return `restored the list ${quoted(d.list.name)}`;
    case "list.deleted":
      return `deleted the list ${quoted(d.name)}`;
    case "list.sorted":
      return `sorted the cards in ${quoted(d.list.name)}`;

    case "label.created":
      return `created ${labelName(d.label)}`;
    case "label.updated":
      return previous && previous.name !== d.label.name
        ? `renamed ${labelName(previous)} to ${quoted(d.label.name || d.label.color)}`
        : `changed ${labelName(d.label)}`;
    case "label.deleted":
      return `deleted the label ${quoted(d.name || "unnamed")}`;

    case "member.added":
      return `added ${d.member.email} to the board as ${d.member.role}`;
    case "member.updated":
      return `made ${d.member.email} ${d.member.role === "editor" ? "an editor" : "a viewer"}`;
    case "member.removed":
      return d.user_id === entry.actor_id
        ? "left the board"
        : `removed ${person(context, d.user_id)} from the board`;

    case "board.created":
      return "created the board";
    case "board.updated": {
      const words = previous ? boardChanges(previous, d.board) : [];
      return words.length > 0 ? words.join(", ") : "changed the board";
    }
    case "board.closed":
      return "closed the board";
    case "board.reopened":
      return "reopened the board";

    default:
      return scope === "card" ? "changed this card" : "changed the board";
  }
}

/** Which card, list, label or board an entry is about, and its state after it. */
function stateOf(entry: ActivityEntry): { key: string; state: unknown } | null {
  const d = entry.data ?? {};
  if (d.card) return { key: `card:${d.card.id}`, state: d.card };
  if (d.list) return { key: `list:${d.list.id}`, state: d.list };
  if (d.label) return { key: `label:${d.label.id}`, state: d.label };
  if (d.board) return { key: "board", state: d.board };
  return null;
}

/**
 * For each entry, the state the previous entry about the same thing left
 * (or null): entries are given newest first, as the API pages them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function previousStates(entries: ActivityEntry[]): Map<number, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = new Map<number, any>();
  const last = new Map<string, unknown>();
  for (const entry of [...entries].reverse()) {
    const about = stateOf(entry);
    result.set(entry.id, about ? (last.get(about.key) ?? null) : null);
    if (about) last.set(about.key, about.state);
  }
  return result;
}
