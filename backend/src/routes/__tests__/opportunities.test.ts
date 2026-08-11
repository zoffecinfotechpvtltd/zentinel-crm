import { describe, it, expect, beforeAll, afterEach } from "vitest";
import ExcelJS from "exceljs";
import { resetDb, loginAs } from "../../test-support/testApp";

async function buildImportRow(company: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Opportunities");
  sheet.addRow([
    "Kind", "Company", "Client Name", "Contact", "Opportunity Types",
    "Description", "PDF/PG & URL", "Stage", "Follow-up Date", "Remarks",
  ]);
  sheet.addRow(["service", company, "", "", "", "", "", "Open", "", ""]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("opportunities routes", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin creates two types, creates an opportunity tagged with both, and re-tags it via PATCH", async () => {
      const { agent } = await loginAs("admin");

      const type1 = await agent.post("/api/opportunities/types").send({ name: "Accessibility" });
      const type2 = await agent.post("/api/opportunities/types").send({ name: "CSCRF" });
      expect(type1.status).toBe(201);
      expect(type2.status).toBe(201);

      const createRes = await agent.post("/api/opportunities").send({
        kind: "service", company: "Value Square Capital",
        opportunity_type_ids: [type1.body.id, type2.body.id],
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.stage).toBe("Open");
      expect(createRes.body.opportunity_types.map((t: { name: string }) => t.name).sort()).toEqual(["Accessibility", "CSCRF"]);

      const listRes = await agent.get("/api/opportunities");
      expect(listRes.status).toBe(200);
      expect(listRes.body.total).toBe(1);

      const patchRes = await agent.patch(`/api/opportunities/${createRes.body.id}`).send({
        opportunity_type_ids: [type1.body.id],
      });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.opportunity_types.map((t: { name: string }) => t.name)).toEqual(["Accessibility"]);
    });
  });

  describe("validation / edge case", () => {
    it("requires lost_reason when stage is set to Lost", async () => {
      const { agent } = await loginAs("sales");
      const createRes = await agent.post("/api/opportunities").send({ kind: "product", company: "Ashida Electronics" });
      const res = await agent.patch(`/api/opportunities/${createRes.body.id}`).send({ stage: "Lost" });
      expect(res.status).toBe(400);
      expect(res.body.details.lost_reason).toBeTruthy();
    });

    it("rejects an empty company on create", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.post("/api/opportunities").send({ kind: "service", company: "" });
      expect(res.status).toBe(400);
    });
  });

  describe("authorization / not-found", () => {
    it("blocks finance and ops from every opportunities endpoint, including GET", async () => {
      const { agent: financeAgent } = await loginAs("finance");
      expect((await financeAgent.get("/api/opportunities")).status).toBe(403);
      const { agent: opsAgent } = await loginAs("ops");
      expect((await opsAgent.get("/api/opportunities")).status).toBe(403);
    });

    it("blocks sales from deleting (admin-only) and returns 404 for a nonexistent opportunity", async () => {
      const { agent: salesAgent } = await loginAs("sales");
      const createRes = await salesAgent.post("/api/opportunities").send({ kind: "service", company: "Sensei Capital" });
      const delRes = await salesAgent.delete(`/api/opportunities/${createRes.body.id}`);
      expect(delRes.status).toBe(403);

      const { agent: adminAgent } = await loginAs("admin");
      const notFoundRes = await adminAgent.get("/api/opportunities/00000000-0000-0000-0000-000000000000");
      expect(notFoundRes.status).toBe(404);
    });
  });

  describe("bulk import duplicate detection", () => {
    it("imports a row once, then skips it as a duplicate on a second import of the same file", async () => {
      const { agent } = await loginAs("admin");
      const file = await buildImportRow(`Dedupe Test Co ${Date.now()}`);

      const first = await agent.post("/api/opportunities/import").attach("file", file, "template.xlsx");
      expect(first.status).toBe(200);
      expect(first.body.imported).toBe(1);
      expect(first.body.duplicates).toBe(0);

      const second = await agent.post("/api/opportunities/import").attach("file", file, "template.xlsx");
      expect(second.status).toBe(200);
      expect(second.body.imported).toBe(0);
      expect(second.body.duplicates).toBe(1);
      expect(second.body.skipped[0].reason).toMatch(/Duplicate/);

      const listRes = await agent.get("/api/opportunities");
      expect(listRes.body.total).toBe(1);
    });
  });
});
