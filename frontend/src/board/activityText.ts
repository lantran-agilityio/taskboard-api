// A card's history in plain words (R-ACTIVITY-02). Events carry the card's new
// state, not what changed, so an update is described by comparing it with
// the card as the previous entry left it. Plain functions, tested on their own.

import type { ActivityEntry } from "../api/comments";
import type { Card, Label, List, Member } from "./model";

export interface Context {
  lists: List[];
  labels: Label[];
  members: Member[];
  /** The user reading: "joined this card" rather than their own email. */
  myId: number;
}

function quoted(text: string): string {
  return `“${text}”`;
}

function listName(context: Context, listId: number): string {
  return context.lists.find((list) => list.id === listId)?.name ?? "an archived list";
}

function labelName(context: Context, labelId: number): string {
  const label = context.labels.find((item) => item.id === labelId);
  if (!label) return "a deleted label";
  return label.name ? `the label ${quoted(label.name)}` : `the ${label.color} label`;
}

function person(context: Context, userId: number): string {
  return (
    context.members.find((member) => member.user_id === userId)?.email ?? "someone"
  );
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
function changes(before: Card, after: Card, context: Context): string[] {
  const words: string[] = [];
  if (before.list_id !== after.list_id) {
    words.push(
      `moved this card from ${listName(context, before.list_id)} to ${listName(context, after.list_id)}`,
    );
  } else if (
    before.position !== after.position &&
    before.position !== null &&
    after.position !== null
  ) {
    words.push(`moved this card within ${listName(context, after.list_id)}`);
  }
  if (before.title !== after.title) {
    words.push(
      `renamed this card from ${quoted(before.title)} to ${quoted(after.title)}`,
    );
  }
  if (before.due_complete !== after.due_complete) {
    words.push(
      after.due_complete ? "marked this card done" : "marked this card not done",
    );
  }
  if (before.due_at !== after.due_at) {
    words.push(
      after.due_at
        ? `set the due date to ${dueWords(after.due_at)}`
        : "removed the due date",
    );
  }
  if ((before.description ?? "") !== (after.description ?? "")) {
    words.push(
      after.description ? "changed the description" : "removed the description",
    );
  }
  for (const id of after.label_ids.filter(
    (label) => !before.label_ids.includes(label),
  )) {
    words.push(`added ${labelName(context, id)}`);
  }
  for (const id of before.label_ids.filter(
    (label) => !after.label_ids.includes(label),
  )) {
    words.push(`removed ${labelName(context, id)}`);
  }
  for (const id of after.assignee_ids.filter(
    (user) => !before.assignee_ids.includes(user),
  )) {
    words.push(
      id === context.myId
        ? "joined this card"
        : `added ${person(context, id)} to this card`,
    );
  }
  for (const id of before.assignee_ids.filter(
    (user) => !after.assignee_ids.includes(user),
  )) {
    words.push(
      id === context.myId
        ? "left this card"
        : `removed ${person(context, id)} from this card`,
    );
  }
  return words;
}

/**
 * What an entry says happened. `previous` is the card as the entry before it
 * (in time) left it, if that entry is loaded.
 */
export function describe(
  entry: ActivityEntry,
  previous: Card | null,
  context: Context,
): string {
  const d = entry.data;
  switch (entry.type) {
    case "card.created":
      return `added this card to ${listName(context, d.card.list_id)}`;
    case "card.updated": {
      const words = previous ? changes(previous, d.card, context) : [];
      return words.length > 0 ? words.join(", ") : "updated this card";
    }
    case "card.archived":
      return "archived this card";
    case "card.restored":
      return "sent this card to the board";
    case "card.deleted":
      return "deleted this card";
    case "checklist.created":
      return `added the checklist ${quoted(d.checklist.title)}`;
    case "checklist.updated":
      return `changed the checklist ${quoted(d.checklist.title)}`;
    case "checklist.deleted":
      return `deleted the checklist ${quoted(d.title)}`;
    case "checklist_item.created":
      return `added ${quoted(d.item.text)} to a checklist`;
    case "checklist_item.updated":
      return d.item.done
        ? `completed ${quoted(d.item.text)}`
        : `changed ${quoted(d.item.text)}`;
    case "checklist_item.deleted":
      return `deleted ${quoted(d.text)} from a checklist`;
    default:
      return "changed this card";
  }
}

/**
 * The card each entry left behind, for describing the next one: entries are
 * given newest first, as the API pages them.
 */
export function previousStates(entries: ActivityEntry[]): Map<number, Card | null> {
  const result = new Map<number, Card | null>();
  let last: Card | null = null;
  for (const entry of [...entries].reverse()) {
    result.set(entry.id, last);
    if (entry.data?.card) last = entry.data.card as Card;
  }
  return result;
}
