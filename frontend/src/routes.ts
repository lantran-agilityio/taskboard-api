import { useEffect, useState } from "react";

// Addresses are hash routes (#home, #board-12, #card-34, and #card-34-comment-5
// for a link to one comment), so the app works as static files with no
// server-side routing.

export type Route =
  | { name: "home" }
  | { name: "board"; id: number }
  | { name: "card"; id: number; commentId?: number };

const BOARD = /^#board-([1-9]\d*)$/;
const CARD = /^#card-([1-9]\d*)(?:-comment-([1-9]\d*))?$/;

export function parseHash(hash: string): Route {
  const board = BOARD.exec(hash);
  if (board) return { name: "board", id: Number(board[1]) };
  const card = CARD.exec(hash);
  if (card) {
    return card[2]
      ? { name: "card", id: Number(card[1]), commentId: Number(card[2]) }
      : { name: "card", id: Number(card[1]) };
  }
  return { name: "home" };
}

export function hashFor(route: Route): string {
  if (route.name === "home") return "#home";
  if (route.name === "board") return `#board-${route.id}`;
  return route.commentId
    ? `#card-${route.id}-comment-${route.commentId}`
    : `#card-${route.id}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
