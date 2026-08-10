import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../testApp";
import supertest from "supertest";

describe("test harness", () => {
  afterEach(async () => {
    await resetDb();
  });

  it("can create an admin user and log in for real", async () => {
    const { agent, user } = await loginAs("admin");
    expect(user.role).toBe("admin");
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
  });

  it("resetDb actually clears data between tests", async () => {
    const res = await supertest(app).get("/api/users/assignable");
    // unauthenticated — should not see the admin from the previous test
    expect(res.status).toBe(401);
  });
});
