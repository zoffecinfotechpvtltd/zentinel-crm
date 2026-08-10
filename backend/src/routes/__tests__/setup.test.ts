import { describe, it, expect, afterEach } from "vitest";
import supertest from "supertest";
import { app, resetDb } from "../../test-support/testApp";

describe("setup routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("reports needsSetup, creates the first admin, and auto-logs them in", async () => {
      const client = supertest(app);
      const statusBefore = await client.get("/api/setup/status");
      expect(statusBefore.body.needsSetup).toBe(true);

      const createRes = await client.post("/api/setup/create-admin").send({
        name: "First Admin", email: "first-admin@test.local", password: "AdminPass123",
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.role).toBe("admin");

      const statusAfter = await client.get("/api/setup/status");
      expect(statusAfter.body.needsSetup).toBe(false);

      const cookie = createRes.headers["set-cookie"];
      const meRes = await client.get("/api/auth/me").set("Cookie", cookie);
      expect(meRes.status).toBe(200);
      expect(meRes.body.email).toBe("first-admin@test.local");
    });
  });

  describe("validation / edge case", () => {
    it("rejects a password with no digit", async () => {
      const res = await supertest(app).post("/api/setup/create-admin").send({
        name: "Weak Pw", email: "weak@test.local", password: "onlyletters",
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_input");
    });
  });

  describe("authorization / not-found", () => {
    it("rejects creating a second admin once one already exists", async () => {
      const client = supertest(app);
      const first = await client.post("/api/setup/create-admin").send({
        name: "Admin One", email: "admin-one@test.local", password: "AdminPass123",
      });
      expect(first.status).toBe(201);

      const second = await client.post("/api/setup/create-admin").send({
        name: "Admin Two", email: "admin-two@test.local", password: "AdminPass123",
      });
      expect(second.status).toBe(409);
      expect(second.body.error).toBe("already_set_up");
    });
  });
});
