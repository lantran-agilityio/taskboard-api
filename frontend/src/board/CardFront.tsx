import type { CSSProperties } from "react";

import {
  ArchiveIcon,
  BubbleIcon,
  CheckIcon,
  ClockIcon,
  LinesIcon,
  TickboxIcon,
} from "../components/icons";
import { plural } from "../format";
import { dueState, type Card, type DueState, type Label, type Member } from "./model";

const DUE_WORD: Record<DueState, string> = {
  overdue: "Overdue",
  complete: "Complete",
  soon: "Due soon",
  upcoming: "Due",
};

const AVATAR_COLORS = ["blue", "purple", "orange", "green", "red", "yellow"];
const LABEL_ORDER = ["green", "yellow", "orange", "red", "purple", "blue"];

export function Avatar({ member, small = false }: { member: Member; small?: boolean }) {
  // Initials from the email's name part: "alice.smith@…" → "AS".
  const name = member.email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  const initials = (
    parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2)
  ).toUpperCase();
  const color = AVATAR_COLORS[member.user_id % AVATAR_COLORS.length];
  return (
    <span
      className={small ? "av sm" : "av"}
      style={{ "--c": `var(--l-${color})` } as CSSProperties}
      title={member.email}
      role="img"
      aria-label={member.email}
    >
      {initials}
    </span>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface CardActions {
  onToggleDone: (card: Card) => void;
  onArchive: (card: Card) => void;
  onDragStart: (card: Card) => void;
  onDragEnd: () => void;
}

/**
 * A card's summary on the board (R-CARD-02). Its title links to #card-<id>,
 * and the link covers the whole card (CSS), so the done toggle and archive
 * buttons can sit on it without being inside the link.
 */
export function CardFront({
  card,
  labels,
  members,
  actions,
  dragging = false,
  dropBefore = false,
}: {
  card: Card;
  labels: Label[];
  members: Member[];
  /** Given when you may edit the board; without them the card is read-only. */
  actions?: CardActions;
  dragging?: boolean;
  dropBefore?: boolean;
}) {
  const cardLabels = card.label_ids
    .map((id) => labels.find((label) => label.id === id))
    .filter((label): label is Label => label !== undefined)
    .sort((a, b) => LABEL_ORDER.indexOf(a.color) - LABEL_ORDER.indexOf(b.color));
  const assignees = card.assignee_ids
    .map((id) => members.find((member) => member.user_id === id))
    .filter((member): member is Member => member !== undefined);
  const due = dueState(card);

  return (
    <article
      className={[
        "card",
        card.due_complete && "is-done",
        dragging && "dragging",
        dropBefore && "drop-before",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={card.title}
      data-card={card.id}
      draggable={actions ? true : undefined}
      onDragStart={
        actions
          ? (event) => {
              event.dataTransfer.effectAllowed = "move";
              // Firefox starts a drag only when some data is set.
              event.dataTransfer.setData("text/plain", card.title);
              actions.onDragStart(card);
            }
          : undefined
      }
      onDragEnd={actions?.onDragEnd}
    >
      {cardLabels.length > 0 && (
        <div className="card-lbls">
          {cardLabels.map((label) => (
            <span
              key={label.id}
              className={`lbl mini ${label.color}`}
              style={{ "--c": `var(--l-${label.color})` } as CSSProperties}
              title={label.name || `${label.color} label`}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}
      <div className="card-title-row">
        {actions ? (
          <button
            type="button"
            className={card.due_complete ? "done-tog on" : "done-tog"}
            aria-pressed={card.due_complete}
            aria-label={card.due_complete ? "Mark not done" : "Mark done"}
            onClick={() => actions.onToggleDone(card)}
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
        <a
          className="card-title card-link"
          href={`#card-${card.id}`}
          // Dragging starts on the card, not the link (whose drag carries its URL).
          draggable={false}
        >
          {card.title}
        </a>
      </div>
      <div className="badges">
        {due && card.due_at && (
          <span className={`due ${due}`} title={DUE_WORD[due]}>
            <ClockIcon />
            {shortDate(card.due_at)}
            {(due === "overdue" || due === "complete") && <b>{DUE_WORD[due]}</b>}
          </span>
        )}
        {card.description && (
          <span
            className="badge"
            title="Has a description"
            role="img"
            aria-label="Has a description"
          >
            <LinesIcon />
          </span>
        )}
        {card.comment_count > 0 && (
          <span className="badge" title={plural(card.comment_count, "comment")}>
            <BubbleIcon />
            {card.comment_count}
          </span>
        )}
        {card.checklist_total > 0 && (
          <span className="badge" title="Checklist items done">
            <TickboxIcon />
            {card.checklist_done}/{card.checklist_total}
          </span>
        )}
        <span className="cardno">#{card.id}</span>
        {assignees.length > 0 && (
          <span className="avs">
            {assignees.map((member) => (
              <Avatar key={member.user_id} member={member} small />
            ))}
          </span>
        )}
      </div>
      {actions && card.due_complete && (
        <button
          type="button"
          className="quick-arch"
          title="Archive"
          aria-label="Archive this card"
          onClick={() => actions.onArchive(card)}
        >
          <ArchiveIcon />
        </button>
      )}
    </article>
  );
}
