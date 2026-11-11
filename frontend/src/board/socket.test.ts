import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeWebSocket, type FakeWebSocket } from "../test/fakeSocket";
import { BoardSocket, socketUrl, type BoardSocketOptions } from "./socket";

let Fake: typeof FakeWebSocket;

function start(overrides: Partial<BoardSocketOptions> = {}) {
  const options = {
    boardId: 7,
    token: "t1",
    onReady: vi.fn(),
    onEvent: vi.fn(),
    onGone: vi.fn(),
    onUnauthorized: vi.fn(),
    onStatus: vi.fn(),
    ...overrides,
  };
  const socket = new BoardSocket(options);
  socket.start();
  return { socket, options };
}

beforeEach(() => {
  vi.useFakeTimers();
  Fake = installFakeWebSocket();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BoardSocket", () => {
  it("connects through the API base and sends the token first", () => {
    start();
    const ws = Fake.latest();

    ws.open();

    expect(ws.url).toBe(socketUrl(7));
    expect(ws.url).toMatch(/^ws:\/\/.+\/api\/boards\/7\/ws$/);
    expect(ws.sent).toEqual([{ type: "auth", token: "t1" }]);
  });

  it("calls onReady on ready and resync, and passes events on", () => {
    const { options } = start();
    const ws = Fake.latest();
    ws.open();

    ws.receive({ type: "ready" });
    ws.receive({ type: "card.updated", board_id: 7, actor_id: 2, data: {} });
    ws.receive({ type: "pong" });
    ws.receive({ type: "resync" });

    expect(options.onReady).toHaveBeenCalledTimes(2);
    expect(options.onEvent).toHaveBeenCalledOnce();
    expect(vi.mocked(options.onEvent).mock.calls[0]?.[0].type).toBe("card.updated");
    expect(options.onStatus).toHaveBeenLastCalledWith("live");
  });

  it("pings while connected", () => {
    start();
    const ws = Fake.latest();
    ws.open();
    ws.receive({ type: "ready" });

    vi.advanceTimersByTime(25_000);

    expect(ws.sent.at(-1)).toEqual({ type: "ping" });
  });

  it("reconnects after a drop, waiting longer each time, and reloads once back", () => {
    const { options } = start();
    Fake.latest().open();
    Fake.latest().receive({ type: "ready" });

    Fake.latest().drop(1006);
    expect(options.onStatus).toHaveBeenLastCalledWith("offline");
    vi.advanceTimersByTime(499);
    expect(Fake.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(Fake.instances).toHaveLength(2);

    Fake.latest().drop(1006);
    vi.advanceTimersByTime(999);
    expect(Fake.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(Fake.instances).toHaveLength(3);

    Fake.latest().open();
    Fake.latest().receive({ type: "ready" });
    expect(options.onReady).toHaveBeenCalledTimes(2);
  });

  it("stops and reports a board that's gone (4404)", () => {
    const { options } = start();
    Fake.latest().open();

    Fake.latest().drop(4404);
    vi.advanceTimersByTime(60_000);

    expect(options.onGone).toHaveBeenCalledOnce();
    expect(Fake.instances).toHaveLength(1);
  });

  it("reports a bad token (4401) without reconnecting", () => {
    const { options } = start();
    Fake.latest().open();

    Fake.latest().drop(4401);
    vi.advanceTimersByTime(60_000);

    expect(options.onUnauthorized).toHaveBeenCalledOnce();
    expect(Fake.instances).toHaveLength(1);
  });

  it("closes for good on stop", () => {
    const { socket } = start();
    const ws = Fake.latest();
    ws.open();

    socket.stop();
    ws.drop(1000);
    vi.advanceTimersByTime(60_000);

    expect(ws.closedWith).toBe(1000);
    expect(Fake.instances).toHaveLength(1);
  });
});
