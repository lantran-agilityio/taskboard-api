import { useEffect, useState } from "react";

import { getCard, getLabels, getMembers, getSnapshot } from "../api/boardView";
import { reopenBoard, setStarred } from "../api/boards";
import { ApiError } from "../api/client";
import { useSession } from "../auth/session";
import { StarIcon } from "../components/icons";
import { Avatar, CardFront } from "./CardFront";
import {
  applyEvent,
  followUp,
  replaceCard,
  type BoardData,
  type BoardEvent,
} from "./model";
import { BoardSocket, type SocketStatus } from "./socket";

type View =
  | { status: "loading" }
  | { status: "ready"; data: BoardData }
  | { status: "missing" } // 404: no such board, or you're not on it
  | { status: "gone" } // deleted, or you were removed, while you watched
  | { status: "error"; message: string };

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

/** The board's lists and cards, kept live over the WebSocket (read-only for now). */
export function BoardPage({ boardId, token }: { boardId: number; token: string }) {
  const { signOut } = useSession();
  const [view, setView] = useState<View>({ status: "loading" });
  const [live, setLive] = useState<SocketStatus>("connecting");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    // Events that arrive while a load is in flight: the load may or may not
    // include them, so they're applied again on top of it (applying an event
    // twice gives the same board).
    let loads = 0;
    let pending: BoardEvent[] = [];

    const update = (change: (data: BoardData) => BoardData) =>
      setView((current) =>
        current.status === "ready"
          ? { status: "ready", data: change(current.data) }
          : current,
      );

    async function refetchCard(cardId: number) {
      try {
        const card = await getCard(token, cardId);
        if (!cancelled) update((data) => replaceCard(data, card));
      } catch {
        // Deleted or moved off the board since: its own event handles that.
      }
    }

    function runFollowUp(event: BoardEvent) {
      const next = followUp(event);
      if (next?.kind === "card") void refetchCard(next.cardId);
      if (next?.kind === "reload") void load();
    }

    async function load() {
      loads += 1;
      try {
        const [snapshot, labels, members] = await Promise.all([
          getSnapshot(token, boardId),
          getLabels(token, boardId),
          getMembers(token, boardId),
        ]);
        if (cancelled) return;
        let data: BoardData = {
          board: snapshot.board,
          lists: snapshot.lists,
          labels,
          members,
        };
        const missed = pending;
        for (const event of missed) data = applyEvent(data, event);
        loaded = true;
        setView({ status: "ready", data });
        missed.forEach((event) => {
          if (followUp(event)?.kind === "card") runFollowUp(event);
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setView({ status: "missing" });
        } else if (!loaded) {
          setView({ status: "error", message: errorMessage(error) });
        }
        // Once loaded, a failed reload keeps the board on screen.
      } finally {
        loads -= 1;
        if (loads === 0) pending = [];
      }
    }

    const socket = new BoardSocket({
      boardId,
      token,
      onReady: () => void load(),
      onEvent: (event) => {
        if (loads > 0) pending.push(event);
        if (loaded) {
          update((data) => applyEvent(data, event));
          runFollowUp(event);
        }
      },
      onGone: () => setView({ status: "gone" }),
      onUnauthorized: signOut,
      onStatus: (status) => {
        setLive(status);
        // If the socket can't connect at all, still show the board.
        if (status === "offline" && !loaded && loads === 0) void load();
      },
    });
    socket.start();
    return () => {
      cancelled = true;
      socket.stop();
    };
  }, [boardId, token, signOut]);

  const boardName = view.status === "ready" ? view.data.board.name : null;
  useEffect(() => {
    if (boardName) document.title = `${boardName} · Taskboard`;
    return () => {
      document.title = "Taskboard";
    };
  }, [boardName]);

  if (view.status === "loading") {
    return <Message title="Loading the board…" busy />;
  }
  if (view.status === "missing") {
    return (
      <Message title="Board not found">It doesn't exist, or you're not on it.</Message>
    );
  }
  if (view.status === "gone") {
    return (
      <Message title="This board is no longer available">
        It was deleted, or you were removed from it.
      </Message>
    );
  }
  if (view.status === "error") {
    return <Message title="Couldn't load the board">{view.message}</Message>;
  }

  const { board, lists, labels, members } = view.data;
  const setBoard = (change: Partial<BoardData["board"]>) =>
    setView((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            data: { ...current.data, board: { ...current.data.board, ...change } },
          }
        : current,
    );

  async function toggleStar() {
    const starred = !board.starred;
    setActionError(null);
    setBoard({ starred });
    try {
      await setStarred(token, board.id, starred);
    } catch (error) {
      setBoard({ starred: !starred });
      setActionError(
        `Couldn't ${starred ? "star" : "unstar"} the board: ${errorMessage(error)}`,
      );
    }
  }

  async function reopen() {
    setActionError(null);
    try {
      const reopened = await reopenBoard(token, board.id);
      setBoard({ closed_at: reopened.closed_at });
    } catch (error) {
      setActionError(`Couldn't reopen the board: ${errorMessage(error)}`);
    }
  }

  return (
    <div className="boardwrap">
      <div className="boardbar gutter">
        <a className="ghost" href="#home">
          ← Boards
        </a>
        <h1 className="board-title">{board.name}</h1>
        <button
          type="button"
          className={board.starred ? "star on" : "star"}
          aria-pressed={board.starred}
          aria-label={board.starred ? "Unstar this board" : "Star this board"}
          onClick={toggleStar}
        >
          <StarIcon />
        </button>
        <span className="grow" />
        <span className={live === "offline" ? "live offline" : "live"} role="status">
          {live === "live"
            ? "Live"
            : live === "offline"
              ? "Reconnecting…"
              : "Connecting…"}
        </span>
        <div className="avs" aria-label="Members">
          {members.map((member) => (
            <Avatar key={member.user_id} member={member} />
          ))}
        </div>
      </div>
      {board.closed_at && (
        <div className="banner gutter" role="status">
          <span>This board is closed, so it's read-only.</span>
          {board.role === "owner" ? (
            <button type="button" className="btn sm" onClick={reopen}>
              Reopen board
            </button>
          ) : (
            <span className="muted">Ask the owner to reopen it.</span>
          )}
        </div>
      )}
      {actionError && (
        <p className="form-error gutter" role="alert">
          {actionError}
        </p>
      )}
      <div className="lanes gutter">
        {lists.length === 0 && <p className="muted">This board has no lists yet.</p>}
        {lists.map((list) => (
          <section key={list.id} className="list" aria-label={list.name}>
            <header className="list-head">
              <h2 className="list-name">{list.name}</h2>
              <span className="count" title={`${list.cards.length} cards`}>
                {list.cards.length}
              </span>
            </header>
            <div className="cards">
              {list.cards.map((card) => (
                <CardFront
                  key={card.id}
                  card={card}
                  labels={labels}
                  members={members}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Message({
  title,
  busy = false,
  children,
}: {
  title: string;
  busy?: boolean;
  children?: string;
}) {
  return (
    <main className="page gutter" aria-busy={busy || undefined}>
      <h1>{title}</h1>
      {children && <p className="muted">{children}</p>}
      <a href="#home">← Boards</a>
    </main>
  );
}
