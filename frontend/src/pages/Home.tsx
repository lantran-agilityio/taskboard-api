import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { User } from "../api/auth";
import { listBoards, setStarred, type Board } from "../api/boards";
import { ApiError } from "../api/client";
import { recentIds } from "../recent";
import { BoardTile } from "./BoardTile";
import { ClosedBoardsDialog } from "./ClosedBoardsDialog";
import { CreateBoardDialog } from "./CreateBoardDialog";

const RECENT_SHOWN = 4;

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; open: Board[]; closed: Board[] };

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

/** The home screen: your boards, starred and recent ones, create, and closed boards. */
export function Home({ token, user }: { token: string; user: User }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [dialog, setDialog] = useState<"create" | "closed" | null>(null);
  const [starError, setStarError] = useState<string | null>(null);

  const fetchBoards = useCallback(async () => {
    try {
      const [open, closed] = await Promise.all([
        listBoards(token),
        listBoards(token, { closed: true }),
      ]);
      setLoad({ status: "ready", open, closed });
    } catch (error) {
      setLoad({ status: "error", message: message(error) });
    }
  }, [token]);

  useEffect(() => {
    // fetchBoards sets state only after its requests finish.
    void fetchBoards();
  }, [fetchBoards]);

  async function toggleStar(board: Board) {
    const starred = !board.starred;
    // Show the change at once; put it back if the API refuses.
    const mark = (value: boolean) =>
      setLoad((current) =>
        current.status === "ready"
          ? {
              ...current,
              open: current.open.map((item) =>
                item.id === board.id ? { ...item, starred: value } : item,
              ),
            }
          : current,
      );
    setStarError(null);
    mark(starred);
    try {
      await setStarred(token, board.id, starred);
    } catch (error) {
      mark(!starred);
      setStarError(
        `Couldn't ${starred ? "star" : "unstar"} “${board.name}”: ${message(error)}`,
      );
    }
  }

  if (load.status === "loading") {
    return (
      <main className="home gutter" aria-busy="true">
        <div className="home-inner">
          <h1>Your boards</h1>
          <p className="muted">Loading your boards…</p>
        </div>
      </main>
    );
  }
  if (load.status === "error") {
    return (
      <main className="home gutter">
        <div className="home-inner">
          <h1>Your boards</h1>
          <p className="form-error" role="alert">
            {load.message}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setLoad({ status: "loading" });
                void fetchBoards();
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  const { open, closed } = load;
  const byId = new Map(open.map((board) => [board.id, board]));
  const starred = open.filter((board) => board.starred);
  // Only open boards you're still on: closed or left ones drop out.
  const recent = recentIds(user.id)
    .map((id) => byId.get(id))
    .filter((board): board is Board => board !== undefined)
    .slice(0, RECENT_SHOWN);

  const section = (title: string, boards: Board[], extra?: ReactNode) => (
    <section className="sec" aria-label={title}>
      <div className="sec-head">
        <h2>{title}</h2>
      </div>
      <div className="tiles">
        {boards.map((board) => (
          <BoardTile key={board.id} board={board} onToggleStar={toggleStar} />
        ))}
        {extra}
      </div>
    </section>
  );

  return (
    <main className="home gutter">
      <div className="home-inner">
        <h1>Your boards</h1>
        {starError && (
          <p className="form-error" role="alert">
            {starError}
          </p>
        )}
        {starred.length > 0 && section("Starred", starred)}
        {recent.length > 0 && section("Recently opened", recent)}
        {section(
          "All boards",
          open,
          <button
            type="button"
            className="tile-new"
            onClick={() => setDialog("create")}
          >
            + Create a board
          </button>,
        )}
        {open.length === 0 && (
          <p className="muted">
            You're not on any boards yet. Create one to get started.
          </p>
        )}
        <div className="row">
          <button type="button" className="btn" onClick={() => setDialog("closed")}>
            Closed boards ({closed.length})
          </button>
        </div>
      </div>
      {dialog === "create" && (
        <CreateBoardDialog
          token={token}
          onClose={() => setDialog(null)}
          onCreated={(board) => {
            setDialog(null);
            // The new board opens at once (R-BOARD-02).
            window.location.hash = `#board-${board.id}`;
          }}
        />
      )}
      {dialog === "closed" && (
        <ClosedBoardsDialog
          token={token}
          boards={closed}
          onClose={() => setDialog(null)}
          onChanged={fetchBoards}
        />
      )}
    </main>
  );
}
