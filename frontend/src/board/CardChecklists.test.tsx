import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "../App";
import type { Board } from "../api/boards";
import type { Checklist, ChecklistItem } from "../api/checklists";
import { TOKEN_KEY } from "../auth/session";
import { boardInfo, card, LABELS, list, MEMBERS } from "../test/boardData";
import { fakeApi, meFor, type FakeResponse } from "../test/fakeApi";
import { FakeWebSocket, installFakeWebSocket } from "../test/fakeSocket";

const BRIEF = card(100, 1, { title: "Brief", checklist_done: 1, checklist_total: 3 });

function item(id: number, text: string, done = false, position = 0): ChecklistItem {
  return {
    id,
    checklist_id: 7,
    text,
    done,
    position,
    created_at: "2026-11-13T00:00:00Z",
    assignee_id: null,
    due_at: null,
  };
}

const CLOSE_UP = item(71, "Close-up", false, 1);

const SHOTS: Checklist = {
  id: 7,
  card_id: 100,
  title: "Shots",
  position: 0,
  created_at: "2026-11-13T00:00:00Z",
  items: [
    item(70, "Window display", true, 0),
    CLOSE_UP,
    item(72, "Team photo", false, 2),
  ],
};

type Handler = (request: { body: string | undefined }) => FakeResponse;
type Routes = Record<string, FakeResponse | Handler>;

function serve(
  routes: Routes = {},
  board: Partial<Board> = {},
  checklists: Checklist[] = [SHOTS],
  start = [list(1, "To do", [BRIEF])],
) {
  return fakeApi({
    "GET /users/me": meFor("t1"),
    "GET /cards/100": { status: 200, body: BRIEF },
    "GET /boards/1/snapshot": {
      status: 200,
      body: { board: boardInfo(board), lists: start },
    },
    "GET /boards/1/labels": { status: 200, body: LABELS },
    "GET /boards/1/members": { status: 200, body: MEMBERS },
    "GET /cards/100/comments": { status: 200, body: { items: [], next_before: null } },
    "GET /boards/1/activity?card_id=100": {
      status: 200,
      body: { items: [], next_before: null },
    },
    "GET /cards/100/checklists": { status: 200, body: checklists },
    ...routes,
  });
}

async function open() {
  window.location.hash = "#card-100";
  render(<App />);
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  act(() => {
    FakeWebSocket.latest().open();
    FakeWebSocket.latest().receive({ type: "ready" });
  });
  return userEvent.setup();
}

function dialog() {
  return within(screen.getByRole("dialog", { name: "Brief" }));
}

async function shots() {
  return within(await screen.findByRole("region", { name: "Shots" }));
}

function bodiesOf(calls: { key: string; body: string | undefined }[], key: string) {
  return calls
    .filter((call) => call.key === key)
    .map((call) => JSON.parse(call.body ?? "null"));
}

/** A PATCH /checklist-items/<id> that answers with the item as changed. */
function patchItem(base: ChecklistItem): Handler {
  return ({ body }) => ({
    status: 200,
    body: { ...base, ...JSON.parse(body ?? "{}") },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, "t1");
  installFakeWebSocket();
});

describe("reading checklists", () => {
  it("shows each checklist with its items, ticked ones struck through, and progress", async () => {
    serve();
    await open();

    const shots_ = await shots();
    expect(shots_.getByText("33%")).toBeInTheDocument();
    expect(
      shots_.getByRole("progressbar", { name: "Shots: 1 of 3 done" }),
    ).toHaveAttribute("aria-valuenow", "33");
    expect(shots_.getByRole("checkbox", { name: "Window display" })).toBeChecked();
    expect(shots_.getByText("Window display").closest("li")).toHaveClass("done");
    expect(shots_.getByRole("checkbox", { name: "Close-up" })).not.toBeChecked();
    expect(
      within(dialog().getByRole("region", { name: "Checklists" })).getByText(
        "1/3 done",
      ),
    ).toBeInTheDocument();
  });

  it("hides and shows ticked items, remembered in this browser", async () => {
    serve();
    const user = await open();
    const shots_ = await shots();

    await user.click(shots_.getByRole("button", { name: "Hide ticked items" }));
    expect(shots_.queryByText("Window display")).not.toBeInTheDocument();
    expect(shots_.getByText("Close-up")).toBeInTheDocument();
    expect(window.localStorage.getItem("taskboard.hideTicked.7")).toBe("1");

    await user.click(shots_.getByRole("button", { name: "Show ticked items (1)" }));
    expect(shots_.getByText("Window display")).toBeInTheDocument();
    expect(window.localStorage.getItem("taskboard.hideTicked.7")).toBeNull();
  });

  it("offers no hide toggle until something is ticked", async () => {
    serve({}, {}, [{ ...SHOTS, items: [item(71, "Close-up")] }]);
    await open();
    const shots_ = await shots();
    expect(
      shots_.queryByRole("button", { name: "Hide ticked items" }),
    ).not.toBeInTheDocument();
    expect(shots_.getByText("0%")).toBeInTheDocument();
  });

  it("lets a viewer read but not change them", async () => {
    serve({}, { role: "viewer" });
    await open();
    const shots_ = await shots();

    expect(shots_.getByRole("checkbox", { name: "Close-up" })).toBeDisabled();
    expect(shots_.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(
      shots_.queryByRole("button", { name: "Add an item" }),
    ).not.toBeInTheDocument();
    expect(
      shots_.queryByRole("button", { name: /Item options/ }),
    ).not.toBeInTheDocument();
    expect(
      dialog().queryByRole("button", { name: "Add a checklist" }),
    ).not.toBeInTheDocument();
    // Hiding ticked items changes nothing on the board, so viewers can too.
    expect(
      shots_.getByRole("button", { name: "Hide ticked items" }),
    ).toBeInTheDocument();
  });

  it("is read-only on a closed board", async () => {
    serve({}, { closed_at: "2026-11-12T00:00:00Z" });
    await open();
    expect((await shots()).getByRole("checkbox", { name: "Close-up" })).toBeDisabled();
  });
});

describe("changing checklists", () => {
  it("adds a checklist named Checklist by default, then its first items", async () => {
    const made: Checklist = {
      ...SHOTS,
      id: 8,
      title: "Checklist",
      position: 1,
      items: [],
    };
    let next = 80;
    const { calls } = serve({
      "POST /cards/100/checklists": { status: 201, body: made },
      "POST /checklists/8/items": ({ body }) => ({
        status: 201,
        body: { ...item(next++, JSON.parse(body ?? "{}").text), checklist_id: 8 },
      }),
    });
    const user = await open();
    await shots();

    await user.click(dialog().getByRole("button", { name: "Add a checklist" }));
    const pop = within(screen.getByRole("dialog", { name: "Add a checklist" }));
    expect(pop.getByLabelText("Title")).toHaveValue("Checklist");
    await user.click(pop.getByRole("button", { name: "Add" }));

    const added = within(await screen.findByRole("region", { name: "Checklist" }));
    // Its add-item field opens at once, and stays open for the next item.
    const field = added.getByRole("textbox", { name: "New item" });
    expect(field).toHaveFocus();
    await user.type(field, "Pick the crop{Enter}");
    await user.type(field, "Send it{Enter}");

    expect(await added.findByText("Send it")).toBeInTheDocument();
    expect(added.getByText("Pick the crop")).toBeInTheDocument();
    expect(field).toHaveValue("");
    expect(bodiesOf(calls, "POST /cards/100/checklists")).toEqual([
      { title: "Checklist" },
    ]);
    expect(bodiesOf(calls, "POST /checklists/8/items")).toEqual([
      { text: "Pick the crop" },
      { text: "Send it" },
    ]);

    await user.click(added.getByRole("button", { name: "Done" }));
    expect(added.queryByRole("textbox", { name: "New item" })).not.toBeInTheDocument();
  });

  it("names a new checklist", async () => {
    const { calls } = serve({
      "POST /cards/100/checklists": ({ body }) => ({
        status: 201,
        body: { ...SHOTS, id: 9, items: [], ...JSON.parse(body ?? "{}") },
      }),
    });
    const user = await open();
    await shots();

    await user.click(dialog().getByRole("button", { name: "Add a checklist" }));
    // The default is selected, so typing replaces it.
    await user.keyboard("Review{Enter}");

    expect(await screen.findByRole("region", { name: "Review" })).toBeInTheDocument();
    expect(bodiesOf(calls, "POST /cards/100/checklists")).toEqual([
      { title: "Review" },
    ]);
  });

  it("ticks an item at once, and puts it back if the API refuses", async () => {
    const { calls } = serve({
      "PATCH /checklist-items/71": patchItem(CLOSE_UP),
      "PATCH /checklist-items/72": {
        status: 422,
        body: { detail: [{ loc: ["body", "item_id"], msg: "Card is archived" }] },
      },
    });
    const user = await open();
    const shots_ = await shots();

    await user.click(shots_.getByRole("checkbox", { name: "Close-up" }));
    expect(shots_.getByRole("checkbox", { name: "Close-up" })).toBeChecked();
    expect(shots_.getByText("67%")).toBeInTheDocument();
    expect(bodiesOf(calls, "PATCH /checklist-items/71")).toEqual([{ done: true }]);

    await user.click(shots_.getByRole("checkbox", { name: "Team photo" }));
    // Refused: the checklists are read again, and say what the API holds.
    await waitFor(() =>
      expect(shots_.getByRole("checkbox", { name: "Team photo" })).not.toBeChecked(),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't tick the item: Card is archived",
    );
  });

  it("renames a checklist", async () => {
    const { calls } = serve({
      "PATCH /checklists/7": ({ body }) => ({
        status: 200,
        body: { ...SHOTS, ...JSON.parse(body ?? "{}") },
      }),
    });
    const user = await open();
    const shots_ = await shots();

    await user.click(shots_.getByRole("button", { name: "Shots" }));
    const field = shots_.getByRole("textbox", { name: "Checklist title" });
    await user.clear(field);
    await user.type(field, "Photos{Enter}");

    expect(await screen.findByRole("region", { name: "Photos" })).toBeInTheDocument();
    expect(bodiesOf(calls, "PATCH /checklists/7")).toEqual([{ title: "Photos" }]);
  });

  it("edits and deletes an item from its options", async () => {
    const { calls } = serve({
      "PATCH /checklist-items/71": patchItem(CLOSE_UP),
      "DELETE /checklist-items/72": { status: 204 },
    });
    const user = await open();
    const shots_ = await shots();

    await user.click(shots_.getByRole("button", { name: "Item options for Close-up" }));
    let pop = within(screen.getByRole("dialog", { name: "Item" }));
    await user.clear(pop.getByLabelText("Text"));
    await user.type(pop.getByLabelText("Text"), "Close-up of the linen{Enter}");
    expect(await shots_.findByText("Close-up of the linen")).toBeInTheDocument();
    expect(bodiesOf(calls, "PATCH /checklist-items/71")).toEqual([
      { text: "Close-up of the linen" },
    ]);

    await user.click(
      shots_.getByRole("button", { name: "Item options for Team photo" }),
    );
    pop = within(screen.getByRole("dialog", { name: "Item" }));
    await user.click(pop.getByRole("button", { name: "Delete item" }));
    expect(shots_.queryByText("Team photo")).not.toBeInTheDocument();
    expect(calls.map((call) => call.key)).toContain("DELETE /checklist-items/72");
  });

  it("gives an item its own assignee and due date, and clears them", async () => {
    const { calls } = serve({ "PATCH /checklist-items/71": patchItem(CLOSE_UP) });
    const user = await open();
    const shots_ = await shots();

    await user.click(shots_.getByRole("button", { name: "Item options for Close-up" }));
    let pop = within(screen.getByRole("dialog", { name: "Item" }));
    await user.selectOptions(pop.getByLabelText("Assignee"), "bob@example.com");
    await user.type(pop.getByLabelText("Due"), "2026-11-25T09:30");
    await user.click(pop.getByRole("button", { name: "Save" }));

    expect(bodiesOf(calls, "PATCH /checklist-items/71")).toEqual([
      { assignee_id: 2, due_at: new Date("2026-11-25T09:30").toISOString() },
    ]);
    // Shown on the item's row: the date and the person.
    const row = within(shots_.getByText("Close-up").closest("li")!);
    expect(row.getByText("Nov 25")).toBeInTheDocument();
    expect(row.getByRole("img", { name: "bob@example.com" })).toBeInTheDocument();

    await user.click(shots_.getByRole("button", { name: "Item options for Close-up" }));
    pop = within(screen.getByRole("dialog", { name: "Item" }));
    await user.selectOptions(pop.getByLabelText("Assignee"), "No one");
    await user.clear(pop.getByLabelText("Due"));
    await user.click(pop.getByRole("button", { name: "Save" }));

    expect(bodiesOf(calls, "PATCH /checklist-items/71").at(-1)).toEqual({
      assignee_id: null,
      due_at: null,
    });
    expect(row.queryByText("Nov 25")).not.toBeInTheDocument();
  });

  it("sends nothing when the options are saved unchanged", async () => {
    const { calls } = serve({ "PATCH /checklist-items/71": patchItem(CLOSE_UP) });
    const user = await open();
    const shots_ = await shots();

    await user.click(shots_.getByRole("button", { name: "Item options for Close-up" }));
    const pop = within(screen.getByRole("dialog", { name: "Item" }));
    await user.click(pop.getByRole("button", { name: "Save" }));

    expect(bodiesOf(calls, "PATCH /checklist-items/71")).toEqual([]);
  });

  it("deletes a checklist after a confirmation", async () => {
    const { calls } = serve({ "DELETE /checklists/7": { status: 204 } });
    const user = await open();
    const shots_ = await shots();

    await user.click(shots_.getByRole("button", { name: "Delete" }));
    const confirm = within(
      screen.getByRole("dialog", { name: "Delete the checklist “Shots”?" }),
    );
    expect(confirm.getByText(/Its 3 items are deleted too/)).toBeInTheDocument();
    await user.click(confirm.getByRole("button", { name: "Delete checklist" }));

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Shots" })).not.toBeInTheDocument(),
    );
    expect(calls.map((call) => call.key)).toContain("DELETE /checklists/7");
    expect(screen.getByRole("dialog", { name: "Brief" })).toBeInTheDocument();
  });

  it("closes the add-item field with Escape, leaving the card open", async () => {
    serve();
    const user = await open();
    const shots_ = await shots();

    await user.click(shots_.getByRole("button", { name: "Add an item" }));
    await user.keyboard("{Escape}");

    expect(shots_.queryByRole("textbox", { name: "New item" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Brief" })).toBeInTheDocument();
  });
});

describe("live updates", () => {
  it("keeps an event that arrives while the checklists are being re-read", async () => {
    let reads = 0;
    let answerLate: (response: FakeResponse) => void = () => {};
    serve({
      "GET /cards/100/checklists": () => {
        reads += 1;
        if (reads === 1) return { status: 200, body: [SHOTS] };
        // The re-read after a reconnect answers only when the test says so.
        return new Promise<FakeResponse>((resolve) => (answerLate = resolve));
      },
    });
    await open();
    const shots_ = await shots();

    act(() => FakeWebSocket.latest().receive({ type: "ready" })); // a reconnect
    await waitFor(() => expect(reads).toBe(2));
    act(() =>
      FakeWebSocket.latest().receive({
        type: "checklist_item.updated",
        board_id: 1,
        actor_id: 2,
        data: {
          card_id: 100,
          item: item(72, "Team photo", true, 2),
          item_ids: [70, 71, 72],
        },
      }),
    );
    // The re-read answers with what it read before that event.
    await act(async () => answerLate({ status: 200, body: [SHOTS] }));

    expect(shots_.getByRole("checkbox", { name: "Team photo" })).toBeChecked();
  });

  it("applies others' checklist changes as they happen", async () => {
    serve();
    await open();
    const shots_ = await shots();

    act(() =>
      FakeWebSocket.latest().receive({
        type: "checklist_item.updated",
        board_id: 1,
        actor_id: 2,
        data: {
          card_id: 100,
          item: item(72, "Team photo", true, 2),
          item_ids: [70, 71, 72],
        },
      }),
    );
    expect(shots_.getByRole("checkbox", { name: "Team photo" })).toBeChecked();

    act(() =>
      FakeWebSocket.latest().receive({
        type: "checklist.deleted",
        board_id: 1,
        actor_id: 2,
        data: { card_id: 100, checklist_id: 7, title: "Shots", checklist_ids: [] },
      }),
    );
    expect(screen.queryByRole("region", { name: "Shots" })).not.toBeInTheDocument();
  });

  it("ignores other cards' checklists, and re-reads after a reconnect", async () => {
    const { calls } = serve({
      "GET /cards/101/checklists": { status: 200, body: [] },
    });
    await open();
    const shots_ = await shots();

    act(() =>
      FakeWebSocket.latest().receive({
        type: "checklist_item.updated",
        board_id: 1,
        actor_id: 2,
        data: {
          card_id: 101,
          item: { ...item(72, "Team photo", true, 2) },
          item_ids: [70, 71, 72],
        },
      }),
    );
    expect(shots_.getByRole("checkbox", { name: "Team photo" })).not.toBeChecked();

    const reads = () =>
      calls.filter((call) => call.key === "GET /cards/100/checklists").length;
    const before = reads();
    act(() => FakeWebSocket.latest().receive({ type: "resync" }));
    await waitFor(() => expect(reads()).toBe(before + 1));
  });
});
