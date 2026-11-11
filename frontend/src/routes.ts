import { useEffect, useState } from "react";

// Addresses are hash routes (#home, #board-12, #card-34), so the app works as
// static files with no server-side routing.

export type Route =
  { name: "home" } | { name: "board"; id: number } | { name: "card"; id: number };

const PATTERN = /^#(board|card)-([1-9]\d*)$/;

export function parseHash(hash: string): Route {
  const match = PATTERN.exec(hash);
  if (match) {
    return { name: match[1] as "board" | "card", id: Number(match[2]) };
  }
  return { name: "home" };
}

export function hashFor(route: Route): string {
  return route.name === "home" ? "#home" : `#${route.name}-${route.id}`;
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
