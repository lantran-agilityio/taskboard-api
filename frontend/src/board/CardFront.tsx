import type { CSSProperties } from "react";

import {
  BubbleIcon,
  CheckIcon,
  ClockIcon,
  LinesIcon,
  TickboxIcon,
} from "../components/icons";
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

/** A card's summary on the board (R-CARD-02): it opens the card at #card-<id>. */
export function CardFront({
  card,
  labels,
  members,
}: {
  card: Card;
  labels: Label[];
  members: Member[];
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
    <a
      className={card.due_complete ? "card is-done" : "card"}
      href={`#card-${card.id}`}
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
        {card.due_complete && (
          <span className="done-tog on" role="img" aria-label="Done">
            <CheckIcon />
          </span>
        )}
        <span className="card-title">{card.title}</span>
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
          <span className="badge" title={`${card.comment_count} comments`}>
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
    </a>
  );
}
