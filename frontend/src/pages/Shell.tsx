import type { User } from "../api/auth";
import type { Route } from "../routes";
import { BoardScreen } from "../board/BoardScreen";
import { Home } from "./Home";

// The signed-in frame: a top bar and the page for the current address.

export function TopBar({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <header className="top gutter">
      <a className="brand" href="#home">
        Taskboard
      </a>
      <div className="top-user">
        <span>{user.email}</span>
        <button type="button" className="ghost" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}

export function Page({
  route,
  token,
  user,
}: {
  route: Route;
  token: string;
  user: User;
}) {
  switch (route.name) {
    case "home":
      return <Home token={token} user={user} />;
    case "board":
    case "card":
      // Same element for both: opening and closing a card keeps the board.
      return <BoardScreen route={route} token={token} />;
  }
}
