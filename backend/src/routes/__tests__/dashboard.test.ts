import { describe, it, expect, beforeAll, afterEach } from "vitest";
import supertest from "supertest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("dashboard routes", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("returns stats and upcoming_followups for admin", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.get("/api/dashboard");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("stats");
      expect(res.body).toHaveProperty("upcoming_followups");
    });
  });

  describe("activity feed", () => {
    it("paginates the company-wide feed for admin, and scopes it to a sales rep's own leads", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const leadRes = await adminAgent.post("/api/leads").send({
        company: "Activity Feed Co", contact_person: "A", email: "activityfeed@test.local",
      });
      await adminAgent.patch(`/api/leads/${leadRes.body.lead.id}`).send({ status: "Contacted" });

      const adminFeed = await adminAgent.get("/api/dashboard/activity");
      expect(adminFeed.status).toBe(200);
      expect(adminFeed.body.total).toBeGreaterThanOrEqual(2);
      expect(adminFeed.body.data[0]).toHaveProperty("actor_name");

      const { agent: salesAgent } = await loginAs("sales");
      const salesFeed = await salesAgent.get("/api/dashboard/activity");
      expect(salesFeed.status).toBe(200);
      // This sales rep has no leads assigned to them — the admin's activity
      // above must not leak into their feed.
      expect(salesFeed.body.total).toBe(0);
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
