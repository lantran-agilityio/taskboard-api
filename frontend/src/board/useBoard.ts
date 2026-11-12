import { useCallback, useEffect, useRef, useState } from "react";

import { getCard, getLabels, getMembers, getSnapshot } from "../api/boardView";
import { ApiError } from "../api/client";
import { useSession } from "../auth/session";
import {
  applyEvent,
  followUp,
  replaceCard,
  type BoardData,
  type BoardEvent,
} from "./model";
import { BoardSocket, type SocketStatus } from "./socket";

export type View =
  | { status: "loading" }
  | { status: "ready"; data: BoardData }
  | { status: "missing" } // 404: no such board, or you're not on it
  | { status: "gone" } // deleted, or you were removed, while you watched
  | { status: "error"; message: string };

export interface BoardHandle {
  view: View;
  live: SocketStatus;
  /** Changes the board on screen (an edit shown before the API answers). */
  update: (change: (data: BoardData) => BoardData) => void;
  /** Reloads the board from the API (after an edit the API refused). */
  reload: () => void;
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong.";
  // A board action has no form to show field errors under, so a 422 on a
  // field (such as "Board is closed" on board_id) is the message itself.
  const fieldMessages = Object.values(error.fieldErrors);
  return fieldMessages.length > 0 ? fieldMessages.join(" ") : error.message;
}

/** One board's data, loaded from the API and kept live over the WebSocket. */
export function useBoard(boardId: number, token: string): BoardHandle {
  const { signOut } = useSession();
  const [view, setView] = useState<View>({ status: "loading" });
  const [live, setLive] = useState<SocketStatus>("connecting");
  // The current connection's load function, for reload() from the page.
  const loadRef = useRef<() => void>(() => {});

  const update = useCallback(
    (change: (data: BoardData) => BoardData) =>
      setView((current) =>
        current.status === "ready"
          ? { status: "ready", data: change(current.data) }
          : current,
      ),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    // Events that arrive while a load is in flight: the load may or may not
    // include them, so they're applied again on top of it (applying an event
    // twice gives the same board).
    let loads = 0;
    let pending: BoardEvent[] = [];

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
    loadRef.current = () => void load();

    const socket = new BoardSocket({
      boardId,
      token,
      onReady: () => void load(),
      onEvent: (event) => {
        if (loads > 0) pending.push(event);
        // Our own changes come back as events too: they're applied like any
        // other, which changes nothing when the screen already shows them,
        // and keeps your other tabs in step.
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
  }, [boardId, token, signOut, update]);

  const reload = useCallback(() => loadRef.current(), []);
  return { view, live, update, reload };
}
