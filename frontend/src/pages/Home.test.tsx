import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Board } from "../api/boards";
import { recordVisit } from "../recent";
import { ALICE, fakeApi, type FakeResponse } from "../test/fakeApi";
import { Home } from "./Home";

function board(id: number, name: string, extra: Partial<Board> = {}): Board {
  return {
    id,
    name,
    description: null,
    created_at: "2026-11-01T00:00:00Z",
    closed_at: null,
    starred: false,
    role: "owner",
    list_count: 0,
    card_count: 0,
    ...extra,
  };
}

/** A tiny server: open and closed boards that reopen and delete really change. */
function serve(
  open: Board[],
  closed: Board[] = [],
  more: Record<string, FakeResponse> = {},
) {
  const state = { open: [...open], closed: [...closed] };
  const routes: Parameters<typeof fakeApi>[0] = {
    "GET /boards": () => ({ status: 200, body: state.open }),
    "GET /boards?closed=true": () => ({ status: 200, body: state.closed }),
    ...more,
  };
  for (const item of closed) {
    routes[`POST /boards/${item.id}/reopen`] = () => {
      state.closed = state.closed.filter((other) => other.id !== item.id);
      const reopened = { ...item, closed_at: null };
      state.open = [...state.open, reopened];
      return { status: 200, body: reopened };
    };
    routes[`DELETE /boards/${item.id}`] = () => {
      state.closed = state.closed.filter((other) => other.id !== item.id);
      return { status: 204 };
    };
  }
  return fakeApi(routes);
}

function renderHome() {
  render(<Home token="t1" user={ALICE} />);
}

function section(name: string) {
  return within(screen.getByRole("region", { name }));
}

describe("the home screen", () => {
  it("shows every open board with its counts", async () => {
    serve([board(1, "Launch", { list_count: 3, card_count: 12 }), board(2, "Move")]);
    renderHome();

    const all = await screen.findByRole("region", { name: "All boards" });

    expect(within(all).getByRole("link", { name: /Launch/ })).toHaveAttribute(
      "href",
      "#board-1",
    );
    expect(within(all).getByText("3 lists · 12 cards")).toBeInTheDocument();
    expect(within(all).getByText("0 lists · 0 cards")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Starred" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Recently opened" }),
    ).not.toBeInTheDocument();
  });

  it("lists starred boards in their own section", async () => {
    serve([board(1, "Launch", { starred: true }), board(2, "Move")]);
    renderHome();

    await screen.findByRole("region", { name: "Starred" });

    expect(
      section("Starred")
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([expect.stringContaining("Launch")]);
  });

  it("lists recently opened boards, newest first, leaving out closed ones", async () => {
    recordVisit(ALICE.id, 3); // closed now
    recordVisit(ALICE.id, 1);
    recordVisit(ALICE.id, 99); // not on it any more
    recordVisit(ALICE.id, 2);
    serve(
      [board(1, "Launch"), board(2, "Move")],
      [board(3, "Old", { closed_at: "2026-11-10T00:00:00Z" })],
    );
    renderHome();

    await screen.findByRole("region", { name: "Recently opened" });

    const names = section("Recently opened")
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(names).toEqual([
      expect.stringContaining("Move"),
      expect.stringContaining("Launch"),
    ]);
    expect(section("All boards").queryByText("Old")).not.toBeInTheDocument();
  });

  it("says when there are no boards yet", async () => {
    serve([]);
    renderHome();

    expect(await screen.findByText(/not on any boards yet/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ Create a board" }),
    ).toBeInTheDocument();
  });

  it("offers to try again when loading fails", async () => {
    let fail = true;
    fakeApi({
      "GET /boards": () =>
        fail
          ? { status: 500, body: { detail: "Server error" } }
          : { status: 200, body: [board(1, "Launch")] },
      "GET /boards?closed=true": { status: 200, body: [] },
    });
    renderHome();

    expect(await screen.findByRole("alert")).toHaveTextContent("Server error");
    fail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("link", { name: /Launch/ })).toBeInTheDocument();
  });
});

describe("starring", () => {
  it("stars a board and moves it into Starred", async () => {
    const { calls } = serve([board(1, "Launch")], [], {
      "PUT /boards/1/star": { status: 204 },
    });
    renderHome();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Star Launch" }));

    expect(
      section("Starred").getByRole("link", { name: /Launch/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Unstar Launch" })[0]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(calls.map((call) => call.key)).toContain("PUT /boards/1/star");
  });

  it("puts the star back and says so when the API refuses", async () => {
    serve([board(1, "Launch", { starred: true })], [], {
      "DELETE /boards/1/star": { status: 404, body: { detail: "Board not found" } },
    });
    renderHome();
    const user = userEvent.setup();

    const [unstar] = await screen.findAllByRole("button", { name: "Unstar Launch" });
    await user.click(unstar!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't unstar “Launch”: Board not found",
    );
    expect(
      section("Starred").getByRole("link", { name: /Launch/ }),
    ).toBeInTheDocument();
  });
});

describe("creating a board", () => {
  async function openCreate() {
    renderHome();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Create a board" }));
    return user;
  }

  it("keeps Create disabled until the title has more than spaces", async () => {
    serve([]);
    const user = await openCreate();
    const create = screen.getByRole("button", { name: "Create" });

    expect(create).toBeDisabled();
    expect(screen.getByLabelText("Board title")).toHaveAccessibleDescription(
      "A title is required.",
    );
    await user.type(screen.getByLabelText("Board title"), "   ");
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText("Board title"), "x");
    expect(create).toBeEnabled();
  });

  it("creates it with the trimmed title and opens it", async () => {
    const { calls } = serve([], [], {
      "POST /boards": { status: 201, body: board(7, "Plans") },
    });
    const user = await openCreate();

    await user.type(screen.getByLabelText("Board title"), "  Plans  ");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(window.location.hash).toBe("#board-7"));
    expect(calls.find((call) => call.key === "POST /boards")?.body).toBe(
      '{"name":"Plans"}',
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the API's error under the field", async () => {
    serve([], [], {
      "POST /boards": {
        status: 422,
        body: {
          detail: [
            { loc: ["body", "name"], msg: "String should have at most 100 characters" },
          ],
        },
      },
    });
    const user = await openCreate();

    await user.type(screen.getByLabelText("Board title"), "Too long");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByLabelText("Board title")).toHaveAccessibleDescription(
      "String should have at most 100 characters",
    );
  });

  it("closes with Escape without creating anything", async () => {
    const { calls } = serve([]);
    const user = await openCreate();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.map((call) => call.key)).not.toContain("POST /boards");
  });
});

describe("closed boards", () => {
  const OLD = board(3, "Old", { closed_at: "2026-11-01T00:00:00Z" });
  const SHARED = board(4, "Shared", {
    closed_at: "2026-11-02T00:00:00Z",
    role: "editor",
  });

  async function openClosed() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Closed boards/ }));
    return {
      user,
      dialog: within(screen.getByRole("dialog", { name: "Closed boards" })),
    };
  }

  it("shows the count and says when there are none", async () => {
    serve([board(1, "Launch")]);
    renderHome();

    expect(
      await screen.findByRole("button", { name: "Closed boards (0)" }),
    ).toBeInTheDocument();
    const { dialog } = await openClosed();
    expect(dialog.getByText("No boards have been closed.")).toBeInTheDocument();
  });

  it("offers Reopen and Delete to the owner only", async () => {
    serve([], [OLD, SHARED]);
    renderHome();

    const { dialog } = await openClosed();

    expect(dialog.getByRole("button", { name: "Reopen Old" })).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Delete Old" })).toBeInTheDocument();
    expect(
      dialog.queryByRole("button", { name: "Reopen Shared" }),
    ).not.toBeInTheDocument();
    expect(
      dialog.getByText("Only the owner can reopen or delete this board"),
    ).toBeInTheDocument();
    expect(dialog.getAllByText(/^closed (last \w+|\d+ \w+ ago)$/)).toHaveLength(2);
  });

  it("reopens a board back onto the home screen", async () => {
    serve([], [OLD]);
    renderHome();
    const { user, dialog } = await openClosed();

    await user.click(dialog.getByRole("button", { name: "Reopen Old" }));

    expect(await dialog.findByText("No boards have been closed.")).toBeInTheDocument();
    expect(
      section("All boards").getByRole("link", { name: /Old/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Closed boards (0)" }),
    ).toBeInTheDocument();
  });

  it("closes with Escape after the focused button is gone", async () => {
    serve([], [OLD]);
    renderHome();
    const { user, dialog } = await openClosed();
    await user.click(dialog.getByRole("button", { name: "Reopen Old" }));
    await dialog.findByText("No boards have been closed.");

    // The Reopen button went with its row, so focus is outside the dialog.
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks before deleting, and Cancel deletes nothing", async () => {
    const { calls } = serve([], [OLD]);
    renderHome();
    const { user, dialog } = await openClosed();

    await user.click(dialog.getByRole("button", { name: "Delete Old" }));
    const confirm = screen.getByRole("dialog", { name: "Delete “Old”?" });
    expect(within(confirm).getByText(/can't be undone/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("dialog", { name: "Delete “Old”?" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Closed boards" })).toBeInTheDocument();
    expect(calls.map((call) => call.key)).not.toContain("DELETE /boards/3");
  });

  it("Escape in the confirmation closes only the confirmation", async () => {
    serve([], [OLD]);
    renderHome();
    const { user, dialog } = await openClosed();
    await user.click(dialog.getByRole("button", { name: "Delete Old" }));

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Delete “Old”?" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Closed boards" })).toBeInTheDocument();
  });

  it("deletes once confirmed", async () => {
    const { calls } = serve([], [OLD]);
    renderHome();
    const { user, dialog } = await openClosed();

    await user.click(dialog.getByRole("button", { name: "Delete Old" }));
    await user.click(screen.getByRole("button", { name: "Delete board" }));

    expect(await dialog.findByText("No boards have been closed.")).toBeInTheDocument();
    expect(calls.map((call) => call.key)).toContain("DELETE /boards/3");
    expect(
      screen.queryByRole("dialog", { name: "Delete “Old”?" }),
    ).not.toBeInTheDocument();
  });
});
