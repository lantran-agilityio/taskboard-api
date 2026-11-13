import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "../App";
import type { Board } from "../api/boards";
import { TOKEN_KEY } from "../auth/session";
import { boardInfo, card, LABELS, list, MEMBERS } from "../test/boardData";
import { fakeApi, meFor, type FakeResponse } from "../test/fakeApi";
import { FakeWebSocket, installFakeWebSocket } from "../test/fakeSocket";
import type { Card } from "./model";

const BRIEF = card(100, 1, {
  title: "Brief",
  description: "Why we **ship**",
  label_ids: [10],
  assignee_ids: [2],
});

function lists() {
  return [
    list(1, "To do", [BRIEF, card(101, 1, { title: "Venue" })]),
    list(2, "Doing", [card(200, 2, { title: "Budget" })]),
  ];
}

type Handler = (request: { body: string | undefined }) => FakeResponse;
type Routes = Record<string, FakeResponse | Handler>;

function serve(routes: Routes = {}, board: Partial<Board> = {}, start = lists()) {
  return fakeApi({
    "GET /users/me": meFor("t1"),
    "GET /cards/100": { status: 200, body: BRIEF },
    "GET /boards/1/snapshot": {
      status: 200,
      body: { board: boardInfo(board), lists: start },
    },
    "GET /boards/1/labels": { status: 200, body: LABELS },
    "GET /boards/1/members": { status: 200, body: MEMBERS },
    // The comments and activity panel (step 26b), empty here.
    "GET /cards/100/comments": { status: 200, body: { items: [], next_before: null } },
    "GET /boards/1/activity?card_id=100": {
      status: 200,
      body: { items: [], next_before: null },
    },
    "GET /cards/100/checklists": { status: 200, body: [] },
    ...routes,
  });
}

/** Opens an address, signed in, and lets the board's socket get ready. */
async function open(hash: string) {
  window.location.hash = hash;
  render(<App />);
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  act(() => {
    FakeWebSocket.latest().open();
    FakeWebSocket.latest().receive({ type: "ready" });
  });
  return userEvent.setup();
}

function dialog() {
  return within(screen.getByRole("dialog", { name: /Brief|Card not found/ }));
}

function bodiesOf(calls: { key: string; body: string | undefined }[], key: string) {
  return calls
    .filter((call) => call.key === key)
    .map((call) => JSON.parse(call.body ?? "null"));
}

/** A PATCH /cards/100 that answers with the card as changed. */
function patchCard(base: Card = BRIEF): Handler {
  return ({ body }) => ({
    status: 200,
    body: { ...base, ...JSON.parse(body ?? "{}") },
  });
}

beforeEach(() => {
  window.localStorage.setItem(TOKEN_KEY, "t1");
  installFakeWebSocket();
});

describe("opening a card", () => {
  it("opens from its own address, over its board", async () => {
    const { calls } = serve();
    await open("#card-100");

    const card = within(await screen.findByRole("dialog", { name: "Brief" }));
    expect(card.getByText("To do")).toBeInTheDocument();
    expect(card.getByText("#100")).toBeInTheDocument();
    expect(card.getByText("ship").tagName).toBe("STRONG");
    expect(
      within(card.getByRole("region", { name: "Labels" })).getByText("Bug"),
    ).toBeInTheDocument();
    expect(
      within(card.getByRole("region", { name: "Members" })).getByRole("img", {
        name: "bob@example.com",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "To do" })).toBeInTheDocument();
    expect(calls.map((call) => call.key)).toContain("GET /cards/100");
  });

  it("opens from the board without reloading it", async () => {
    const { calls } = serve();
    const user = await open("#board-1");
    await screen.findByRole("region", { name: "To do" });

    await user.click(screen.getByRole("link", { name: "Brief" }));

    expect(await screen.findByRole("dialog", { name: "Brief" })).toBeInTheDocument();
    expect(calls.filter((call) => call.key === "GET /boards/1/snapshot")).toHaveLength(
      1,
    );
    expect(calls.map((call) => call.key)).not.toContain("GET /cards/100");
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("closes with × or Escape, back to the board", async () => {
    serve();
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.keyboard("{Escape}");

    await waitFor(() => expect(window.location.hash).toBe("#board-1"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("says when the card doesn't exist", async () => {
    serve({ "GET /cards/100": { status: 404, body: { detail: "Card not found" } } });
    window.location.hash = "#card-100";
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Card not found" }),
    ).toBeInTheDocument();
  });
});

describe("editing the card", () => {
  it("renames it", async () => {
    const { calls } = serve({ "PATCH /cards/100": patchCard() });
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.click(dialog().getByRole("button", { name: "Brief" }));
    const field = dialog().getByRole("textbox", { name: "Card title" });
    await user.clear(field);
    await user.type(field, "Project brief{Enter}");

    expect(
      await screen.findByRole("dialog", { name: "Project brief" }),
    ).toBeInTheDocument();
    expect(bodiesOf(calls, "PATCH /cards/100")).toEqual([{ title: "Project brief" }]);
  });

  it("edits the description with Save, and Cancel or Escape keeps it", async () => {
    const { calls } = serve({ "PATCH /cards/100": patchCard() });
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.click(dialog().getByRole("button", { name: "Edit" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Brief" })).toBeInTheDocument();
    expect(
      dialog().queryByRole("textbox", { name: "Description" }),
    ).not.toBeInTheDocument();

    await user.click(dialog().getByRole("button", { name: "Edit" }));
    const field = dialog().getByRole("textbox", { name: "Description" });
    await user.clear(field);
    await user.type(field, "- one\n- two");
    await user.click(
      within(dialog().getByRole("region", { name: "Description" })).getByRole(
        "button",
        {
          name: "Save",
        },
      ),
    );

    expect(
      dialog()
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["one", "two"]);
    expect(bodiesOf(calls, "PATCH /cards/100")).toEqual([
      { description: "- one\n- two" },
    ]);
  });

  it("clears the description when saved empty", async () => {
    const { calls } = serve({ "PATCH /cards/100": patchCard() });
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.click(dialog().getByRole("button", { name: "Edit" }));
    await user.clear(dialog().getByRole("textbox", { name: "Description" }));
    await user.click(
      within(dialog().getByRole("region", { name: "Description" })).getByRole(
        "button",
        {
          name: "Save",
        },
      ),
    );

    expect(bodiesOf(calls, "PATCH /cards/100")).toEqual([{ description: null }]);
    expect(
      dialog().getByRole("button", { name: "Add a more detailed description…" }),
    ).toBeInTheDocument();
  });

  it("marks it done", async () => {
    const { calls } = serve({ "PATCH /cards/100": patchCard() });
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.click(dialog().getByRole("button", { name: "Mark done" }));

    expect(dialog().getByRole("button", { name: "Mark not done" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(bodiesOf(calls, "PATCH /cards/100")).toEqual([{ due_complete: true }]);
  });

  it("assigns members from a search", async () => {
    const { calls } = serve({ "PATCH /cards/100": patchCard() });
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.click(dialog().getByRole("button", { name: "Edit members" }));
    const picker = within(screen.getByRole("dialog", { name: "Members" }));
    await user.type(picker.getByRole("textbox", { name: "Search members" }), "ali");
    expect(picker.queryByText("bob@example.com")).not.toBeInTheDocument();
    await user.click(picker.getByRole("checkbox", { name: "alice@example.com" }));

    expect(bodiesOf(calls, "PATCH /cards/100")).toEqual([{ assignee_ids: [1, 2] }]);
  });

  it("sets and removes the due date, starting at tomorrow", async () => {
    const { calls } = serve({ "PATCH /cards/100": patchCard() });
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.click(dialog().getByRole("button", { name: "Add" }));
    const picker = within(screen.getByRole("dialog", { name: "Due date" }));
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const day = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    expect(picker.getByLabelText("Date")).toHaveValue(day);
    await user.clear(picker.getByLabelText("Date"));
    await user.type(picker.getByLabelText("Date"), "2026-12-01");
    await user.clear(picker.getByLabelText("Time"));
    await user.type(picker.getByLabelText("Time"), "09:30");
    await user.click(picker.getByRole("button", { name: "Save" }));

    expect(bodiesOf(calls, "PATCH /cards/100")).toEqual([
      { due_at: new Date("2026-12-01T09:30").toISOString() },
    ]);
    await user.click(dialog().getByRole("button", { name: "Change" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Due date" })).getByRole("button", {
        name: "Remove",
      }),
    );
    expect(bodiesOf(calls, "PATCH /cards/100").at(-1)).toEqual({ due_at: null });
  });

  it("moves it to another list and position", async () => {
    const { calls } = serve({ "PATCH /cards/100": patchCard() });
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.click(dialog().getByRole("button", { name: /In list To do/ }));
    const picker = within(screen.getByRole("dialog", { name: "Move card" }));
    expect(picker.getByRole("combobox", { name: "List" })).toHaveDisplayValue(
      "To do (current)",
    );
    expect(
      within(picker.getByRole("combobox", { name: "Position" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["1 (current)", "2"]);
    await user.selectOptions(picker.getByRole("combobox", { name: "List" }), "2");
    await user.selectOptions(picker.getByRole("combobox", { name: "Position" }), "0");
    await user.click(picker.getByRole("button", { name: "Move" }));

    expect(bodiesOf(calls, "PATCH /cards/100")).toEqual([{ list_id: 2, position: 0 }]);
    expect(dialog().getByRole("button", { name: /In list Doing/ })).toBeInTheDocument();
  });
});

describe("labels", () => {
  it("ticks labels on and off, searchable", async () => {
    const { calls } = serve({ "PATCH /cards/100": patchCard() });
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.click(dialog().getByRole("button", { name: "Edit labels" }));
    const picker = within(screen.getByRole("dialog", { name: "Labels" }));
    expect(picker.getByRole("checkbox", { name: "Bug (red)" })).toBeChecked();
    await user.type(picker.getByRole("textbox", { name: "Search labels" }), "green");
    expect(
      picker.queryByRole("checkbox", { name: "Bug (red)" }),
    ).not.toBeInTheDocument();
    await user.click(picker.getByRole("checkbox", { name: "green label" }));

    expect(bodiesOf(calls, "PATCH /cards/100")).toEqual([{ label_ids: [10, 11] }]);
  });

  it("creates a label and applies it to the card at once", async () => {
    const { calls } = serve({
      "POST /boards/1/labels": {
        status: 201,
        body: { id: 12, board_id: 1, name: "UX", color: "blue" },
      },
      "PATCH /cards/100": patchCard(),
    });
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.click(dialog().getByRole("button", { name: "Edit labels" }));
    await user.click(screen.getByRole("button", { name: "Create a label" }));
    const editor = within(screen.getByRole("dialog", { name: "Create a label" }));
    await user.type(editor.getByLabelText("Name (optional)"), "UX");
    await user.click(editor.getByRole("radio", { name: "blue" }));
    await user.click(editor.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(bodiesOf(calls, "PATCH /cards/100")).toEqual([{ label_ids: [10, 12] }]),
    );
    expect(bodiesOf(calls, "POST /boards/1/labels")).toEqual([
      { name: "UX", color: "blue" },
    ]);
    expect(
      within(dialog().getByRole("region", { name: "Labels" })).getByText("UX"),
    ).toBeInTheDocument();
  });

  it("edits a label, and deletes one after a confirmation", async () => {
    const { calls } = serve({
      "PATCH /labels/10": {
        status: 200,
        body: { id: 10, board_id: 1, name: "Defect", color: "red" },
      },
      "DELETE /labels/10": { status: 204 },
    });
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.click(dialog().getByRole("button", { name: "Edit labels" }));
    await user.click(screen.getByRole("button", { name: "Edit label Bug" }));
    const name = screen.getByLabelText("Name (optional)");
    await user.clear(name);
    await user.type(name, "Defect");
    await user.click(
      within(screen.getByRole("dialog", { name: "Edit label" })).getByRole("button", {
        name: "Save",
      }),
    );
    expect(bodiesOf(calls, "PATCH /labels/10")).toEqual([
      { name: "Defect", color: "red" },
    ]);
    expect(
      within(dialog().getByRole("region", { name: "Labels" })).getByText("Defect"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit label Defect" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = within(screen.getByRole("dialog", { name: /Delete the label/ }));
    expect(confirm.getByText(/comes off every card/)).toBeInTheDocument();
    await user.click(confirm.getByRole("button", { name: "Delete label" }));

    expect(calls.map((call) => call.key)).toContain("DELETE /labels/10");
    expect(
      within(dialog().getByRole("region", { name: "Labels" })).queryByText("Defect"),
    ).not.toBeInTheDocument();
  });
});

describe("archiving, restoring and deleting", () => {
  it("archives from the menu and then offers Restore and Delete", async () => {
    let archived = false;
    const { calls } = serve({
      "POST /cards/100/archive": () => {
        archived = true;
        return {
          status: 200,
          body: { ...BRIEF, position: null, archived_at: "2026-11-12T08:00:00Z" },
        };
      },
      "GET /cards/100": () => ({
        status: 200,
        body: archived
          ? { ...BRIEF, position: null, archived_at: "2026-11-12T08:00:00Z" }
          : BRIEF,
      }),
    });
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.click(dialog().getByRole("button", { name: "Card actions" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(await dialog().findByText(/This card was archived/)).toBeInTheDocument();
    expect(
      dialog().queryByRole("button", { name: "Mark done" }),
    ).not.toBeInTheDocument();
    expect(
      dialog().queryByRole("button", { name: "Edit labels" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "To do" })).not.toHaveTextContent(
      "Brief",
    );
    expect(calls.map((call) => call.key)).toContain("POST /cards/100/archive");

    await user.click(dialog().getByRole("button", { name: "Card actions" }));
    expect(
      screen.getByRole("button", { name: "Restore to the board" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete for good…" }),
    ).toBeInTheDocument();
  });

  it("shows the archived card even if a read races the archive", async () => {
    // The server's GET answers with the card as it was before the archive,
    // as a read that arrives first would in a real browser.
    serve({
      "POST /cards/100/archive": {
        status: 200,
        body: { ...BRIEF, position: null, archived_at: "2026-11-12T08:00:00Z" },
      },
      "GET /cards/100": { status: 200, body: BRIEF },
    });
    const user = await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    await user.click(dialog().getByRole("button", { name: "Card actions" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(await dialog().findByText(/This card was archived/)).toBeInTheDocument();
    await user.click(dialog().getByRole("button", { name: "Card actions" }));
    expect(
      screen.getByRole("button", { name: "Restore to the board" }),
    ).toBeInTheDocument();
  });

  it("restores an archived card", async () => {
    const stored = { ...BRIEF, position: null, archived_at: "2026-11-12T08:00:00Z" };
    const { calls } = serve(
      {
        "GET /cards/100": { status: 200, body: stored },
        "POST /cards/100/restore": { status: 200, body: BRIEF },
      },
      {},
      [list(1, "To do", [card(101, 1, { title: "Venue" })])],
    );
    const user = await open("#card-100");
    await screen.findByText(/This card was archived/);

    await user.click(dialog().getByRole("button", { name: "Card actions" }));
    await user.click(screen.getByRole("button", { name: "Restore to the board" }));

    await waitFor(() =>
      expect(dialog().getByRole("button", { name: "Mark done" })).toBeInTheDocument(),
    );
    expect(calls.map((call) => call.key)).toContain("POST /cards/100/restore");
  });

  it("deletes an archived card after a warning, and goes back to the board", async () => {
    const stored = { ...BRIEF, position: null, archived_at: "2026-11-12T08:00:00Z" };
    const { calls } = serve(
      {
        "GET /cards/100": { status: 200, body: stored },
        "DELETE /cards/100": { status: 204 },
      },
      {},
      [list(1, "To do", [])],
    );
    const user = await open("#card-100");
    await screen.findByText(/This card was archived/);

    await user.click(dialog().getByRole("button", { name: "Card actions" }));
    await user.click(screen.getByRole("button", { name: "Delete for good…" }));
    const confirm = within(screen.getByRole("dialog", { name: "Delete “Brief”?" }));
    expect(confirm.getByText(/can't be undone/)).toBeInTheDocument();
    await user.click(confirm.getByRole("button", { name: "Delete card" }));

    await waitFor(() => expect(window.location.hash).toBe("#board-1"));
    expect(calls.map((call) => call.key)).toContain("DELETE /cards/100");
  });
});

describe("read-only cards", () => {
  it("offers a viewer no edit controls", async () => {
    serve({}, { role: "viewer" });
    await open("#card-100");
    await screen.findByRole("dialog", { name: "Brief" });

    expect(dialog().queryByRole("button", { name: "Brief" })).not.toBeInTheDocument();
    expect(
      dialog().queryByRole("button", { name: "Card actions" }),
    ).not.toBeInTheDocument();
    expect(
      dialog().queryByRole("button", { name: "Edit labels" }),
    ).not.toBeInTheDocument();
    expect(dialog().queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(dialog().queryByRole("button", { name: /In list/ })).not.toBeInTheDocument();
    expect(dialog().getByText("ship").tagName).toBe("STRONG");
  });

  it("says when the card's list is archived", async () => {
    serve({}, {}, [list(2, "Doing", [card(200, 2, { title: "Budget" })])]);
    await open("#card-100");

    expect(await screen.findByText(/Its list is archived/)).toBeInTheDocument();
    expect(
      dialog().queryByRole("button", { name: "Mark done" }),
    ).not.toBeInTheDocument();
    expect(dialog().getByText("In an archived list")).toBeInTheDocument();
  });
});
