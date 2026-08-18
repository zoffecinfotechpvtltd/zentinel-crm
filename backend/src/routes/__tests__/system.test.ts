import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { resetDb, loginAs } from "../../test-support/testApp";

describe("system routes", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin fetches server-info", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.get("/api/system/server-info");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("object_storage_configured");
    });
  });

  describe("validation / edge case", () => {
    it("rejects restore without the exact confirmation phrase", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent
        .post("/api/system/restore")
        .field("confirm", "yes please")
        .attach("file", Buffer.from(JSON.stringify({ version: 1, tables: [] })), "backup.json");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("confirmation_required");
    });
  });

  describe("authorization / not-found", () => {
    it("blocks non-admins from the audit log", async () => {
      const { agent } = await loginAs("ops");
      const res = await agent.get("/api/system/audit-log");
      expect(res.status).toBe(403);
    });
  });
});
