import { useState, type CSSProperties, type FormEvent } from "react";

import { ConfirmDialog } from "../components/ConfirmDialog";
import { Popover } from "../components/Popover";
import {
  datesChange,
  keepInOrder,
  localParts,
  type DatesChange,
  type DatesForm,
} from "./dates";
import type { Card, Label, LabelColor, ListWithCards, Member } from "./model";

export const COLORS: LabelColor[] = [
  "green",
  "yellow",
  "orange",
  "red",
  "purple",
  "blue",
];

export function LabelChip({ label, large = false }: { label: Label; large?: boolean }) {
  return (
    <span
      className={`lbl ${label.color}${large ? " lg" : ""}`}
      style={{ "--c": `var(--l-${label.color})` } as CSSProperties}
      title={label.name || `${label.color} label`}
    >
      {label.name}
    </span>
  );
}

function byColor(a: Label, b: Label): number {
  return COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || a.id - b.id;
}

/**
 * Ticks the board's labels on and off for a card (R-LABEL-02), searchable and
 * grouped by colour, and opens the editor to create (R-LABEL-03), change
 * (R-LABEL-04) or delete (R-LABEL-05) a label.
 */
export function LabelsPopover({
  card,
  labels,
  anchor,
  onClose,
  onToggle,
  onCreate,
  onUpdate,
  onDelete,
}: {
  card: Card;
  labels: Label[];
  anchor: HTMLElement | null;
  onClose: () => void;
  onToggle: (labelId: number) => void;
  onCreate: (label: { name: string; color: LabelColor }) => void;
  onUpdate: (labelId: number, change: { name: string; color: LabelColor }) => void;
  onDelete: (labelId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Label | "new" | null>(null);

  if (editing !== null) {
    return (
      <LabelEditor
        key={editing === "new" ? "new" : editing.id}
        label={editing === "new" ? null : editing}
        anchor={anchor}
        onClose={() => setEditing(null)}
        onSave={(values) => {
          if (editing === "new") onCreate(values);
          else onUpdate(editing.id, values);
          setEditing(null);
        }}
        onDelete={
          editing === "new"
            ? undefined
            : () => {
                onDelete(editing.id);
                setEditing(null);
              }
        }
      />
    );
  }

  const term = search.trim().toLowerCase();
  const shown = labels
    .filter(
      (label) => !term || `${label.name} ${label.color}`.toLowerCase().includes(term),
    )
    .sort(byColor);

  return (
    <Popover key="labels" title="Labels" anchor={anchor} onClose={onClose}>
      <input
        className="field"
        aria-label="Search labels"
        placeholder="Search labels"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="blk tight">
        {shown.map((label) => (
          <div key={label.id} className="lbl-row">
            <label className="lbl-check">
              <input
                type="checkbox"
                checked={card.label_ids.includes(label.id)}
                onChange={() => onToggle(label.id)}
                aria-label={
                  label.name ? `${label.name} (${label.color})` : `${label.color} label`
                }
              />
              <LabelChip label={label} />
            </label>
            <button
              type="button"
              className="ghost sm"
              aria-label={`Edit label ${label.name || label.color}`}
              onClick={() => setEditing(label)}
            >
              ✎
            </button>
          </div>
        ))}
        {shown.length === 0 && <p className="hint">No labels match.</p>}
      </div>
      <button type="button" className="btn wide" onClick={() => setEditing("new")}>
        Create a label
      </button>
    </Popover>
  );
}

/** A label's name (optional) and colour (one of the API's six). */
export function LabelEditor({
  label,
  anchor,
  onClose,
  onSave,
  onDelete,
}: {
  label: Label | null;
  anchor: HTMLElement | null;
  onClose: () => void;
  onSave: (values: { name: string; color: LabelColor }) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState<LabelColor>(label?.color ?? "green");
  const [confirming, setConfirming] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ name: name.trim(), color });
  }

  if (confirming && onDelete) {
    return (
      <ConfirmDialog
        title={`Delete the label “${label?.name || label?.color}”?`}
        message="It comes off every card that has it. This can't be undone."
        confirmLabel="Delete label"
        onCancel={() => setConfirming(false)}
        onConfirm={onDelete}
      />
    );
  }

  return (
    <Popover
      title={label ? "Edit label" : "Create a label"}
      anchor={anchor}
      onClose={onClose}
    >
      <form className="blk" onSubmit={submit}>
        <div className="lbl-preview">
          <LabelChip label={{ id: 0, board_id: 0, name: name.trim(), color }} large />
        </div>
        <div className="lab">
          <label htmlFor="label-name">Name (optional)</label>
          <input
            id="label-name"
            className="field"
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <fieldset className="swatches">
          <legend>Colour</legend>
          {COLORS.map((option) => (
            <label key={option} className="swatch" title={option}>
              <input
                type="radio"
                name="label-color"
                value={option}
                checked={color === option}
                onChange={() => setColor(option)}
                aria-label={option}
              />
              <span style={{ "--c": `var(--l-${option})` } as CSSProperties} />
            </label>
          ))}
        </fieldset>
        <div className="row">
          <button type="submit" className="btn primary">
            {label ? "Save" : "Create"}
          </button>
          {onDelete && (
            <button
              type="button"
              className="btn danger"
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </Popover>
  );
}

/**
 * Sets, changes or removes the card's start and due dates (R-DATE-01,
 * R-DATE-03). Each is ticked on or off. A start is a day, starting at today; a
 * due date has a time and starts at tomorrow, at the current time (past dates
 * are allowed). Changing one past the other moves the other, so they stay in
 * order and the API's rule (a start never after the due date) always holds.
 */
export function DatesPopover({
  card,
  anchor,
  onClose,
  onSave,
}: {
  card: Card;
  anchor: HTMLElement | null;
  onClose: () => void;
  onSave: (change: DatesChange) => void;
}) {
  // Read once, when the picker opens.
  const [form, setForm] = useState<DatesForm>(() => {
    const due = localParts(
      card.due_at ? new Date(card.due_at) : new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    const today = localParts(new Date()).day;
    return {
      hasStart: card.start_at !== null,
      startDay: card.start_at ? localParts(new Date(card.start_at)).day : today,
      // With no dates yet, the due date is ticked: it's the usual one to add.
      hasDue: card.due_at !== null || card.start_at === null,
      dueDay: due.day,
      dueTime: due.time,
    };
  });

  function change(changes: Partial<DatesForm>, changed: "start" | "due") {
    setForm((current) => keepInOrder({ ...current, ...changes }, changed));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changes = datesChange(card, form);
    if (Object.keys(changes).length > 0) onSave(changes);
    else onClose();
  }

  function removeAll() {
    const changes: DatesChange = {};
    if (card.start_at) changes.start_at = null;
    if (card.due_at) changes.due_at = null;
    onSave(changes);
  }

  return (
    <Popover title="Dates" anchor={anchor} onClose={onClose}>
      <form className="blk" onSubmit={submit}>
        <div className="lab">
          <label className="row">
            <input
              type="checkbox"
              checked={form.hasStart}
              onChange={(event) => change({ hasStart: event.target.checked }, "due")}
            />
            Start date
          </label>
          <input
            type="date"
            className="field"
            aria-label="Start day"
            required={form.hasStart}
            disabled={!form.hasStart}
            value={form.startDay}
            onChange={(event) => change({ startDay: event.target.value }, "start")}
          />
        </div>
        <div className="lab">
          <label className="row">
            <input
              type="checkbox"
              checked={form.hasDue}
              onChange={(event) => change({ hasDue: event.target.checked }, "start")}
            />
            Due date
          </label>
          <div className="row">
            <input
              type="date"
              className="field"
              aria-label="Due day"
              required={form.hasDue}
              disabled={!form.hasDue}
              value={form.dueDay}
              onChange={(event) => change({ dueDay: event.target.value }, "due")}
            />
            <input
              type="time"
              className="field"
              aria-label="Due time"
              required={form.hasDue}
              disabled={!form.hasDue}
              value={form.dueTime}
              onChange={(event) => change({ dueTime: event.target.value }, "due")}
            />
          </div>
        </div>
        <div className="row">
          <button type="submit" className="btn primary">
            Save
          </button>
          {(card.start_at || card.due_at) && (
            <button type="button" className="btn" onClick={removeAll}>
              Remove
            </button>
          )}
        </div>
      </form>
    </Popover>
  );
}

/** Assigns the board's people to the card (R-CARD-11), searchable. */
export function MembersPopover({
  card,
  members,
  anchor,
  onClose,
  onToggle,
}: {
  card: Card;
  members: Member[];
  anchor: HTMLElement | null;
  onClose: () => void;
  onToggle: (userId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const shown = members.filter((member) => member.email.toLowerCase().includes(term));
  return (
    <Popover title="Members" anchor={anchor} onClose={onClose}>
      <input
        className="field"
        aria-label="Search members"
        placeholder="Search members"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="blk tight">
        {shown.map((member) => (
          <label key={member.user_id} className="lbl-check">
            <input
              type="checkbox"
              checked={card.assignee_ids.includes(member.user_id)}
              onChange={() => onToggle(member.user_id)}
            />
            <span>{member.email}</span>
          </label>
        ))}
        {shown.length === 0 && <p className="hint">Nobody on this board matches.</p>}
      </div>
    </Popover>
  );
}

/**
 * Moves the card to a list and a position (R-CARD-07): positions are numbered
 * from 1, the current one is marked, and an empty list offers only 1.
 */
export function MovePopover({
  card,
  lists,
  anchor,
  onClose,
  onMove,
}: {
  card: Card;
  lists: ListWithCards[];
  anchor: HTMLElement | null;
  onClose: () => void;
  onMove: (listId: number, position: number) => void;
}) {
  const current = lists.find((list) => list.id === card.list_id);
  const currentIndex = current?.cards.findIndex((other) => other.id === card.id) ?? 0;
  const [listId, setListId] = useState(card.list_id);
  const [position, setPosition] = useState(currentIndex);
  const target = lists.find((list) => list.id === listId);
  // In its own list the card keeps a slot; elsewhere it adds one at the end.
  const slots = target
    ? target.cards.filter((other) => other.id !== card.id).length + 1
    : 1;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (listId !== card.list_id || position !== currentIndex) onMove(listId, position);
    onClose();
  }

  return (
    <Popover title="Move card" anchor={anchor} onClose={onClose}>
      <form className="blk" onSubmit={submit}>
        <div className="lab">
          <label htmlFor="move-card-list">List</label>
          <select
            id="move-card-list"
            className="field"
            value={listId}
            onChange={(event) => {
              const next = Number(event.target.value);
              setListId(next);
              const list = lists.find((item) => item.id === next);
              // Default to the end of another list, or back to its own place.
              setPosition(
                next === card.list_id ? currentIndex : (list?.cards.length ?? 0),
              );
            }}
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
                {list.id === card.list_id ? " (current)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="lab">
          <label htmlFor="move-card-position">Position</label>
          <select
            id="move-card-position"
            className="field"
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
          >
            {Array.from({ length: slots }, (_, index) => (
              <option key={index} value={index}>
                {index + 1}
                {listId === card.list_id && index === currentIndex ? " (current)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn primary">
          Move
        </button>
      </form>
    </Popover>
  );
}
