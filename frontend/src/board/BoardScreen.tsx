import { useCallback, useEffect, useState } from "react";

import { getCard } from "../api/boardView";
import { useSession } from "../auth/session";
import { recordVisit } from "../recent";
import type { Route } from "../routes";
import { BoardPage } from "./BoardPage";

/** The board on screen and its cards, as the board page reports them. */
interface OnScreen {
  boardId: number;
  cardIds: Set<number>;
}

/** What a card lookup found: its board, or nothing (null). */
interface Lookup {
  cardId: number;
  boardId: number | null;
}

/**
 * #board-<id> and #card-<id>: both show a board, and a card opens as a dialog
 * over its board. This stays mounted while you open and close cards, so the
 * board keeps its data and its socket.
 *
 * The board to show is worked out on each render: a board address names it;
 * a card on the board on screen keeps that board; any other card is looked up
 * (its board_id), and the board on screen stays while the answer comes.
 */
export function BoardScreen({
  route,
  token,
}: {
  route: Extract<Route, { name: "board" | "card" }>;
  token: string;
}) {
  const { session } = useSession();
  const userId = session.status === "signedIn" ? session.user.id : null;
  const [onScreen, setOnScreen] = useState<OnScreen | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);

  const cardId = route.name === "card" ? route.id : null;
  const knownCard = cardId !== null && onScreen?.cardIds.has(cardId) === true;
  const looked = cardId !== null && lookup?.cardId === cardId ? lookup : null;

  let boardId: number | null;
  if (route.name === "board") boardId = route.id;
  else if (knownCard) boardId = onScreen!.boardId;
  else if (looked) boardId = looked.boardId;
  else boardId = onScreen?.boardId ?? null; // keep the board on screen while looking

  // A card that isn't on the board on screen (another board, or archived):
  // ask the API which board it's on. State is set only when the answer comes.
  useEffect(() => {
    if (cardId === null || knownCard || lookup?.cardId === cardId) return;
    let cancelled = false;
    getCard(token, cardId)
      .then((card) => {
        if (!cancelled) setLookup({ cardId, boardId: card.board_id });
      })
      .catch(() => {
        // 404: it doesn't exist, or it's on a board you're not on.
        if (!cancelled) setLookup({ cardId, boardId: null });
      });
    return () => {
      cancelled = true;
    };
  }, [cardId, knownCard, lookup, token]);

  // Opening a board, or one of its cards, puts it first in "Recently opened".
  useEffect(() => {
    if (userId !== null && boardId !== null) recordVisit(userId, boardId);
  }, [userId, boardId]);

  const reportCards = useCallback(
    (shownBoard: number, cardIds: Set<number>) =>
      setOnScreen({ boardId: shownBoard, cardIds }),
    [],
  );

  if (looked && looked.boardId === null) {
    return (
      <main className="page gutter">
        <h1>Card not found</h1>
        <p className="muted">It doesn't exist, or it's on a board you're not on.</p>
        <a href="#home">← Boards</a>
      </main>
    );
  }
  if (boardId === null) {
    return (
      <main className="page gutter" aria-busy="true">
        <h1>Loading the card…</h1>
      </main>
    );
  }
  return (
    <BoardPage
      // A different board starts from scratch (its own socket and data).
      key={boardId}
      boardId={boardId}
      token={token}
      cardId={cardId}
      commentId={route.name === "card" ? (route.commentId ?? null) : null}
      onCards={reportCards}
    />
  );
}
