import { useState, type FormEvent } from "react";

import { createBoard, type Board } from "../api/boards";
import { ApiError } from "../api/client";
import { Modal } from "../components/Modal";

export function CreateBoardDialog({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (board: Board) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  // Spaces alone don't make a title (R-BOARD-02).
  const blank = name.trim() === "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blank) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await createBoard(token, name.trim()));
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught : new ApiError(0, "Something went wrong."),
      );
      setBusy(false);
    }
  }

  const nameError = error?.fieldErrors.name;
  const hintId = nameError ? "board-name-error" : "board-name-hint";

  return (
    <Modal title="Create a board" onClose={onClose}>
      <form className="stack" onSubmit={handleSubmit} noValidate>
        {error?.message && !nameError && (
          <p className="form-error" role="alert">
            {error.message}
          </p>
        )}
        <div className="lab">
          <label htmlFor="board-name">Board title</label>
          <input
            id="board-name"
            className="field"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={blank || nameError ? hintId : undefined}
          />
          {nameError ? (
            <small id="board-name-error" className="err">
              {nameError}
            </small>
          ) : (
            blank && (
              <small id="board-name-hint" className="hint">
                A title is required.
              </small>
            )
          )}
        </div>
        <p className="hint">
          You'll be the board's owner. It starts with six colour labels.
        </p>
        <div className="row end">
          <button type="submit" className="btn primary" disabled={blank || busy}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
