// One board's live updates over the API's WebSocket (WS /boards/{id}/ws).
//
// Protocol: send {"type": "auth", "token"} first; the server answers "ready",
// then sends events. "resync" means events may have been lost (the server's
// database listener reconnected), and so does any reconnect of ours: both
// call onReady, and the page reloads the board. Close codes are 4000 + HTTP:
// 4401 for a bad token, 4404 for a board that's gone or access lost.

import type { BoardEvent } from "./model";

export type SocketStatus = "connecting" | "live" | "offline";

export interface BoardSocketOptions {
  boardId: number;
  token: string;
  /** After "ready" and "resync": load (or reload) the board. */
  onReady: () => void;
  onEvent: (event: BoardEvent) => void;
  /** 4404: the board was deleted, or you were removed from it. */
  onGone: () => void;
  /** 4401: the token is no good any more. */
  onUnauthorized: () => void;
  onStatus?: (status: SocketStatus) => void;
}

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_NOT_FOUND = 4404;
const PING_MS = 25_000;
const FIRST_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;

export function socketUrl(boardId: number): string {
  const base: string = import.meta.env.VITE_API_URL ?? "/api";
  const url = new URL(`${base}/boards/${boardId}/ws`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export class BoardSocket {
  private socket: WebSocket | null = null;
  private delay = FIRST_DELAY_MS;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private readonly options: BoardSocketOptions;

  constructor(options: BoardSocketOptions) {
    this.options = options;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  /** Closes for good: no reconnect. */
  stop(): void {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.stopPing();
    this.socket?.close(1000);
    this.socket = null;
  }

  private connect(): void {
    this.options.onStatus?.("connecting");
    const socket = new WebSocket(socketUrl(this.options.boardId));
    this.socket = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "auth", token: this.options.token }));
    };
    socket.onmessage = (message: MessageEvent<string>) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(message.data);
      } catch {
        return;
      }
      const event = parsed as BoardEvent;
      switch (event.type) {
        case "ready":
          this.delay = FIRST_DELAY_MS;
          this.startPing();
          this.options.onStatus?.("live");
          this.options.onReady();
          break;
        case "resync":
          this.options.onReady();
          break;
        case "pong":
          break;
        default:
          this.options.onEvent(event);
      }
    };
    socket.onclose = (close: CloseEvent) => {
      this.stopPing();
      if (this.socket !== socket || this.stopped) return;
      this.socket = null;
      if (close.code === CLOSE_NOT_FOUND) {
        this.stopped = true;
        this.options.onGone();
      } else if (close.code === CLOSE_UNAUTHORIZED) {
        this.stopped = true;
        this.options.onUnauthorized();
      } else {
        // Dropped (network, server restart): try again, waiting longer each
        // time, and reload once back, since events were missed meanwhile.
        this.options.onStatus?.("offline");
        this.retry = setTimeout(() => this.connect(), this.delay);
        this.delay = Math.min(this.delay * 2, MAX_DELAY_MS);
      }
    };
  }

  private startPing(): void {
    this.stopPing();
    // Keeps idle connections from being dropped by proxies along the way.
    this.ping = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_MS);
  }

  private stopPing(): void {
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
  }
}
