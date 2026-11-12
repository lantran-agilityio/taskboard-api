import { useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import { addMember, changeRole, removeMember, type MemberRole } from "../api/members";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Modal } from "../components/Modal";
import { Avatar } from "./CardFront";
import type { Attempt, Change } from "./CardDialog";
import type { BoardData, Member } from "./model";

const ROLE_WORDS: Record<Member["role"], string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

/**
 * The board's people (R-MEMBER-01 to R-MEMBER-06, roles as in D5): everyone
 * sees who's on the board and their role; the owner invites by email, changes
 * roles and removes people; anyone but the owner can leave. A closed board
 * only allows leaving.
 */
export function ShareDialog({
  data,
  token,
  myId,
  change,
  attempt,
  update,
  onClose,
  onLeft,
}: {
  data: BoardData;
  token: string;
  myId: number;
  change: Change;
  attempt: Attempt;
  update: (change: (data: BoardData) => BoardData) => void;
  onClose: () => void;
  /** After leaving: the board is no longer yours to show. */
  onLeft: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("editor");
  const [busy, setBusy] = useState(false);
  const [inviteError, setInviteError] = useState<ApiError | null>(null);
  const [toRemove, setToRemove] = useState<Member | null>(null);
  const { board, members } = data;
  const isOwner = board.role === "owner";
  const closed = board.closed_at !== null;
  const manage = isOwner && !closed;
  const boardId = board.id;
  // The owner first, as the API lists them.
  const people = [...members].sort(
    (a, b) => Number(b.role === "owner") - Number(a.role === "owner"),
  );

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setInviteError(null);
    try {
      const member = await addMember(token, boardId, address, role);
      update((current) =>
        current.members.some((other) => other.user_id === member.user_id)
          ? current
          : { ...current, members: [...current.members, member] },
      );
      setEmail("");
    } catch (caught) {
      setInviteError(
        caught instanceof ApiError ? caught : new ApiError(0, "Something went wrong."),
      );
    } finally {
      setBusy(false);
    }
  }

  function setMemberRole(member: Member, next: MemberRole) {
    void change(
      `change ${member.email}'s role`,
      (current) => ({
        ...current,
        members: current.members.map((other) =>
          other.user_id === member.user_id ? { ...other, role: next } : other,
        ),
      }),
      () => changeRole(token, boardId, member.user_id, next),
    );
  }

  async function remove(member: Member) {
    setToRemove(null);
    if (member.user_id === myId) {
      // Leaving: once it's done the board isn't ours to show any more.
      const done = await attempt("leave the board", () =>
        removeMember(token, boardId, myId),
      );
      if (done !== null) onLeft();
      return;
    }
    void change(
      `remove ${member.email}`,
      (current) => ({
        ...current,
        members: current.members.filter((other) => other.user_id !== member.user_id),
        // Leaving a board also unassigns that person from its cards.
        lists: current.lists.map((list) => ({
          ...list,
          cards: list.cards.map((card) => ({
            ...card,
            assignee_ids: card.assignee_ids.filter((id) => id !== member.user_id),
          })),
        })),
      }),
      () => removeMember(token, boardId, member.user_id),
    );
  }

  const emailError = inviteError?.fieldErrors.email;

  return (
    <Modal title="Share board" onClose={onClose}>
      {manage ? (
        <form className="invite" onSubmit={invite} noValidate>
          <div className="lab grow">
            <label htmlFor="invite-email">Email address</label>
            <input
              id="invite-email"
              className="field"
              type="email"
              autoComplete="off"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                // A new address deserves a fresh answer, not the last one's error.
                setInviteError(null);
              }}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "invite-email-error" : "invite-email-hint"}
            />
            {emailError ? (
              <small id="invite-email-error" className="err">
                {emailError}
              </small>
            ) : (
              <small id="invite-email-hint" className="hint">
                They need an account already.
              </small>
            )}
          </div>
          <div className="lab">
            <label htmlFor="invite-role">Role</label>
            <select
              id="invite-role"
              className="field"
              value={role}
              onChange={(event) => setRole(event.target.value as MemberRole)}
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button
            type="submit"
            className="btn primary"
            disabled={busy || !email.trim()}
          >
            Invite
          </button>
          {inviteError && !emailError && (
            <p className="form-error" role="alert">
              {inviteError.message}
            </p>
          )}
        </form>
      ) : (
        <p className="hint">
          {closed
            ? "The board is closed: people can leave it, but nobody can be added or changed."
            : "Only the owner can invite people or change roles."}
        </p>
      )}
      <section className="blk" aria-label="Board members">
        <h3>Board members · {members.length}</h3>
        <ul className="rows">
          {people.map((member) => {
            const me = member.user_id === myId;
            const owner = member.role === "owner";
            return (
              <li key={member.user_id} className="member">
                <Avatar member={member} />
                <div>
                  {member.email}
                  {me ? " (you)" : ""}
                  {owner && (
                    <small>
                      The owner can't be changed or leave: a board always has its owner.
                    </small>
                  )}
                </div>
                {owner || !manage ? (
                  <span className="tag">{ROLE_WORDS[member.role]}</span>
                ) : (
                  <select
                    aria-label={`Role for ${member.email}`}
                    value={member.role}
                    onChange={(event) =>
                      setMemberRole(member, event.target.value as MemberRole)
                    }
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                )}
                {me && !owner && (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setToRemove(member)}
                  >
                    Leave
                  </button>
                )}
                {!me && !owner && manage && (
                  <button
                    type="button"
                    className="btn sm"
                    aria-label={`Remove ${member.email}`}
                    onClick={() => setToRemove(member)}
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {toRemove && (
        <ConfirmDialog
          title={
            toRemove.user_id === myId
              ? "Leave this board?"
              : `Remove ${toRemove.email}?`
          }
          message={
            toRemove.user_id === myId
              ? "You lose access to it and its cards straight away. Only the owner can invite you back."
              : "They lose access to the board straight away and are taken off its cards. You can invite them again later."
          }
          confirmLabel={toRemove.user_id === myId ? "Leave board" : "Remove"}
          onCancel={() => setToRemove(null)}
          onConfirm={() => void remove(toRemove)}
        />
      )}
    </Modal>
  );
}
