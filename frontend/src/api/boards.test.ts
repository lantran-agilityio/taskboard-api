import { describe, expect, it } from "vitest";

import { fakeApi } from "../test/fakeApi";
import {
  createBoard,
  deleteBoard,
  listBoards,
  reopenBoard,
  setStarred,
} from "./boards";

describe("board calls", () => {
  it("send the right method, path, body and token", async () => {
    const { calls } = fakeApi({
      "GET /boards": { status: 200, body: [] },
      "GET /boards?closed=true": { status: 200, body: [] },
      "POST /boards": { status: 201, body: { id: 4 } },
      "PUT /boards/4/star": { status: 204 },
      "DELETE /boards/4/star": { status: 204 },
      "POST /boards/4/reopen": { status: 200, body: { id: 4 } },
      "DELETE /boards/4": { status: 204 },
    });

    await listBoards("t");
    await listBoards("t", { closed: true });
    await createBoard("t", "Plans");
    await setStarred("t", 4, true);
    await setStarred("t", 4, false);
    await reopenBoard("t", 4);
    await deleteBoard("t", 4);

    expect(calls.map((call) => call.key)).toEqual([
      "GET /boards",
      "GET /boards?closed=true",
      "POST /boards",
      "PUT /boards/4/star",
      "DELETE /boards/4/star",
      "POST /boards/4/reopen",
      "DELETE /boards/4",
    ]);
    expect(calls[2]?.body).toBe('{"name":"Plans"}');
    expect(
      calls.every((call) => call.headers.get("Authorization") === "Bearer t"),
    ).toBe(true);
  });
});
