import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "../App";
import type { Board } from "../api/boards";
import { TOKEN_KEY } from "../auth/session";
import { boardInfo, card, LABELS, list } from "../test/boardData";
import { fakeApi, meFor, type FakeResponse } from "../test/fakeApi";
import { FakeWebSocket, installFakeWebSocket } from "../test/fakeSocket";

// The signed-in user is Alice (1).
const OWNER_ALICE = [
  { user_id: 1, email: "alice@example.com", role: "owner" },
  { user_id: 2, email: "bob@example.com", role: "editor" },
];
const OWNER_CAROL = [
  { user_id: 3, email: "carol@example.com", role: "owner" },
  { user_id: 1, email: "alice@example.com", role: "editor" },
];

type Handler = (request: { body: string | undefined }) => FakeResponse;

function serve(
  routes: Record<string, FakeResponse | Handler> = {},
  board: Partial<Board> = {},
  members = OWNER_ALICE,
) {
  return fakeApi({
    "GET /users/me": meFor("t1"),
    "GET /boards/1/snapshot": {
      status: 200,
      body: {
        board: boardInfo(board),
        lists: [
          list(1, "To do", [card(100, 1, { title: "Brief", assignee_ids: [2] })]),
        ],
      },
    },
    "GET /boards/1/labels": { status: 200, body: LABELS },
    "GET /boards/1/members": { status: 200, body: members },
    ...routes,
  });
}

async function openShare() {
  window.location.hash = "#board-1";
  render(<App />);
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  act(() => {
    FakeWebSocket.latest().open();
    FakeWebSocket.latest().receive({ type: "ready" });
  });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Share" }));
  return user;
}

function dialog() {
  return within(screen.getByRole("dialog", { name: "Share board" }));
}

function memberRows(): string[] {
  return within(dialog().getByRole("region", { name: "Board members" }))
    .getAllByRole("listitem")
    .map((row) => row.textContent?.replace(/\s+/g, " ").trim() ?? "");
}

function bodiesOf(calls: { key: string; body: string | undefined }[], key: string) {
  return calls
    .filter((call) => call.key === key)
    .map((call) => JSON.parse(call.body ?? "null"));
}

beforeEach(() => {
  window.localStorage.setItem(TOKEN_KEY, "t1");
  installFakeWebSocket();
});

describe("who's on the board", () => {
  it("lists the owner first, with roles", async () => {
    serve();
    await openShare();

    expect(
      dialog().getByRole("heading", { name: "Board members · 2" }),
    ).toBeInTheDocument();
    const rows = memberRows();
    expect(rows[0]).toMatch(
      /alice@example.com \(you\)The owner can't be changed or leave/,
    );
    expect(rows[0]).toMatch(/Owner$/);
    expect(
      dialog().getByRole("combobox", { name: "Role for bob@example.com" }),
    ).toHaveValue("editor");
  });
});

describe("as the owner", () => {
  it("invites someone by email with a role", async () => {
    const { calls } = serve({
      "POST /boards/1/members": {
        status: 201,
        body: { user_id: 4, email: "dan@example.com", role: "viewer" },
      },
    });
    const user = await openShare();

    expect(dialog().getByRole("button", { name: "Invite" })).toBeDisabled();
    await user.type(dialog().getByLabelText("Email address"), "  dan@example.com ");
    await user.selectOptions(dialog().getByLabelText("Role"), "viewer");
    await user.click(dialog().getByRole("button", { name: "Invite" }));

    expect(
      await dialog().findByRole("combobox", { name: "Role for dan@example.com" }),
    ).toHaveValue("viewer");
    expect(dialog().getByLabelText("Email address")).toHaveValue("");
    expect(bodiesOf(calls, "POST /boards/1/members")).toEqual([
      { email: "dan@example.com", role: "viewer" },
    ]);
  });

  it("says when nobody has that email", async () => {
    serve({
      "POST /boards/1/members": {
        status: 422,
        body: { detail: [{ loc: ["body", "email"], msg: "No user with this email" }] },
      },
    });
    const user = await openShare();

    await user.type(dialog().getByLabelText("Email address"), "nobody@example.com");
    await user.click(dialog().getByRole("button", { name: "Invite" }));

    expect(await dialog().findByLabelText("Email address")).toHaveAccessibleDescription(
      "No user with this email",
    );
  });

  it("clears the error as soon as the email is edited", async () => {
    serve({
      "POST /boards/1/members": {
        status: 422,
        body: { detail: [{ loc: ["body", "email"], msg: "No user with this email" }] },
      },
    });
    const user = await openShare();
    await user.type(dialog().getByLabelText("Email address"), "nobody@example.com");
    await user.click(dialog().getByRole("button", { name: "Invite" }));
    await dialog().findByText("No user with this email");

    await user.type(dialog().getByLabelText("Email address"), "x");

    expect(dialog().queryByText("No user with this email")).not.toBeInTheDocument();
    expect(dialog().getByLabelText("Email address")).toHaveAccessibleDescription(
      "They need an account already.",
    );
  });

  it("says when they're already on the board", async () => {
    serve({
      "POST /boards/1/members": {
        status: 409,
        body: { detail: "User is already on this board" },
      },
    });
    const user = await openShare();

    await user.type(dialog().getByLabelText("Email address"), "bob@example.com");
    await user.click(dialog().getByRole("button", { name: "Invite" }));

    expect(await dialog().findByRole("alert")).toHaveTextContent(
      "User is already on this board",
    );
  });

  it("changes a role", async () => {
    const { calls } = serve({
      "PATCH /boards/1/members/2": {
        status: 200,
        body: { user_id: 2, email: "bob@example.com", role: "viewer" },
      },
    });
    const user = await openShare();

    await user.selectOptions(
      dialog().getByRole("combobox", { name: "Role for bob@example.com" }),
      "viewer",
    );

    expect(
      dialog().getByRole("combobox", { name: "Role for bob@example.com" }),
    ).toHaveValue("viewer");
    expect(bodiesOf(calls, "PATCH /boards/1/members/2")).toEqual([{ role: "viewer" }]);
  });

  it("removes someone after a confirmation, taking them off cards", async () => {
    const { calls } = serve({ "DELETE /boards/1/members/2": { status: 204 } });
    const user = await openShare();

    await user.click(dialog().getByRole("button", { name: "Remove bob@example.com" }));
    const confirm = within(
      screen.getByRole("dialog", { name: "Remove bob@example.com?" }),
    );
    expect(confirm.getByText(/lose access/)).toBeInTheDocument();
    await user.click(confirm.getByRole("button", { name: "Remove" }));

    expect(memberRows()).toHaveLength(1);
    expect(calls.map((call) => call.key)).toContain("DELETE /boards/1/members/2");
    expect(
      within(screen.getByRole("article", { name: "Brief" })).queryByRole("img", {
        name: "bob@example.com",
      }),
    ).not.toBeInTheDocument();
  });

  it("can't leave, and says why", async () => {
    serve();
    await openShare();

    expect(dialog().queryByRole("button", { name: "Leave" })).not.toBeInTheDocument();
    expect(dialog().getByText(/a board always has its owner/)).toBeInTheDocument();
  });

  it("can't change anyone on a closed board", async () => {
    serve({}, { closed_at: "2026-11-12T08:00:00Z" });
    await openShare();

    expect(dialog().queryByLabelText("Email address")).not.toBeInTheDocument();
    expect(dialog().queryByRole("combobox")).not.toBeInTheDocument();
    expect(dialog().queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    expect(dialog().getByText(/The board is closed/)).toBeInTheDocument();
  });
});

describe("as a member", () => {
  it("sees roles but can't invite or change them", async () => {
    serve({}, { role: "editor" }, OWNER_CAROL);
    await openShare();

    expect(
      dialog().getByText("Only the owner can invite people or change roles."),
    ).toBeInTheDocument();
    expect(dialog().queryByLabelText("Email address")).not.toBeInTheDocument();
    expect(dialog().queryByRole("combobox")).not.toBeInTheDocument();
    expect(dialog().queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    expect(memberRows()[1]).toMatch(/alice@example.com \(you\)EditorLeave/);
  });

  it("leaves after a confirmation and goes home", async () => {
    const { calls } = serve(
      {
        "DELETE /boards/1/members/1": { status: 204 },
        "GET /boards": { status: 200, body: [] },
        "GET /boards?closed=true": { status: 200, body: [] },
      },
      { role: "editor" },
      OWNER_CAROL,
    );
    const user = await openShare();

    await user.click(dialog().getByRole("button", { name: "Leave" }));
    const confirm = within(screen.getByRole("dialog", { name: "Leave this board?" }));
    expect(confirm.getByText(/Only the owner can invite you back/)).toBeInTheDocument();
    await user.click(confirm.getByRole("button", { name: "Leave board" }));

    await waitFor(() => expect(window.location.hash).toBe("#home"));
    expect(calls.map((call) => call.key)).toContain("DELETE /boards/1/members/1");
  });

  it("can still leave a closed board", async () => {
    serve({}, { role: "viewer", closed_at: "2026-11-12T08:00:00Z" }, [
      OWNER_CAROL[0]!,
      { user_id: 1, email: "alice@example.com", role: "viewer" },
    ]);
    await openShare();

    expect(dialog().getByRole("button", { name: "Leave" })).toBeInTheDocument();
  });
});

describe("live", () => {
  it("shows members added or removed by others", async () => {
    serve();
    await openShare();

    act(() =>
      FakeWebSocket.latest().receive({
        type: "member.added",
        board_id: 1,
        actor_id: 1,
        data: { member: { user_id: 5, email: "erin@example.com", role: "editor" } },
      }),
    );
    expect(
      dialog().getByRole("heading", { name: "Board members · 3" }),
    ).toBeInTheDocument();

    act(() =>
      FakeWebSocket.latest().receive({
        type: "member.removed",
        board_id: 1,
        actor_id: 2,
        data: { user_id: 2 },
      }),
    );
    expect(memberRows().join(" ")).not.toContain("bob@example.com");
  });
});
