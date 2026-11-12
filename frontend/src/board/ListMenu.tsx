import { useState, type FormEvent } from "react";

import type { SortBy } from "../api/boardEdit";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Popover } from "../components/Popover";
import type { ListWithCards } from "./model";

const SORTS: { by: SortBy; label: string }[] = [
  { by: "created_desc", label: "Date created, newest first" },
  { by: "created_asc", label: "Date created, oldest first" },
  { by: "title", label: "Card title, A to Z" },
];

/** A list's actions: add a card, move the list, sort its cards once, archive it. */
export function ListMenu({
  list,
  position,
  listCount,
  anchor,
  onClose,
  onAddCard,
  onMove,
  onSort,
  onArchive,
}: {
  list: ListWithCards;
  /** The list's 0-based place on the board. */
  position: number;
  listCount: number;
  anchor: HTMLElement | null;
  onClose: () => void;
  onAddCard: () => void;
  onMove: (position: number) => void;
  onSort: (by: SortBy) => void;
  onArchive: () => void;
}) {
  const [mode, setMode] = useState<"menu" | "move" | "sort" | "archive">("menu");
  const [target, setTarget] = useState(position);

  if (mode === "archive") {
    return (
      <ConfirmDialog
        title={`Archive “${list.name}”?`}
        message="The list and its cards leave the board. You can restore them from the board's archived items."
        confirmLabel="Archive list"
        onCancel={onClose}
        onConfirm={() => {
          onArchive();
          onClose();
        }}
      />
    );
  }

  if (mode === "move") {
    function submit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (target !== position) onMove(target);
      onClose();
    }
    return (
      <Popover key="move" title="Move list" anchor={anchor} onClose={onClose}>
        <form className="blk" onSubmit={submit}>
          <div className="lab">
            <label htmlFor="move-list-position">Position</label>
            <select
              id="move-list-position"
              className="field"
              value={target}
              onChange={(event) => setTarget(Number(event.target.value))}
            >
              {Array.from({ length: listCount }, (_, index) => (
                <option key={index} value={index}>
                  {index + 1}
                  {index === position ? " (current)" : ""}
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

  if (mode === "sort") {
    return (
      <Popover key="sort" title="Sort cards once" anchor={anchor} onClose={onClose}>
        <div className="menu">
          {SORTS.map((sort) => (
            <button
              key={sort.by}
              type="button"
              onClick={() => {
                onSort(sort.by);
                onClose();
              }}
            >
              {sort.label}
            </button>
          ))}
        </div>
        <p className="hint">Cards added later still go at the bottom.</p>
      </Popover>
    );
  }

  return (
    <Popover key="menu" title={list.name} anchor={anchor} onClose={onClose}>
      <div className="menu">
        <button
          type="button"
          onClick={() => {
            onAddCard();
            onClose();
          }}
        >
          Add a card
        </button>
        <button type="button" onClick={() => setMode("move")}>
          Move list…
        </button>
        {/* Sorting only makes sense with cards to sort (R-LIST-05). */}
        {list.cards.length > 0 && (
          <button type="button" onClick={() => setMode("sort")}>
            Sort cards…
          </button>
        )}
        <hr />
        <button
          type="button"
          className="danger-text"
          onClick={() => setMode("archive")}
        >
          Archive this list…
        </button>
      </div>
    </Popover>
  );
}
