import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "../App";
import type { Board } from "../api/boards";
import type { ActivityEntry } from "../api/comments";
import { TOKEN_KEY } from "../auth/session";
import { boardInfo, card, LABELS, list, MEMBERS } from "../test/boardData";
import { fakeApi, meFor, type FakeResponse } from "../test/fakeApi";
import { FakeWebSocket, installFakeWebSocket } from "../test/fakeSocket";

const BRIEF = card(100, 1, { title: "Brief" });

function entry(id: number, type: string, data: object, actor = 2): ActivityEntry {
  return { id, type, actor_id: actor, data, created_at: "2026-11-12T08:00:00Z" };
}

const LOG = [
  entry(3, "comment.created", { comment: { id: 9, card_id: 100, body: "Ship it" } }),
  entry(2, "card.created", { card: BRIEF }, 1),
  entry(1, "list.created", { list: list(1, "To do") }, 1),
];

type Handler = (request: { body: string | undefined }) => FakeResponse;

function serve(
  routes: Record<string, FakeResponse | Handler> = {},
  board: Partial<Board> = {},
) {
  return fakeApi({
    "GET /users/me": meFor("t1"),
    "GET /boards/1/snapshot": {
      status: 200,
      body: {
        board: boardInfo({ description: "Our **launch** plan", ...board }),
        lists: [list(1, "To do", [BRIEF])],
      },
    },
    "GET /boards/1/labels": { status: 200, body: LABELS },
    "GET /boards/1/members": { status: 200, body: MEMBERS },
    "GET /boards/1/activity": { status: 200, body: { items: LOG, next_before: null } },
    "GET /boards/1/activity?kind=comments": {
      status: 200,
      body: { items: [LOG[0]], next_before: null },
    },
    "GET /boards/1/cards?archived=true": {
      status: 200,
      body: [
        card(101, 1, {
          title: "Old idea",
          position: null,
          archived_at: "2026-11-11T08:00:00Z",
        }),
      ],
    },
    "GET /boards/1/lists?archived=true": {
      status: 200,
      body: [
        {
          ...list(5, "Someday"),
          position: null,
          archived_at: "2026-11-10T08:00:00Z",
          cards: undefined,
        },
      ],
    },
    ...routes,
  });
}

async function openMenu() {
  window.location.hash = "#board-1";
  render(<App />);
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  act(() => {
    FakeWebSocket.latest().open();
    FakeWebSocket.latest().receive({ type: "ready" });
  });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Menu" }));
  return user;
}

function panel() {
  return within(screen.getByRole("complementary", { name: "Board menu" }));
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

describe("the menu panel", () => {
  it("opens from the board bar and closes with Escape", async () => {
    serve();
    const user = await openMenu();

    expect(panel().getByRole("button", { name: "About" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("complementary", { name: "Board menu" }),
    ).not.toBeInTheDocument();
  });
});

describe("about", () => {
  it("shows the description and the owner, and lets editors change it", async () => {
    const { calls } = serve({ "PATCH /boards/1": { status: 200, body: boardInfo() } });
    const user = await openMenu();

    expect(panel().getByText("launch").tagName).toBe("STRONG");
    expect(
      within(panel().getByRole("region", { name: "Owner" })).getByText(
        "alice@example.com",
      ),
    ).toBeInTheDocument();
    await user.click(panel().getByRole("button", { name: "Edit" }));
    const field = panel().getByRole("textbox", { name: "Board description" });
    await user.clear(field);
    await user.type(field, "Ship it");
    await user.click(panel().getByRole("button", { name: "Save" }));

    expect(panel().getByText("Ship it")).toBeInTheDocument();
    expect(bodiesOf(calls, "PATCH /boards/1")).toEqual([{ description: "Ship it" }]);
  });

  it("offers a viewer no Edit", async () => {
    serve({}, { role: "viewer" });
    await openMenu();

    expect(panel().queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});

describe("activity", () => {
  it("reads the board's log in plain words, and filters to comments", async () => {
    const { calls } = serve();
    const user = await openMenu();

    await user.click(panel().getByRole("button", { name: "Activity" }));
    const log = await panel().findByLabelText("Board activity");
    expect(log).toHaveTextContent("bob@example.com commented on “Brief”: Ship it");
    expect(log).toHaveTextContent("You added “Brief” to To do");
    expect(log).toHaveTextContent("You added the list “To do”");

    await user.click(panel().getByRole("button", { name: "Comments" }));
    await waitFor(() =>
      expect(panel().getByLabelText("Board activity")).not.toHaveTextContent(
        "added the list",
      ),
    );
    expect(calls.map((call) => call.key)).toContain(
      "GET /boards/1/activity?kind=comments",
    );
  });

  it("re-reads the log when something happens", async () => {
    let log = LOG;
    serve({
      "GET /boards/1/activity": () => ({
        status: 200,
        body: { items: log, next_before: null },
      }),
    });
    const user = await openMenu();
    await user.click(panel().getByRole("button", { name: "Activity" }));
    await panel().findByLabelText("Board activity");

    log = [entry(4, "board.closed", { board: boardInfo() }), ...LOG];
    act(() =>
      FakeWebSocket.latest().receive({
        type: "board.closed",
        board_id: 1,
        actor_id: 2,
        data: { board: boardInfo() },
      }),
    );

    await waitFor(() =>
      expect(panel().getByLabelText("Board activity")).toHaveTextContent(
        "closed the board",
      ),
    );
  });
});

describe("archived items", () => {
  async function openArchived() {
    const user = await openMenu();
    await user.click(panel().getByRole("button", { name: "Archived items" }));
    await panel().findByRole("list", { name: "Archived cards" });
    return user;
  }

  it("lists archived cards and lists, searchable", async () => {
    serve();
    const user = await openArchived();

    const cards = within(panel().getByRole("list", { name: "Archived cards" }));
    expect(cards.getByRole("link", { name: "Old idea" })).toHaveAttribute(
      "href",
      "#card-101",
    );
    expect(cards.getByText(/in To do · archived/)).toBeInTheDocument();
    await user.type(
      panel().getByRole("textbox", { name: "Search archived items" }),
      "zzz",
    );
    expect(panel().getByText("No archived cards match.")).toBeInTheDocument();

    await user.clear(panel().getByRole("textbox", { name: "Search archived items" }));
    await user.click(panel().getByRole("button", { name: "Lists" }));
    expect(
      within(panel().getByRole("list", { name: "Archived lists" })).getByText(
        "Someday",
      ),
    ).toBeInTheDocument();
  });

  it("restores a card to the board", async () => {
    const { calls } = serve({
      "POST /cards/101/restore": {
        status: 200,
        body: card(101, 1, { title: "Old idea" }),
      },
    });
    const user = await openArchived();

    await user.click(panel().getByRole("button", { name: "Restore Old idea" }));

    expect(panel().getByText("No archived cards.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "To do" })).toHaveTextContent("Old idea");
    expect(calls.map((call) => call.key)).toContain("POST /cards/101/restore");
  });

  it("deletes a card after a warning", async () => {
    const { calls } = serve({ "DELETE /cards/101": { status: 204 } });
    const user = await openArchived();

    await user.click(panel().getByRole("button", { name: "Delete Old idea" }));
    const confirm = within(screen.getByRole("dialog", { name: "Delete “Old idea”?" }));
    expect(confirm.getByText(/can't be undone/)).toBeInTheDocument();
    await user.click(confirm.getByRole("button", { name: "Delete card" }));

    expect(panel().getByText("No archived cards.")).toBeInTheDocument();
    expect(calls.map((call) => call.key)).toContain("DELETE /cards/101");
  });

  it("restores a list, and deletes one with all its cards after a warning", async () => {
    const { calls } = serve({
      "POST /lists/5/restore": { status: 200, body: list(5, "Someday") },
      "DELETE /lists/5": { status: 204 },
    });
    const user = await openArchived();
    await user.click(panel().getByRole("button", { name: "Lists" }));

    await user.click(panel().getByRole("button", { name: "Delete Someday" }));
    const confirm = within(
      screen.getByRole("dialog", { name: "Delete the list “Someday”?" }),
    );
    expect(confirm.getByText(/all its cards/)).toBeInTheDocument();
    await user.click(confirm.getByRole("button", { name: "Cancel" }));
    await user.click(panel().getByRole("button", { name: "Restore Someday" }));

    expect(panel().getByText("No archived lists.")).toBeInTheDocument();
    expect(calls.map((call) => call.key)).toContain("POST /lists/5/restore");
    expect(calls.map((call) => call.key)).not.toContain("DELETE /lists/5");
  });

  it("offers a viewer no Restore or Delete", async () => {
    serve({}, { role: "viewer" });
    await openArchived();

    expect(panel().queryByRole("button", { name: /Restore/ })).not.toBeInTheDocument();
    expect(panel().queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });
});

describe("labels", () => {
  it("creates, changes and deletes labels", async () => {
    const { calls } = serve({
      "POST /boards/1/labels": {
        status: 201,
        body: { id: 12, board_id: 1, name: "UX", color: "blue" },
      },
      "PATCH /labels/10": {
        status: 200,
        body: { id: 10, board_id: 1, name: "Defect", color: "red" },
      },
      "DELETE /labels/11": { status: 204 },
    });
    const user = await openMenu();
    await user.click(panel().getByRole("button", { name: "Labels" }));

    await user.click(panel().getByRole("button", { name: "Create a label" }));
    await user.type(screen.getByLabelText("Name (optional)"), "UX");
    await user.click(screen.getByRole("radio", { name: "blue" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(
      await within(panel().getByRole("list", { name: "Labels" })).findByText("UX"),
    ).toBeInTheDocument();

    await user.click(panel().getByRole("button", { name: "Edit label Bug" }));
    await user.clear(screen.getByLabelText("Name (optional)"));
    await user.type(screen.getByLabelText("Name (optional)"), "Defect");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      within(panel().getByRole("list", { name: "Labels" })).getByText("Defect"),
    ).toBeInTheDocument();

    await user.click(panel().getByRole("button", { name: "Edit label green" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete label" }));

    expect(bodiesOf(calls, "POST /boards/1/labels")).toEqual([
      { name: "UX", color: "blue" },
    ]);
    expect(bodiesOf(calls, "PATCH /labels/10")).toEqual([
      { name: "Defect", color: "red" },
    ]);
    expect(calls.map((call) => call.key)).toContain("DELETE /labels/11");
  });
});

describe("closing the board", () => {
  it("lets the owner close it after a confirmation", async () => {
    const { calls } = serve({
      "POST /boards/1/close": {
        status: 200,
        body: boardInfo({ closed_at: "2026-11-12T09:00:00Z" }),
      },
    });
    const user = await openMenu();

    await user.click(panel().getByRole("button", { name: "Close board…" }));
    const confirm = within(screen.getByRole("dialog", { name: "Close “Launch”?" }));
    expect(confirm.getByText(/reopen it later/)).toBeInTheDocument();
    await user.click(confirm.getByRole("button", { name: "Close board" }));

    expect(
      await screen.findByText("This board is closed, so it's read-only."),
    ).toBeInTheDocument();
    expect(calls.map((call) => call.key)).toContain("POST /boards/1/close");
    expect(
      panel().queryByRole("button", { name: "Close board…" }),
    ).not.toBeInTheDocument();
  });

  it("isn't offered to an editor", async () => {
    serve({}, { role: "editor" });
    await openMenu();

    expect(
      panel().queryByRole("button", { name: "Close board…" }),
    ).not.toBeInTheDocument();
  });
});
