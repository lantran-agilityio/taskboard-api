import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import * as auth from "../api/auth";
import { ApiError, setUnauthorizedHandler } from "../api/client";

// The token lives in memory, so closing the tab signs out. "Remember me" also
// keeps it in localStorage, where any script on the page could read it: that
// is the trade-off the user opts into. The API's tokens expire after 30
// minutes either way.

export const TOKEN_KEY = "taskboard.token";

// Storage can throw (private windows, blocked site data), so every access is
// guarded and a failure just means "not remembered".
function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Not remembered; the session still works in memory.
  }
}

export type Session =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; token: string; user: auth.User };

interface SessionContextValue {
  session: Session;
  signIn: (email: string, password: string, remember: boolean) => Promise<void>;
  register: (email: string, password: string, remember: boolean) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() =>
    readStoredToken() ? { status: "loading" } : { status: "signedOut" },
  );

  const signOut = useCallback(() => {
    writeStoredToken(null);
    setSession({ status: "signedOut" });
  }, []);

  // Any request that gets a 401 with our token means the token is no good.
  useEffect(() => {
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // A remembered token is checked once on start; a 401 signs out (above).
  useEffect(() => {
    const stored = readStoredToken();
    if (!stored) return;
    let cancelled = false;
    auth
      .me(stored)
      .then((user) => {
        if (!cancelled) setSession({ status: "signedIn", token: stored, user });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Offline or a server error: drop to sign-in, but keep the token for
        // next time unless the API said it's invalid.
        if (!(error instanceof ApiError && error.status === 401)) {
          setSession({ status: "signedOut" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const token = await auth.login(email, password);
      const user = await auth.me(token);
      writeStoredToken(remember ? token : null);
      setSession({ status: "signedIn", token, user });
    },
    [],
  );

  const register = useCallback(
    async (email: string, password: string, remember: boolean) => {
      await auth.register(email, password);
      await signIn(email, password, remember);
    },
    [signIn],
  );

  const value = useMemo(
    () => ({ session, signIn, register, signOut }),
    [session, signIn, register, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
