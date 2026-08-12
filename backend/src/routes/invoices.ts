import { Router } from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeActivityLog } from "../lib/activityLog";
import { buildTallySalesVoucherXml } from "../lib/tallyExport";
import { parseInvoicePdfText } from "../lib/invoicePdfParse";
import { computeTotals } from "../lib/invoiceMath";
import { mountNotesAndAttachments } from "../lib/attachNotesAndFiles";
import { buildSingleEventIcs } from "../lib/ics";
import { fireWebhook } from "../lib/outboundWebhook";

const router = Router();
const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Invoices are Finance's domain — Sales has no access at all now (mirrors
// Leads being Sales' domain with no Finance access). Clients still bridges
// the two since both roles legitimately need to see who they're talking to.
router.use(requireAuth, requireRole("admin", "finance"));

const BALANCE_EXPR = `(i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0))`;

async function isClientOwnedBySales(clientId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `select 1 from clients c join leads l on l.id = c.converted_from_lead_id
     where c.id = $1 and l.assigned_to = $2`,
    [clientId, userId]
  );
  return result.rows.length > 0;
}

router.get("/", async (req, res) => {
  const conditions: string[] = ["i.deleted_at is null"];
  const values: unknown[] = [];
  let i = 1;

  if (req.user!.role === "sales") {
    conditions.push(
      `i.client_id in (select c.id from clients c join leads l on l.id = c.converted_from_lead_id where l.assigned_to = $${i++})`
    );
    values.push(req.user!.id);
  }
  if (req.query.status) {
    conditions.push(`i.status = $${i++}`);
    values.push(req.query.status);
  }
  if (req.query.client_id) {
    conditions.push(`i.client_id = $${i++}`);
    values.push(req.query.client_id);
  }
  if (req.query.tally_sync_status) {
    conditions.push(`i.tally_sync_status = $${i++}`);
    values.push(req.query.tally_sync_status);
  }
  // Payment follow-ups — only ever meaningful for invoices that still owe
  // money, same as Leads' equivalent filter never involving Won/Lost leads.
  if (req.query.followup === "today") {
    conditions.push(`i.next_followup_date = current_date`, `${BALANCE_EXPR} > 0`);
  } else if (req.query.followup === "overdue") {
    conditions.push(`i.next_followup_date < current_date`, `${BALANCE_EXPR} > 0`);
  } else if (req.query.followup === "upcoming") {
    conditions.push(`i.next_followup_date > current_date`, `${BALANCE_EXPR} > 0`);
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page) || 20));
  const offset = (page - 1) * perPage;
  const whereClause = conditions.join(" and ");

  const countResult = await pool.query(`select count(*) from invoices i where ${whereClause}`, values);
  const dataResult = await pool.query(
    `select i.*, ${BALANCE_EXPR} as balance
     from invoices i where ${whereClause}
     order by i.created_at desc limit $${i} offset $${i + 1}`,
    [...values, perPage, offset]
  );

  res.json({ data: dataResult.rows, total: Number(countResult.rows[0].count), page, per_page: perPage });
});

router.get("/summary", async (req, res) => {
  const conditions: string[] = ["i.deleted_at is null"];
  const values: unknown[] = [];
  let i = 1;

  if (req.user!.role === "sales") {
    conditions.push(
      `i.client_id in (select c.id from clients c join leads l on l.id = c.converted_from_lead_id where l.assigned_to = $${i++})`
    );
    values.push(req.user!.id);
  }
  const whereClause = conditions.join(" and ");

  const result = await pool.query(
    `select
       coalesce(sum(i.total) filter (where i.status <> 'Draft' and i.status <> 'Cancelled'), 0) as total_invoiced,
       coalesce(sum((select coalesce(sum(p.amount), 0) from payments p where p.invoice_id = i.id)), 0) as amount_received,
       coalesce(sum(${BALANCE_EXPR}) filter (where i.status <> 'Draft' and i.status <> 'Cancelled'), 0) as outstanding,
       count(*) filter (where i.status = 'Overdue') as overdue_count
     from invoices i
     where ${whereClause}`,
    values
  );
  const row = result.rows[0];
  res.json({
    total_invoiced: Number(row.total_invoiced),
    amount_received: Number(row.amount_received),
    outstanding: Number(row.outstanding),
    overdue_count: Number(row.overdue_count),
  });
});

// Reads a Tally-exported invoice PDF's text layer and returns best-effort
// extracted fields plus a client match and a duplicate check — nothing is
// written to the database here. The caller reviews/edits the draft and
// saves it through the normal POST /invoices path, same as manual entry.
router.post("/import-pdf", requireRole("admin", "finance"), pdfUpload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "no_file" });
    return;
  }
  if (req.file.mimetype !== "application/pdf") {
    res.status(400).json({ error: "not_a_pdf" });
    return;
  }

  let text: string;
  try {
    const parsed = await pdfParse(req.file.buffer);
    text = parsed.text;
  } catch {
    res.status(400).json({ error: "unreadable_pdf", message: "Couldn't read this PDF — it may be a scanned image with no selectable text." });
    return;
  }

  const extracted = parseInvoicePdfText(text);

  let matchedClient: { id: string; company: string } | null = null;
  if (extracted.party_name) {
    const clientMatch = await pool.query(
      `select id, company from clients
       where deleted_at is null and (company ilike $1 or tally_ledger_name ilike $1)
       order by (tally_ledger_name ilike $1) desc
       limit 1`,
      [`%${extracted.party_name}%`]
    );
    if (clientMatch.rows.length > 0) matchedClient = clientMatch.rows[0];
  }

  let duplicate: { id: string; invoice_number: string | null } | null = null;
  if (extracted.invoice_number) {
    const byNumber = await pool.query(
      `select id, invoice_number from invoices where invoice_number = $1 and deleted_at is null`,
      [extracted.invoice_number]
    );
    if (byNumber.rows.length > 0) duplicate = byNumber.rows[0];
  }
  if (!duplicate && matchedClient && extracted.total != null && extracted.invoice_date) {
    const byFingerprint = await pool.query(
      `select id, invoice_number from invoices
       where deleted_at is null and client_id = $1 and total = $2 and invoice_date = $3`,
      [matchedClient.id, extracted.total, extracted.invoice_date]
    );
    if (byFingerprint.rows.length > 0) duplicate = byFingerprint.rows[0];
  }

  res.json({
    extracted: {
      invoice_number: extracted.invoice_number,
      invoice_date: extracted.invoice_date,
      due_date: extracted.due_date,
      party_name: extracted.party_name,
      subtotal: extracted.subtotal,
      gst_rate: extracted.gst_rate,
      tax: extracted.tax,
      total: extracted.total,
    },
    matched_client: matchedClient,
    duplicate,
  });
});

async function assertInvoiceReadAccess(req: import("express").Request, invoice: { client_id: string }, res: import("express").Response): Promise<boolean> {
  if (req.user!.role === "sales" && !(await isClientOwnedBySales(invoice.client_id, req.user!.id))) {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

// --- Recurring invoice templates ---
// Registered before "/:id" for the same route-ordering reason as elsewhere
// in this codebase — "/recurring" would otherwise be swallowed as an :id
// value. Generation itself happens in the daily recurringInvoices job, not
// here — these routes only manage the template.

router.get("/recurring", async (_req, res) => {
  const result = await pool.query(
    `select rt.*, c.company as client_company from recurring_invoice_templates rt
     join clients c on c.id = rt.client_id
     where rt.deleted_at is null order by rt.next_run_date`
  );
  res.json(result.rows);
});

const recurringLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  rate: z.number().nonnegative(),
  gst_rate: z.number().nonnegative(),
});

const createRecurringSchema = z.object({
  client_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  contract_id: z.string().uuid().optional(),
  line_items: z.array(recurringLineItemSchema).min(1),
  frequency: z.enum(["monthly", "quarterly", "yearly"]),
  next_run_date: z.string(),
});

router.post("/recurring", requireRole("admin", "finance"), async (req, res) => {
  const parsed = createRecurringSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;
  const clientResult = await pool.query(`select 1 from clients where id = $1 and deleted_at is null`, [f.client_id]);
  if (clientResult.rows.length === 0) {
    res.status(404).json({ error: "client_not_found" });
    return;
  }
  const result = await pool.query(
    `insert into recurring_invoice_templates (client_id, project_id, contract_id, line_items, frequency, next_run_date, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [f.client_id, f.project_id ?? null, f.contract_id ?? null, JSON.stringify(f.line_items), f.frequency, f.next_run_date, req.user!.id]
  );
  res.status(201).json(result.rows[0]);
});

const updateRecurringSchema = z.object({
  line_items: z.array(recurringLineItemSchema).min(1).optional(),
  frequency: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  next_run_date: z.string().optional(),
  is_active: z.boolean().optional(),
});

router.patch("/recurring/:id", requireRole("admin", "finance"), async (req, res) => {
  const parsed = updateRecurringSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (f.line_items !== undefined) { setClauses.push(`line_items = $${i++}`); values.push(JSON.stringify(f.line_items)); }
  if (f.frequency !== undefined) { setClauses.push(`frequency = $${i++}`); values.push(f.frequency); }
  if (f.next_run_date !== undefined) { setClauses.push(`next_run_date = $${i++}`); values.push(f.next_run_date); }
  if (f.is_active !== undefined) { setClauses.push(`is_active = $${i++}`); values.push(f.is_active); }
  if (setClauses.length === 0) {
    res.status(400).json({ error: "no_fields_to_update" });
    return;
  }
  setClauses.push(`updated_at = now()`);
  values.push(req.params.id);
  const result = await pool.query(
    `update recurring_invoice_templates set ${setClauses.join(", ")} where id = $${i} and deleted_at is null returning *`,
    values
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(result.rows[0]);
});

router.delete("/recurring/:id", requireRole("admin", "finance"), async (req, res) => {
  const result = await pool.query(
    `update recurring_invoice_templates set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null returning id`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

router.get("/:id", async (req, res) => {
  const result = await pool.query(
    `select i.*, ${BALANCE_EXPR} as balance from invoices i where i.id = $1 and i.deleted_at is null`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const invoice = result.rows[0];
  if (!(await assertInvoiceReadAccess(req, invoice, res))) return;

  const lineItemsResult = await pool.query(`select * from invoice_line_items where invoice_id = $1 order by created_at`, [
    req.params.id,
  ]);
  const paymentsResult = await pool.query(`select * from payments where invoice_id = $1 order by payment_date`, [
    req.params.id,
  ]);
  const creditNotesResult = await pool.query(`select * from credit_notes where invoice_id = $1 order by created_at`, [
    req.params.id,
  ]);

  res.json({
    ...invoice,
    line_items: lineItemsResult.rows,
    payments: paymentsResult.rows,
    credit_notes: creditNotesResult.rows,
  });
});

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  rate: z.number().nonnegative(),
  gst_rate: z.number().nonnegative().default(18),
});

const createInvoiceSchema = z.object({
  client_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  contract_id: z.string().uuid().optional(),
  invoice_date: z.string().optional(),
  due_date: z.string().optional(),
  line_items: z.array(lineItemSchema).min(1),
});

router.post("/", requireRole("admin", "finance"), async (req, res) => {
  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  const clientResult = await pool.query(`select tally_ledger_name from clients where id = $1 and deleted_at is null`, [
    f.client_id,
  ]);
  if (clientResult.rows.length === 0) {
    res.status(404).json({ error: "client_not_found" });
    return;
  }
  if (!clientResult.rows[0].tally_ledger_name) {
    res.status(400).json({
      error: "tally_ledger_name_required",
      message: "Client must have a tally_ledger_name set before an invoice can be created for them.",
    });
    return;
  }

  const { subtotal, tax, total, lines } = computeTotals(f.line_items);

  const client = await pool.connect();
  try {
    await client.query("begin");
    const invoiceResult = await client.query(
      `insert into invoices (client_id, project_id, contract_id, invoice_date, due_date, subtotal, tax, total, created_by, updated_by)
       values ($1,$2,$3,coalesce($4,current_date),$5,$6,$7,$8,$9,$9)
       returning *`,
      [f.client_id, f.project_id ?? null, f.contract_id ?? null, f.invoice_date ?? null, f.due_date ?? null, subtotal, tax, total, req.user!.id]
    );
    const invoice = invoiceResult.rows[0];

    for (const l of lines) {
      await client.query(
        `insert into invoice_line_items (invoice_id, description, quantity, rate, gst_rate)
         values ($1,$2,$3,$4,$5)`,
        [invoice.id, l.description, l.quantity, l.rate, l.gst_rate]
      );
    }

    await client.query("commit");
    await writeActivityLog(pool, {
      entityType: "invoice",
      entityId: invoice.id,
      actorId: req.user!.id,
      action: "created",
      detail: { total },
    });
    res.status(201).json(invoice);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
});

const followupSchema = z.object({
  next_followup_date: z.string().nullable(),
});

// Deliberately separate from the general PATCH /:id — payment follow-up
// tracking is orthogonal to the Draft/Final lock (a Final invoice is
// exactly the kind you'd be following up on, so this has to work
// regardless of lock state, unlike line items/amounts).
router.patch("/:id/followup", async (req, res) => {
  const parsed = followupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const result = await pool.query(
    `update invoices set next_followup_date = $1, updated_by = $2, updated_at = now()
     where id = $3 and deleted_at is null returning id, next_followup_date`,
    [parsed.data.next_followup_date, req.user!.id, req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(result.rows[0]);
});

router.get("/:id/followup.ics", async (req, res) => {
  const result = await pool.query(
    `select i.*, c.company as client_company from invoices i
     left join clients c on c.id = i.client_id
     where i.id = $1 and i.deleted_at is null`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const inv = result.rows[0];
  if (!inv.next_followup_date) {
    res.status(400).json({ error: "no_followup_date" });
    return;
  }
  const ics = buildSingleEventIcs({
    uid: inv.id,
    date: inv.next_followup_date,
    summary: `Payment follow-up — ${inv.client_company ?? "Client"}${inv.invoice_number ? ` (${inv.invoice_number})` : ""}`,
    description: `Balance due: ${inv.total}`,
  });
  res.setHeader("Content-Type", "text/calendar");
  res.setHeader("Content-Disposition", `attachment; filename="payment-followup-${(inv.invoice_number ?? "draft").replace(/[^a-z0-9]/gi, "-")}.ics"`);
  res.send(ics);
});

const updateDraftSchema = z.object({
  client_id: z.string().uuid().optional(),
  project_id: z.string().uuid().nullable().optional(),
  contract_id: z.string().uuid().nullable().optional(),
  invoice_date: z.string().optional(),
  due_date: z.string().nullable().optional(),
  line_items: z.array(lineItemSchema).min(1).optional(),
});

const updateNonDraftSchema = z.object({
  status: z.enum(["Sent", "Partial", "Paid", "Overdue", "Cancelled"]).optional(),
});

router.patch("/:id", requireRole("admin", "finance"), async (req, res) => {
  const existingResult = await pool.query(`select * from invoices where id = $1 and deleted_at is null`, [req.params.id]);
  if (existingResult.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const existing = existingResult.rows[0];

  if (existing.status !== "Draft") {
    const parsed = updateNonDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    if (Object.keys(req.body).some((k) => !["status"].includes(k))) {
      res.status(409).json({
        error: "invoice_locked",
        message: "Finalized invoices cannot have line items or amounts edited. Use a credit note instead.",
      });
      return;
    }
    if (!parsed.data.status) {
      res.status(400).json({ error: "no_fields_to_update" });
      return;
    }

    const result = await pool.query(
      `update invoices set status = $1, updated_by = $2, updated_at = now() where id = $3 returning *`,
      [parsed.data.status, req.user!.id, req.params.id]
    );
    res.json(result.rows[0]);
    return;
  }

  const parsed = updateDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("begin");

    let subtotal = existing.subtotal;
    let tax = existing.tax;
    let total = existing.total;

    if (f.line_items) {
      const computed = computeTotals(f.line_items);
      subtotal = computed.subtotal;
      tax = computed.tax;
      total = computed.total;
      await client.query(`delete from invoice_line_items where invoice_id = $1`, [req.params.id]);
      for (const l of computed.lines) {
        await client.query(
          `insert into invoice_line_items (invoice_id, description, quantity, rate, gst_rate) values ($1,$2,$3,$4,$5)`,
          [req.params.id, l.description, l.quantity, l.rate, l.gst_rate]
        );
      }
    }

    const result = await client.query(
      `update invoices set
         client_id = coalesce($1, client_id),
         project_id = case when $2::boolean then $3 else project_id end,
         contract_id = case when $4::boolean then $5 else contract_id end,
         invoice_date = coalesce($6, invoice_date),
         due_date = case when $7::boolean then $8 else due_date end,
         subtotal = $9, tax = $10, total = $11,
         updated_by = $12, updated_at = now()
       where id = $13
       returning *`,
      [
        f.client_id ?? null,
        "project_id" in f, f.project_id ?? null,
        "contract_id" in f, f.contract_id ?? null,
        f.invoice_date ?? null,
        "due_date" in f, f.due_date ?? null,
        subtotal, tax, total,
        req.user!.id,
        req.params.id,
      ]
    );

    await client.query("commit");
    res.json(result.rows[0]);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
});

router.delete("/:id", requireRole("admin", "finance"), async (req, res) => {
  const result = await pool.query(
    `update invoices set deleted_at = now(), updated_by = $1, updated_at = now()
     where id = $2 and status = 'Draft' and deleted_at is null returning id`,
    [req.user!.id, req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found_or_not_draft" });
    return;
  }
  res.json({ ok: true });
});

// POST /api/invoices/:id/finalize — atomic sequential invoice numbering, even under concurrency.
router.post("/:id/finalize", requireRole("admin", "finance"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const invoiceResult = await client.query(
      `select * from invoices where id = $1 and deleted_at is null for update`,
      [req.params.id]
    );
    if (invoiceResult.rows.length === 0) {
      await client.query("rollback");
      res.status(404).json({ error: "not_found" });
      return;
    }
    const invoice = invoiceResult.rows[0];

    if (invoice.status !== "Draft") {
      await client.query("rollback");
      res.status(409).json({ error: "not_draft", message: "Only Draft invoices can be finalized." });
      return;
    }

    const lineItemsResult = await client.query(`select count(*) from invoice_line_items where invoice_id = $1`, [
      invoice.id,
    ]);
    if (Number(lineItemsResult.rows[0].count) === 0) {
      await client.query("rollback");
      res.status(400).json({ error: "no_line_items", message: "Cannot finalize an invoice with no line items." });
      return;
    }

    const year = new Date(invoice.invoice_date).getFullYear();
    await client.query(`insert into invoice_number_counters (year) values ($1) on conflict (year) do nothing`, [year]);
    const counterResult = await client.query(
      `update invoice_number_counters set last_number = last_number + 1 where year = $1 returning last_number`,
      [year]
    );
    const seq = counterResult.rows[0].last_number;
    const invoiceNumber = `ZI-${year}-${String(seq).padStart(3, "0")}`;

    const updateResult = await client.query(
      `update invoices set
         invoice_number = $1, status = 'Final', finalized_at = now(), finalized_by = $2,
         updated_by = $2, updated_at = now()
       where id = $3 returning *`,
      [invoiceNumber, req.user!.id, invoice.id]
    );

    await writeActivityLog(client, {
      entityType: "invoice",
      entityId: invoice.id,
      actorId: req.user!.id,
      action: "status_changed",
      detail: { from: "Draft", to: "Final", invoice_number: invoiceNumber },
    });

    await client.query("commit");
    res.json(updateResult.rows[0]);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
});

const creditNoteSchema = z.object({
  reason: z.string().min(1),
  amount: z.number().positive(),
});

router.post("/:id/credit-notes", requireRole("admin", "finance"), async (req, res) => {
  const parsed = creditNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }

  const invoiceResult = await pool.query(`select * from invoices where id = $1 and deleted_at is null`, [req.params.id]);
  if (invoiceResult.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (invoiceResult.rows[0].status === "Draft") {
    res.status(400).json({ error: "invoice_not_finalized", message: "Credit notes only apply to finalized invoices." });
    return;
  }

  const result = await pool.query(
    `insert into credit_notes (invoice_id, reason, amount, created_by) values ($1,$2,$3,$4) returning *`,
    [req.params.id, parsed.data.reason, parsed.data.amount, req.user!.id]
  );
  res.status(201).json(result.rows[0]);
});

// --- Phase 6a: manual payment recording + Tally export/mark-synced ---

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  payment_date: z.string(),
  method: z.string().optional(),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/:id/payments", requireRole("admin", "finance"), async (req, res) => {
  const parsed = recordPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("begin");

    const invoiceResult = await client.query(`select * from invoices where id = $1 and deleted_at is null for update`, [
      req.params.id,
    ]);
    if (invoiceResult.rows.length === 0) {
      await client.query("rollback");
      res.status(404).json({ error: "not_found" });
      return;
    }
    const invoice = invoiceResult.rows[0];

    if (invoice.status === "Draft" || invoice.status === "Cancelled") {
      await client.query("rollback");
      res.status(400).json({
        error: "invalid_invoice_status",
        message: "Payments can only be recorded against Final (or later) invoices.",
      });
      return;
    }

    const currentBalanceResult = await client.query(
      `select (i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)) as balance
       from invoices i where i.id = $1`,
      [invoice.id]
    );
    const currentBalance = Number(currentBalanceResult.rows[0].balance);
    if (f.amount > currentBalance) {
      await client.query("rollback");
      res.status(400).json({
        error: "amount_exceeds_balance",
        message: `Payment of ${f.amount} exceeds the outstanding balance of ${currentBalance}. Record a partial amount, or issue a credit note first if this is a genuine overpayment/refund.`,
      });
      return;
    }

    const paymentResult = await client.query(
      `insert into payments (invoice_id, amount, payment_date, method, reference_number, notes, source, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,'manual',$7,$7) returning *`,
      [invoice.id, f.amount, f.payment_date, f.method ?? null, f.reference_number ?? null, f.notes ?? null, req.user!.id]
    );

    const balanceResult = await client.query(
      `select (i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)) as balance
       from invoices i where i.id = $1`,
      [invoice.id]
    );
    const balance = Number(balanceResult.rows[0].balance);

    let newStatus = invoice.status;
    if (balance <= 0) {
      newStatus = "Paid";
    } else if (balance < Number(invoice.total)) {
      newStatus = "Partial";
    }

    if (newStatus !== invoice.status) {
      await client.query(`update invoices set status = $1, updated_by = $2, updated_at = now() where id = $3`, [
        newStatus, req.user!.id, invoice.id,
      ]);
      await writeActivityLog(client, {
        entityType: "invoice",
        entityId: invoice.id,
        actorId: req.user!.id,
        action: "status_changed",
        detail: { from: invoice.status, to: newStatus, reason: "payment_recorded" },
      });
    }

    await client.query("commit");
    if (newStatus === "Paid" && invoice.status !== "Paid") {
      fireWebhook("invoice.paid", { invoice_id: invoice.id, invoice_number: invoice.invoice_number, total: invoice.total });
    }
    res.status(201).json({ payment: paymentResult.rows[0], balance, invoice_status: newStatus });
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
});

router.get("/:id/tally-export", requireRole("admin", "finance"), async (req, res) => {
  const result = await pool.query(
    `select i.*, c.tally_ledger_name from invoices i
     join clients c on c.id = i.client_id
     where i.id = $1 and i.deleted_at is null`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const invoice = result.rows[0];

  if (invoice.status === "Draft") {
    res.status(400).json({ error: "invoice_not_finalized", message: "Only Final (or later) invoices can be exported." });
    return;
  }

  const xml = buildTallySalesVoucherXml({
    invoiceNumber: invoice.invoice_number,
    invoiceDate: new Date(invoice.invoice_date).toISOString().slice(0, 10),
    ledgerName: invoice.tally_ledger_name,
    subtotal: Number(invoice.subtotal),
    tax: Number(invoice.tax),
    total: Number(invoice.total),
  });

  await pool.query(`update invoices set tally_sync_status = 'pending' where id = $1`, [invoice.id]);

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoice_number}.xml"`);
  res.send(xml);
});

const markSyncedSchema = z.object({ tally_voucher_ref: z.string().min(1) });

router.post("/:id/mark-synced", requireRole("admin", "finance"), async (req, res) => {
  const parsed = markSyncedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }

  const result = await pool.query(
    `update invoices set tally_sync_status = 'synced', tally_voucher_ref = $1, updated_by = $2, updated_at = now()
     where id = $3 and deleted_at is null and status <> 'Draft'
     returning *`,
    [parsed.data.tally_voucher_ref, req.user!.id, req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found_or_not_finalized" });
    return;
  }
  res.json(result.rows[0]);
});

mountNotesAndAttachments(router, "invoice");

export default router;
