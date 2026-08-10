import { describe, it, expect, afterEach } from "vitest";
import supertest from "supertest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("dashboard routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("returns stats, recent_activity, and upcoming_followups for admin", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.get("/api/dashboard");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("stats");
      expect(res.body).toHaveProperty("recent_activity");
      expect(res.body).toHaveProperty("upcoming_followups");
    });
  });

  describe("validation / edge case", () => {
    it("zeroes out client/revenue figures for the sales role", async () => {
      const { agent } = await loginAs("sales");
      const res = await agent.get("/api/dashboard");
      expect(res.status).toBe(200);
      expect(res.body.stats.active_clients).toBe(0);
      expect(res.body.stats.projects_active).toBe(0);
    });

    it("returns null (not 0) for revenue_change_pct when there's no prior-period baseline", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.get("/api/dashboard");
      expect(res.status).toBe(200);
      expect(res.body.stats.revenue_change_pct).toBeNull();
    });
  });

  describe("authorization / not-found", () => {
    it("requires authentication", async () => {
      const res = await supertest(app).get("/api/dashboard");
      expect(res.status).toBe(401);
    });
  });
});
