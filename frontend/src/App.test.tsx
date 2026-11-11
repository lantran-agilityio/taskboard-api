import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { TOKEN_KEY } from "./auth/session";
import { ALICE, fakeApi, meFor } from "./test/fakeApi";

const TOKEN = { status: 200, body: { access_token: "t1", token_type: "bearer" } };

async function fillIn(email: string, password: string, remember = false) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  if (remember) await user.click(screen.getByLabelText(/remember me/i));
  return user;
}

describe("signing in", () => {
  it("shows the home page with the user's email, and remembers nothing", async () => {
    const { calls } = fakeApi({
      "POST /auth/token": TOKEN,
      "GET /users/me": meFor("t1"),
    });
    render(<App />);

    const user = await fillIn("alice@example.com", "correct horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(ALICE.email)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your boards" })).toBeInTheDocument();
    expect(calls[0]?.body).toBe("username=alice%40example.com&password=correct+horse");
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("remembers the token when asked, and a reload stays signed in", async () => {
    fakeApi({ "POST /auth/token": TOKEN, "GET /users/me": meFor("t1") });
    const { unmount } = render(<App />);
    const user = await fillIn("alice@example.com", "correct horse", true);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText(ALICE.email);
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe("t1");

    unmount();
    render(<App />);

    expect(await screen.findByText(ALICE.email)).toBeInTheDocument();
  });

  it("shows the API's message for a wrong password", async () => {
    fakeApi({
      "POST /auth/token": {
        status: 401,
        body: { detail: "Incorrect email or password" },
      },
    });
    render(<App />);

    const user = await fillIn("alice@example.com", "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect email or password",
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("lands on the address asked for before signing in", async () => {
    window.location.hash = "#board-5";
    fakeApi({ "POST /auth/token": TOKEN, "GET /users/me": meFor("t1") });
    render(<App />);

    const user = await fillIn("alice@example.com", "correct horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Board 5" })).toBeInTheDocument();
  });
});

describe("a remembered token", () => {
  it("that the API rejects shows sign-in and is forgotten", async () => {
    window.localStorage.setItem(TOKEN_KEY, "expired");
    fakeApi({ "GET /users/me": meFor("t1") });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull());
  });

  it("is kept when the server can't be reached", async () => {
    window.localStorage.setItem(TOKEN_KEY, "t1");
    fakeApi({ "GET /users/me": { status: 503, body: { detail: "Unavailable" } } });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe("t1");
  });
});

describe("registering", () => {
  async function openRegister() {
    render(<App />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Create an account" }));
  }

  it("creates the account, signs in and lands on home", async () => {
    const { calls } = fakeApi({
      "POST /auth/register": { status: 201, body: ALICE },
      "POST /auth/token": TOKEN,
      "GET /users/me": meFor("t1"),
    });
    await openRegister();

    const user = await fillIn("alice@example.com", "correct horse");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(ALICE.email)).toBeInTheDocument();
    expect(calls.map((call) => call.key)).toEqual([
      "POST /auth/register",
      "POST /auth/token",
      "GET /users/me",
    ]);
  });

  it("shows field errors under their fields", async () => {
    fakeApi({
      "POST /auth/register": {
        status: 422,
        body: {
          detail: [
            { loc: ["body", "email"], msg: "value is not a valid email address" },
            {
              loc: ["body", "password"],
              msg: "String should have at least 8 characters",
            },
          ],
        },
      },
    });
    await openRegister();

    const user = await fillIn("nope", "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByLabelText("Email")).toHaveAccessibleDescription(
      "value is not a valid email address",
    );
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
      "String should have at least 8 characters",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says when the email is taken", async () => {
    fakeApi({
      "POST /auth/register": {
        status: 409,
        body: { detail: "Email already registered" },
      },
    });
    await openRegister();

    const user = await fillIn("alice@example.com", "correct horse");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email already registered",
    );
  });
});

describe("signing out", () => {
  it("clears the session and the remembered token", async () => {
    window.localStorage.setItem(TOKEN_KEY, "t1");
    fakeApi({ "GET /users/me": meFor("t1") });
    render(<App />);
    await screen.findByText(ALICE.email);

    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
