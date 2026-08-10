import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("reports routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("sales can access lead-conversion (the one report open to sales)", async () => {
      const { agent } = await loginAs("sales");
      const res = await agent.get("/api/reports/lead-conversion");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("funnel");
    });

    it("admin sets the fiscal-year revenue target and it's reflected in /revenue", async () => {
      const { agent } = await loginAs("admin");
      const putRes = await agent.put("/api/reports/revenue/target").send({ amount: 5000000, fiscal_year: "2026-27" });
      expect(putRes.status).toBe(200);
      const getRes = await agent.get("/api/reports/revenue");
      expect(getRes.status).toBe(200);
      expect(getRes.body.fy_target.amount).toBe(5000000);
    });
  });

  describe("validation / edge case", () => {
    it("rejects a non-positive target amount", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.put("/api/reports/revenue/target").send({ amount: -100, fiscal_year: "2026-27" });
      expect(res.status).toBe(400);
    });
  });

  describe("authorization / not-found", () => {
    it("blocks sales from /revenue but allows ops (full report access despite no write access elsewhere)", async () => {
      const { agent: salesAgent } = await loginAs("sales");
      expect((await salesAgent.get("/api/reports/revenue")).status).toBe(403);
      const { agent: opsAgent } = await loginAs("ops");
      expect((await opsAgent.get("/api/reports/revenue")).status).toBe(200);
    });

    it("blocks non-admin from setting the revenue target", async () => {
      const { agent } = await loginAs("finance");
      const res = await agent.put("/api/reports/revenue/target").send({ amount: 100, fiscal_year: "2026-27" });
      expect(res.status).toBe(403);
    });
  });
});
