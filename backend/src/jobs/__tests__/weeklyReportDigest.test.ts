import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { pool } from "../../db/pool";
import { resetDb, loginAs } from "../../test-support/testApp";
import { runWeeklyReportDigestJob } from "../weeklyReportDigest";

describe("weekly report digest job", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("sends to admin and finance only, never sales or ops", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { user: admin } = await loginAs("admin");
      const { user: finance } = await loginAs("finance");
      const { user: sales } = await loginAs("sales");
      const { user: ops } = await loginAs("ops");

      const { sent } = await runWeeklyReportDigestJob();

      expect(sent).toBe(2);
      const recipients = logSpy.mock.calls.map((c) => String(c[0]));
      expect(recipients.some((l) => l.includes(admin.email))).toBe(true);
      expect(recipients.some((l) => l.includes(finance.email))).toBe(true);
      expect(recipients.some((l) => l.includes(sales.email))).toBe(false);
      expect(recipients.some((l) => l.includes(ops.email))).toBe(false);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("reports the correct open-pipeline value and overdue-invoice count", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { agent, user: admin } = await loginAs("admin");
      await agent.post("/api/leads").send({ company: "Pipeline Lead", contact_person: "A", email: "pl@x.com", value_estimate: 50000 });

      const clientRes = await agent.post("/api/clients").send({ company: `Weekly Overdue Co ${Date.now()}`, tally_ledger_name: "L2" });
      const invoiceRes = await agent.post("/api/invoices").send({
        client_id: clientRes.body.id,
        line_items: [{ description: "Service", rate: 1000 }],
      });
      await pool.query(`update invoices set status = 'Overdue', due_date = current_date - 3 where id = $1`, [invoiceRes.body.id]);

      await runWeeklyReportDigestJob();

      const adminCall = logSpy.mock.calls.find((c) => String(c[0]).includes(admin.email));
      expect(adminCall?.[0]).toContain("Open pipeline value: Rs 50,000");
      expect(adminCall?.[0]).toContain("Overdue invoices: 1");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("sends nothing when there are no admin or finance users to notify", async () => {
    const { sent } = await runWeeklyReportDigestJob();
    expect(sent).toBe(0);
  });
});
