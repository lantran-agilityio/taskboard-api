import { useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import { useSession } from "../auth/session";

type Mode = "signIn" | "register";

const TEXT = {
  signIn: {
    title: "Sign in",
    submit: "Sign in",
    busy: "Signing in…",
    switchPrompt: "New here?",
    switchLabel: "Create an account",
  },
  register: {
    title: "Create an account",
    submit: "Create account",
    busy: "Creating account…",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
  },
} as const;

/** Sign-in and register share one form; the address the user asked for stays
 * in the hash, so they land there once signed in. */
export function AuthScreen() {
  const { signIn, register } = useSession();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const text = TEXT[mode];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === "signIn" ? signIn : register)(email.trim(), password, remember);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "Something went wrong. Please try again."),
      );
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(mode === "signIn" ? "register" : "signIn");
    setError(null);
  }

  const emailError = error?.fieldErrors.email ?? error?.fieldErrors.username;
  const passwordError = error?.fieldErrors.password;

  return (
    <main className="auth gutter">
      <div className="auth-card">
        <p className="brand">Taskboard</p>
        <h1>{text.title}</h1>
        <form onSubmit={handleSubmit} noValidate>
          {error?.message && !emailError && !passwordError && (
            <p className="form-error" role="alert">
              {error.message}
            </p>
          )}
          {/* Hints and errors sit outside the <label>, so they aren't part of
              the field's name; aria-describedby links them instead. */}
          <div className="lab">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="field"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError && (
              <small id="email-error" className="err">
                {emailError}
              </small>
            )}
          </div>
          <div className="lab">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="field"
              type="password"
              name="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={
                passwordError
                  ? "password-error"
                  : mode === "register"
                    ? "password-hint"
                    : undefined
              }
            />
            {passwordError ? (
              <small id="password-error" className="err">
                {passwordError}
              </small>
            ) : (
              mode === "register" && (
                <small id="password-hint" className="hint">
                  At least 8 characters.
                </small>
              )
            )}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span>Remember me on this device</span>
          </label>
          <button className="btn primary wide" type="submit" disabled={busy}>
            {busy ? text.busy : text.submit}
          </button>
        </form>
        <p className="switch">
          {text.switchPrompt}{" "}
          <button type="button" className="link" onClick={switchMode}>
            {text.switchLabel}
          </button>
        </p>
      </div>
    </main>
  );
}
