import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { ApiError } from "../api/client";
import {
  createComment,
  deleteComment,
  getComment,
  listCardActivity,
  listComments,
  updateComment,
  type ActivityEntry,
  type Comment,
} from "../api/comments";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Markdown } from "../components/Markdown";
import { timeAgo } from "../format";
import { describe, previousStates, type Context } from "./activityText";
import { Avatar } from "./CardFront";
import type { BoardEvent, Member } from "./model";

type Source<T> = { items: T[]; next: number | null };

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

function isComment(type: string): boolean {
  return type.startsWith("comment.");
}

/** Newest first, no duplicates: what we had, with what's new on top. */
function merge<T extends { id: number }>(have: T[], incoming: T[]): T[] {
  const byId = new Map(have.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

/** The card an event is about, as the API's card_id filter reads it. */
function cardOf(event: BoardEvent): number | undefined {
  const d = event.data;
  return d?.card?.id ?? d?.card_id ?? d?.comment?.card_id;
}

function when(iso: string): string {
  return timeAgo(iso);
}

/**
 * The card's comments (R-COMMENT-01 to R-COMMENT-04) and history
 * (R-ACTIVITY-02), newest first, with "Show details" for the history. Comments
 * and history are paged separately; the merged list only goes back as far as
 * both are loaded, so nothing shows out of order.
 */
export function CardFeed({
  cardId,
  boardId,
  token,
  context,
  members,
  isOwner,
  canWrite,
  canDelete,
  readOnlyNote,
  highlightId,
  subscribe,
}: {
  cardId: number;
  boardId: number;
  token: string;
  context: Context;
  members: Member[];
  /** The reader owns the board, so may delete anyone's comment. */
  isOwner: boolean;
  /** May comment and edit their own comments (editor or owner, card not frozen). */
  canWrite: boolean;
  /** May delete comments at all (editor or owner, even on a frozen card). */
  canDelete: boolean;
  /** Why there's no comment box, when there isn't one. */
  readOnlyNote: string | null;
  /** A comment to show and highlight (from a #card-…-comment-… link). */
  highlightId: number | null;
  subscribe: (listener: (event: BoardEvent) => void) => () => void;
}) {
  const [comments, setComments] = useState<Source<Comment> | null>(null);
  const [activity, setActivity] = useState<Source<ActivityEntry> | null>(null);
  const [linked, setLinked] = useState<Comment | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const [toDelete, setToDelete] = useState<Comment | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrolled = useRef(false);
  const myId = context.myId;

  const readActivity = useCallback(
    async (before?: number) => {
      const page = await listCardActivity(token, boardId, cardId, before);
      // Comments are shown as comments, not as history entries.
      return { ...page, items: page.items.filter((entry) => !isComment(entry.type)) };
    },
    [token, boardId, cardId],
  );

  // First pages of both, when the dialog opens.
  useEffect(() => {
    let cancelled = false;
    Promise.all([listComments(token, cardId), readActivity()])
      .then(([commentPage, activityPage]) => {
        if (cancelled) return;
        setComments({ items: commentPage.items, next: commentPage.next_before });
        setActivity({ items: activityPage.items, next: activityPage.next_before });
      })
      .catch((caught: unknown) => {
        if (!cancelled)
          setError(`Couldn't load comments and activity: ${message(caught)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [token, cardId, readActivity]);

  // A linked comment that isn't on the first page: read it on its own.
  useEffect(() => {
    if (highlightId === null || comments === null) return;
    if (comments.items.some((comment) => comment.id === highlightId)) return;
    let cancelled = false;
    getComment(token, highlightId)
      .then((comment) => {
        if (!cancelled && comment.card_id === cardId) setLinked(comment);
      })
      .catch(() => {
        if (!cancelled) setStatus("That comment was deleted.");
      });
    return () => {
      cancelled = true;
    };
  }, [highlightId, comments, token, cardId]);

  // Scroll the linked comment into view, once.
  useEffect(() => {
    if (highlightId === null || scrolled.current) return;
    const element = document.getElementById(`comment-${highlightId}`);
    if (element) {
      element.scrollIntoView?.({ block: "center" });
      scrolled.current = true;
    }
  });

  // Live: comments change in place; anything else about this card re-reads
  // the newest history (events don't carry an entry's id or time).
  useEffect(
    () =>
      subscribe((event) => {
        if (cardOf(event) !== cardId) return;
        const d = event.data;
        if (event.type === "comment.created" || event.type === "comment.updated") {
          setComments(
            (current) =>
              current && { ...current, items: merge(current.items, [d.comment]) },
          );
        } else if (event.type === "comment.deleted") {
          setComments(
            (current) =>
              current && {
                ...current,
                items: current.items.filter((item) => item.id !== d.comment_id),
              },
          );
          setLinked((current) => (current?.id === d.comment_id ? null : current));
        } else {
          readActivity()
            .then((page) =>
              setActivity(
                (current) =>
                  current && { ...current, items: merge(current.items, page.items) },
              ),
            )
            .catch(() => {
              // The next event or reopening the card catches up.
            });
        }
      }),
    [subscribe, cardId, readActivity],
  );

  async function loadOlder() {
    if (!comments || !activity) return;
    setError(null);
    try {
      const [olderComments, olderActivity] = await Promise.all([
        comments.next !== null ? listComments(token, cardId, comments.next) : null,
        activity.next !== null ? readActivity(activity.next) : null,
      ]);
      if (olderComments) {
        setComments((current) => ({
          items: merge(current?.items ?? [], olderComments.items),
          next: olderComments.next_before,
        }));
      }
      if (olderActivity) {
        setActivity((current) => ({
          items: merge(current?.items ?? [], olderActivity.items),
          next: olderActivity.next_before,
        }));
      }
    } catch (caught) {
      setError(`Couldn't load older entries: ${message(caught)}`);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const comment = await createComment(token, cardId, body);
      setComments(
        (current) => current && { ...current, items: merge(current.items, [comment]) },
      );
      setDraft("");
    } catch (caught) {
      setError(`Couldn't save the comment: ${message(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const body = editing.body.trim();
    if (!body) return;
    setError(null);
    try {
      const comment = await updateComment(token, editing.id, body);
      setComments(
        (current) => current && { ...current, items: merge(current.items, [comment]) },
      );
      setLinked((current) => (current?.id === comment.id ? comment : current));
      setEditing(null);
    } catch (caught) {
      setError(`Couldn't save your changes: ${message(caught)}`);
    }
  }

  async function remove(comment: Comment) {
    setToDelete(null);
    setError(null);
    try {
      await deleteComment(token, comment.id);
      setComments(
        (current) =>
          current && {
            ...current,
            items: current.items.filter((item) => item.id !== comment.id),
          },
      );
      setLinked((current) => (current?.id === comment.id ? null : current));
    } catch (caught) {
      setError(`Couldn't delete the comment: ${message(caught)}`);
    }
  }

  async function copyLink(comment: Comment) {
    const { origin, pathname, search } = window.location;
    const url = `${origin}${pathname}${search}#card-${cardId}-comment-${comment.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      // No clipboard (an insecure page, or permission refused): show it instead.
      setStatus(`Copy this link: ${url}`);
    }
  }

  function author(userId: number): Member {
    return (
      members.find((member) => member.user_id === userId) ?? {
        user_id: userId,
        email: "someone",
        role: "viewer",
      }
    );
  }

  // Only as far back as both sources are loaded; the rest waits for "Show older".
  const cutoff = (() => {
    const edges: number[] = [];
    for (const source of [comments, activity]) {
      if (source && source.next !== null && source.items.length > 0) {
        edges.push(new Date(source.items.at(-1)!.created_at).getTime());
      }
    }
    return edges.length ? Math.max(...edges) : -Infinity;
  })();
  const states = previousStates(activity?.items ?? []);
  const feed = [
    ...(comments?.items ?? []).map((comment) => ({
      kind: "comment" as const,
      at: comment.created_at,
      comment,
    })),
    ...(showDetails ? (activity?.items ?? []) : []).map((entry) => ({
      kind: "entry" as const,
      at: entry.created_at,
      entry,
    })),
  ]
    .filter((item) => new Date(item.at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const more = (comments?.next ?? null) !== null || (activity?.next ?? null) !== null;
  const linkedShown =
    linked &&
    !feed.some((item) => item.kind === "comment" && item.comment.id === linked.id);

  function commentRow(comment: Comment) {
    const mine = comment.author_id === myId;
    const who = author(comment.author_id);
    const isEditing = editing?.id === comment.id;
    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        // Escape discards the edit; it doesn't close the card.
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        setEditing(null);
      }
    };
    return (
      <article
        key={`c${comment.id}`}
        id={`comment-${comment.id}`}
        className={comment.id === highlightId ? "ev hl" : "ev"}
        aria-label={`Comment by ${who.email}`}
      >
        <Avatar member={who} small />
        <div>
          <b>{who.user_id === myId ? "You" : who.email}</b>{" "}
          <time
            dateTime={comment.created_at}
            title={new Date(comment.created_at).toLocaleString()}
          >
            {when(comment.created_at)}
            {comment.edited_at ? " (edited)" : ""}
          </time>
          {isEditing ? (
            <div className="blk tight">
              <textarea
                className="field"
                aria-label="Edit comment"
                rows={3}
                maxLength={5000}
                autoFocus
                value={editing.body}
                onChange={(event) =>
                  setEditing({ id: comment.id, body: event.target.value })
                }
                onKeyDown={onKeyDown}
              />
              <div className="row">
                <button
                  type="button"
                  className="btn primary sm"
                  onClick={() => void saveEdit()}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => setEditing(null)}
                >
                  Discard changes
                </button>
              </div>
            </div>
          ) : (
            <Markdown text={comment.body} className="cmt-body" />
          )}
          {!isEditing && (
            <div className="cmt-acts">
              <button
                type="button"
                className="ghost"
                onClick={() => void copyLink(comment)}
              >
                Copy link
              </button>
              {mine && canWrite && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setEditing({ id: comment.id, body: comment.body })}
                >
                  Edit
                </button>
              )}
              {canDelete && (mine || isOwner) && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setToDelete(comment)}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="feed-panel" aria-label="Comments and activity">
      <div className="blk-head">
        <h3>Comments and activity</h3>
        <button
          type="button"
          className="btn sm"
          aria-pressed={showDetails}
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
      </div>
      {canWrite ? (
        <form className="blk tight" onSubmit={submit}>
          <textarea
            className="field"
            aria-label="Write a comment"
            placeholder="Write a comment…"
            rows={2}
            maxLength={5000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="row">
            <button
              type="submit"
              className="btn primary sm"
              disabled={busy || !draft.trim()}
            >
              Save
            </button>
            <span className="hint">Markdown works.</span>
          </div>
        </form>
      ) : (
        readOnlyNote && <p className="hint">{readOnlyNote}</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="hint" role="status">
          {status}
        </p>
      )}
      {linkedShown && linked && (
        <div className="linked">
          <p className="hint">Linked comment</p>
          {commentRow(linked)}
        </div>
      )}
      {comments === null || activity === null ? (
        !error && <p className="muted">Loading…</p>
      ) : (
        <div className="feed">
          {feed.map((item) =>
            item.kind === "comment" ? (
              commentRow(item.comment)
            ) : (
              <div key={`e${item.entry.id}`} className="ev">
                <Avatar member={author(item.entry.actor_id)} small />
                <div>
                  <b>
                    {item.entry.actor_id === myId
                      ? "You"
                      : author(item.entry.actor_id).email}
                  </b>{" "}
                  {describe(item.entry, states.get(item.entry.id) ?? null, context)}
                  <time
                    dateTime={item.entry.created_at}
                    title={new Date(item.entry.created_at).toLocaleString()}
                  >
                    {when(item.entry.created_at)}
                  </time>
                </div>
              </div>
            ),
          )}
          {feed.length === 0 && !more && <p className="hint">Nothing here yet.</p>}
          {more && (
            <button type="button" className="btn sm" onClick={() => void loadOlder()}>
              Show older
            </button>
          )}
        </div>
      )}
      {toDelete && (
        <ConfirmDialog
          title="Delete this comment?"
          message="It's deleted for good. This can't be undone."
          confirmLabel="Delete comment"
          onCancel={() => setToDelete(null)}
          onConfirm={() => void remove(toDelete)}
        />
      )}
    </section>
  );
}
