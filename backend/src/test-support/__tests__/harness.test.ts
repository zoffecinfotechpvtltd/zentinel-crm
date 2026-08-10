import { describe, it, expect, afterEach } from "vitest";
import { resetDb, loginAs } from "../testApp";
import supertest from "supertest";

describe("test harness", () => {
  afterEach(async () => {
    await resetDb();
  });

  // Shared across both tests below: test 2 reuses this exact agent (cookie
  // and all) to prove resetDb() truncated the session row it was relying
  // on — an anonymous request returning 401 would prove nothing (it always
  // does), so this has to be the *same previously-authenticated* agent.
  let previousAgent: ReturnType<typeof supertest.agent> | undefined;

  it("can create an admin user and log in for real", async () => {
    const { agent, user } = await loginAs("admin");
    expect(user.role).toBe("admin");
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
    previousAgent = agent;
  });

  it("resetDb actually clears data between tests", async () => {
    if (!previousAgent) throw new Error("previous test did not set previousAgent");
    // Same agent, same session cookie, that got a 200 from /api/auth/me a
    // moment ago in the previous test. If resetDb()'s TRUNCATE genuinely
    // wiped the sessions table, that cookie no longer maps to a live
    // session and this must now be 401 — not because the request is
    // anonymous, but because the session backing it is gone.
    const res = await previousAgent.get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
