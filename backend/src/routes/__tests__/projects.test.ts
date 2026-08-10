import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

type Agent = Awaited<ReturnType<typeof loginAs>>["agent"];

async function makeClient(adminAgent: Agent): Promise<string> {
  const res = await adminAgent.post("/api/clients").send({ company: `Client-${Date.now()}-${Math.random()}` });
  return res.body.id as string;
}

describe("projects routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("ops creates a project and completing it forces progress to 100", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const clientId = await makeClient(adminAgent);

      const { agent: opsAgent } = await loginAs("ops");
      const createRes = await opsAgent.post("/api/projects").send({ name: "Website Revamp", client_id: clientId, status: "In Progress", progress: 40 });
      expect(createRes.status).toBe(201);

      const patchRes = await opsAgent.patch(`/api/projects/${createRes.body.id}`).send({ status: "Completed" });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.progress).toBe(100);
    });
  });

  describe("validation / edge case", () => {
    it("rejects a due_date earlier than start_date", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const clientId = await makeClient(adminAgent);
      const { agent: opsAgent } = await loginAs("ops");
      const res = await opsAgent.post("/api/projects").send({
        name: "Bad Dates", client_id: clientId, start_date: "2026-06-01", due_date: "2026-05-01",
      });
      expect(res.status).toBe(400);
      expect(res.body.details.due_date).toBeTruthy();
    });

    it("empty PATCH body is rejected", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const clientId = await makeClient(adminAgent);
      const { agent: opsAgent } = await loginAs("ops");
      const createRes = await opsAgent.post("/api/projects").send({ name: "Empty Patch Target", client_id: clientId });
      const res = await opsAgent.patch(`/api/projects/${createRes.body.id}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("no_fields_to_update");
    });
  });

  describe("authorization / not-found", () => {
    it("blocks sales entirely and blocks finance from writing", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const clientId = await makeClient(adminAgent);

      const { agent: salesAgent } = await loginAs("sales");
      expect((await salesAgent.get("/api/projects")).status).toBe(403);

      const { agent: financeAgent } = await loginAs("finance");
      expect((await financeAgent.get("/api/projects")).status).toBe(200);
      const writeRes = await financeAgent.post("/api/projects").send({ name: "Finance Can't Create", client_id: clientId });
      expect(writeRes.status).toBe(403);
    });
  });
});
