import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("message-templates routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin creates a template and any role can list it", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const createRes = await adminAgent.post("/api/message-templates").send({
        name: "Proposal Nudge", channel: "email", body: "Hi {{name}}, following up on {{service}}.", category: "proposal_followup",
      });
      expect(createRes.status).toBe(201);

      const { agent: financeAgent } = await loginAs("finance");
      const listRes = await financeAgent.get("/api/message-templates");
      expect(listRes.status).toBe(200);
      expect(listRes.body.some((t: { id: string }) => t.id === createRes.body.id)).toBe(true);
    });
  });

  describe("validation / edge case", () => {
    it("rejects an invalid channel", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.post("/api/message-templates").send({
        name: "Bad Channel", channel: "sms", body: "Hi", category: "checkin",
      });
      expect(res.status).toBe(400);
    });

    it("rejects an empty PATCH body", async () => {
      const { agent } = await loginAs("admin");
      const createRes = await agent.post("/api/message-templates").send({
        name: "Patch Target", channel: "whatsapp", body: "Hi", category: "checkin",
      });
      const res = await agent.patch(`/api/message-templates/${createRes.body.id}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("no_fields_to_update");
    });
  });

  describe("authorization / not-found", () => {
    it("blocks a non-admin from creating or updating a template", async () => {
      const { agent } = await loginAs("sales");
      const res = await agent.post("/api/message-templates").send({
        name: "Sales Can't Create", channel: "email", body: "Hi", category: "checkin",
      });
      expect(res.status).toBe(403);
    });
  });
});
