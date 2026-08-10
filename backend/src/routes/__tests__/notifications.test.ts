import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { resetDb, loginAs } from "../../test-support/testApp";
import { pool } from "../../db/pool";

async function seedNotification(userId: string): Promise<string> {
  const res = await pool.query(
    `insert into notifications (user_id, type, title, body) values ($1, 'test', 'Test notification', 'body') returning id`,
    [userId]
  );
  return res.rows[0].id;
}

describe("notifications routes", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("marks a notification read and it no longer counts as unread", async () => {
      const { agent, user } = await loginAs("admin");
      const notifId = await seedNotification(user.id);

      const beforeRes = await agent.get("/api/notifications/unread-count");
      expect(beforeRes.body.count).toBe(1);

      const readRes = await agent.patch(`/api/notifications/${notifId}/read`);
      expect(readRes.status).toBe(200);

      const afterRes = await agent.get("/api/notifications/unread-count");
      expect(afterRes.body.count).toBe(0);
    });
  });

  describe("validation / edge case", () => {
    it("marking the same notification read twice returns not_found the second time", async () => {
      const { agent, user } = await loginAs("admin");
      const notifId = await seedNotification(user.id);
      expect((await agent.patch(`/api/notifications/${notifId}/read`)).status).toBe(200);
      const secondRes = await agent.patch(`/api/notifications/${notifId}/read`);
      expect(secondRes.status).toBe(404);
    });
  });

  describe("authorization / not-found", () => {
    it("returns 404 (not 403) trying to read another user's notification", async () => {
      const { user: owner } = await loginAs("admin", { email: "owner@test.local" });
      const notifId = await seedNotification(owner.id);
      const { agent: intruder } = await loginAs("sales", { email: "intruder@test.local" });
      const res = await intruder.patch(`/api/notifications/${notifId}/read`);
      expect(res.status).toBe(404);
    });
  });
});
