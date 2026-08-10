import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("leads routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("creates a lead as sales and converts it to a client on Won", async () => {
      const { agent } = await loginAs("sales");
      const createRes = await agent.post("/api/leads").send({
        company: "Acme Corp", contact_person: "Jane Doe", email: "jane@acme.test",
        industry: "IT/Software", source: "Referral",
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.lead.status).toBe("New");
      const leadId = createRes.body.lead.id;

      const wonRes = await agent.patch(`/api/leads/${leadId}`).send({ status: "Won" });
      expect(wonRes.status).toBe(200);

      const convertRes = await agent.post(`/api/leads/${leadId}/convert`);
      expect(convertRes.status).toBe(201);
      expect(convertRes.body.client.id).toBeTruthy();
    });
  });

  describe("validation / edge case", () => {
    it("requires lost_reason when setting status to Lost", async () => {
      const { agent } = await loginAs("sales");
      const createRes = await agent.post("/api/leads").send({
        company: "Beta LLC", contact_person: "Bob", email: "bob@beta.test",
        industry: "E-commerce", source: "Website",
      });
      const res = await agent.patch(`/api/leads/${createRes.body.lead.id}`).send({ status: "Lost" });
      expect(res.status).toBe(400);
      expect(res.body.details.lost_reason).toBeTruthy();
    });

    it("converts a lead regardless of status if it's not already converted", async () => {
      const { agent } = await loginAs("sales");
      const createRes = await agent.post("/api/leads").send({
        company: "Gamma Inc", contact_person: "Ann", email: "ann@gamma.test",
        industry: "E-commerce", source: "Website",
      });
      const res = await agent.post(`/api/leads/${createRes.body.lead.id}/convert`);
      expect(res.status).toBe(201);
      expect(res.body.client.id).toBeTruthy();
    });
  });

  describe("authorization / not-found", () => {
    it("blocks finance and ops from leads entirely", async () => {
      const { agent: financeAgent } = await loginAs("finance");
      expect((await financeAgent.get("/api/leads")).status).toBe(403);
      const { agent: opsAgent } = await loginAs("ops");
      expect((await opsAgent.get("/api/leads")).status).toBe(403);
    });

    it("blocks a sales rep from editing another sales rep's lead", async () => {
      const { agent: repA } = await loginAs("sales", { email: "repA@test.local" });
      const createRes = await repA.post("/api/leads").send({
        company: "Delta Co", contact_person: "Dana", email: "dana@delta.test",
        industry: "E-commerce", source: "Website",
      });
      const { agent: repB } = await loginAs("sales", { email: "repB@test.local" });
      const res = await repB.patch(`/api/leads/${createRes.body.lead.id}`).send({ company: "Hijacked" });
      expect(res.status).toBe(403);
    });
  });
});
