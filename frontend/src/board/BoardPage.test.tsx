import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "../App";
import { TOKEN_KEY } from "../auth/session";
import { boardInfo, card, LABELS, list, MEMBERS } from "../test/boardData";
import { fakeApi, meFor, type FakeResponse } from "../test/fakeApi";
import { FakeWebSocket, installFakeWebSocket } from "../test/fakeSocket";
import type { ListWithCards } from "./model";

const LISTS: ListWithCards[] = [
  list(1, "To do", [
    card(100, 1, {
      title: "Write brief",
      label_ids: [10, 11],
      assignee_ids: [2],
      description: "Why",
      comment_count: 2,
      checklist_done: 1,
      checklist_total: 3,
      due_at: "2020-01-01T10:00:00Z", // long past
    }),
    card(101, 1, {
      title: "Book venue",
      due_at: "2020-01-01T10:00:00Z",
      due_complete: true,
      checklist_done: 0,
      checklist_total: 2,
      checklist_due_at: "2026-11-25T12:00:00Z",
    }),
  ]),
  list(2, "Done", []),
];

type Routes = Record<string, FakeResponse | (() => FakeResponse)>;

function serve(routes: Routes = {}, lists = LISTS, board = boardInfo()) {
  return fakeApi({
    "GET /users/me": meFor("t1"),
    "GET /boards/1/snapshot": { status: 200, body: { board, lists } },
    "GET /boards/1/labels": { status: 200, body: LABELS },
    "GET /boards/1/members": { status: 200, body: MEMBERS },
    ...routes,
  });
}

/** Opens #board-1 signed in, and lets the socket get to "ready". */
async function openBoard() {
  render(<App />);
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  const ws = FakeWebSocket.latest();
  act(() => {
    ws.open();
    ws.receive({ type: "ready" });
  });
  return ws;
}

function event(type: string, data: object) {
  return { type, board_id: 1, actor_id: 2, data };
}

function lane(name: string) {
  return within(screen.getByRole("region", { name }));
}

function titlesIn(name: string): string[] {
  return lane(name)
    .queryAllByRole("article")
    .map((card) => card.getAttribute("aria-label") ?? "");
}

beforeEach(() => {
  window.localStorage.setItem(TOKEN_KEY, "t1");
  window.location.hash = "#board-1";
  installFakeWebSocket();
});

describe("the board page", () => {
  it("shows the lists and card fronts once the socket is ready", async () => {
    serve();
    const ws = await openBoard();

    expect(await screen.findByRole("heading", { name: "Launch" })).toBeInTheDocument();
    expect(ws.sent[0]).toEqual({ type: "auth", token: "t1" });
    expect(titlesIn("To do")).toEqual(["Write brief", "Book venue"]);
    expect(titlesIn("Done")).toEqual([]);
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Live");
    expect(document.title).toBe("Launch · Taskboard");
  });

  it("shows each card's summary", async () => {
    serve();
    await openBoard();

    const brief = await screen.findByRole("article", { name: "Write brief" });
    expect(within(brief).getByRole("link", { name: "Write brief" })).toHaveAttribute(
      "href",
      "#card-100",
    );
    expect(within(brief).getByText("Bug")).toBeInTheDocument();
    expect(within(brief).getByText("Overdue")).toBeInTheDocument();
    expect(
      within(brief).getByRole("img", { name: "Has a description" }),
    ).toBeInTheDocument();
    expect(within(brief).getByTitle("2 comments")).toHaveTextContent("2");
    expect(within(brief).getByTitle("Checklist items done")).toHaveTextContent("1/3");
    expect(within(brief).getByText("#100")).toBeInTheDocument();
    expect(
      within(brief).getByRole("img", { name: "bob@example.com" }),
    ).toHaveTextContent("BO");

    const venue = screen.getByRole("article", { name: "Book venue" });
    expect(
      within(venue).getByRole("button", { name: "Mark not done" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(within(venue).getByText("Complete")).toBeInTheDocument();
    // The checklist badge adds the nearest open item's due date (R-CHECK-05).
    expect(
      within(venue).getByTitle("Checklist items done, and the next item due"),
    ).toHaveTextContent("0/2 • Nov 25");
  });

  it("applies live events", async () => {
    serve();
    const ws = await openBoard();
    await screen.findByRole("heading", { name: "Launch" });

    act(() => {
      ws.receive(
        event("card.updated", {
          card: card(101, 2, { title: "Book venue" }),
          lists: [
            { list_id: 1, card_ids: [100] },
            { list_id: 2, card_ids: [101] },
          ],
        }),
      );
      ws.receive(
        event("list.created", { list: list(3, "Later"), list_ids: [1, 2, 3] }),
      );
      ws.receive(event("board.updated", { board: { id: 1, name: "Big launch" } }));
    });

    expect(titlesIn("To do")).toEqual(["Write brief"]);
    expect(titlesIn("Done")).toEqual(["Book venue"]);
    expect(screen.getByRole("region", { name: "Later" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Big launch" })).toBeInTheDocument();
  });

  it("re-reads a card when its comments change", async () => {
    const { calls } = serve({
      "GET /cards/101": {
        status: 200,
        body: card(101, 1, { title: "Book venue", comment_count: 1 }),
      },
    });
    const ws = await openBoard();
    await screen.findByRole("heading", { name: "Launch" });

    act(() =>
      ws.receive(event("comment.created", { comment: { id: 5, card_id: 101 } })),
    );

    const venue = screen.getByRole("article", { name: "Book venue" });
    expect(await within(venue).findByTitle("1 comment")).toBeInTheDocument();
    expect(calls.map((call) => call.key)).toContain("GET /cards/101");
  });

  it("keeps an event that arrives while the board is loading", async () => {
    // The snapshot was read before the card was made; the event comes in
    // while the snapshot is on its way.
    serve({
      "GET /boards/1/snapshot": () => {
        FakeWebSocket.latest().receive(
          event("card.created", {
            card: card(102, 2, { title: "Late card" }),
            lists: [{ list_id: 2, card_ids: [102] }],
          }),
        );
        return { status: 200, body: { board: boardInfo(), lists: LISTS } };
      },
    });
    await openBoard();

    await screen.findByRole("heading", { name: "Launch" });
    expect(titlesIn("Done")).toEqual(["Late card"]);
  });

  it("reloads on resync", async () => {
    const { calls } = serve();
    const ws = await openBoard();
    await screen.findByRole("heading", { name: "Launch" });

    act(() => ws.receive({ type: "resync" }));

    await waitFor(() =>
      expect(
        calls.filter((call) => call.key === "GET /boards/1/snapshot"),
      ).toHaveLength(2),
    );
  });

  it("still loads when the socket can't connect, and says it's reconnecting", async () => {
    serve();
    render(<App />);
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    act(() => FakeWebSocket.latest().drop(1006));

    expect(await screen.findByRole("heading", { name: "Launch" })).toBeInTheDocument();
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();
  });

  it("says when the board is gone while you watch", async () => {
    serve();
    const ws = await openBoard();
    await screen.findByRole("heading", { name: "Launch" });

    act(() => ws.drop(4404));

    expect(
      screen.getByRole("heading", { name: "This board is no longer available" }),
    ).toBeInTheDocument();
  });

  it("says when the board doesn't exist", async () => {
    serve({
      "GET /boards/1/snapshot": { status: 404, body: { detail: "Board not found" } },
    });
    await openBoard();

    expect(
      await screen.findByRole("heading", { name: "Board not found" }),
    ).toBeInTheDocument();
  });
});

describe("the board header", () => {
  it("stars the board", async () => {
    const { calls } = serve({ "PUT /boards/1/star": { status: 204 } });
    await openBoard();

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Star this board" }));

    expect(screen.getByRole("button", { name: "Unstar this board" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(calls.map((call) => call.key)).toContain("PUT /boards/1/star");
  });

  it("shows a closed board as read-only, and lets the owner reopen it", async () => {
    serve(
      { "POST /boards/1/reopen": { status: 200, body: boardInfo() } },
      LISTS,
      boardInfo({ closed_at: "2026-11-10T00:00:00Z" }),
    );
    await openBoard();

    expect(
      await screen.findByText("This board is closed, so it's read-only."),
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reopen board" }));

    await waitFor(() =>
      expect(
        screen.queryByText("This board is closed, so it's read-only."),
      ).not.toBeInTheDocument(),
    );
  });

  it("tells others to ask the owner", async () => {
    serve({}, LISTS, boardInfo({ closed_at: "2026-11-10T00:00:00Z", role: "editor" }));
    await openBoard();

    expect(await screen.findByText("Ask the owner to reopen it.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reopen board" }),
    ).not.toBeInTheDocument();
  });
});
