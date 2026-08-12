import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type supertest from "supertest";
import { pool } from "../../db/pool";
import { resetDb, loginAs } from "../../test-support/testApp";
import { runFollowupReminderJob } from "../followupReminders";

async function notificationsFor(userId: string, type: string) {
  const r = await pool.query(`select * from notifications where user_id = $1 and type = $2 order by created_at`, [userId, type]);
  return r.rows;
}

describe("follow-up reminder job", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("lead follow-ups", () => {
    it("notifies the assigned rep once, bundling multiple due leads into a single notification", async () => {
      const { agent, user: sales } = await loginAs("sales");
      const lead1 = await agent.post("/api/leads").send({ company: "Due Lead One", contact_person: "A", email: "a@x.com" });
      const lead2 = await agent.post("/api/leads").send({ company: "Due Lead Two", contact_person: "B", email: "b@x.com" });
      await pool.query(`update leads set assigned_to = $1, next_followup_date = current_date where id = any($2)`, [
        sales.id, [lead1.body.lead.id, lead2.body.lead.id],
      ]);

      await runFollowupReminderJob();

      const notifs = await notificationsFor(sales.id, "followup_due");
      expect(notifs).toHaveLength(1);
      expect(notifs[0].title).toContain("2 follow-up(s)");
    });

    it("does not notify for a lead whose follow-up date is in the future", async () => {
      const { agent, user: sales } = await loginAs("sales");
      const lead = await agent.post("/api/leads").send({ company: "Future Lead", contact_person: "A", email: "a2@x.com" });
      await pool.query(`update leads set assigned_to = $1, next_followup_date = current_date + 5 where id = $2`, [sales.id, lead.body.lead.id]);

      await runFollowupReminderJob();

      expect(await notificationsFor(sales.id, "followup_due")).toHaveLength(0);
    });

    it("does not notify for a Won lead even if its follow-up date is overdue", async () => {
      const { agent, user: sales } = await loginAs("sales");
      const lead = await agent.post("/api/leads").send({ company: "Won Lead", contact_person: "A", email: "a3@x.com" });
      await pool.query(
        `update leads set assigned_to = $1, status = 'Won', next_followup_date = current_date - 2 where id = $2`,
        [sales.id, lead.body.lead.id]
      );

      await runFollowupReminderJob();

      expect(await notificationsFor(sales.id, "followup_due")).toHaveLength(0);
    });
  });

  describe("lead escalation", () => {
    it("escalates to every active admin when a lead is more than 3 business days overdue", async () => {
      const { user: admin1 } = await loginAs("admin");
      const { user: admin2 } = await loginAs("admin");
      const { agent, user: sales } = await loginAs("sales");
      const lead = await agent.post("/api/leads").send({ company: "Escalate Co", contact_person: "A", email: "esc@x.com" });
      await pool.query(`update leads set assigned_to = $1, next_followup_date = current_date - 10 where id = $2`, [sales.id, lead.body.lead.id]);

      const { escalations } = await runFollowupReminderJob();

      expect(escalations).toBe(2);
      expect(await notificationsFor(admin1.id, "followup_escalated")).toHaveLength(1);
      expect(await notificationsFor(admin2.id, "followup_escalated")).toHaveLength(1);
    });

    it("does not escalate a lead overdue by only 1 day (within the 3-business-day grace window)", async () => {
      const { user: admin } = await loginAs("admin");
      const { agent, user: sales } = await loginAs("sales");
      const lead = await agent.post("/api/leads").send({ company: "Barely Overdue Co", contact_person: "A", email: "bo@x.com" });
      await pool.query(`update leads set assigned_to = $1, next_followup_date = current_date - 1 where id = $2`, [sales.id, lead.body.lead.id]);

      const { escalations } = await runFollowupReminderJob();

      expect(escalations).toBe(0);
      expect(await notificationsFor(admin.id, "followup_escalated")).toHaveLength(0);
    });

    it("does not escalate a Won lead even if its stale follow-up date would otherwise qualify", async () => {
      const { user: admin } = await loginAs("admin");
      const { agent, user: sales } = await loginAs("sales");
      const lead = await agent.post("/api/leads").send({ company: "Won Stale Co", contact_person: "A", email: "ws@x.com" });
      await pool.query(
        `update leads set assigned_to = $1, status = 'Won', next_followup_date = current_date - 10 where id = $2`,
        [sales.id, lead.body.lead.id]
      );

      const { escalations } = await runFollowupReminderJob();

      expect(escalations).toBe(0);
      expect(await notificationsFor(admin.id, "followup_escalated")).toHaveLength(0);
    });
  });

  describe("opportunity follow-ups", () => {
    it("notifies every active admin/sales user when an opportunity follow-up is due, but not finance", async () => {
      const { agent, user: admin } = await loginAs("admin");
      const { user: sales } = await loginAs("sales");
      const { user: finance } = await loginAs("finance");
      const oppRes = await agent.post("/api/opportunities").send({ kind: "service", company: "Due Opp Co" });
      await pool.query(`update opportunities set follow_up_date = current_date where id = $1`, [oppRes.body.id]);

      await runFollowupReminderJob();

      expect(await notificationsFor(admin.id, "opportunity_followup_due")).toHaveLength(1);
      expect(await notificationsFor(sales.id, "opportunity_followup_due")).toHaveLength(1);
      expect(await notificationsFor(finance.id, "opportunity_followup_due")).toHaveLength(0);
    });

    it("does not notify for a Lost opportunity even if its follow-up date is overdue", async () => {
      const { agent, user: admin } = await loginAs("admin");
      const oppRes = await agent.post("/api/opportunities").send({ kind: "service", company: "Resolved Opp Co" });
      await pool.query(
        `update opportunities set stage = 'Lost', lost_reason = 'x', follow_up_date = current_date - 3 where id = $1`,
        [oppRes.body.id]
      );

      await runFollowupReminderJob();

      expect(await notificationsFor(admin.id, "opportunity_followup_due")).toHaveLength(0);
    });

    it("does not notify for a future opportunity follow-up date", async () => {
      const { agent, user: admin } = await loginAs("admin");
      const oppRes = await agent.post("/api/opportunities").send({ kind: "service", company: "Future Opp Co" });
      await pool.query(`update opportunities set follow_up_date = current_date + 7 where id = $1`, [oppRes.body.id]);

      await runFollowupReminderJob();

      expect(await notificationsFor(admin.id, "opportunity_followup_due")).toHaveLength(0);
    });
  });

  describe("invoice follow-ups", () => {
    async function createInvoice(agent: ReturnType<typeof supertest.agent>, company: string, ledger: string) {
      const clientRes = await agent.post("/api/clients").send({ company, tally_ledger_name: ledger });
      const invoiceRes = await agent.post("/api/invoices").send({
        client_id: clientRes.body.id,
        line_items: [{ description: "Service", rate: 1000 }],
      });
      return invoiceRes.body.id as string;
    }

    it("notifies every active admin/finance user when an invoice follow-up is due, but not sales", async () => {
      const { agent, user: admin } = await loginAs("admin");
      const { user: finance } = await loginAs("finance");
      const { user: sales } = await loginAs("sales");
      const invoiceId = await createInvoice(agent, "Invoice Followup Co", "Ledger X");
      await pool.query(`update invoices set status = 'Sent', next_followup_date = current_date where id = $1`, [invoiceId]);

      await runFollowupReminderJob();

      expect(await notificationsFor(admin.id, "invoice_followup_due")).toHaveLength(1);
      expect(await notificationsFor(finance.id, "invoice_followup_due")).toHaveLength(1);
      expect(await notificationsFor(sales.id, "invoice_followup_due")).toHaveLength(0);
    });

    it("does not notify for a Draft invoice even if next_followup_date is due", async () => {
      const { agent, user: admin } = await loginAs("admin");
      const invoiceId = await createInvoice(agent, "Draft Invoice Co", "Ledger Y");
      // Left as Draft (default status) — never sent, so nothing to chase yet.
      await pool.query(`update invoices set next_followup_date = current_date where id = $1`, [invoiceId]);

      await runFollowupReminderJob();

      expect(await notificationsFor(admin.id, "invoice_followup_due")).toHaveLength(0);
    });

    it("does not notify for a future invoice follow-up date", async () => {
      const { agent, user: admin } = await loginAs("admin");
      const invoiceId = await createInvoice(agent, "Future Invoice Co", "Ledger Z");
      await pool.query(`update invoices set status = 'Sent', next_followup_date = current_date + 4 where id = $1`, [invoiceId]);

      await runFollowupReminderJob();

      expect(await notificationsFor(admin.id, "invoice_followup_due")).toHaveLength(0);
    });
  });
});
