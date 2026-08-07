import { pool } from "../db/pool";
import { sendMail } from "../lib/mail";

function formatMoneyPlain(value: unknown): string {
  return `Rs ${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// The Reports page only has numbers if someone remembers to open it. This
// sends the same headline numbers (pipeline, revenue, overdue) to Admin and
// Finance once a week so the business state shows up whether or not anyone
// logs in that week.
export async function runWeeklyReportDigestJob(): Promise<{ sent: number }> {
  const recipientsResult = await pool.query(
    `select id, email, name from users where role in ('admin', 'finance') and is_active = true and deleted_at is null`
  );
  if (recipientsResult.rows.length === 0) return { sent: 0 };

  const [wonCount, lostCount, pipelineValue, revenueThisMonth, pendingPayments, overdueCount, newLeadsThisWeek] = await Promise.all([
    pool.query(`select count(*) as value from leads where deleted_at is null and status = 'Won'`),
    pool.query(`select count(*) as value from leads where deleted_at is null and status = 'Lost'`),
    pool.query(`select coalesce(sum(value_estimate), 0) as value from leads where deleted_at is null and status not in ('Won','Lost')`),
    pool.query(`select coalesce(sum(amount), 0) as value from payments where date_trunc('month', payment_date) = date_trunc('month', current_date)`),
    pool.query(
      `select coalesce(sum(i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)), 0) as value
       from invoices i where deleted_at is null and status not in ('Draft','Cancelled')`
    ),
    pool.query(`select count(*) as value from invoices where deleted_at is null and status = 'Overdue'`),
    pool.query(`select count(*) as value from leads where deleted_at is null and created_at >= current_date - interval '7 days'`),
  ]);

  const won = Number(wonCount.rows[0].value);
  const lost = Number(lostCount.rows[0].value);
  const conversionRate = won + lost > 0 ? Math.round((won / (won + lost)) * 1000) / 10 : 0;

  const lines = [
    `New leads this week: ${newLeadsThisWeek.rows[0].value}`,
    `Open pipeline value: ${formatMoneyPlain(pipelineValue.rows[0].value)}`,
    `Conversion rate (all-time): ${conversionRate}%`,
    `Revenue received this month: ${formatMoneyPlain(revenueThisMonth.rows[0].value)}`,
    `Outstanding across all invoices: ${formatMoneyPlain(pendingPayments.rows[0].value)}`,
    `Overdue invoices: ${overdueCount.rows[0].value}`,
  ];

  let sent = 0;
  for (const user of recipientsResult.rows) {
    try {
      await sendMail({
        to: user.email,
        subject: "Zentinel — your weekly business summary",
        text: `Hi ${user.name},\n\nThis week at a glance:\n\n${lines.map((l) => `  - ${l}`).join("\n")}\n\nFull detail in Reports.`,
        html: `<p>Hi ${user.name},</p><p>This week at a glance:</p><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul><p>Full detail in Reports.</p>`,
      });
      sent++;
    } catch (err) {
      console.error(`Weekly report digest failed to send to ${user.email}:`, err);
    }
  }
  return { sent };
}
