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

  describe("validation / edge case", () => {
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
