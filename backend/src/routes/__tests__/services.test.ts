import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { resetDb, loginAs } from "../../test-support/testApp";

describe("services routes", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin creates a service and any authenticated role can list it", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const createRes = await adminAgent.post("/api/services").send({ name: `GST Filing ${Date.now()}` });
      expect(createRes.status).toBe(201);

      const { agent: salesAgent } = await loginAs("sales");
      const listRes = await salesAgent.get("/api/services");
      expect(listRes.status).toBe(200);
      expect(listRes.body.some((s: { id: string }) => s.id === createRes.body.id)).toBe(true);
    });
  });

  describe("validation / edge case", () => {
    it("rejects a duplicate service name", async () => {
      const { agent } = await loginAs("admin");
      const name = `Payroll ${Date.now()}`;
      await agent.post("/api/services").send({ name });
      const res = await agent.post("/api/services").send({ name });
      expect(res.status).toBe(500);
    });

    it("rejects an empty name", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.post("/api/services").send({ name: "" });
      expect(res.status).toBe(400);
    });
  });

  describe("authorization / not-found", () => {
    it("blocks a non-admin from creating a service", async () => {
      const { agent } = await loginAs("ops");
      const res = await agent.post("/api/services").send({ name: "Ops Can't Create" });
      expect(res.status).toBe(403);
    });
  });
});
