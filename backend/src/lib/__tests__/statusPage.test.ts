import { describe, it, expect } from "vitest";
import { classifyHealthResponse } from "../statusPage";

describe("classifyHealthResponse", () => {
  it("classifies a healthy response (res.ok and body.ok) as online", () => {
    expect(classifyHealthResponse(true, { ok: true, db: "connected" })).toBe("online");
  });

  it("classifies a response with a down DB (body.ok false) as degraded, not offline", () => {
    // This is the scenario the bug report was about: the backend answered
    // (HTTP 503, but it answered) with db: "unreachable" because the DB
    // query failed. That must classify as "degraded", never "offline" —
    // "offline" is reserved for the fetch never getting a response at all.
    expect(classifyHealthResponse(false, { ok: false, db: "unreachable" })).toBe("degraded");
  });
});
