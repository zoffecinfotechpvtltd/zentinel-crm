import { pool } from "../db/pool";
import { createNotification } from "../lib/notifications";
import { businessDaysBetween } from "../lib/businessDays";

// Opportunities has no per-rep "assigned_to" workflow today (it's a shared
// Admin+Sales tracker, unlike Leads) — so a due follow-up is bundled once
// per active Admin/Sales user rather than routed to a single owner.
async function runOpportunityFollowupReminders(): Promise<number> {
  const dueResult = await pool.query(
    `select id, company, follow_up_date from opportunities
     where deleted_at is null and stage not in ('Won','Lost') and follow_up_date <= current_date
     order by follow_up_date`
  );
  if (dueResult.rows.length === 0) return 0;

  const recipientsResult = await pool.query(
    `select id from users where role in ('admin','sales') and is_active = true and deleted_at is null`
  );

  const names = dueResult.rows.slice(0, 5).map((o) => o.company).join(", ");
  const title = `${dueResult.rows.length} opportunity follow-up(s) due today or overdue`;
  const body = names + (dueResult.rows.length > 5 ? ", …" : "");

  let reminders = 0;
  for (const user of recipientsResult.rows) {
    await createNotification(pool, { userId: user.id, type: "opportunity_followup_due", title, body });
    reminders++;
  }
  return reminders;
}

// Runs each morning: one bundled notification per rep for their own Today +
// Overdue leads, plus a separate escalation notification (to Admins — no
// manager hierarchy is modeled) for any lead more than 3 business days overdue.
// Also bundles due Opportunity follow-ups (see above) to every Admin/Sales user.
export async function runFollowupReminderJob(): Promise<{ reminders: number; escalations: number }> {
  const dueResult = await pool.query(
    `select id, company, assigned_to, next_followup_date from leads
     where deleted_at is null and status not in ('Won','Lost')
       and assigned_to is not null and next_followup_date <= current_date
     order by next_followup_date`
  );

  const byRep = new Map<string, { id: string; company: string; next_followup_date: string }[]>();
  for (const row of dueResult.rows) {
    const list = byRep.get(row.assigned_to) ?? [];
    list.push(row);
    byRep.set(row.assigned_to, list);
  }

  let reminders = 0;
  for (const [repId, leads] of byRep) {
    const names = leads.slice(0, 5).map((l) => l.company).join(", ");
    await createNotification(pool, {
      userId: repId,
      type: "followup_due",
      title: `${leads.length} follow-up(s) due today or overdue`,
      body: names + (leads.length > 5 ? ", …" : ""),
    });
    reminders++;
  }

  const today = new Date();
  const escalated = dueResult.rows.filter(
    (row) => businessDaysBetween(new Date(row.next_followup_date), today) > 3
  );

  let escalations = 0;
  if (escalated.length > 0) {
    const adminsResult = await pool.query(`select id from users where role = 'admin' and is_active = true`);
    for (const lead of escalated) {
      for (const admin of adminsResult.rows) {
        await createNotification(pool, {
          userId: admin.id,
          type: "followup_escalated",
          entityType: "lead",
          entityId: lead.id,
          title: `Escalation: follow-up on ${lead.company} is overdue`,
          body: `Overdue since ${lead.next_followup_date}`,
        });
        escalations++;
      }
    }
  }

  reminders += await runOpportunityFollowupReminders();

  return { reminders, escalations };
}
