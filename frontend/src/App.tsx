import { useEffect } from "react";

import { SessionProvider, useSession } from "./auth/session";
import { AuthScreen } from "./pages/AuthScreen";
import { Page, TopBar } from "./pages/Shell";
import { recordVisit } from "./recent";
import { useRoute } from "./routes";

function Screen() {
  const { session, signOut } = useSession();
  const route = useRoute();
  const userId = session.status === "signedIn" ? session.user.id : null;

  // Opening a board puts it first in "Recently opened" on the home screen.
  useEffect(() => {
    if (userId !== null && route.name === "board") recordVisit(userId, route.id);
  }, [userId, route]);

  if (session.status === "loading") {
    return (
      <main className="page gutter" aria-busy="true">
        <p className="muted">Loading…</p>
      </main>
    );
  }
  if (session.status === "signedOut") {
    return <AuthScreen />;
  }
  return (
    <>
      <TopBar user={session.user} onSignOut={signOut} />
      <Page route={route} token={session.token} user={session.user} />
    </>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Screen />
    </SessionProvider>
  );
}
