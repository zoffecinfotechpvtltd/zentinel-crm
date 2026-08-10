import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { resetDb, loginAs } from "../../test-support/testApp";

type Agent = Awaited<ReturnType<typeof loginAs>>["agent"];

async function createLead(agent: Agent, company: string): Promise<string> {
  const res = await agent.post("/api/leads").send({
    company, contact_person: "Contact", email: `${company.replace(/\s+/g, "").toLowerCase()}@test.local`,
    industry: "Other", source: "Website",
  });
  // POST /api/leads wraps its response as {lead, duplicate_warning} — verified
  // against backend/src/routes/leads.ts in Tasks 5 and 17 of this same plan.
  return res.body.lead.id as string;
}

describe("notes and attachments sub-routes (via leads)", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("adds a note and uploads a file to a lead", async () => {
      const { agent } = await loginAs("sales");
      const leadId = await createLead(agent, "Notes Target Co");

      const noteRes = await agent.post(`/api/leads/${leadId}/notes`).send({ body: "Called, left voicemail." });
      expect(noteRes.status).toBe(201);

      const fileRes = await agent.post(`/api/leads/${leadId}/attachments`).attach("file", Buffer.from("hello"), "note.txt");
      expect(fileRes.status).toBe(201);

      const listRes = await agent.get(`/api/leads/${leadId}/attachments`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBe(1);
    });
  });

  describe("validation / edge case", () => {
    it("rejects an empty note body and a missing file", async () => {
      const { agent } = await loginAs("sales");
      const leadId = await createLead(agent, "Empty Note Co");

      const noteRes = await agent.post(`/api/leads/${leadId}/notes`).send({ body: "   " });
      expect(noteRes.status).toBe(400);

      const fileRes = await agent.post(`/api/leads/${leadId}/attachments`).send();
      expect(fileRes.status).toBe(400);
      expect(fileRes.body.error).toBe("no_file");
    });
  });

  describe("authorization / not-found", () => {
    it("returns 404 for notes/attachments on a nonexistent lead", async () => {
      const { agent } = await loginAs("sales");
      const res = await agent.get("/api/leads/00000000-0000-0000-0000-000000000000/notes");
      expect(res.status).toBe(404);
    });

    it("a sales rep CAN note another sales rep's lead (coarse role gate only, no per-record ownership check here)", async () => {
      const { agent: repA } = await loginAs("sales", { email: "notes-repA@test.local" });
      const leadId = await createLead(repA, "Cross Rep Co");

      const { agent: repB } = await loginAs("sales", { email: "notes-repB@test.local" });
      const res = await repB.post(`/api/leads/${leadId}/notes`).send({ body: "I can see this lead's notes route." });
      expect(res.status).toBe(201);
    });
  });
});
