import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "../test/fakeApi";
import { ApiError, apiFetch, setUnauthorizedHandler } from "./client";

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected the request to fail");
}

afterEach(() => setUnauthorizedHandler(null));

describe("apiFetch", () => {
  it("sends JSON with the token and returns the body", async () => {
    const { calls } = fakeApi({ "POST /boards": { status: 201, body: { id: 3 } } });

    const result = await apiFetch("/boards", {
      method: "POST",
      json: { name: "X" },
      token: "abc",
    });

    expect(result).toEqual({ id: 3 });
    expect(calls[0]?.body).toBe('{"name":"X"}');
    expect(calls[0]?.headers.get("Content-Type")).toBe("application/json");
    expect(calls[0]?.headers.get("Authorization")).toBe("Bearer abc");
  });

  it("sends a form body", async () => {
    const { calls } = fakeApi({ "POST /auth/token": { status: 200, body: {} } });

    await apiFetch("/auth/token", {
      method: "POST",
      form: { username: "a@b.co", password: "p w" },
    });

    expect(calls[0]?.body).toBe("username=a%40b.co&password=p+w");
    expect(calls[0]?.headers.get("Authorization")).toBeNull();
  });

  it("returns nothing for 204", async () => {
    fakeApi({ "DELETE /lists/1": { status: 204 } });

    await expect(apiFetch("/lists/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("turns a 422 list into field errors", async () => {
    fakeApi({
      "POST /auth/register": {
        status: 422,
        body: {
          detail: [
            { loc: ["body", "email"], msg: "value is not a valid email address" },
            {
              loc: ["body", "password"],
              msg: "String should have at least 8 characters",
            },
            { loc: ["body"], msg: "Give at least one field to change" },
          ],
        },
      },
    });

    const error = await caught(
      apiFetch("/auth/register", { method: "POST", json: {} }),
    );

    expect(error.status).toBe(422);
    expect(error.fieldErrors).toEqual({
      email: "value is not a valid email address",
      password: "String should have at least 8 characters",
    });
    expect(error.message).toBe("Give at least one field to change");
  });

  it("uses a string detail as the message", async () => {
    fakeApi({
      "POST /auth/register": {
        status: 409,
        body: { detail: "Email already registered" },
      },
    });

    const error = await caught(
      apiFetch("/auth/register", { method: "POST", json: {} }),
    );

    expect(error.status).toBe(409);
    expect(error.message).toBe("Email already registered");
    expect(error.fieldErrors).toEqual({});
  });

  it("calls the unauthorized handler on a 401 with a token", async () => {
    fakeApi({
      "GET /users/me": { status: 401, body: { detail: "Not authenticated" } },
    });
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await caught(apiFetch("/users/me", { token: "old" }));

    expect(handler).toHaveBeenCalledOnce();
  });

  it("doesn't call it for a failed login (no token yet)", async () => {
    fakeApi({
      "POST /auth/token": {
        status: 401,
        body: { detail: "Incorrect email or password" },
      },
    });
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    const error = await caught(apiFetch("/auth/token", { method: "POST", form: {} }));

    expect(error.message).toBe("Incorrect email or password");
    expect(handler).not.toHaveBeenCalled();
  });

  it("reports a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await caught(apiFetch("/users/me"));

    expect(error.status).toBe(0);
    expect(error.message).toMatch(/can't reach the server/i);
  });
});
