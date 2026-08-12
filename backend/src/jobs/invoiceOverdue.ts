import { pool } from "../db/pool";
import { createNotification } from "../lib/notifications";
import { runAutomationRules } from "../lib/automationRules";

// Overdue is computed by this job, not a manually set dropdown: any Final+
// invoice whose due_date has passed and still carries a balance flips to
// Overdue. Draft/Cancelled/Paid/already-Overdue are excluded.
export async function runInvoiceOverdueJob(): Promise<{ affected: number }> {
  const result = await pool.query(
    `update invoices i set status = 'Overdue', updated_at = now()
     where i.due_date < current_date
       and i.status not in ('Draft', 'Cancelled', 'Paid', 'Overdue')
       and i.deleted_at is null
       and (i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)) > 0
     returning i.id, i.invoice_number`
  );

  if (result.rows.length > 0) {
    // "Relevant user" per Notifications README: assigned Finance user + Admin —
    // the data model has no per-invoice Finance assignee, so this notifies all
    // active Finance + Admin users (never the whole user base).
    const recipients = await pool.query(
      `select id from users where role in ('finance','admin') and is_active = true`
    );
    for (const invoice of result.rows) {
      for (const user of recipients.rows) {
        await createNotification(pool, {
          userId: user.id,
          type: "invoice_overdue",
          entityType: "invoice",
          entityId: invoice.id,
          title: `Invoice ${invoice.invoice_number ?? invoice.id} is now overdue`,
        });
      }
      await runAutomationRules("invoice", invoice.id, "Overdue", invoice.invoice_number ?? invoice.id);
    }
  }

  return { affected: result.rowCount ?? 0 };
}
