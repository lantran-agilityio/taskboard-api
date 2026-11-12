import { useCallback, useEffect, useState } from "react";

import * as menu from "../api/boardMenu";
import * as edit from "../api/boardEdit";
import { ApiError } from "../api/client";
import type { ActivityEntry } from "../api/comments";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useEscape } from "../components/escape";
import { Markdown } from "../components/Markdown";
import { timeAgo } from "../format";
import {
  describe,
  listsWithHistory,
  previousStates,
  type Context,
} from "./activityText";
import type { Attempt, Change } from "./CardDialog";
import { Avatar } from "./CardFront";
import { COLORS, LabelChip, LabelEditor } from "./CardPickers";
import * as local from "./edits";
import type { BoardData, BoardEvent, Card, Label, List, Member } from "./model";

type Tab = "about" | "activity" | "archived" | "labels";

const TABS: { id: Tab; label: string }[] = [
  { id: "about", label: "About" },
  { id: "activity", label: "Activity" },
  { id: "archived", label: "Archived items" },
  { id: "labels", label: "Labels" },
];

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

function someone(members: Member[], userId: number): Member {
  return (
    members.find((member) => member.user_id === userId) ?? {
      user_id: userId,
      email: "someone",
      role: "viewer",
    }
  );
}

interface MenuProps {
  data: BoardData;
  token: string;
  myId: number;
  /** Editor or owner, on an open board. */
  canEdit: boolean;
  change: Change;
  attempt: Attempt;
  update: (change: (data: BoardData) => BoardData) => void;
  subscribe: (listener: (event: BoardEvent) => void) => () => void;
  onClose: () => void;
}

/**
 * The board menu, a panel at the side of the board: About (R-BOARD-05),
 * Activity (R-ACTIVITY-01), Archived items (R-LIST-06 to R-LIST-08,
 * R-CARD-09, R-CARD-10), Labels (R-LABEL-03 to R-LABEL-05), and Close board
 * for the owner (R-BOARD-06). Everyone on the board can read it.
 */
export function BoardMenu(props: MenuProps) {
  const { data, token, onClose, change } = props;
  const [tab, setTab] = useState<Tab>("about");
  const [confirmClose, setConfirmClose] = useState(false);
  useEscape(onClose);
  const isOwner = data.board.role === "owner";

  return (
    <aside className="panel" aria-label="Board menu">
      <div className="panel-head">
        <h2>Menu</h2>
        <button type="button" className="x" aria-label="Close menu" onClick={onClose}>
          ×
        </button>
      </div>
      <nav className="tabs" aria-label="Board menu sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="panel-body">
        {tab === "about" && <AboutTab {...props} />}
        {tab === "activity" && <ActivityTab {...props} />}
        {tab === "archived" && <ArchivedTab {...props} />}
        {tab === "labels" && <LabelsTab {...props} />}
      </div>
      {isOwner && !data.board.closed_at && (
        <div className="panel-foot">
          <button type="button" className="btn" onClick={() => setConfirmClose(true)}>
            Close board…
          </button>
        </div>
      )}
      {confirmClose && (
        <ConfirmDialog
          title={`Close “${data.board.name}”?`}
          message="It becomes read-only for everyone and leaves the home screen. You can reopen it later from Closed boards."
          confirmLabel="Close board"
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false);
            void change(
              "close the board",
              null,
              () => menu.closeBoard(token, data.board.id),
              (closed) => (board) => ({
                ...board,
                board: { ...board.board, closed_at: closed.closed_at },
              }),
            );
          }}
        />
      )}
    </aside>
  );
}

/** The board's description (Markdown, editable by editors and the owner) and its owner. */
function AboutTab({ data, token, canEdit, change }: MenuProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const owner = data.members.find((member) => member.role === "owner");
  const description = data.board.description;

  function save() {
    if (draft === null) return;
    const value = draft.trim() || null;
    setDraft(null);
    if (value === description) return;
    void change(
      "save the description",
      (board) => ({ ...board, board: { ...board.board, description: value } }),
      () => menu.setBoardDescription(token, data.board.id, value),
    );
  }

  return (
    <>
      <section className="blk" aria-label="Description">
        <div className="blk-head">
          <h3>Description</h3>
          {canEdit && draft === null && (
            <button
              type="button"
              className="btn sm"
              onClick={() => setDraft(description ?? "")}
            >
              Edit
            </button>
          )}
        </div>
        {draft !== null ? (
          <div className="blk tight">
            <textarea
              className="field"
              aria-label="Board description"
              rows={5}
              maxLength={2000}
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  // Escape cancels the edit, not the menu.
                  event.stopPropagation();
                  event.nativeEvent.stopImmediatePropagation();
                  setDraft(null);
                }
              }}
            />
            <div className="row">
              <button type="button" className="btn primary sm" onClick={save}>
                Save
              </button>
              <button type="button" className="btn sm" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : description ? (
          <Markdown text={description} />
        ) : (
          <p className="hint">No description yet.</p>
        )}
      </section>
      <section className="blk" aria-label="Owner">
        <h3>Owner</h3>
        {owner && (
          <div className="row">
            <Avatar member={owner} small />
            <span>{owner.email}</span>
          </div>
        )}
        <p className="hint">Created {timeAgo(data.board.created_at)}.</p>
      </section>
    </>
  );
}

/** The whole board's log in plain words, All or Comments only, live. */
function ActivityTab({ data, token, myId, subscribe }: MenuProps) {
  const [kind, setKind] = useState<menu.ActivityKind>("all");
  const [page, setPage] = useState<{
    kind: menu.ActivityKind;
    items: ActivityEntry[];
    next: number | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boardId = data.board.id;

  const readFirst = useCallback(
    async (which: menu.ActivityKind) => {
      try {
        const result = await menu.listBoardActivity(token, boardId, which);
        setPage((current) => ({
          kind: which,
          // Keep older pages already loaded for this kind; the new first page goes on top.
          items: merge(current?.kind === which ? current.items : [], result.items),
          next:
            current?.kind === which && current.items.length > result.items.length
              ? current.next
              : result.next_before,
        }));
        setError(null);
      } catch (caught) {
        setError(`Couldn't load the activity: ${message(caught)}`);
      }
    },
    [token, boardId],
  );

  useEffect(() => {
    let cancelled = false;
    menu
      .listBoardActivity(token, boardId, kind)
      .then((result) => {
        if (!cancelled)
          setPage({ kind, items: result.items, next: result.next_before });
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(`Couldn't load the activity: ${message(caught)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, token, boardId]);

  // Anything that happens on the board adds an entry: re-read the newest page.
  useEffect(
    () =>
      subscribe((event) => {
        if (kind === "comments" && !event.type.startsWith("comment.")) return;
        void readFirst(kind);
      }),
    [subscribe, kind, readFirst],
  );

  async function older() {
    if (!page || page.next === null) return;
    try {
      const result = await menu.listBoardActivity(token, boardId, kind, page.next);
      setPage(
        (current) =>
          current && {
            ...current,
            items: merge(current.items, result.items),
            next: result.next_before,
          },
      );
    } catch (caught) {
      setError(`Couldn't load older activity: ${message(caught)}`);
    }
  }

  const entries = page?.kind === kind ? page.items : null;
  const context: Context = {
    // Archived lists are named from the log itself.
    lists: listsWithHistory(data.lists, entries ?? []),
    labels: data.labels,
    members: data.members,
    myId,
    cardTitles: new Map(
      data.lists.flatMap((list) => list.cards.map((card) => [card.id, card.title])),
    ),
  };
  const states = previousStates(entries ?? []);

  return (
    <>
      <div className="seg" role="group" aria-label="Show">
        <button
          type="button"
          aria-pressed={kind === "all"}
          onClick={() => setKind("all")}
        >
          All
        </button>
        <button
          type="button"
          aria-pressed={kind === "comments"}
          onClick={() => setKind("comments")}
        >
          Comments
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {entries === null ? (
        !error && <p className="muted">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="empty">
          {kind === "comments" ? "No comments yet." : "Nothing has happened yet."}
        </div>
      ) : (
        <div className="feed" aria-label="Board activity">
          {entries.map((entry) => {
            const who = someone(data.members, entry.actor_id);
            return (
              <div key={entry.id} className="ev">
                <Avatar member={who} small />
                <div>
                  <b>{entry.actor_id === myId ? "You" : who.email}</b>{" "}
                  {describe(entry, states.get(entry.id) ?? null, context, "board")}
                  <time
                    dateTime={entry.created_at}
                    title={new Date(entry.created_at).toLocaleString()}
                  >
                    {timeAgo(entry.created_at)}
                  </time>
                </div>
              </div>
            );
          })}
          {page?.next !== null && page?.next !== undefined && (
            <button type="button" className="btn sm" onClick={() => void older()}>
              Show older
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** Newest first, no duplicates. */
function merge(have: ActivityEntry[], incoming: ActivityEntry[]): ActivityEntry[] {
  const byId = new Map(have.map((entry) => [entry.id, entry]));
  for (const entry of incoming) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

const ARCHIVE_EVENTS = new Set([
  "card.archived",
  "card.restored",
  "card.deleted",
  "list.archived",
  "list.restored",
  "list.deleted",
]);

/**
 * Archived cards and lists, newest first, searchable. Editors and the owner
 * restore them, or delete them for good after a warning. Cards of archived
 * lists aren't listed: they come back with their list (R-LIST-06).
 */
function ArchivedTab({ data, token, canEdit, attempt, update, subscribe }: MenuProps) {
  const [which, setWhich] = useState<"cards" | "lists">("cards");
  const [search, setSearch] = useState("");
  const [cards, setCards] = useState<Card[] | null>(null);
  const [lists, setLists] = useState<List[] | null>(null);
  const [toDelete, setToDelete] = useState<
    { kind: "card"; item: Card } | { kind: "list"; item: List } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const boardId = data.board.id;

  const read = useCallback(async () => {
    try {
      const [archivedCards, archivedLists] = await Promise.all([
        menu.listArchivedCards(token, boardId),
        menu.listArchivedLists(token, boardId),
      ]);
      setCards(archivedCards);
      setLists(archivedLists);
      setError(null);
    } catch (caught) {
      setError(`Couldn't load archived items: ${message(caught)}`);
    }
  }, [token, boardId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      menu.listArchivedCards(token, boardId),
      menu.listArchivedLists(token, boardId),
    ])
      .then(([archivedCards, archivedLists]) => {
        if (cancelled) return;
        setCards(archivedCards);
        setLists(archivedLists);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(`Couldn't load archived items: ${message(caught)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [token, boardId]);

  useEffect(
    () =>
      subscribe((event) => {
        if (ARCHIVE_EVENTS.has(event.type)) void read();
      }),
    [subscribe, read],
  );

  async function restoreCard(card: Card) {
    const restored = await attempt("restore the card", () =>
      edit.restoreCard(token, card.id),
    );
    if (!restored) return;
    setCards((current) => current?.filter((item) => item.id !== card.id) ?? null);
    update((board) => local.addCard(board, restored));
  }

  async function restoreList(list: List) {
    // The board reloads on the list's own event (its cards come back with it).
    const restored = await attempt("restore the list", () =>
      menu.restoreList(token, list.id),
    );
    if (restored)
      setLists((current) => current?.filter((item) => item.id !== list.id) ?? null);
  }

  async function remove() {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    if (target.kind === "card") {
      const done = await attempt("delete the card", () =>
        edit.deleteCard(token, target.item.id),
      );
      if (done !== null)
        setCards(
          (current) => current?.filter((item) => item.id !== target.item.id) ?? null,
        );
    } else {
      const done = await attempt("delete the list", () =>
        menu.deleteList(token, target.item.id),
      );
      if (done !== null)
        setLists(
          (current) => current?.filter((item) => item.id !== target.item.id) ?? null,
        );
    }
  }

  const term = search.trim().toLowerCase();
  const shownCards = (cards ?? []).filter((card) =>
    card.title.toLowerCase().includes(term),
  );
  const shownLists = (lists ?? []).filter((list) =>
    list.name.toLowerCase().includes(term),
  );
  const listName = (listId: number) =>
    data.lists.find((list) => list.id === listId)?.name ?? "a list";

  return (
    <>
      <div className="row">
        <div className="seg" role="group" aria-label="Archived">
          <button
            type="button"
            aria-pressed={which === "cards"}
            onClick={() => setWhich("cards")}
          >
            Cards
          </button>
          <button
            type="button"
            aria-pressed={which === "lists"}
            onClick={() => setWhich("lists")}
          >
            Lists
          </button>
        </div>
        <input
          className="field grow"
          aria-label="Search archived items"
          placeholder={`Search archived ${which}`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {cards === null || lists === null ? (
        !error && <p className="muted">Loading…</p>
      ) : which === "cards" ? (
        shownCards.length === 0 ? (
          <div className="empty">
            {term ? "No archived cards match." : "No archived cards."}
          </div>
        ) : (
          <ul className="rows" aria-label="Archived cards">
            {shownCards.map((card) => (
              <li key={card.id} className="arow">
                <div>
                  <a href={`#card-${card.id}`}>{card.title}</a>
                  <small>
                    in {listName(card.list_id)}
                    {card.archived_at ? ` · archived ${timeAgo(card.archived_at)}` : ""}
                  </small>
                </div>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      className="btn sm"
                      aria-label={`Restore ${card.title}`}
                      onClick={() => void restoreCard(card)}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      className="btn sm"
                      aria-label={`Delete ${card.title}`}
                      onClick={() => setToDelete({ kind: "card", item: card })}
                    >
                      Delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )
      ) : shownLists.length === 0 ? (
        <div className="empty">
          {term ? "No archived lists match." : "No archived lists."}
        </div>
      ) : (
        <ul className="rows" aria-label="Archived lists">
          {shownLists.map((list) => (
            <li key={list.id} className="arow">
              <div>
                {list.name}
                {list.archived_at && (
                  <small>archived {timeAgo(list.archived_at)}</small>
                )}
              </div>
              {canEdit && (
                <>
                  <button
                    type="button"
                    className="btn sm"
                    aria-label={`Restore ${list.name}`}
                    onClick={() => void restoreList(list)}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    aria-label={`Delete ${list.name}`}
                    onClick={() => setToDelete({ kind: "list", item: list })}
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {toDelete && (
        <ConfirmDialog
          title={
            toDelete.kind === "card"
              ? `Delete “${toDelete.item.title}”?`
              : `Delete the list “${toDelete.item.name}”?`
          }
          message={
            toDelete.kind === "card"
              ? "The card and its comments are deleted for good. This can't be undone."
              : "The list and all its cards are deleted for good. This can't be undone."
          }
          confirmLabel={toDelete.kind === "card" ? "Delete card" : "Delete list"}
          onCancel={() => setToDelete(null)}
          onConfirm={() => void remove()}
        />
      )}
    </>
  );
}

/** The board's labels: create, change and delete (with a warning), for editors and the owner. */
function LabelsTab({ data, token, canEdit, change, attempt, update }: MenuProps) {
  const [editing, setEditing] = useState<{
    label: Label | null;
    anchor: HTMLElement;
  } | null>(null);
  const labels = [...data.labels].sort(
    (a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || a.id - b.id,
  );

  return (
    <>
      <p className="hint">
        Labels belong to this board. Every new board starts with six colours and no
        names.
      </p>
      <ul className="rows" aria-label="Labels">
        {labels.map((label) => (
          <li key={label.id} className="lbl-row">
            <LabelChip label={label} />
            <span className="grow" />
            {canEdit && (
              <button
                type="button"
                className="ghost sm"
                aria-label={`Edit label ${label.name || label.color}`}
                onClick={(event) => setEditing({ label, anchor: event.currentTarget })}
              >
                ✎
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <button
          type="button"
          className="btn"
          onClick={(event) => setEditing({ label: null, anchor: event.currentTarget })}
        >
          Create a label
        </button>
      )}
      {editing && (
        <LabelEditor
          key={editing.label?.id ?? "new"}
          label={editing.label}
          anchor={editing.anchor}
          onClose={() => setEditing(null)}
          onSave={(values) => {
            const target = editing.label;
            setEditing(null);
            if (target) {
              void change(
                "change the label",
                (board) => ({
                  ...board,
                  labels: board.labels.map((label) =>
                    label.id === target.id ? { ...label, ...values } : label,
                  ),
                }),
                () => edit.updateLabel(token, target.id, values),
              );
            } else {
              void attempt("create the label", () =>
                edit.createLabel(token, data.board.id, values),
              ).then((created) => {
                if (!created) return;
                update((board) =>
                  board.labels.some((other) => other.id === created.id)
                    ? board
                    : { ...board, labels: [...board.labels, created] },
                );
              });
            }
          }}
          onDelete={
            editing.label
              ? () => {
                  const target = editing.label!;
                  setEditing(null);
                  void change(
                    "delete the label",
                    (board) => ({
                      ...board,
                      labels: board.labels.filter((label) => label.id !== target.id),
                      lists: board.lists.map((list) => ({
                        ...list,
                        cards: list.cards.map((card) => ({
                          ...card,
                          label_ids: card.label_ids.filter((id) => id !== target.id),
                        })),
                      })),
                    }),
                    () => edit.deleteLabel(token, target.id),
                  );
                }
              : undefined
          }
        />
      )}
    </>
  );
}
