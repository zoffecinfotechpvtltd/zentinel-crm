import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { resetDb, loginAs } from "../../test-support/testApp";

describe("settings routes", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin regenerates the lead webhook secret and it shows up in /integrations", async () => {
      const { agent } = await loginAs("admin");
      const regenRes = await agent.post("/api/settings/integrations/lead-webhook-secret/regenerate");
      expect(regenRes.status).toBe(200);
      expect(regenRes.body.lead_webhook_secret).toBeTruthy();

      const getRes = await agent.get("/api/settings/integrations");
      expect(getRes.status).toBe(200);
      expect(getRes.body.lead_webhook_secret).toBe(regenRes.body.lead_webhook_secret);
    });

    it("admin saves SMTP config and the password is stripped from every response", async () => {
      const { agent } = await loginAs("admin");
      const putRes = await agent.put("/api/settings/smtp").send({ host: "smtp.test", port: 587, user: "u", pass: "secret", from: "noreply@test.local" });
      expect(putRes.status).toBe(200);
      expect(putRes.body.pass).toBeUndefined();

      const getRes = await agent.get("/api/settings/smtp");
      expect(getRes.status).toBe(200);
      expect(getRes.body.pass).toBeUndefined();
      expect(getRes.body.host).toBe("smtp.test");
    });
  });

  describe("validation / edge case", () => {
    it("GET /smtp returns null when nothing has been configured yet", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.get("/api/settings/smtp");
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it("smtp/test fails with smtp_not_configured before any SMTP config is saved", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.post("/api/settings/smtp/test").send({ to: "someone@test.local" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("smtp_not_configured");
    });
  });

  describe("authorization / not-found", () => {
    it("blocks every settings endpoint for non-admins", async () => {
      const { agent } = await loginAs("finance");
      expect((await agent.get("/api/settings/integrations")).status).toBe(403);
      expect((await agent.get("/api/settings/smtp")).status).toBe(403);
    });
  });
});
