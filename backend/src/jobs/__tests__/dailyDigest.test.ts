import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { pool } from "../../db/pool";
import { resetDb, loginAs } from "../../test-support/testApp";
import { runDailyDigestJob } from "../dailyDigest";

// No SMTP is configured in the test environment (no smtp_config row, no
// SMTP_* env vars) — lib/mail.ts's sendMail() falls back to console.log and
// resolves successfully in that case, so `sent` still increments correctly
// without a real send. Spying on console.log lets each test assert on the
// digest body without needing a mail-server double.
describe("daily digest job", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("sends a sales rep only their own assigned lead follow-ups, not another rep's", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { agent, user: repA } = await loginAs("sales");
      const { user: repB } = await loginAs("sales");
      const leadA = await agent.post("/api/leads").send({ company: "Rep A Lead", contact_person: "X", email: "repa@x.com" });
      const leadB = await agent.post("/api/leads").send({ company: "Rep B Lead", contact_person: "Y", email: "repb@x.com" });
      await pool.query(`update leads set assigned_to = $1, next_followup_date = current_date where id = $2`, [repA.id, leadA.body.lead.id]);
      await pool.query(`update leads set assigned_to = $1, next_followup_date = current_date where id = $2`, [repB.id, leadB.body.lead.id]);

      const { sent } = await runDailyDigestJob();

      expect(sent).toBeGreaterThanOrEqual(2);
      const repACall = logSpy.mock.calls.find((c) => String(c[0]).includes(repA.email));
      expect(repACall?.[0]).toContain("Rep A Lead");
      expect(repACall?.[0]).not.toContain("Rep B Lead");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("includes overdue invoices for finance but not for a sales-only user", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { agent: adminAgent } = await loginAs("admin");
      const { user: finance } = await loginAs("finance");
      const { user: sales } = await loginAs("sales");
      const clientRes = await adminAgent.post("/api/clients").send({ company: `Overdue Digest Co ${Date.now()}`, tally_ledger_name: "L1" });
      const invoiceRes = await adminAgent.post("/api/invoices").send({
        client_id: clientRes.body.id,
        line_items: [{ description: "Service", rate: 1000 }],
      });
      await pool.query(`update invoices set status = 'Overdue', due_date = current_date - 5 where id = $1`, [invoiceRes.body.id]);

      await runDailyDigestJob();

      const financeCall = logSpy.mock.calls.find((c) => String(c[0]).includes(finance.email));
      expect(financeCall?.[0]).toContain("Overdue invoices");
      const salesCall = logSpy.mock.calls.find((c) => String(c[0]).includes(sales.email));
      expect(salesCall).toBeUndefined();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("skips a user entirely when they have nothing due (no empty digest sent)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { user: sales } = await loginAs("sales");

      await runDailyDigestJob();

      const salesCall = logSpy.mock.calls.find((c) => String(c[0]).includes(sales.email));
      expect(salesCall).toBeUndefined();
    } finally {
      logSpy.mockRestore();
    }
  });
});
