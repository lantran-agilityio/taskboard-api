import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import * as api from "../api/checklists";
import type { Checklist, ChecklistItem, ItemChange } from "../api/checklists";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DotsIcon, GripIcon } from "../components/icons";
import { plural } from "../format";
import { InlineEdit } from "../components/InlineEdit";
import { Popover } from "../components/Popover";
import { useQueue } from "../components/queue";
import type { Attempt } from "./CardDialog";
import { Avatar } from "./CardFront";
import { localParts, shortDay } from "./dates";
import {
  applyChecklistEvent,
  changeItem,
  isOverdue,
  progress,
  putChecklist,
  putItem,
  removeChecklist,
  removeItem,
} from "./checklists";
import type { BoardEvent, Member } from "./model";
import { fullIndex, moveTo } from "./reorder";
import { useDragSort, useReorder } from "./useReorder";

export interface ChecklistsHandle {
  /** null while loading. */
  checklists: Checklist[] | null;
  failed: boolean;
  /** The checklist whose "Add an item" form is open. */
  addingTo: number | null;
  setAddingTo: (id: number | null) => void;
  add: (title: string) => Promise<void>;
  rename: (checklist: Checklist, title: string) => void;
  remove: (checklist: Checklist) => void;
  addItem: (checklist: Checklist, text: string) => Promise<void>;
  toggle: (item: ChecklistItem) => void;
  /** Text, assignee or due date; shown at once, then saved. */
  editItem: (item: ChecklistItem, change: ItemChange) => void;
  /** Moves to a 0-based position (R-CHECK-06): shown at once, then saved. */
  moveChecklist: (checklist: Checklist, index: number) => void;
  moveItem: (item: ChecklistItem, index: number) => void;
  removeItem: (item: ChecklistItem) => void;
}

function isChecklistEvent(event: BoardEvent): boolean {
  return (
    event.type.startsWith("checklist.") || event.type.startsWith("checklist_item.")
  );
}

/**
 * One card's checklists: read from the API when the card opens, kept in step
 * by the board's checklist events, and re-read after a reconnect (events may
 * have been missed) or a refused change.
 */
export function useChecklists(
  cardId: number,
  token: string,
  attempt: Attempt,
  subscribe: (listener: (event: BoardEvent) => void) => () => void,
): ChecklistsHandle {
  const [checklists, setChecklists] = useState<Checklist[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  // Bumped to read the checklists again.
  const [reads, setReads] = useState(0);
  const reread = () => setReads((count) => count + 1);
  // Events that arrive while a read is in flight. The read's answer may be
  // older than them, so they're applied again on top of it (events carry the
  // new state, so applying one twice changes nothing), as useBoard does.
  const during = useRef<BoardEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    during.current = [];
    api
      .listChecklists(token, cardId)
      .then((found) => {
        if (cancelled) return;
        const missed = during.current ?? [];
        during.current = null;
        setChecklists(missed.reduce(applyChecklistEvent, found));
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        during.current = null;
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cardId, token, reads]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "resync") {
          reread();
          return;
        }
        if (!isChecklistEvent(event) || event.data?.card_id !== cardId) return;
        during.current?.push(event);
        const missing =
          event.type.startsWith("checklist_item.") &&
          !(checklists ?? []).some((list) => list.id === event.data.item?.checklist_id);
        // An item for a checklist we don't hold: an earlier event was missed.
        if (missing && event.type !== "checklist_item.deleted") reread();
        else setChecklists((current) => current && applyChecklistEvent(current, event));
      }),
    [subscribe, cardId, checklists],
  );

  function apply(change: (current: Checklist[]) => Checklist[]) {
    setChecklists((current) => current && change(current));
  }

  return {
    checklists,
    failed,
    addingTo,
    setAddingTo,
    async add(title) {
      const made = await attempt("add the checklist", () =>
        api.createChecklist(token, cardId, title),
      );
      if (!made) return reread();
      apply((current) => putChecklist(current, made));
      // Straight on to its first item, as people add items one after another.
      setAddingTo(made.id);
    },
    rename(checklist, title) {
      void attempt("rename the checklist", () =>
        api.renameChecklist(token, checklist.id, title),
      ).then((renamed) => {
        if (renamed) apply((current) => putChecklist(current, renamed));
        else reread();
      });
    },
    remove(checklist) {
      apply((current) => removeChecklist(current, checklist.id));
      void attempt("delete the checklist", () =>
        api.deleteChecklist(token, checklist.id),
      ).then((done) => {
        // A 204 resolves to undefined; null means the API refused.
        if (done === null) reread();
      });
    },
    async addItem(checklist, text) {
      const made = await attempt("add the item", () =>
        api.createItem(token, checklist.id, text),
      );
      if (made) apply((current) => putItem(current, made));
      else reread();
    },
    toggle(item) {
      // Shown at once: ticking is the most common change and should feel instant.
      apply((current) => changeItem(current, item.id, { done: !item.done }));
      void attempt(item.done ? "untick the item" : "tick the item", () =>
        api.updateItem(token, item.id, { done: !item.done }),
      ).then((saved) => {
        if (saved) apply((current) => putItem(current, saved));
        else reread();
      });
    },
    editItem(item, change) {
      apply((current) => changeItem(current, item.id, change));
      void attempt("change the item", () =>
        api.updateItem(token, item.id, change),
      ).then((saved) => {
        if (saved) apply((current) => putItem(current, saved));
        else reread();
      });
    },
    moveChecklist(checklist, index) {
      if (checklist.position === index) return;
      apply((current) => moveTo(current, checklist.id, index));
      void attempt("move the checklist", () =>
        api.moveChecklist(token, checklist.id, index),
      ).then((saved) => {
        if (saved) apply((current) => putChecklist(current, saved));
        else reread();
      });
    },
    moveItem(item, index) {
      if (item.position === index) return;
      apply((current) =>
        current.map((checklist) =>
          checklist.id === item.checklist_id
            ? { ...checklist, items: moveTo(checklist.items, item.id, index) }
            : checklist,
        ),
      );
      void attempt("move the item", () =>
        api.updateItem(token, item.id, { position: index }),
      ).then((saved) => {
        if (saved) apply((current) => putItem(current, saved));
        else reread();
      });
    },
    removeItem(item) {
      apply((current) => removeItem(current, item.id));
      void attempt("delete the item", () => api.deleteItem(token, item.id)).then(
        (done) => {
          if (done === null) reread();
        },
      );
    },
  };
}

const HIDE_KEY = "taskboard.hideTicked.";

// Hiding ticked items is a choice for this browser only (the API keeps no
// such flag), so it lives in localStorage, which may be unavailable.
function readHidden(checklistId: number): boolean {
  try {
    return localStorage.getItem(HIDE_KEY + checklistId) === "1";
  } catch {
    return false;
  }
}

function writeHidden(checklistId: number, hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HIDE_KEY + checklistId, "1");
    else localStorage.removeItem(HIDE_KEY + checklistId);
  } catch {
    // Still hidden for now, just not remembered.
  }
}

/** The card's checklists, under its description (R-CHECK-01 to R-CHECK-04). */
export function Checklists({
  handle,
  editable,
  members,
}: {
  handle: ChecklistsHandle;
  /** Editor or owner, on an open board, and the card isn't frozen. */
  editable: boolean;
  /** The board's people: item assignees are picked from them. */
  members: Member[];
}) {
  const [confirm, setConfirm] = useState<Checklist | null>(null);
  const lists = handle.checklists ?? [];
  const byId = (id: number) => lists.find((checklist) => checklist.id === id)!;
  const keys = useReorder({
    ids: lists.map((checklist) => checklist.id),
    name: (id) => `the checklist “${byId(id).title}”`,
    onDrop: (id, index) => handle.moveChecklist(byId(id), index),
  });
  const drag = useDragSort((id, index) => handle.moveChecklist(byId(id), index));
  if (handle.failed && !handle.checklists) {
    return <p className="muted">Couldn't load the checklists.</p>;
  }
  if (!handle.checklists) return null;
  const others = keys.order.filter((id) => id !== drag.dragId);
  return (
    <>
      <div className="checklists" {...(editable ? drag.containerProps : {})}>
        {keys.order.map((id) => (
          <ChecklistBlock
            key={id}
            checklist={byId(id)}
            handle={handle}
            editable={editable}
            members={members}
            onDelete={() => setConfirm(byId(id))}
            sort={
              editable
                ? {
                    drag: drag.itemProps(id),
                    grip: keys.handleProps(id),
                    held: keys.held?.id === id,
                    dragging: drag.dragId === id,
                    dropBefore: drag.dropAt !== null && others[drag.dropAt] === id,
                  }
                : undefined
            }
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {keys.announcement}
      </p>
      {confirm && (
        <ConfirmDialog
          title={`Delete the checklist “${confirm.title}”?`}
          message={`Its ${plural(confirm.items.length, "item")} ${
            confirm.items.length === 1 ? "is" : "are"
          } deleted too. This can't be undone.`}
          confirmLabel="Delete checklist"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            handle.remove(confirm);
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}

/** How one checklist or item is moved: drag props, its grip's keys, and its state. */
interface Sortable {
  drag: ReturnType<ReturnType<typeof useDragSort>["itemProps"]>;
  grip: ReturnType<ReturnType<typeof useReorder>["handleProps"]>;
  held: boolean;
  dragging: boolean;
  dropBefore: boolean;
}

function sortClass(base: string, sort: Sortable | undefined): string {
  return [
    base,
    sort?.held && "held",
    sort?.dragging && "dragging",
    sort?.dropBefore && "drop-before",
  ]
    .filter(Boolean)
    .join(" ");
}

function ChecklistBlock({
  checklist,
  handle,
  editable,
  members,
  onDelete,
  sort,
}: {
  checklist: Checklist;
  handle: ChecklistsHandle;
  editable: boolean;
  members: Member[];
  onDelete: () => void;
  /** Given to those who can edit: how this checklist is moved (R-CHECK-06). */
  sort?: Sortable;
}) {
  const [hidden, setHidden] = useState(() => readHidden(checklist.id));
  const [options, setOptions] = useState<{
    item: ChecklistItem;
    anchor: HTMLElement;
  } | null>(null);
  const { done, total, percent } = progress(checklist);
  // The toggle only shows once something is ticked (R-CHECK-03).
  const hiding = hidden && done > 0;
  const itemById = (id: number) => checklist.items.find((item) => item.id === id)!;
  const allIds = checklist.items.map((item) => item.id);
  // Only the items on screen take part, so positions match what people see.
  const visibleIds = checklist.items
    .filter((item) => !(hiding && item.done))
    .map((item) => item.id);
  function drop(id: number, index: number) {
    handle.moveItem(itemById(id), fullIndex(allIds, visibleIds, id, index));
  }
  const keys = useReorder({
    ids: visibleIds,
    name: (id) => `the item “${itemById(id).text}”`,
    onDrop: drop,
  });
  const drag = useDragSort(drop);
  const shown = keys.order.map(itemById);
  const others = shown.filter((item) => item.id !== drag.dragId);

  function setHiddenTo(value: boolean) {
    setHidden(value);
    writeHidden(checklist.id, value);
  }

  return (
    <section
      className={sortClass("detail checklist", sort)}
      aria-label={checklist.title}
      data-sort-id={sort?.drag["data-sort-id"]}
    >
      <div
        className="blk-head"
        draggable={sort ? true : undefined}
        onDragStart={sort?.drag.onDragStart}
        onDragEnd={sort?.drag.onDragEnd}
      >
        {sort && (
          <button
            type="button"
            className="ghost sm grip"
            aria-label={`Move the checklist ${checklist.title}`}
            {...sort.grip}
          >
            <GripIcon />
          </button>
        )}
        <h3>
          <InlineEdit
            value={checklist.title}
            label="Checklist title"
            className="checklist-title"
            inputClassName="title-input checklist-input"
            editable={editable}
            onSave={(title) => handle.rename(checklist, title)}
          />
        </h3>
        {done > 0 && (
          <button type="button" className="btn sm" onClick={() => setHiddenTo(!hiding)}>
            {hiding ? `Show ticked items (${done})` : "Hide ticked items"}
          </button>
        )}
        {editable && (
          <button type="button" className="btn sm" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
      <div className="progress">
        <span>{percent}%</span>
        <div
          className="bar"
          role="progressbar"
          aria-label={`${checklist.title}: ${done} of ${total} done`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <i
            className={percent === 100 ? "full" : ""}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      {shown.length > 0 && (
        <ul
          className={
            drag.dropAt !== null && drag.dropAt >= others.length
              ? "items drop-end"
              : "items"
          }
          {...(editable ? drag.containerProps : {})}
        >
          {shown.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              sort={
                editable
                  ? {
                      drag: drag.itemProps(item.id),
                      grip: keys.handleProps(item.id),
                      held: keys.held?.id === item.id,
                      dragging: drag.dragId === item.id,
                      dropBefore:
                        drag.dropAt !== null && others[drag.dropAt]?.id === item.id,
                    }
                  : undefined
              }
              assignee={members.find((member) => member.user_id === item.assignee_id)}
              editable={editable}
              onToggle={() => handle.toggle(item)}
              onOptions={(anchor) => setOptions({ item, anchor })}
            />
          ))}
        </ul>
      )}
      {hiding && shown.length === 0 && <p className="hint">Every item is ticked.</p>}
      <p className="sr-only" aria-live="polite">
        {keys.announcement}
      </p>
      {editable &&
        (handle.addingTo === checklist.id ? (
          <AddItemForm
            onAdd={(text) => handle.addItem(checklist, text)}
            onDone={() => handle.setAddingTo(null)}
          />
        ) : (
          <div>
            <button
              type="button"
              className="btn sm"
              onClick={() => handle.setAddingTo(checklist.id)}
            >
              Add an item
            </button>
          </div>
        ))}
      {options && (
        <ItemOptions
          item={options.item}
          members={members}
          anchor={options.anchor}
          onClose={() => setOptions(null)}
          onSave={(change) => {
            if (Object.keys(change).length > 0) handle.editItem(options.item, change);
            setOptions(null);
          }}
          onDelete={() => {
            handle.removeItem(options.item);
            setOptions(null);
          }}
        />
      )}
    </section>
  );
}

function ItemRow({
  item,
  sort,
  assignee,
  editable,
  onToggle,
  onOptions,
}: {
  item: ChecklistItem;
  sort?: Sortable;
  assignee: Member | undefined;
  editable: boolean;
  onToggle: () => void;
  onOptions: (anchor: HTMLElement) => void;
}) {
  const id = useId();
  return (
    <li className={sortClass(item.done ? "item done" : "item", sort)} {...sort?.drag}>
      {sort && (
        <button
          type="button"
          className="ghost sm grip"
          aria-label={`Move ${item.text}`}
          {...sort.grip}
        >
          <GripIcon />
        </button>
      )}
      <input
        type="checkbox"
        id={id}
        checked={item.done}
        disabled={!editable}
        onChange={onToggle}
      />
      <label className="t" htmlFor={id}>
        {item.text}
      </label>
      {item.due_at && (
        <span
          className={isOverdue(item) ? "due overdue" : "due upcoming"}
          title="Item due"
        >
          {shortDay(item.due_at)}
        </span>
      )}
      {assignee && <Avatar member={assignee} small />}
      {editable && (
        <button
          type="button"
          className="ghost sm"
          aria-label={`Item options for ${item.text}`}
          onClick={(event) => onOptions(event.currentTarget)}
        >
          <DotsIcon />
        </button>
      )}
    </li>
  );
}

/** Adds items one after another: the field stays open and empties after each. */
function AddItemForm({
  onAdd,
  onDone,
}: {
  onAdd: (text: string) => Promise<void>;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  // Items typed in a row are saved in that order.
  const queue = useQueue();

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    queue(() => onAdd(value));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      // Escape closes this form, not the card.
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      onDone();
    }
  }

  return (
    <form className="blk tight" onSubmit={submit}>
      <input
        className="field"
        aria-label="New item"
        placeholder="Add an item"
        maxLength={500}
        autoComplete="off"
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="row">
        <button type="submit" className="btn primary sm">
          Add
        </button>
        <button type="button" className="btn sm" onClick={onDone}>
          Done
        </button>
      </div>
    </form>
  );
}

/** "2026-11-20T17:00" for a datetime-local field, in the browser's time zone. */
function localDateTime(iso: string | null): string {
  if (!iso) return "";
  const { day, time } = localParts(new Date(iso));
  return `${day}T${time}`;
}

/**
 * An item's options: its text, its own assignee and due date (R-CHECK-05), and
 * delete. Saving sends only what changed; an empty due field clears the date.
 */
function ItemOptions({
  item,
  members,
  anchor,
  onClose,
  onSave,
  onDelete,
}: {
  item: ChecklistItem;
  members: Member[];
  anchor: HTMLElement;
  onClose: () => void;
  onSave: (change: ItemChange) => void;
  onDelete: () => void;
}) {
  const fieldId = useId();
  const assigneeId = useId();
  const dueId = useId();
  const [text, setText] = useState(item.text);
  const [assignee, setAssignee] = useState(item.assignee_id?.toString() ?? "");
  const [due, setDue] = useState(localDateTime(item.due_at));
  return (
    <Popover title="Item" anchor={anchor} onClose={onClose}>
      <form
        className="blk"
        onSubmit={(event) => {
          event.preventDefault();
          const change: ItemChange = {};
          const value = text.trim();
          // An empty text keeps the old one, as renaming elsewhere does.
          if (value && value !== item.text) change.text = value;
          const assigneeValue = assignee ? Number(assignee) : null;
          if (assigneeValue !== item.assignee_id) change.assignee_id = assigneeValue;
          // Compared in the field's own form, so an unchanged date isn't resent.
          if (due !== localDateTime(item.due_at)) {
            change.due_at = due ? new Date(due).toISOString() : null;
          }
          onSave(change);
        }}
      >
        <label className="lab" htmlFor={fieldId}>
          Text
        </label>
        <input
          id={fieldId}
          className="field"
          maxLength={500}
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <label className="lab" htmlFor={assigneeId}>
          Assignee
        </label>
        <select
          id={assigneeId}
          className="field"
          value={assignee}
          onChange={(event) => setAssignee(event.target.value)}
        >
          <option value="">No one</option>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.email}
            </option>
          ))}
        </select>
        <label className="lab" htmlFor={dueId}>
          Due
        </label>
        <input
          id={dueId}
          type="datetime-local"
          className="field"
          value={due}
          onChange={(event) => setDue(event.target.value)}
        />
        <div className="row">
          <button type="submit" className="btn primary">
            Save
          </button>
          <span className="grow" />
          <button type="button" className="btn" onClick={onDelete}>
            Delete item
          </button>
        </div>
      </form>
    </Popover>
  );
}
