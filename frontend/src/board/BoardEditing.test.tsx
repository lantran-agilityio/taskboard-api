import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type { Board } from "../api/boards";
import { TOKEN_KEY } from "../auth/session";
import { boardInfo, card, LABELS, list, MEMBERS } from "../test/boardData";
import { fakeApi, meFor, type FakeResponse } from "../test/fakeApi";
import { FakeWebSocket, installFakeWebSocket } from "../test/fakeSocket";
import type { ListWithCards } from "./model";

function lists(): ListWithCards[] {
  return [
    list(1, "To do", [
      card(100, 1, { title: "Brief" }),
      card(101, 1, { title: "Venue" }),
    ]),
    list(2, "Doing", [card(200, 2, { title: "Budget", due_complete: true })]),
    list(3, "Done", []),
  ];
}

type Routes = Record<
  string,
  | FakeResponse
  | ((request: { body: string | undefined }) => FakeResponse | Promise<FakeResponse>)
>;

/** A promise the test resolves when it chooses: holds a request in flight. */
function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

function serve(routes: Routes = {}, board: Partial<Board> = {}, start = lists()) {
  return fakeApi({
    "GET /users/me": meFor("t1"),
    "GET /boards/1/snapshot": {
      status: 200,
      body: { board: boardInfo(board), lists: start },
    },
    "GET /boards/1/labels": { status: 200, body: LABELS },
    "GET /boards/1/members": { status: 200, body: MEMBERS },
    ...routes,
  });
}

async function openBoard() {
  render(<App />);
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  act(() => {
    FakeWebSocket.latest().open();
    FakeWebSocket.latest().receive({ type: "ready" });
  });
  await screen.findByRole("region", { name: "To do" });
  return userEvent.setup();
}

function lane(name: string) {
  return within(screen.getByRole("region", { name }));
}

function titles(name: string): string[] {
  return lane(name)
    .queryAllByRole("article")
    .map((article) => article.getAttribute("aria-label") ?? "");
}

function laneNames(): string[] {
  return screen
    .getAllByRole("region")
    .map((region) => region.getAttribute("aria-label") ?? "");
}

function bodiesOf(calls: { key: string; body: string | undefined }[], key: string) {
  return calls
    .filter((call) => call.key === key)
    .map((call) => JSON.parse(call.body ?? "null"));
}

// jsdom has no drag-and-drop data store; the board only needs these.
const dataTransfer = { setData: () => {}, effectAllowed: "", dropEffect: "" };

// jsdom has no DragEvent, so Testing Library would fall back to a plain Event
// and drop clientX/clientY. A MouseEvent keeps them.
class DragEventWithPointer extends MouseEvent {}

beforeEach(() => {
  vi.stubGlobal("DragEvent", DragEventWithPointer);
  window.localStorage.setItem(TOKEN_KEY, "t1");
  window.location.hash = "#board-1";
  installFakeWebSocket();
});

describe("who can edit", () => {
  it("offers no edit controls to a viewer", async () => {
    serve({}, { role: "viewer" });
    await openBoard();

    expect(
      screen.queryByRole("button", { name: /Add a list/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /List actions/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "+ Add a card" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "To do" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark done" })).not.toBeInTheDocument();
    expect(
      within(lane("Doing").getByRole("article")).getByRole("img", { name: "Done" }),
    ).toBeInTheDocument();
    expect(lane("To do").getAllByRole("article")[0]).not.toHaveAttribute("draggable");
  });

  it("offers none on a closed board, even to the owner", async () => {
    serve({}, { closed_at: "2026-11-10T00:00:00Z" });
    await openBoard();

    expect(
      screen.queryByRole("button", { name: /Add a list/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Launch" })).not.toBeInTheDocument();
  });

  it("lets only the owner rename the board", async () => {
    serve({}, { role: "editor" });
    await openBoard();

    expect(screen.getByRole("heading", { name: "Launch" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Launch" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /List actions for To do/ }),
    ).toBeInTheDocument();
  });
});

describe("adding", () => {
  it("adds lists one after another", async () => {
    let next = 4;
    const { calls } = serve({
      "POST /boards/1/lists": ({ body }) => ({
        status: 201,
        body: { ...list(next++, JSON.parse(body ?? "{}").name), cards: undefined },
      }),
    });
    const user = await openBoard();

    await user.click(screen.getByRole("button", { name: "+ Add another list" }));
    await user.type(screen.getByRole("textbox", { name: "List name" }), "Later{Enter}");
    await user.type(
      screen.getByRole("textbox", { name: "List name" }),
      "  Someday {Enter}",
    );
    await user.type(screen.getByRole("textbox", { name: "List name" }), "   {Enter}");

    expect(laneNames()).toEqual(["To do", "Doing", "Done", "Later", "Someday"]);
    expect(bodiesOf(calls, "POST /boards/1/lists")).toEqual([
      { name: "Later" },
      { name: "Someday" },
    ]);
    expect(screen.getByRole("textbox", { name: "List name" })).toHaveValue("   ");

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("textbox", { name: "List name" }),
    ).not.toBeInTheDocument();
  });

  it("adds cards one after another, and closes on a blank title", async () => {
    let next = 300;
    const { calls } = serve({
      "POST /lists/3/cards": ({ body }) => ({
        status: 201,
        body: card(next++, 3, { title: JSON.parse(body ?? "{}").title }),
      }),
    });
    const user = await openBoard();

    await user.click(lane("Done").getByRole("button", { name: "+ Add a card" }));
    await user.type(
      screen.getByRole("textbox", { name: "Card title" }),
      "Ship it{Enter}",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Card title" }),
      "Celebrate{Enter}",
    );

    expect(titles("Done")).toEqual(["Ship it", "Celebrate"]);
    expect(lane("Done").getByTitle("2 cards")).toHaveTextContent("2");

    await user.type(screen.getByRole("textbox", { name: "Card title" }), "  {Enter}");
    expect(
      screen.queryByRole("textbox", { name: "Card title" }),
    ).not.toBeInTheDocument();
    expect(bodiesOf(calls, "POST /lists/3/cards")).toHaveLength(2);
  });
});

describe("typing fast", () => {
  it("keeps card titles typed while the last one saves, and saves them in order", async () => {
    let next = 300;
    const first = gate();
    const { calls } = serve({
      "POST /lists/3/cards": async ({ body }) => {
        const title = JSON.parse(body ?? "{}").title;
        if (title === "One") await first.opened;
        return { status: 201, body: card(next++, 3, { title }) };
      },
    });
    const user = await openBoard();

    await user.click(lane("Done").getByRole("button", { name: "+ Add a card" }));
    const field = screen.getByRole("textbox", { name: "Card title" });
    await user.type(field, "One{Enter}");
    // "One" is still saving: the field is already empty for the next title.
    expect(field).toHaveValue("");
    await user.type(field, "Two{Enter}Three{Enter}");
    expect(bodiesOf(calls, "POST /lists/3/cards")).toEqual([{ title: "One" }]);

    await act(async () => first.open());

    await waitFor(() => expect(titles("Done")).toEqual(["One", "Two", "Three"]));
    expect(bodiesOf(calls, "POST /lists/3/cards")).toEqual([
      { title: "One" },
      { title: "Two" },
      { title: "Three" },
    ]);
    expect(field).toHaveValue("");
  });

  it("keeps list names typed while the last one saves", async () => {
    let next = 4;
    const first = gate();
    serve({
      "POST /boards/1/lists": async ({ body }) => {
        const name = JSON.parse(body ?? "{}").name;
        if (name === "Later") await first.opened;
        return { status: 201, body: { ...list(next++, name), cards: undefined } };
      },
    });
    const user = await openBoard();

    await user.click(screen.getByRole("button", { name: "+ Add another list" }));
    await user.type(
      screen.getByRole("textbox", { name: "List name" }),
      "Later{Enter}Someday{Enter}",
    );
    await act(async () => first.open());

    await waitFor(() =>
      expect(laneNames()).toEqual(["To do", "Doing", "Done", "Later", "Someday"]),
    );
  });

  it("gives a refused title back, if the field is still empty", async () => {
    serve({
      "POST /lists/3/cards": {
        status: 422,
        body: { detail: [{ loc: ["body", "title"], msg: "Too long" }] },
      },
    });
    const user = await openBoard();

    await user.click(lane("Done").getByRole("button", { name: "+ Add a card" }));
    await user.type(screen.getByRole("textbox", { name: "Card title" }), "Oops{Enter}");

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Card title" })).toHaveValue("Oops"),
    );
  });
});

describe("renaming", () => {
  it("renames a list in place with Enter", async () => {
    const { calls } = serve({
      "PATCH /lists/1": { status: 200, body: list(1, "Backlog") },
    });
    const user = await openBoard();

    await user.click(screen.getByRole("button", { name: "To do" }));
    const field = screen.getByRole("textbox", { name: "List name" });
    await user.clear(field);
    await user.type(field, "Backlog{Enter}");

    expect(screen.getByRole("region", { name: "Backlog" })).toBeInTheDocument();
    expect(bodiesOf(calls, "PATCH /lists/1")).toEqual([{ name: "Backlog" }]);
  });

  it("keeps the old name for an empty one, with no request", async () => {
    const { calls } = serve();
    const user = await openBoard();

    await user.click(screen.getByRole("button", { name: "To do" }));
    await user.clear(screen.getByRole("textbox", { name: "List name" }));
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "To do" })).toBeInTheDocument();
    expect(calls.map((call) => call.key)).not.toContain("PATCH /lists/1");
  });

  it("cancels with Escape", async () => {
    const { calls } = serve();
    const user = await openBoard();

    await user.click(screen.getByRole("button", { name: "To do" }));
    await user.type(
      screen.getByRole("textbox", { name: "List name" }),
      " changed{Escape}",
    );

    expect(screen.getByRole("button", { name: "To do" })).toBeInTheDocument();
    expect(calls.map((call) => call.key)).not.toContain("PATCH /lists/1");
  });

  it("renames the board", async () => {
    const { calls } = serve({
      "PATCH /boards/1": { status: 200, body: boardInfo({ name: "Big launch" }) },
    });
    const user = await openBoard();

    await user.click(screen.getByRole("button", { name: "Launch" }));
    const field = screen.getByRole("textbox", { name: "Board title" });
    await user.clear(field);
    await user.type(field, "Big launch{Enter}");

    expect(screen.getByRole("heading", { name: "Big launch" })).toBeInTheDocument();
    expect(bodiesOf(calls, "PATCH /boards/1")).toEqual([{ name: "Big launch" }]);
  });
});

describe("cards", () => {
  it("marks a card done and not done", async () => {
    const { calls } = serve({
      "PATCH /cards/100": {
        status: 200,
        body: card(100, 1, { title: "Brief", due_complete: true }),
      },
      "PATCH /cards/200": { status: 200, body: card(200, 2, { title: "Budget" }) },
    });
    const user = await openBoard();

    await user.click(
      within(lane("To do").getAllByRole("article")[0]!).getByRole("button", {
        name: "Mark done",
      }),
    );
    await user.click(
      within(lane("Doing").getByRole("article")).getByRole("button", {
        name: "Mark not done",
      }),
    );

    expect(
      within(lane("To do").getAllByRole("article")[0]!).getByRole("button", {
        name: "Mark not done",
      }),
    ).toBeInTheDocument();
    expect(bodiesOf(calls, "PATCH /cards/100")).toEqual([{ due_complete: true }]);
    expect(bodiesOf(calls, "PATCH /cards/200")).toEqual([{ due_complete: false }]);
  });

  it("archives a done card straight from the board, without asking", async () => {
    const { calls } = serve({
      "POST /cards/200/archive": { status: 200, body: card(200, 2) },
    });
    const user = await openBoard();

    expect(
      lane("To do").queryByRole("button", { name: "Archive this card" }),
    ).not.toBeInTheDocument();
    await user.click(lane("Doing").getByRole("button", { name: "Archive this card" }));

    expect(titles("Doing")).toEqual([]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.map((call) => call.key)).toContain("POST /cards/200/archive");
  });
});

describe("the list menu", () => {
  async function openMenu(name: string) {
    const user = await openBoard();
    await user.click(screen.getByRole("button", { name: `List actions for ${name}` }));
    return user;
  }

  it("moves a list to a position numbered from 1", async () => {
    const { calls } = serve({
      "PATCH /lists/3": { status: 200, body: list(3, "Done") },
    });
    const user = await openMenu("Done");

    await user.click(screen.getByRole("button", { name: "Move list…" }));
    const position = screen.getByRole("combobox", { name: "Position" });
    expect(
      within(position)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["1", "2", "3 (current)"]);
    await user.selectOptions(position, "0");
    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(laneNames()).toEqual(["Done", "To do", "Doing"]);
    expect(bodiesOf(calls, "PATCH /lists/3")).toEqual([{ position: 0 }]);
  });

  it("offers sorting only when the list has cards", async () => {
    serve();
    const user = await openMenu("Done");

    expect(
      screen.queryByRole("button", { name: "Sort cards…" }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "List actions for To do" }));
    expect(screen.getByRole("button", { name: "Sort cards…" })).toBeInTheDocument();
  });

  it("sorts once, in the order the API returns", async () => {
    const { calls } = serve({
      "POST /lists/1/sort": {
        status: 200,
        body: [card(101, 1, { title: "Venue" }), card(100, 1, { title: "Brief" })],
      },
    });
    const user = await openMenu("To do");

    await user.click(screen.getByRole("button", { name: "Sort cards…" }));
    await user.click(
      screen.getByRole("button", { name: "Date created, newest first" }),
    );

    expect(titles("To do")).toEqual(["Venue", "Brief"]);
    expect(bodiesOf(calls, "POST /lists/1/sort")).toEqual([{ by: "created_desc" }]);
  });

  it("archives a list after a confirmation", async () => {
    const { calls } = serve({
      "POST /lists/1/archive": { status: 200, body: list(1, "To do") },
    });
    const user = await openMenu("To do");

    await user.click(screen.getByRole("button", { name: "Archive this list…" }));
    const confirm = screen.getByRole("dialog", { name: "Archive “To do”?" });
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(laneNames()).toContain("To do");

    await user.click(screen.getByRole("button", { name: "List actions for To do" }));
    await user.click(screen.getByRole("button", { name: "Archive this list…" }));
    await user.click(screen.getByRole("button", { name: "Archive list" }));

    expect(laneNames()).toEqual(["Doing", "Done"]);
    expect(calls.filter((call) => call.key === "POST /lists/1/archive")).toHaveLength(
      1,
    );
  });

  it("opens the add-card form", async () => {
    serve();
    const user = await openMenu("Doing");

    await user.click(screen.getByRole("button", { name: "Add a card" }));

    expect(
      lane("Doing").getByRole("textbox", { name: "Card title" }),
    ).toBeInTheDocument();
  });
});

describe("dragging", () => {
  it("drags a card to the end of another list", async () => {
    const { calls } = serve({
      "PATCH /cards/100": { status: 200, body: card(100, 3) },
    });
    await openBoard();
    const brief = lane("To do").getAllByRole("article")[0]!;
    const target = screen
      .getByRole("region", { name: "Done" })
      .querySelector(".cards")!;

    fireEvent.dragStart(brief, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer, clientY: 500 });
    fireEvent.drop(target, { dataTransfer, clientY: 500 });

    expect(titles("To do")).toEqual(["Venue"]);
    expect(titles("Done")).toEqual(["Brief"]);
    expect(bodiesOf(calls, "PATCH /cards/100")).toEqual([{ list_id: 3, position: 0 }]);
  });

  it("takes a card dropped anywhere on an empty list, such as its add button", async () => {
    const { calls } = serve({
      "PATCH /cards/100": { status: 200, body: card(100, 3) },
    });
    await openBoard();
    const brief = lane("To do").getAllByRole("article")[0]!;
    const addButton = lane("Done").getByRole("button", { name: "+ Add a card" });

    fireEvent.dragStart(brief, { dataTransfer });
    fireEvent.dragOver(addButton, { dataTransfer, clientY: 40 });
    fireEvent.drop(addButton, { dataTransfer, clientY: 40 });

    expect(titles("Done")).toEqual(["Brief"]);
    expect(bodiesOf(calls, "PATCH /cards/100")).toEqual([{ list_id: 3, position: 0 }]);
  });

  it("drags a card to the top of its own list", async () => {
    const { calls } = serve({
      "PATCH /cards/101": { status: 200, body: card(101, 1) },
    });
    await openBoard();
    const venue = lane("To do").getAllByRole("article")[1]!;
    const target = screen
      .getByRole("region", { name: "To do" })
      .querySelector(".cards")!;

    fireEvent.dragStart(venue, { dataTransfer });
    fireEvent.drop(target, { dataTransfer, clientY: -10 });

    expect(titles("To do")).toEqual(["Venue", "Brief"]);
    expect(bodiesOf(calls, "PATCH /cards/101")).toEqual([{ list_id: 1, position: 0 }]);
  });

  it("sends nothing when a card is dropped where it was", async () => {
    const { calls } = serve();
    await openBoard();
    const venue = lane("To do").getAllByRole("article")[1]!;
    const target = screen
      .getByRole("region", { name: "To do" })
      .querySelector(".cards")!;

    fireEvent.dragStart(venue, { dataTransfer });
    fireEvent.drop(target, { dataTransfer, clientY: 500 });

    expect(calls.map((call) => call.key)).not.toContain("PATCH /cards/101");
  });

  it("drags a list by its header", async () => {
    const { calls } = serve({
      "PATCH /lists/2": { status: 200, body: list(2, "Doing") },
    });
    await openBoard();
    const header = screen
      .getByRole("region", { name: "Doing" })
      .querySelector(".list-head")!;
    const lanesBox = document.querySelector(".lanes")!;

    fireEvent.dragStart(header, { dataTransfer });
    fireEvent.dragOver(lanesBox, { dataTransfer, clientX: -10 });
    fireEvent.drop(lanesBox, { dataTransfer, clientX: -10 });

    expect(laneNames()).toEqual(["Doing", "To do", "Done"]);
    expect(bodiesOf(calls, "PATCH /lists/2")).toEqual([{ position: 0 }]);
  });
});

describe("when the API refuses", () => {
  it("says why and reloads the board as the API has it", async () => {
    const { calls } = serve({
      "PATCH /lists/3": {
        status: 422,
        body: { detail: [{ loc: ["path", "board_id"], msg: "Board is closed" }] },
      },
    });
    const user = await openBoard();
    await user.click(screen.getByRole("button", { name: "List actions for Done" }));
    await user.click(screen.getByRole("button", { name: "Move list…" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Position" }), "0");

    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't move the list: Board is closed",
    );
    await waitFor(() => expect(laneNames()).toEqual(["To do", "Doing", "Done"]));
    expect(calls.filter((call) => call.key === "GET /boards/1/snapshot")).toHaveLength(
      2,
    );
  });

  it("applies the echo of your own change without doubling it", async () => {
    serve({
      "PATCH /cards/100": { status: 200, body: card(100, 3, { title: "Brief" }) },
    });
    await openBoard();
    const brief = lane("To do").getAllByRole("article")[0]!;
    const target = screen
      .getByRole("region", { name: "Done" })
      .querySelector(".cards")!;
    fireEvent.dragStart(brief, { dataTransfer });
    fireEvent.drop(target, { dataTransfer, clientY: 500 });

    act(() =>
      FakeWebSocket.latest().receive({
        type: "card.updated",
        board_id: 1,
        actor_id: 1,
        data: {
          card: card(100, 3, { title: "Brief" }),
          lists: [
            { list_id: 1, card_ids: [101] },
            { list_id: 3, card_ids: [100] },
          ],
        },
      }),
    );

    expect(titles("To do")).toEqual(["Venue"]);
    expect(titles("Done")).toEqual(["Brief"]);
  });
});
