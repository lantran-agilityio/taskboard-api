import { vi } from "vitest";

// A stand-in for the API behind fetch: tests set what each "METHOD /path"
// answers and read back the requests that were made.

export interface FakeResponse {
  status: number;
  body?: unknown;
}

type Handler = (request: {
  body: string | undefined;
  headers: Headers;
}) => FakeResponse;

export function fakeApi(routes: Record<string, FakeResponse | Handler>) {
  const calls: { key: string; body: string | undefined; headers: Headers }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input).replace(/^\/api/, "");
    const key = `${init.method ?? "GET"} ${path}`;
    const headers = new Headers(init.headers);
    const body = init.body as string | undefined;
    calls.push({ key, body, headers });
    const route = routes[key];
    if (!route) throw new Error(`fakeApi: no answer for ${key}`);
    const { status, body: responseBody } =
      typeof route === "function" ? route({ body, headers }) : route;
    return new Response(status === 204 ? null : JSON.stringify(responseBody ?? null), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export const ALICE = {
  id: 1,
  email: "alice@example.com",
  created_at: "2026-11-11T00:00:00Z",
};

/** /users/me answers 200 for the given token and 401 for any other. */
export function meFor(token: string) {
  return ({ headers }: { headers: Headers }): FakeResponse =>
    headers.get("Authorization") === `Bearer ${token}`
      ? { status: 200, body: ALICE }
      : { status: 401, body: { detail: "Could not validate credentials" } };
}
