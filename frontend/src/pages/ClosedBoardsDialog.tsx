import { useState } from "react";

import { deleteBoard, reopenBoard, type Board } from "../api/boards";
import { ApiError } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Modal } from "../components/Modal";
import { timeAgo } from "../format";

/** Closed boards with Reopen and Delete for their owner (R-BOARD-07, R-BOARD-08). */
export function ClosedBoardsDialog({
  token,
  boards,
  onClose,
  onChanged,
}: {
  token: string;
  boards: Board[];
  onClose: () => void;
  /** Called after a reopen or delete, so the caller reloads its lists. */
  onChanged: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(board: Board, action: () => Promise<unknown>) {
    setBusyId(board.id);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title="Closed boards" onClose={onClose}>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {boards.length === 0 ? (
        <div className="empty">No boards have been closed.</div>
      ) : (
        <ul className="rows">
          {boards.map((board) => (
            <li key={board.id} className="arow">
              <div>
                <a href={`#board-${board.id}`}>{board.name}</a>
                {board.closed_at && <small>closed {timeAgo(board.closed_at)}</small>}
              </div>
              {board.role === "owner" ? (
                <>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={busyId === board.id}
                    aria-label={`Reopen ${board.name}`}
                    onClick={() => run(board, () => reopenBoard(token, board.id))}
                  >
                    Reopen
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={busyId === board.id}
                    aria-label={`Delete ${board.name}`}
                    onClick={() => setToDelete(board)}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <small className="muted">
                  Only the owner can reopen or delete this board
                </small>
              )}
            </li>
          ))}
        </ul>
      )}
      {toDelete && (
        <ConfirmDialog
          title={`Delete “${toDelete.name}”?`}
          message="The board, its lists, cards and history are deleted for everyone. This can't be undone."
          confirmLabel="Delete board"
          busy={busyId === toDelete.id}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            const board = toDelete;
            await run(board, () => deleteBoard(token, board.id));
            setToDelete(null);
          }}
        />
      )}
    </Modal>
  );
}
