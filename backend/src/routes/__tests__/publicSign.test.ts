import { describe, it, expect, afterEach } from "vitest";
import supertest from "supertest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

type Agent = Awaited<ReturnType<typeof loginAs>>["agent"];

async function createSigningToken(agent: Agent): Promise<string> {
  const leadRes = await agent.post("/api/leads").send({
    company: "Sign Target Co", contact_person: "Sam", email: "sam@sign.test",
    industry: "Other", source: "Website",
  });
  const leadId = leadRes.body.lead.id;
  const attachRes = await agent
    .post(`/api/leads/${leadId}/attachments`)
    .attach("file", Buffer.from("test document content"), "doc.txt");
  const attId = attachRes.body.id;
  const sigRes = await agent.post(`/api/leads/${leadId}/attachments/${attId}/signature-request`);
  const link: string = sigRes.body.link;
  return link.split("/sign/")[1];
}

describe("public sign routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("fetches a pending signing link, then signs it", async () => {
      const { agent } = await loginAs("sales");
      const token = await createSigningToken(agent);

      const getRes = await supertest(app).get(`/api/sign/${token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.status).toBe("pending");

      const signRes = await supertest(app).post(`/api/sign/${token}`).send({ signer_name: "Sam Signer" });
      expect(signRes.status).toBe(200);
      expect(signRes.body.ok).toBe(true);
    });
  });

  describe("validation / edge case", () => {
    it("rejects signing an already-resolved link", async () => {
      const { agent } = await loginAs("sales");
      const token = await createSigningToken(agent);
      await supertest(app).post(`/api/sign/${token}`).send({ signer_name: "First Signer" });

      const res = await supertest(app).post(`/api/sign/${token}`).send({ signer_name: "Second Signer" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("already_resolved");
    });
  });

  describe("authorization / not-found", () => {
    it("returns 404 for an unknown token", async () => {
      const res = await supertest(app).get("/api/sign/not-a-real-token");
      expect(res.status).toBe(404);
    });
  });
});
