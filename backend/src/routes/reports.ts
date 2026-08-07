import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { getFiscalYearRange } from "../lib/fiscalYear";

const router = Router();

router.use(requireAuth);

// lead-conversion stays open to every role (it's status counts, not pricing —
// Sales' own Dashboard depends on it). Every other report here is revenue,
// client-wise, or service-wise pricing data — off limits to Sales for the
// same reason Clients/Invoices are (see clients.ts).
const NOT_SALES = requireRole("admin", "finance", "ops");

function dateRangeFromQuery(query: import("express").Request["query"]): { from: string; to: string } {
  const fy = getFiscalYearRange();
  return {
    from: typeof query.from === "string" ? query.from : fy.start,
    to: typeof query.to === "string" ? query.to : fy.end,
  };
}

// --- Lead Conversion ---

router.get("/lead-conversion", async (req, res) => {
  const { from, to } = dateRangeFromQuery(req.query);
  const conditions = ["deleted_at is null", "created_at::date between $1 and $2"];
  const values: unknown[] = [from, to];
  let i = 3;
  if (req.query.assigned_to) {
    conditions.push(`assigned_to = $${i++}`);
    values.push(req.query.assigned_to);
  }
  const whereClause = conditions.join(" and ");

  const funnelResult = await pool.query(
    `select status, count(*) as count, coalesce(sum(value_estimate), 0) as value_sum
     from leads where ${whereClause} group by status`,
    values
  );

  const totals = await pool.query(
    `select
       count(*) filter (where status = 'Won') as won_count,
       count(*) filter (where status = 'Lost') as lost_count,
       coalesce(sum(coalesce(won_value, value_estimate)) filter (where status = 'Won'), 0) as won_value,
       coalesce(sum(value_estimate), 0) as pipeline_value
     from leads where ${whereClause}`,
    values
  );

  const t = totals.rows[0];
  const wonCount = Number(t.won_count);
  const lostCount = Number(t.lost_count);
  const wonValue = Number(t.won_value);
  const pipelineValue = Number(t.pipeline_value);

  res.json({
    from, to,
    funnel: funnelResult.rows,
    won_count: wonCount,
    lost_count: lostCount,
    conversion_rate_by_count_pct: wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 10000) / 100 : 0,
    conversion_rate_by_value_pct: pipelineValue > 0 ? Math.round((wonValue / pipelineValue) * 10000) / 100 : 0,
  });
});

// --- Revenue ---

router.get("/revenue", NOT_SALES, async (req, res) => {
  const { from, to } = dateRangeFromQuery(req.query);

  const monthlyResult = await pool.query(
    `select date_trunc('month', payment_date) as month, sum(amount) as total
     from payments where payment_date between $1 and $2
     group by month order by month`,
    [from, to]
  );

  const clientWiseResult = await pool.query(
    `select c.id as client_id, c.company, sum(p.amount) as total
     from payments p join invoices i on i.id = p.invoice_id join clients c on c.id = i.client_id
     where p.payment_date between $1 and $2
     group by c.id, c.company order by total desc`,
    [from, to]
  );

  const outstandingResult = await pool.query(
    `select coalesce(sum(i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)), 0) as outstanding
     from invoices i where i.deleted_at is null and i.status not in ('Draft','Cancelled')
       and i.invoice_date between $1 and $2`,
    [from, to]
  );

  const fy = getFiscalYearRange();
  const targetResult = await pool.query(`select value from settings where key = 'fy_revenue_target'`);
  const target = targetResult.rows[0]?.value ?? null;
  const actualResult = await pool.query(
    `select coalesce(sum(amount), 0) as total from payments where payment_date between $1 and $2`,
    [fy.start, fy.end]
  );

  res.json({
    from, to,
    monthly_trend: monthlyResult.rows,
    client_wise: clientWiseResult.rows,
    outstanding: Number(outstandingResult.rows[0].outstanding),
    fy_target: target,
    fy_actual: Number(actualResult.rows[0].total),
    fiscal_year: fy,
  });
});

const setTargetSchema = z.object({ amount: z.number().positive(), fiscal_year: z.string() });

router.put("/revenue/target", requireRole("admin"), async (req, res) => {
  const parsed = setTargetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  await pool.query(
    `insert into settings (key, value, updated_by, updated_at) values ('fy_revenue_target', $1, $2, now())
     on conflict (key) do update set value = $1, updated_by = $2, updated_at = now()`,
    [JSON.stringify(parsed.data), req.user!.id]
  );
  res.json({ ok: true, value: parsed.data });
});

// --- Payment Pending ---

async function paymentPendingRows(query: import("express").Request["query"]) {
  const conditions = ["i.deleted_at is null", "i.status not in ('Draft','Cancelled')"];
  const values: unknown[] = [];
  let i = 1;
  if (query.status) {
    conditions.push(`i.status = $${i++}`);
    values.push(query.status);
  }
  if (query.assigned_to) {
    conditions.push(
      `i.client_id in (select c.id from clients c join leads l on l.id = c.converted_from_lead_id where l.assigned_to = $${i++})`
    );
    values.push(query.assigned_to);
  }
  conditions.push(
    `(i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)) > 0`
  );
  const whereClause = conditions.join(" and ");

  const result = await pool.query(
    `select i.id, i.invoice_number, c.company as client_company, i.due_date, i.status,
            (i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)) as balance
     from invoices i join clients c on c.id = i.client_id
     where ${whereClause}
     order by i.due_date nulls last`,
    values
  );
  return result.rows;
}

router.get("/payment-pending", NOT_SALES, async (req, res) => {
  const rows = await paymentPendingRows(req.query);
  res.json({ data: rows });
});

router.get("/payment-pending/export", NOT_SALES, async (req, res) => {
  const rows = await paymentPendingRows(req.query);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Payment Pending");
  sheet.columns = [
    { header: "Invoice Number", key: "invoice_number", width: 20 },
    { header: "Client", key: "client_company", width: 30 },
    { header: "Due Date", key: "due_date", width: 15 },
    { header: "Status", key: "status", width: 15 },
    { header: "Balance", key: "balance", width: 15 },
  ];
  for (const row of rows) sheet.addRow(row);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="payment-pending.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// --- Service-wise ---

router.get("/service-wise", NOT_SALES, async (req, res) => {
  const { from, to } = dateRangeFromQuery(req.query);

  const revenueResult = await pool.query(
    `select s.id as service_id, s.name, coalesce(sum(p.amount), 0) as revenue
     from services s
     left join contracts ct on ct.service_id = s.id
     left join invoices i on i.contract_id = ct.id
     left join payments p on p.invoice_id = i.id and p.payment_date between $1 and $2
     group by s.id, s.name order by revenue desc`,
    [from, to]
  );

  const leadVolumeResult = await pool.query(
    `select s.id as service_id, s.name, count(l.id) as lead_count
     from services s left join leads l on l.service_id = s.id
       and l.deleted_at is null and l.created_at::date between $1 and $2
     group by s.id, s.name order by lead_count desc`,
    [from, to]
  );

  res.json({ from, to, revenue_by_service: revenueResult.rows, lead_volume_by_service: leadVolumeResult.rows });
});

function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? "");
}

// Reuses the message_templates system (built for Follow-up Automation) for the
// Payment Pending report's one-click reminder, rather than a separate stub.
router.get("/payment-pending/:invoiceId/remind/:templateId", NOT_SALES, async (req, res) => {
  const invoiceResult = await pool.query(
    `select i.*, c.company,
            (i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)) as balance
     from invoices i join clients c on c.id = i.client_id
     where i.id = $1 and i.deleted_at is null`,
    [req.params.invoiceId]
  );
  if (invoiceResult.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const invoice = invoiceResult.rows[0];

  const contactResult = await pool.query(
    `select name from client_contacts where client_id = $1 and is_primary = true and deleted_at is null limit 1`,
    [invoice.client_id]
  );
  const contactName = contactResult.rows[0]?.name ?? invoice.company;

  const templateResult = await pool.query(`select * from message_templates where id = $1`, [req.params.templateId]);
  if (templateResult.rows.length === 0) {
    res.status(404).json({ error: "template_not_found" });
    return;
  }
  const template = templateResult.rows[0];

  const placeholderValues: Record<string, string> = {
    name: contactName,
    service: "",
    amount: `₹${Number(invoice.balance).toLocaleString("en-IN")}`,
    date: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("en-IN") : "",
  };

  res.json({
    subject: template.subject ? fillTemplate(template.subject, placeholderValues) : null,
    body: fillTemplate(template.body, placeholderValues),
  });
});

export default router;
