import { describe, it, expect, beforeAll, afterEach } from "vitest";
import supertest from "supertest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("auth routes", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("logs in with correct credentials and can fetch /me with the session cookie", async () => {
      const { agent, user } = await loginAs("admin");
      const res = await agent.get("/api/auth/me");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: user.id, email: user.email, role: "admin" });
    });
  });

  describe("validation / edge case", () => {
    it("locks the account after 8 failed attempts within the lockout window", async () => {
      const { user } = await loginAs("admin");
      const client = supertest(app);
      for (let i = 0; i < 7; i++) {
        const res = await client.post("/api/auth/login").send({ email: user.email, password: "wrong-password" });
        expect(res.status).toBe(401);
        expect(res.body.error).toBe("invalid_credentials");
      }
      const eighth = await client.post("/api/auth/login").send({ email: user.email, password: "wrong-password" });
      expect(eighth.status).toBe(423);
      expect(eighth.body.error).toBe("account_locked");

      // Even the CORRECT password is now rejected while locked.
      const correctButLocked = await client.post("/api/auth/login").send({ email: user.email, password: "TestPass123" });
      expect(correctButLocked.status).toBe(423);
    });

    it("rejects a malformed login body with a validation error", async () => {
      const res = await supertest(app).post("/api/auth/login").send({ email: "not-an-email" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_input");
    });
  });

  describe("authorization / not-found", () => {
    it("rejects /me without a session", async () => {
      const res = await supertest(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });

    it("rejects change-password with the wrong current password", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.post("/api/auth/change-password").send({ currentPassword: "wrong", newPassword: "NewPass123" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("invalid_credentials");
    });
  });
});
