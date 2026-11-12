import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type { Board } from "../api/boards";
import type { ActivityEntry, Comment } from "../api/comments";
import { TOKEN_KEY } from "../auth/session";
import { boardInfo, card, LABELS, list } from "../test/boardData";
import { fakeApi, meFor, type FakeResponse } from "../test/fakeApi";
import { FakeWebSocket, installFakeWebSocket } from "../test/fakeSocket";

// Alice (1) is the owner, Bob (2) an editor, Carol (3) a viewer.
const MEMBERS = [
  { user_id: 1, email: "alice@example.com", role: "owner" },
  { user_id: 2, email: "bob@example.com", role: "editor" },
  { user_id: 3, email: "carol@example.com", role: "viewer" },
];
const BRIEF = card(100, 1, { title: "Brief" });

function comment(
  id: number,
  author: number,
  body: string,
  at: string,
  extra: Partial<Comment> = {},
): Comment {
  return {
    id,
    card_id: 100,
    author_id: author,
    body,
    created_at: at,
    edited_at: null,
    ...extra,
  };
}

function entry(
  id: number,
  type: string,
  data: object,
  at: string,
  actor = 2,
): ActivityEntry {
  return { id, type, actor_id: actor, data, created_at: at };
}

const COMMENTS = [
  comment(6, 2, "Looks **good**", "2026-11-12T10:00:00Z", {
    edited_at: "2026-11-12T10:05:00Z",
  }),
  comment(5, 1, "First draft", "2026-11-12T08:00:00Z"),
];
const ACTIVITY = [
  entry(21, "card.updated", { card: { ...BRIEF, list_id: 2 } }, "2026-11-12T09:00:00Z"),
  entry(20, "card.created", { card: BRIEF }, "2026-11-12T07:00:00Z", 1),
];

type Handler = (request: { body: string | undefined }) => FakeResponse;

function serve(
  routes: Record<string, FakeResponse | Handler> = {},
  board: Partial<Board> = {},
  {
    comments = COMMENTS,
    activity = ACTIVITY,
    lists = [list(1, "To do", [BRIEF]), list(2, "Doing")],
  } = {},
) {
  return fakeApi({
    "GET /users/me": meFor("t1"),
    "GET /cards/100": { status: 200, body: BRIEF },
    "GET /boards/1/snapshot": {
      status: 200,
      body: {
        board: boardInfo(board),
        lists,
      },
    },
    "GET /boards/1/labels": { status: 200, body: LABELS },
    "GET /boards/1/members": { status: 200, body: MEMBERS },
    "GET /cards/100/comments": {
      status: 200,
      body: { items: comments, next_before: null },
    },
    "GET /boards/1/activity?card_id=100": {
      status: 200,
      body: { items: activity, next_before: null },
    },
    ...routes,
  });
}

async function open(hash = "#card-100") {
  window.location.hash = hash;
  render(<App />);
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  act(() => {
    FakeWebSocket.latest().open();
    FakeWebSocket.latest().receive({ type: "ready" });
  });
  await screen.findByRole("dialog", { name: "Brief" });
  return userEvent.setup();
}

function panel() {
  return within(screen.getByRole("region", { name: "Comments and activity" }));
}

/** The feed's rows, newest first, as text. */
async function rows(): Promise<string[]> {
  const feed = await waitFor(() => {
    const element = document.querySelector(".feed");
    if (!element) throw new Error("no feed yet");
    return element;
  });
  return [...feed.querySelectorAll(":scope > .ev")].map((row) =>
    (row.querySelector("b")?.parentElement?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

beforeEach(() => {
  window.localStorage.setItem(TOKEN_KEY, "t1");
  installFakeWebSocket();
});

describe("the feed", () => {
  it("mixes comments and history, newest first", async () => {
    serve();
    await open();

    const shown = await rows();
    expect(shown).toHaveLength(4);
    expect(shown[0]).toMatch(/^bob@example.com .*\(edited\)Looks good/);
    expect(shown[1]).toMatch(/^bob@example.com moved this card from To do to Doing/);
    expect(shown[2]).toMatch(/^You .*First draft/);
    expect(shown[3]).toMatch(/^You added this card to To do/);
    expect(panel().getByText("good").tagName).toBe("STRONG");
  });

  it("hides and shows the history with the details toggle", async () => {
    serve();
    const user = await open();
    await rows();

    await user.click(panel().getByRole("button", { name: "Hide details" }));
    expect(await rows()).toHaveLength(2);
    expect(panel().getByRole("button", { name: "Show details" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(panel().getByRole("button", { name: "Show details" }));
    expect(await rows()).toHaveLength(4);
  });

  it("loads older pages, never showing anything out of order", async () => {
    const { calls } = serve({
      "GET /cards/100/comments": {
        status: 200,
        body: {
          items: [comment(9, 2, "Newest", "2026-11-12T12:00:00Z")],
          next_before: 9,
        },
      },
      "GET /cards/100/comments?before=9": {
        status: 200,
        body: {
          items: [comment(4, 2, "Old comment", "2026-11-11T08:00:00Z")],
          next_before: null,
        },
      },
      "GET /boards/1/activity?card_id=100": {
        status: 200,
        body: {
          items: [entry(30, "card.archived", { card: BRIEF }, "2026-11-11T09:00:00Z")],
          next_before: null,
        },
      },
    });
    const user = await open();

    // The history entry is older than the oldest loaded comment, and more
    // comments exist: it waits until they're loaded.
    expect(await rows()).toEqual([expect.stringMatching(/Newest/)]);
    await user.click(panel().getByRole("button", { name: "Show older" }));

    await waitFor(async () => expect(await rows()).toHaveLength(3));
    const shown = await rows();
    expect(shown[1]).toMatch(/archived this card/);
    expect(shown[2]).toMatch(/Old comment/);
    expect(calls.map((call) => call.key)).toContain("GET /cards/100/comments?before=9");
    expect(
      panel().queryByRole("button", { name: "Show older" }),
    ).not.toBeInTheDocument();
  });
});

describe("writing comments", () => {
  it("adds a comment at the top", async () => {
    const { calls } = serve({
      "POST /cards/100/comments": ({ body }) => ({
        status: 201,
        body: comment(7, 1, JSON.parse(body ?? "{}").body, "2026-11-12T11:00:00Z"),
      }),
    });
    const user = await open();
    const box = panel().getByRole("textbox", { name: "Write a comment" });
    const save = panel().getAllByRole("button", { name: "Save" })[0]!;

    expect(save).toBeDisabled();
    await user.type(box, "  Ship _it_  ");
    await user.click(save);

    expect((await rows())[0]).toMatch(/^You .*Ship it/);
    expect(box).toHaveValue("");
    expect(
      JSON.parse(calls.find((call) => call.key === "POST /cards/100/comments")!.body!),
    ).toEqual({
      body: "Ship _it_",
    });
  });

  it("edits your own comment, and marks it edited", async () => {
    const { calls } = serve({
      "PATCH /comments/5": {
        status: 200,
        body: comment(5, 1, "Second draft", "2026-11-12T08:00:00Z", {
          edited_at: "2026-11-12T11:00:00Z",
        }),
      },
    });
    const user = await open();
    const mine = within(
      await screen.findByRole("article", { name: "Comment by alice@example.com" }),
    );
    const bobs = within(
      screen.getByRole("article", { name: "Comment by bob@example.com" }),
    );

    expect(bobs.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await user.click(mine.getByRole("button", { name: "Edit" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Brief" })).toBeInTheDocument();
    expect(
      mine.queryByRole("textbox", { name: "Edit comment" }),
    ).not.toBeInTheDocument();

    await user.click(mine.getByRole("button", { name: "Edit" }));
    const field = mine.getByRole("textbox", { name: "Edit comment" });
    await user.clear(field);
    await user.type(field, "Second draft");
    await user.click(mine.getByRole("button", { name: "Save" }));

    expect(mine.getByText("Second draft")).toBeInTheDocument();
    expect(mine.getByText(/\(edited\)/)).toBeInTheDocument();
    expect(
      JSON.parse(calls.find((call) => call.key === "PATCH /comments/5")!.body!),
    ).toEqual({
      body: "Second draft",
    });
  });

  it("lets the owner delete anyone's comment after a confirmation", async () => {
    const { calls } = serve({ "DELETE /comments/6": { status: 204 } });
    const user = await open();
    const bobs = within(
      await screen.findByRole("article", { name: "Comment by bob@example.com" }),
    );

    await user.click(bobs.getByRole("button", { name: "Delete" }));
    const confirm = within(
      screen.getByRole("dialog", { name: "Delete this comment?" }),
    );
    expect(confirm.getByText(/can't be undone/)).toBeInTheDocument();
    await user.click(confirm.getByRole("button", { name: "Delete comment" }));

    expect(
      screen.queryByRole("article", { name: "Comment by bob@example.com" }),
    ).not.toBeInTheDocument();
    expect(calls.map((call) => call.key)).toContain("DELETE /comments/6");
  });

  it("lets an editor delete only their own", async () => {
    serve({}, { role: "editor" });
    await open();

    const bobs = within(
      await screen.findByRole("article", { name: "Comment by bob@example.com" }),
    );
    const mine = within(
      screen.getByRole("article", { name: "Comment by alice@example.com" }),
    );
    expect(bobs.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(mine.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("gives a viewer no comment box", async () => {
    serve({}, { role: "viewer" });
    await open();

    expect(
      await panel().findByText("Viewers can read comments but not write them."),
    ).toBeInTheDocument();
    expect(
      panel().queryByRole("textbox", { name: "Write a comment" }),
    ).not.toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("asks for a restore before commenting on an archived card, but still deletes", async () => {
    serve(
      {
        "GET /cards/100": {
          status: 200,
          body: { ...BRIEF, position: null, archived_at: "2026-11-12T09:00:00Z" },
        },
      },
      {},
      // Archived: not on the board, so the dialog reads it on its own.
      { lists: [list(1, "To do"), list(2, "Doing")] },
    );
    window.location.hash = "#card-100";
    render(<App />);
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => {
      FakeWebSocket.latest().open();
      FakeWebSocket.latest().receive({ type: "ready" });
    });

    expect(
      await screen.findByText("Restore the card to comment on it."),
    ).toBeInTheDocument();
    const mine = within(
      await screen.findByRole("article", { name: "Comment by alice@example.com" }),
    );
    expect(mine.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(mine.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

describe("links to comments", () => {
  it("copies a link to one comment", async () => {
    serve();
    const user = await open();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const mine = within(
      await screen.findByRole("article", { name: "Comment by alice@example.com" }),
    );
    await user.click(mine.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/#card-100-comment-5$/),
    );
    expect(panel().getByRole("status")).toHaveTextContent("Link copied.");
  });

  it("shows the link when the clipboard refuses", async () => {
    serve();
    const user = await open();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    const mine = within(
      await screen.findByRole("article", { name: "Comment by alice@example.com" }),
    );
    await user.click(mine.getByRole("button", { name: "Copy link" }));

    expect(panel().getByRole("status")).toHaveTextContent(
      /Copy this link: .*#card-100-comment-5/,
    );
  });

  it("opens a linked comment highlighted", async () => {
    serve();
    await open("#card-100-comment-5");

    const linked = await screen.findByRole("article", {
      name: "Comment by alice@example.com",
    });
    expect(linked).toHaveClass("hl");
  });

  it("reads a linked comment that isn't on the first page", async () => {
    serve({
      "GET /comments/2": {
        status: 200,
        body: comment(2, 2, "Long ago", "2026-11-01T08:00:00Z"),
      },
      "GET /cards/100/comments": {
        status: 200,
        body: { items: COMMENTS, next_before: 5 },
      },
    });
    await open("#card-100-comment-2");

    expect(await panel().findByText("Linked comment")).toBeInTheDocument();
    expect(panel().getByText("Long ago")).toBeInTheDocument();
  });
});

describe("live updates", () => {
  it("shows others' comments as they're written, and drops deleted ones", async () => {
    serve();
    await open();
    await rows();

    act(() =>
      FakeWebSocket.latest().receive({
        type: "comment.created",
        board_id: 1,
        actor_id: 2,
        data: { comment: comment(8, 2, "Just now", "2026-11-12T12:00:00Z") },
      }),
    );
    expect((await rows())[0]).toMatch(/Just now/);

    act(() =>
      FakeWebSocket.latest().receive({
        type: "comment.deleted",
        board_id: 1,
        actor_id: 2,
        data: { comment_id: 8, card_id: 100 },
      }),
    );
    expect(panel().queryByText("Just now")).not.toBeInTheDocument();
  });

  it("re-reads the history when the card changes", async () => {
    let activity = ACTIVITY;
    serve({
      "GET /boards/1/activity?card_id=100": () => ({
        status: 200,
        body: { items: activity, next_before: null },
      }),
    });
    await open();
    await rows();

    activity = [
      entry(
        22,
        "card.updated",
        { card: { ...BRIEF, list_id: 2, due_complete: true } },
        "2026-11-12T11:30:00Z",
      ),
      ...ACTIVITY,
    ];
    act(() =>
      FakeWebSocket.latest().receive({
        type: "card.updated",
        board_id: 1,
        actor_id: 2,
        data: { card: { ...BRIEF, list_id: 2, due_complete: true }, lists: [] },
      }),
    );

    await waitFor(async () =>
      expect((await rows())[0]).toMatch(/marked this card done/),
    );
  });

  it("ignores events about other cards", async () => {
    const { calls } = serve();
    await open();
    await rows();
    const before = calls.length;

    act(() =>
      FakeWebSocket.latest().receive({
        type: "card.updated",
        board_id: 1,
        actor_id: 2,
        data: { card: card(999, 1), lists: [] },
      }),
    );

    expect(calls.slice(before).map((call) => call.key)).not.toContain(
      "GET /boards/1/activity?card_id=100",
    );
  });
});
