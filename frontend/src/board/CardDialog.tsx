import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import * as edit from "../api/boardEdit";
import { getCard } from "../api/boardView";
import { ApiError } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useEscape } from "../components/escape";
import { CheckIcon, ClockIcon, DotsIcon } from "../components/icons";
import { InlineEdit } from "../components/InlineEdit";
import { Markdown } from "../components/Markdown";
import { Popover } from "../components/Popover";
import { timeAgo } from "../format";
import { useSession } from "../auth/session";
import { Checklists, useChecklists } from "./CardChecklists";
import { CardFeed } from "./CardFeed";
import { Avatar } from "./CardFront";
import {
  DuePopover,
  LabelChip,
  LabelsPopover,
  MembersPopover,
  MovePopover,
} from "./CardPickers";
import * as local from "./edits";
import {
  dueState,
  type BoardData,
  type BoardEvent,
  type Card,
  type DueState,
  type Label,
} from "./model";

/** Shows a change at once, asks the API, and reloads if it refuses (BoardPage). */
export type Change = <T>(
  what: string,
  show: ((data: BoardData) => BoardData) | null,
  request: () => Promise<T>,
  confirm?: (result: T) => (data: BoardData) => BoardData,
) => Promise<boolean>;

/** Asks the API and returns its answer, or null after showing why it refused. */
export type Attempt = <T>(what: string, request: () => Promise<T>) => Promise<T | null>;

const DUE_WORD: Record<DueState, string> = {
  overdue: "Overdue",
  complete: "Complete",
  soon: "Due soon",
  upcoming: "",
};

function findCard(data: BoardData, cardId: number): Card | undefined {
  for (const list of data.lists) {
    const card = list.cards.find((item) => item.id === cardId);
    if (card) return card;
  }
  return undefined;
}

function dueText(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Pop = "labels" | "members" | "due" | "move" | "menu" | "checklist";

/**
 * A card opened at #card-<id>, over its board (R-CARD-03): its list, title,
 * labels, members, due date, done, description, and its menu. Active cards
 * come from the board's live data; archived ones (or ones in an archived
 * list) are read from the API and shown read-only, with Restore and Delete.
 */
export function CardDialog({
  cardId,
  data,
  token,
  canEdit,
  change,
  attempt,
  update,
  subscribe,
  commentId = null,
  onClose,
}: {
  cardId: number;
  data: BoardData;
  token: string;
  /** Editor or owner, on an open board. */
  canEdit: boolean;
  change: Change;
  attempt: Attempt;
  update: (change: (data: BoardData) => BoardData) => void;
  /** The board's events, for the comments and activity panel. */
  subscribe: (listener: (event: BoardEvent) => void) => () => void;
  /** A comment to highlight, from a #card-…-comment-… link. */
  commentId?: number | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const { session } = useSession();
  const myId = session.status === "signedIn" ? session.user.id : 0;
  const dialog = useRef<HTMLDivElement>(null);
  // The open popover and the button it hangs from (taken from the click).
  const [pop, setPop] = useState<{ kind: Pop; anchor: HTMLElement } | null>(null);
  const [fetched, setFetched] = useState<Card | null>(null);
  const [missing, setMissing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const checklists = useChecklists(cardId, token, attempt, subscribe);
  useEscape(onClose);

  const liveCard = findCard(data, cardId);
  const card = liveCard ?? fetched;

  // Not on the board: archived, or in an archived list. Read it from the API,
  // and again whenever it leaves the board (archived while open).
  useEffect(() => {
    // On the board, or already held as archived (from our own archive): no read.
    if (liveCard || (fetched?.id === cardId && fetched.archived_at)) return;
    let cancelled = false;
    getCard(token, cardId)
      .then((found) => {
        if (!cancelled) setFetched(found);
      })
      .catch((error: unknown) => {
        if (!cancelled && error instanceof ApiError && error.status === 404)
          setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [liveCard === undefined, cardId, token, fetched?.archived_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deleted while open, by anyone. An archived card isn't on the board, so
  // the board's own update can't show that it's gone.
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "card.deleted" && event.data?.card_id === cardId)
          setMissing(true);
      }),
    [subscribe, cardId],
  );

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const list = card ? data.lists.find((item) => item.id === card.list_id) : undefined;
  const archived = Boolean(card?.archived_at);
  const listArchived = card !== null && card !== undefined && !archived && !list;
  // An archived card, or one in an archived list, is read-only (the API's
  // "frozen" rule) until it's restored.
  const editable = canEdit && !archived && !listArchived;

  function save(what: string, changes: edit.CardChange) {
    if (!card) return;
    void change(
      what,
      (current) => local.changeCard(current, card.id, changes as Partial<Card>),
      () => edit.updateCard(token, card.id, changes),
    );
  }

  function toggle(ids: number[], id: number): number[] {
    return ids.includes(id)
      ? ids.filter((other) => other !== id)
      : [...ids, id].sort((a, b) => a - b);
  }

  async function createLabelFor(
    current: Card,
    values: { name: string; color: Label["color"] },
  ) {
    const label = await attempt("create the label", () =>
      edit.createLabel(token, data.board.id, values),
    );
    if (!label) return;
    update((board) =>
      board.labels.some((other) => other.id === label.id)
        ? board
        : { ...board, labels: [...board.labels, label] },
    );
    // A label created from a card is applied to it straight away (R-LABEL-03).
    save("apply the label", { label_ids: toggle(current.label_ids, label.id) });
  }

  const labelList = card
    ? card.label_ids
        .map((id) => data.labels.find((label) => label.id === id))
        .filter((label): label is Label => label !== undefined)
    : [];
  const assignees = card
    ? card.assignee_ids
        .map((id) => data.members.find((member) => member.user_id === id))
        .filter((member) => member !== undefined)
    : [];
  const due = card ? dueState(card) : null;

  return (
    <div
      className="scrim modal-z"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="modal card-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {missing ? (
          <>
            <div className="modal-head">
              <h2 id={titleId}>Card not found</h2>
              <button type="button" className="x" aria-label="Close" onClick={onClose}>
                ×
              </button>
            </div>
            <p className="muted">It was deleted, or it isn't on this board.</p>
          </>
        ) : !card ? (
          <p id={titleId} className="muted" aria-busy="true">
            Loading the card…
          </p>
        ) : (
          <>
            {archived && (
              <div className="banner" role="status">
                This card was archived{" "}
                {card.archived_at ? timeAgo(card.archived_at) : ""}. Restore it to
                change it.
              </div>
            )}
            {listArchived && (
              <div className="banner" role="status">
                Its list is archived, so this card can't be changed.
              </div>
            )}
            <div className="card-h">
              {editable ? (
                <button
                  type="button"
                  className={card.due_complete ? "done-tog on" : "done-tog"}
                  aria-pressed={card.due_complete}
                  aria-label={card.due_complete ? "Mark not done" : "Mark done"}
                  onClick={() =>
                    save(
                      card.due_complete
                        ? "mark the card not done"
                        : "mark the card done",
                      {
                        due_complete: !card.due_complete,
                      },
                    )
                  }
                >
                  <CheckIcon />
                </button>
              ) : (
                card.due_complete && (
                  <span className="done-tog on" role="img" aria-label="Done">
                    <CheckIcon />
                  </span>
                )
              )}
              <h2
                id={titleId}
                className={
                  card.due_complete ? "card-h-heading is-done" : "card-h-heading"
                }
              >
                <InlineEdit
                  value={card.title}
                  label="Card title"
                  className="card-h-title"
                  inputClassName="title-input"
                  editable={editable}
                  onSave={(title) => save("rename the card", { title })}
                />
              </h2>
              {canEdit && !listArchived && (
                <button
                  type="button"
                  className="ghost sm"
                  aria-label="Card actions"
                  onClick={(event) =>
                    setPop({ kind: "menu", anchor: event.currentTarget })
                  }
                >
                  <DotsIcon />
                </button>
              )}
              <button type="button" className="x" aria-label="Close" onClick={onClose}>
                ×
              </button>
            </div>
            <p className="in-list">
              {editable ? (
                <button
                  type="button"
                  className="btn sm"
                  aria-label={`In list ${list?.name ?? ""}. Move card`}
                  onClick={(event) =>
                    setPop({ kind: "move", anchor: event.currentTarget })
                  }
                >
                  In list <b>{list?.name}</b> ▾
                </button>
              ) : (
                <span>
                  {list ? (
                    <>
                      In list <b>{list.name}</b>
                    </>
                  ) : (
                    "In an archived list"
                  )}
                </span>
              )}
              <span className="cardno">#{card.id}</span>
            </p>

            <div className="dlg-body">
              <div className="dlg-main">
                <div className="details">
                  <section className="detail" aria-label="Labels">
                    <h3>Labels</h3>
                    <div className="row">
                      {labelList.map((label) => (
                        <LabelChip key={label.id} label={label} />
                      ))}
                      {editable && (
                        <button
                          type="button"
                          className="btn sm"
                          aria-label="Edit labels"
                          onClick={(event) =>
                            setPop({ kind: "labels", anchor: event.currentTarget })
                          }
                        >
                          +
                        </button>
                      )}
                      {!editable && labelList.length === 0 && (
                        <span className="muted">None</span>
                      )}
                    </div>
                  </section>
                  <section className="detail" aria-label="Members">
                    <h3>Members</h3>
                    <div className="row">
                      <span className="avs">
                        {assignees.map((member) => (
                          <Avatar key={member.user_id} member={member} />
                        ))}
                      </span>
                      {editable && (
                        <button
                          type="button"
                          className="btn sm"
                          aria-label="Edit members"
                          onClick={(event) =>
                            setPop({ kind: "members", anchor: event.currentTarget })
                          }
                        >
                          +
                        </button>
                      )}
                      {!editable && assignees.length === 0 && (
                        <span className="muted">None</span>
                      )}
                    </div>
                  </section>
                  <section className="detail" aria-label="Due date">
                    <h3>Due date</h3>
                    <div className="row">
                      {card.due_at && due ? (
                        <span className={`due ${due}`}>
                          <ClockIcon />
                          {dueText(card.due_at)}
                          {DUE_WORD[due] && <b>{DUE_WORD[due]}</b>}
                        </span>
                      ) : (
                        <span className="muted">None</span>
                      )}
                      {editable && (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={(event) =>
                            setPop({ kind: "due", anchor: event.currentTarget })
                          }
                        >
                          {card.due_at ? "Change" : "Add"}
                        </button>
                      )}
                    </div>
                  </section>
                  <section className="detail" aria-label="Checklists">
                    <h3>Checklists</h3>
                    <div className="row">
                      <ChecklistSummary lists={checklists.checklists} />
                      {editable && (
                        <button
                          type="button"
                          className="btn sm"
                          aria-label="Add a checklist"
                          onClick={(event) =>
                            setPop({ kind: "checklist", anchor: event.currentTarget })
                          }
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </section>
                </div>

                <Description
                  text={card.description}
                  editable={editable}
                  onSave={(description) =>
                    save("save the description", { description })
                  }
                />
                <Checklists handle={checklists} editable={editable} />
              </div>
              <aside className="dlg-side">
                <CardFeed
                  cardId={card.id}
                  boardId={data.board.id}
                  token={token}
                  context={{
                    lists: data.lists,
                    labels: data.labels,
                    members: data.members,
                    myId,
                  }}
                  members={data.members}
                  isOwner={data.board.role === "owner"}
                  canWrite={editable}
                  // The API lets authors and the owner delete comments even on a
                  // frozen card, so tidying up doesn't need a restore first.
                  canDelete={canEdit}
                  readOnlyNote={
                    editable
                      ? null
                      : archived
                        ? "Restore the card to comment on it."
                        : listArchived
                          ? "Restore its list to comment on it."
                          : data.board.closed_at
                            ? "The board is closed, so comments are read-only."
                            : "Viewers can read comments but not write them."
                  }
                  highlightId={commentId}
                  subscribe={subscribe}
                />
              </aside>
            </div>
          </>
        )}
      </div>

      {card && pop?.kind === "labels" && (
        <LabelsPopover
          card={card}
          labels={data.labels}
          anchor={pop.anchor}
          onClose={() => setPop(null)}
          onToggle={(id) =>
            save("change the labels", { label_ids: toggle(card.label_ids, id) })
          }
          onCreate={(values) => void createLabelFor(card, values)}
          onUpdate={(id, values) =>
            void change(
              "change the label",
              (board) => ({
                ...board,
                labels: board.labels.map((label) =>
                  label.id === id ? { ...label, ...values } : label,
                ),
              }),
              () => edit.updateLabel(token, id, values),
            )
          }
          onDelete={(id) =>
            void change(
              "delete the label",
              (board) => ({
                ...board,
                labels: board.labels.filter((label) => label.id !== id),
                lists: board.lists.map((item) => ({
                  ...item,
                  cards: item.cards.map((other) => ({
                    ...other,
                    label_ids: other.label_ids.filter((labelId) => labelId !== id),
                  })),
                })),
              }),
              () => edit.deleteLabel(token, id),
            )
          }
        />
      )}
      {card && pop?.kind === "members" && (
        <MembersPopover
          card={card}
          members={data.members}
          anchor={pop.anchor}
          onClose={() => setPop(null)}
          onToggle={(id) =>
            save("change the members", { assignee_ids: toggle(card.assignee_ids, id) })
          }
        />
      )}
      {card && pop?.kind === "due" && (
        <DuePopover
          card={card}
          anchor={pop.anchor}
          onClose={() => setPop(null)}
          onSave={(dueAt) => {
            save(dueAt ? "set the due date" : "remove the due date", { due_at: dueAt });
            setPop(null);
          }}
        />
      )}
      {card && pop?.kind === "move" && (
        <MovePopover
          card={card}
          lists={data.lists}
          anchor={pop.anchor}
          onClose={() => setPop(null)}
          onMove={(listId, position) =>
            void change(
              "move the card",
              (board) => local.moveCard(board, card.id, listId, position),
              () => edit.updateCard(token, card.id, { list_id: listId, position }),
            )
          }
        />
      )}
      {card && pop?.kind === "checklist" && (
        <AddChecklistPopover
          anchor={pop.anchor}
          onClose={() => setPop(null)}
          onAdd={(title) => {
            setPop(null);
            void checklists.add(title);
          }}
        />
      )}
      {card && pop?.kind === "menu" && (
        <Popover title="Card actions" anchor={pop.anchor} onClose={() => setPop(null)}>
          <div className="menu">
            {archived ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPop(null);
                    void change(
                      "restore the card",
                      null,
                      () => edit.restoreCard(token, card.id),
                      (restored) => (board) => local.addCard(board, restored),
                    );
                  }}
                >
                  Restore to the board
                </button>
                <button
                  type="button"
                  className="danger-text"
                  onClick={() => {
                    setPop(null);
                    setConfirmDelete(true);
                  }}
                >
                  Delete for good…
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPop(editable ? { kind: "move", anchor: pop.anchor } : null);
                  }}
                >
                  Move…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPop(null);
                    // No confirmation (R-CARD-08): an archived card is easy to restore.
                    // Not optimistic: taking the card off the board first would
                    // make this dialog re-read it before the archive happened.
                    // The API's answer (the archived card) is kept, then the
                    // card leaves the board.
                    void change(
                      "archive the card",
                      null,
                      () => edit.archiveCard(token, card.id),
                      (archivedCard) => {
                        setFetched(archivedCard);
                        return (board) => local.removeCard(board, card.id);
                      },
                    );
                  }}
                >
                  Archive
                </button>
              </>
            )}
          </div>
        </Popover>
      )}
      {card && confirmDelete && (
        <ConfirmDialog
          title={`Delete “${card.title}”?`}
          message="The card and its comments are deleted for good. This can't be undone; the board's activity only keeps a note that it was deleted."
          confirmLabel="Delete card"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void change("delete the card", null, () =>
              edit.deleteCard(token, card.id),
            ).then((done) => {
              if (done) onClose();
            });
          }}
        />
      )}
    </div>
  );
}

function ChecklistSummary({
  lists,
}: {
  lists: { items: { done: boolean }[] }[] | null;
}) {
  if (!lists) return null;
  const items = lists.flatMap((list) => list.items);
  if (lists.length === 0) return <span className="muted">None</span>;
  return (
    <span className="muted">
      {items.filter((item) => item.done).length}/{items.length} done
    </span>
  );
}

/** Names a new checklist; "Checklist" is offered, selected, so typing replaces it (R-CHECK-01). */
function AddChecklistPopover({
  anchor,
  onClose,
  onAdd,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  onAdd: (title: string) => void;
}) {
  const fieldId = useId();
  const [title, setTitle] = useState("Checklist");
  return (
    <Popover title="Add a checklist" anchor={anchor} onClose={onClose}>
      <form
        className="blk"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd(title.trim() || "Checklist");
        }}
      >
        <label className="lab" htmlFor={fieldId}>
          Title
        </label>
        <input
          id={fieldId}
          className="field"
          maxLength={100}
          autoComplete="off"
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div>
          <button type="submit" className="btn primary">
            Add
          </button>
        </div>
      </form>
    </Popover>
  );
}

/** The card's Markdown description: shown formatted, edited as text with Save and Cancel (R-CARD-04). */
function Description({
  text,
  editable,
  onSave,
}: {
  text: string | null;
  editable: boolean;
  onSave: (text: string | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      // Escape means "stop editing", not "close the card".
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      setDraft(null);
    }
  }

  return (
    <section className="detail" aria-label="Description">
      <div className="row">
        <h3>Description</h3>
        {editable && draft === null && text && (
          <button type="button" className="btn sm" onClick={() => setDraft(text)}>
            Edit
          </button>
        )}
      </div>
      {draft !== null ? (
        <div className="blk">
          <textarea
            className="field"
            aria-label="Description"
            maxLength={2000}
            rows={6}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <p className="hint">
            Markdown works: **bold**, _italic_, lists, links and `code`.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const value = draft.trim();
                setDraft(null);
                if (value !== (text ?? "")) onSave(value || null);
              }}
            >
              Save
            </button>
            <button type="button" className="btn" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : text ? (
        <Markdown text={text} className="desc" />
      ) : editable ? (
        <button type="button" className="desc-empty" onClick={() => setDraft("")}>
          Add a more detailed description…
        </button>
      ) : (
        <p className="muted">No description.</p>
      )}
    </section>
  );
}
