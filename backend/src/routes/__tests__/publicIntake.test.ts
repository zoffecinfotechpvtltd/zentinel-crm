import { describe, it, expect, beforeAll, afterEach } from "vitest";
import supertest from "supertest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

async function configureWebhookSecret(): Promise<string> {
  const { agent } = await loginAs("admin", { email: "webhook-admin@test.local" });
  const res = await agent.post("/api/settings/integrations/lead-webhook-secret/regenerate");
  return res.body.lead_webhook_secret as string;
}

describe("public intake routes", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("creates a lead with the correct secret, sourced as Website", async () => {
      const secret = await configureWebhookSecret();
      const res = await supertest(app).post("/api/public/leads").send({
        secret, company: "Inbound Co", contact_person: "Ivy", email: "ivy@inbound.test",
      });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("validation / edge case", () => {
    it("rejects a malformed body (missing company)", async () => {
      const secret = await configureWebhookSecret();
      const res = await supertest(app).post("/api/public/leads").send({ secret, contact_person: "No Company", email: "x@test.local" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_input");
    });
  });

  describe("authorization / not-found", () => {
    it("rejects a wrong secret with invalid_secret", async () => {
      await configureWebhookSecret();
      const res = await supertest(app).post("/api/public/leads").send({
        secret: "totally-wrong", company: "Blocked Co", contact_person: "Bo", email: "bo@blocked.test",
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("invalid_secret");
    });

    it("rejects any secret when none has been configured yet", async () => {
      const res = await supertest(app).post("/api/public/leads").send({
        secret: "anything", company: "Too Early Co", contact_person: "Te", email: "te@early.test",
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("invalid_secret");
    });
  });
});
