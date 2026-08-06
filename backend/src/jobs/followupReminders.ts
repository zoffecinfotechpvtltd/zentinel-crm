import { pool } from "../db/pool";
import { createNotification } from "../lib/notifications";
import { businessDaysBetween } from "../lib/businessDays";

// Runs each morning: one bundled notification per rep for their own Today +
// Overdue leads, plus a separate escalation notification (to Admins — no
// manager hierarchy is modeled) for any lead more than 3 business days overdue.
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

  return { reminders, escalations };
}
