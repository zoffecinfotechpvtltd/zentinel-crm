import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { resetDb, loginAs } from "../../test-support/testApp";

describe("users routes", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin creates a user and it appears in the list", async () => {
      const { agent } = await loginAs("admin");
      const email = `new-${Date.now()}@test.local`;
      const createRes = await agent.post("/api/users").send({ email, password: "NewPass123", name: "New Person", role: "ops" });
      expect(createRes.status).toBe(201);

      const listRes = await agent.get("/api/users");
      expect(listRes.status).toBe(200);
      expect(listRes.body.find((u: { email: string }) => u.email === email)).toBeTruthy();
    });

    it("any authenticated role can list assignable users without seeing email", async () => {
      await loginAs("admin", { email: "assignable-target@test.local" });
      const { agent } = await loginAs("sales");
      const res = await agent.get("/api/users/assignable");
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].email).toBeUndefined();
    });
  });

  describe("validation / edge case", () => {
    it("rejects creating a user with an email that's already in use", async () => {
      const { agent, user } = await loginAs("admin");
      const res = await agent.post("/api/users").send({ email: user.email, password: "NewPass123", name: "Dup", role: "sales" });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("email_already_exists");
    });

    it("deactivating a user immediately revokes their existing session", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const { agent: opsAgent, user: opsUser } = await loginAs("ops");

      // ops is logged in and working fine before deactivation.
      expect((await opsAgent.get("/api/auth/me")).status).toBe(200);

      const patchRes = await adminAgent.patch(`/api/users/${opsUser.id}`).send({ is_active: false });
      expect(patchRes.status).toBe(200);

      const afterRes = await opsAgent.get("/api/auth/me");
      expect(afterRes.status).toBe(401);
    });
  });

  describe("authorization / not-found", () => {
    it("rejects a non-admin from listing users", async () => {
      const { agent } = await loginAs("finance");
      const res = await agent.get("/api/users");
      expect(res.status).toBe(403);
    });

    it("returns 404 patching a nonexistent user", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.patch("/api/users/00000000-0000-0000-0000-000000000000").send({ name: "Ghost" });
      expect(res.status).toBe(404);
    });
  });
});
