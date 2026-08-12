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

    it("rejects a file over the 25MB limit with a clear message instead of a bare 500", async () => {
      const { agent } = await loginAs("sales");
      const leadId = await createLead(agent, "Too Big File Co");

      const oversized = Buffer.alloc(26 * 1024 * 1024, 1);
      const res = await agent.post(`/api/leads/${leadId}/attachments`).attach("file", oversized, "huge.bin");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("file_too_large");
      expect(res.body.message).toMatch(/25MB/);
    }, 20000);
  });

  describe("editing an attachment's document type", () => {
    it("lets the uploader fix a mis-tagged file without deleting and re-uploading it", async () => {
      const { agent } = await loginAs("sales");
      const leadId = await createLead(agent, "Retag Co");
      const fileRes = await agent.post(`/api/leads/${leadId}/attachments`)
        .field("document_type", "Engagement Letter")
        .attach("file", Buffer.from("hello"), "note.txt");
      expect(fileRes.body.document_type).toBe("Engagement Letter");

      const editRes = await agent.patch(`/api/leads/${leadId}/attachments/${fileRes.body.id}`).send({ document_type: "Proposal" });
      expect(editRes.status).toBe(200);
      expect(editRes.body.document_type).toBe("Proposal");

      const listRes = await agent.get(`/api/leads/${leadId}/attachments`);
      expect(listRes.body[0].document_type).toBe("Proposal");
    });

    it("blocks a different non-admin rep from editing someone else's upload", async () => {
      const { agent: repA } = await loginAs("sales", { email: "edit-repA@test.local" });
      const leadId = await createLead(repA, "Owned By A Co");
      const fileRes = await repA.post(`/api/leads/${leadId}/attachments`).attach("file", Buffer.from("hello"), "note.txt");

      const { agent: repB } = await loginAs("sales", { email: "edit-repB@test.local" });
      const res = await repB.patch(`/api/leads/${leadId}/attachments/${fileRes.body.id}`).send({ document_type: "Proposal" });
      expect(res.status).toBe(403);
    });

    it("returns 404 for a nonexistent attachment", async () => {
      const { agent } = await loginAs("sales");
      const leadId = await createLead(agent, "No Such File Co");
      const res = await agent.patch(`/api/leads/${leadId}/attachments/00000000-0000-0000-0000-000000000000`).send({ document_type: "Proposal" });
      expect(res.status).toBe(404);
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
