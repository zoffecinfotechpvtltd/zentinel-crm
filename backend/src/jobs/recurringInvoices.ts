import { pool } from "../db/pool";
import { computeTotals, type LineItemInput } from "../lib/invoiceMath";
import { writeActivityLog } from "../lib/activityLog";
import { createNotification } from "../lib/notifications";

// pg parses a DATE column as local midnight in the Node process's own
// timezone, not UTC — reading it back via toISOString() (UTC) can land on
// the wrong calendar day depending on server timezone. Staying entirely in
// local getters/setters here (matching how pg constructed the Date) avoids
// that round-trip.
function advance(date: Date, frequency: string): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  else if (frequency === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Runs daily. A template due today (or overdue — e.g. the job didn't run
// for a few days) generates one Draft invoice per pass, not one per missed
// day; next_run_date only ever advances by a single cycle each run, so a
// long-dead job catches up gradually rather than back-filling a burst of
// invoices the moment it resumes.
export async function runRecurringInvoicesJob(): Promise<{ created: number; skipped: number }> {
  const dueResult = await pool.query(
    `select rt.*, c.tally_ledger_name from recurring_invoice_templates rt
     join clients c on c.id = rt.client_id
     where rt.deleted_at is null and rt.is_active and rt.next_run_date <= current_date`
  );

  let created = 0;
  let skipped = 0;

  for (const template of dueResult.rows) {
    if (!template.tally_ledger_name) {
      // Can't create an invoice without one (same rule as the manual create
      // route) — leave next_run_date alone so it retries once this is fixed,
      // rather than silently skipping the cycle forever.
      skipped++;
      continue;
    }

    const lineItems = template.line_items as LineItemInput[];
    const { subtotal, tax, total, lines } = computeTotals(lineItems);

    const client = await pool.connect();
    try {
      await client.query("begin");
      const invoiceResult = await client.query(
        `insert into invoices (client_id, project_id, contract_id, invoice_date, subtotal, tax, total, created_by, updated_by)
         values ($1,$2,$3,current_date,$4,$5,$6,null,null)
         returning id`,
        [template.client_id, template.project_id, template.contract_id, subtotal, tax, total]
      );
      const invoice = invoiceResult.rows[0];

      for (const l of lines) {
        await client.query(
          `insert into invoice_line_items (invoice_id, description, quantity, rate, gst_rate) values ($1,$2,$3,$4,$5)`,
          [invoice.id, l.description, l.quantity, l.rate, l.gst_rate]
        );
      }

      const nextRunDate = advance(template.next_run_date, template.frequency);
      await client.query(
        `update recurring_invoice_templates set next_run_date = $1, last_generated_invoice_id = $2, updated_at = now() where id = $3`,
        [nextRunDate, invoice.id, template.id]
      );

      await client.query("commit");
      created++;

      await writeActivityLog(pool, {
        entityType: "invoice",
        entityId: invoice.id,
        actorId: null,
        action: "created",
        detail: { total, source: "recurring_template", template_id: template.id },
      });

      const recipients = await pool.query(`select id from users where role in ('finance','admin') and is_active = true`);
      for (const user of recipients.rows) {
        await createNotification(pool, {
          userId: user.id,
          type: "recurring_invoice_generated",
          entityType: "invoice",
          entityId: invoice.id,
          title: `A new Draft invoice was generated from a recurring template — review before sending`,
        });
      }
    } catch (err) {
      await client.query("rollback");
      console.error(`Recurring invoice generation failed for template ${template.id}:`, err);
      skipped++;
    } finally {
      client.release();
    }
  }

  return { created, skipped };
}
