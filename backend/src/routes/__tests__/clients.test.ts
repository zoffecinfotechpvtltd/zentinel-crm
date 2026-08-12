import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { resetDb, loginAs } from "../../test-support/testApp";

describe("clients routes", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin creates a client, then finance adds a contract making it Active", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const createRes = await adminAgent.post("/api/clients").send({ company: "Widgets Ltd" });
      expect(createRes.status).toBe(201);
      const clientId = createRes.body.id;

      const { agent: financeAgent } = await loginAs("finance");
      const contractRes = await financeAgent.post(`/api/clients/${clientId}/contracts`).send({ value: 50000, status: "active" });
      expect(contractRes.status).toBe(201);

      const getRes = await adminAgent.get(`/api/clients/${clientId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.status).toBe("Active");
    });
  });

  describe("contact deletion", () => {
    it("removes a contact from the list", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const createRes = await adminAgent.post("/api/clients").send({ company: "Deletable Contact Co" });
      const contactRes = await adminAgent.post(`/api/clients/${createRes.body.id}/contacts`).send({ name: "Temp Contact" });
      expect((await adminAgent.get(`/api/clients/${createRes.body.id}`)).body.contacts).toHaveLength(1);

      const delRes = await adminAgent.delete(`/api/clients/${createRes.body.id}/contacts/${contactRes.body.id}`);
      expect(delRes.status).toBe(200);
      expect((await adminAgent.get(`/api/clients/${createRes.body.id}`)).body.contacts).toHaveLength(0);
    });

    it("blocks sales from deleting a contact", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const createRes = await adminAgent.post("/api/clients").send({ company: "Contact Sales Blocked Co" });
      const contactRes = await adminAgent.post(`/api/clients/${createRes.body.id}/contacts`).send({ name: "Temp Contact" });

      const { agent: salesAgent } = await loginAs("sales");
      const res = await salesAgent.delete(`/api/clients/${createRes.body.id}/contacts/${contactRes.body.id}`);
      expect(res.status).toBe(403);
    });

    it("returns 404 for a nonexistent contact", async () => {
      const { agent } = await loginAs("admin");
      const createRes = await agent.post("/api/clients").send({ company: "No Such Contact Co" });
      const res = await agent.delete(`/api/clients/${createRes.body.id}/contacts/00000000-0000-0000-0000-000000000000`);
      expect(res.status).toBe(404);
    });
  });

  describe("contract deletion", () => {
    it("removes a contract, and the client falls back to Inactive when it was the only one keeping it Active", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const createRes = await adminAgent.post("/api/clients").send({ company: "Deletable Contract Co" });
      const clientId = createRes.body.id;

      const { agent: financeAgent } = await loginAs("finance");
      const contractRes = await financeAgent.post(`/api/clients/${clientId}/contracts`).send({ value: 25000, status: "active" });
      expect((await adminAgent.get(`/api/clients/${clientId}`)).body.status).toBe("Active");

      const delRes = await financeAgent.delete(`/api/clients/${clientId}/contracts/${contractRes.body.id}`);
      expect(delRes.status).toBe(200);

      const afterRes = await adminAgent.get(`/api/clients/${clientId}`);
      expect(afterRes.body.status).toBe("Inactive");
      expect(afterRes.body.contracts).toHaveLength(0);
    });

    it("blocks sales from deleting a contract", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const createRes = await adminAgent.post("/api/clients").send({ company: "Sales Blocked Co" });
      const contractRes = await adminAgent.post(`/api/clients/${createRes.body.id}/contracts`).send({ value: 1000 });

      const { agent: salesAgent } = await loginAs("sales");
      const res = await salesAgent.delete(`/api/clients/${createRes.body.id}/contracts/${contractRes.body.id}`);
      expect(res.status).toBe(403);
    });

    it("returns 404 for a nonexistent contract", async () => {
      const { agent } = await loginAs("admin");
      const createRes = await agent.post("/api/clients").send({ company: "No Such Contract Co" });
      const res = await agent.delete(`/api/clients/${createRes.body.id}/contracts/00000000-0000-0000-0000-000000000000`);
      expect(res.status).toBe(404);
    });
  });

  describe("validation / edge case", () => {
    it("rejects a contract with neither a service nor a value — a stray click must not create a blank row", async () => {
      const { agent } = await loginAs("admin");
      const createRes = await agent.post("/api/clients").send({ company: "Blank Contract Co" });
      const res = await agent.post(`/api/clients/${createRes.body.id}/contracts`).send({ start_date: "2026-01-01" });
      expect(res.status).toBe(400);

      const detail = await agent.get(`/api/clients/${createRes.body.id}`);
      expect(detail.body.contracts).toHaveLength(0);
    });

    it("rejects creating a client with a duplicate company name", async () => {
      const { agent } = await loginAs("admin");
      await agent.post("/api/clients").send({ company: "Only One Inc" });
      const res = await agent.post("/api/clients").send({ company: "Only One Inc" });
      expect(res.status).toBe(500);
    });

    it("blocks finance from archiving a client (admin-only despite passing the route's role gate)", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const createRes = await adminAgent.post("/api/clients").send({ company: "Archivable Co" });
      const { agent: financeAgent } = await loginAs("finance");
      const res = await financeAgent.patch(`/api/clients/${createRes.body.id}`).send({ is_archived: true });
      expect(res.status).toBe(403);
    });
  });

  describe("authorization / not-found", () => {
    it("blocks sales from every clients endpoint, including GET", async () => {
      const { agent } = await loginAs("sales");
      expect((await agent.get("/api/clients")).status).toBe(403);
    });

    it("returns 404 for a nonexistent client", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.get("/api/clients/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
    });
  });
});
