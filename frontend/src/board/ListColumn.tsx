import { useRef, useState, type DragEvent, type FormEvent } from "react";

import { DotsIcon } from "../components/icons";
import { plural } from "../format";
import { InlineEdit } from "../components/InlineEdit";
import { useQueue } from "../components/queue";
import { CardFront, type CardActions } from "./CardFront";
import { dropIndex, type Span } from "./dnd";
import type { Label, ListWithCards, Member } from "./model";

/** What is being dragged right now, and where it came from. */
export type Drag =
  | { kind: "card"; id: number; fromList: number; fromIndex: number }
  | { kind: "list"; id: number; fromIndex: number };

export interface ListActions extends CardActions {
  onRename: (listId: number, name: string) => void;
  onOpenMenu: (list: ListWithCards, anchor: HTMLElement) => void;
  onAddCard: (listId: number, title: string) => Promise<boolean>;
  onDropCard: (listId: number, index: number) => void;
  onListDragStart: (list: ListWithCards) => void;
}

/** One list on the board: its name, card count, cards, and the add-card form. */
export function ListColumn({
  list,
  labels,
  members,
  actions,
  drag,
  dropListBefore,
  addingCard,
  onAddingCard,
}: {
  list: ListWithCards;
  labels: Label[];
  members: Member[];
  actions?: ListActions;
  drag: Drag | null;
  dropListBefore: boolean;
  addingCard: boolean;
  onAddingCard: (open: boolean) => void;
}) {
  const cardsBox = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const cardDrag = drag?.kind === "card" ? drag : null;

  /** Where the dragged card would land: among this list's other cards. */
  function indexAt(event: DragEvent): number {
    const others: Span[] = [];
    cardsBox.current
      ?.querySelectorAll<HTMLElement>("[data-card]")
      .forEach((element) => {
        if (Number(element.dataset.card) === cardDrag?.id) return;
        const box = element.getBoundingClientRect();
        others.push({ start: box.top, size: box.height });
      });
    return dropIndex(others, event.clientY);
  }

  const others = list.cards.filter((card) => card.id !== cardDrag?.id);
  const listClass = [
    "list",
    drag?.kind === "list" && drag.id === list.id && "dragging",
    dropListBefore && "drop-before",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    // The whole column takes a dropped card, not just the cards box (which is
    // a few pixels tall in an empty list); the cards' positions decide where.
    <section
      className={listClass}
      aria-label={list.name}
      data-list={list.id}
      onDragOver={(event) => {
        if (!cardDrag || !actions) return;
        event.preventDefault(); // allows the drop
        event.dataTransfer.dropEffect = "move";
        setDropAt(indexAt(event));
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDropAt(null);
      }}
      onDrop={(event) => {
        if (!cardDrag || !actions) return;
        event.preventDefault();
        const index = indexAt(event);
        setDropAt(null);
        actions.onDropCard(list.id, index);
      }}
    >
      <header
        className="list-head"
        draggable={actions ? true : undefined}
        onDragStart={(event) => {
          if (!actions) return;
          // Only the header drags the list, not a card dragged inside it.
          if (event.target !== event.currentTarget) return;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", list.name);
          actions.onListDragStart(list);
        }}
        onDragEnd={actions?.onDragEnd}
      >
        <h2>
          <InlineEdit
            value={list.name}
            label="List name"
            className="list-name"
            inputClassName="list-input"
            editable={actions !== undefined}
            onSave={(name) => actions?.onRename(list.id, name)}
          />
        </h2>
        <span className="count" title={plural(list.cards.length, "card")}>
          {list.cards.length}
        </span>
        {actions && (
          <button
            ref={menuButton}
            type="button"
            className="ghost sm"
            aria-label={`List actions for ${list.name}`}
            onClick={() =>
              menuButton.current && actions.onOpenMenu(list, menuButton.current)
            }
          >
            <DotsIcon />
          </button>
        )}
      </header>
      <div
        ref={cardsBox}
        className={
          dropAt !== null && dropAt >= others.length ? "cards drop-end" : "cards"
        }
      >
        {list.cards.map((card) => (
          <CardFront
            key={card.id}
            card={card}
            labels={labels}
            members={members}
            actions={actions}
            dragging={cardDrag?.id === card.id}
            dropBefore={dropAt !== null && others[dropAt]?.id === card.id}
          />
        ))}
      </div>
      {actions &&
        (addingCard ? (
          <AddCardForm
            onAdd={(title) => actions.onAddCard(list.id, title)}
            onClose={() => onAddingCard(false)}
          />
        ) : (
          <button type="button" className="add-card" onClick={() => onAddingCard(true)}>
            + Add a card
          </button>
        ))}
    </section>
  );
}

/**
 * Adds cards one after another (R-CARD-01): the field stays open and empties
 * after each card; Escape, ×, or submitting only spaces closes it.
 */
function AddCardForm({
  onAdd,
  onClose,
}: {
  onAdd: (title: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const queue = useQueue();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      onClose();
      return;
    }
    // Emptied at once, so the next title can be typed while this one saves.
    setTitle("");
    queue(async () => {
      const added = await onAdd(trimmed);
      // Refused: give the title back to fix, unless another is being typed.
      if (!added) setTitle((current) => current || trimmed);
    });
  }

  return (
    <form className="mini-form" onSubmit={submit}>
      <input
        className="field"
        aria-label="Card title"
        placeholder="Card title"
        maxLength={100}
        autoComplete="off"
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      />
      <div className="row">
        <button type="submit" className="btn primary sm">
          Add card
        </button>
        <button
          type="button"
          className="x"
          aria-label="Stop adding cards"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </form>
  );
}

/**
 * Adds lists one after another (R-LIST-01): new lists go at the right end,
 * the field stays open, and a name of only spaces creates nothing.
 */
export function AddListColumn({
  first,
  onAdd,
}: {
  first: boolean;
  onAdd: (name: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const queue = useQueue();

  if (!open) {
    return (
      <div className="list-add">
        <button type="button" className="add-list-btn" onClick={() => setOpen(true)}>
          + Add {first ? "a" : "another"} list
        </button>
      </div>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    // As for cards: empty at once, save in order, give a refused name back.
    setName("");
    queue(async () => {
      const added = await onAdd(trimmed);
      if (!added) setName((current) => current || trimmed);
    });
  }

  return (
    <div className="list-add">
      <form className="mini-form" onSubmit={submit}>
        <input
          className="field"
          aria-label="List name"
          placeholder="List name"
          maxLength={100}
          autoComplete="off"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        />
        <div className="row">
          <button type="submit" className="btn primary sm">
            Add list
          </button>
          <button
            type="button"
            className="x"
            aria-label="Stop adding lists"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
      </form>
    </div>
  );
}
