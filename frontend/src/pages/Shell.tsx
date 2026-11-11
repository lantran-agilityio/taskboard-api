import type { User } from "../api/auth";
import type { Route } from "../routes";
import { BoardPage } from "../board/BoardPage";
import { Home } from "./Home";

// The signed-in frame: a top bar and the page for the current address. The
// card page is a placeholder until roadmap step 26 builds the card dialog.

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
      // key: a different board starts from scratch (its own socket and data).
      return <BoardPage key={route.id} boardId={route.id} token={token} />;
    case "card":
      return (
        <Placeholder title={`Card #${route.id}`} step={26}>
          The card dialog: details, checklists, comments and activity.
        </Placeholder>
      );
  }
}

function Placeholder({
  title,
  step,
  children,
}: {
  title: string;
  step: number;
  children: string;
}) {
  return (
    <main className="page gutter">
      <h1>{title}</h1>
      <p className="muted">
        Coming in roadmap step {step}: {children}
      </p>
      <a href="#home">← Boards</a>
    </main>
  );
}
