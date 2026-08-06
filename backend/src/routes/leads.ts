import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeActivityLog } from "../lib/activityLog";
import { createNotification } from "../lib/notifications";

const router = Router();

router.use(requireAuth);

const INDUSTRIES = [
  "Banking & Finance", "IT/Software", "Healthcare", "Government",
  "Manufacturing", "E-commerce", "Telecom", "Other",
] as const;
const SOURCES = ["Website", "Referral", "LinkedIn", "Cold Call", "Event", "Email Campaign"] as const;
const STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"] as const;

function assertLeadsAccess(role: string, res: import("express").Response): boolean {
  if (role === "ops") {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

// GET /api/leads — list with server-side search/filter/pagination, scoped by role.
router.get("/", async (req, res) => {
  if (!assertLeadsAccess(req.user!.role, res)) return;

  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page) || 20));
  const offset = (page - 1) * perPage;

  const conditions: string[] = ["deleted_at is null"];
  const values: unknown[] = [];
  let i = 1;

  if (req.user!.role === "sales") {
    conditions.push(`assigned_to = $${i++}`);
    values.push(req.user!.id);
  } else if (req.query.assigned_to) {
    conditions.push(`assigned_to = $${i++}`);
    values.push(req.query.assigned_to);
  }

  if (req.query.search) {
    conditions.push(`(company ilike $${i} or contact_person ilike $${i})`);
    values.push(`%${req.query.search}%`);
    i++;
  }
  if (req.query.status) {
    conditions.push(`status = $${i++}`);
    values.push(req.query.status);
  }
  if (req.query.service_id) {
    conditions.push(`service_id = $${i++}`);
    values.push(req.query.service_id);
  }
  if (req.query.source) {
    conditions.push(`source = $${i++}`);
    values.push(req.query.source);
  }
  if (req.query.industry) {
    conditions.push(`industry = $${i++}`);
    values.push(req.query.industry);
  }
  // Follow-ups screen tabs — computed from next_followup_date vs today on every
  // request, never a stored tag (per Follow-up Automation README).
  if (req.query.followup === "today") {
    conditions.push(`next_followup_date = current_date and status not in ('Won','Lost')`);
  } else if (req.query.followup === "overdue") {
    conditions.push(`next_followup_date < current_date and status not in ('Won','Lost')`);
  } else if (req.query.followup === "upcoming") {
    conditions.push(`next_followup_date > current_date and status not in ('Won','Lost')`);
  } else if (req.query.followup === "all") {
    conditions.push(`next_followup_date is not null and status not in ('Won','Lost')`);
  }

  const whereClause = conditions.join(" and ");

  const countResult = await pool.query(`select count(*) from leads where ${whereClause}`, values);
  const dataResult = await pool.query(
    `select * from leads where ${whereClause} order by created_at desc limit $${i} offset $${i + 1}`,
    [...values, perPage, offset]
  );

  res.json({
    data: dataResult.rows,
    total: Number(countResult.rows[0].count),
    page,
    per_page: perPage,
  });
});

router.get("/:id", async (req, res) => {
  if (!assertLeadsAccess(req.user!.role, res)) return;

  const result = await pool.query(`select * from leads where id = $1 and deleted_at is null`, [req.params.id]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const lead = result.rows[0];
  if (req.user!.role === "sales" && lead.assigned_to !== req.user!.id) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  res.json(lead);
});

const createLeadSchema = z.object({
  company: z.string().min(1),
  contact_person: z.string().min(1),
  email: z.string().email(),
  designation: z.string().optional(),
  mobile: z.string().optional(),
  website: z.string().optional(),
  industry: z.enum(INDUSTRIES).optional(),
  source: z.enum(SOURCES).optional(),
  service_id: z.string().uuid().optional(),
  value_estimate: z.number().nonnegative().optional(),
  assigned_to: z.string().uuid().optional(),
  next_followup_date: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/", requireRole("admin", "sales"), async (req, res) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  const dupCheck = await pool.query(
    `select id, company, email, deleted_at from leads where lower(company) = lower($1) or email = $2`,
    [f.company, f.email]
  );

  const result = await pool.query(
    `insert into leads (
       company, contact_person, email, designation, mobile, website,
       industry, source, service_id, value_estimate, assigned_to,
       next_followup_date, notes, status, created_by, updated_by
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'New',$14,$14)
     returning *`,
    [
      f.company, f.contact_person, f.email, f.designation ?? null, f.mobile ?? null, f.website ?? null,
      f.industry ?? null, f.source ?? null, f.service_id ?? null, f.value_estimate ?? null,
      f.assigned_to ?? null, f.next_followup_date ?? null, f.notes ?? null, req.user!.id,
    ]
  );

  if (f.assigned_to) {
    await createNotification(pool, {
      userId: f.assigned_to,
      type: "lead_assigned",
      entityType: "lead",
      entityId: result.rows[0].id,
      title: `You were assigned a new lead: ${result.rows[0].company}`,
    });
  }

  res.status(201).json({
    lead: result.rows[0],
    duplicate_warning: dupCheck.rows.length > 0 ? dupCheck.rows : undefined,
  });
});

const updateLeadSchema = z.object({
  company: z.string().min(1).optional(),
  contact_person: z.string().min(1).optional(),
  email: z.string().email().optional(),
  designation: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  industry: z.enum(INDUSTRIES).nullable().optional(),
  source: z.enum(SOURCES).nullable().optional(),
  service_id: z.string().uuid().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  lost_reason: z.string().nullable().optional(),
  value_estimate: z.number().nonnegative().nullable().optional(),
  won_value: z.number().nonnegative().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  next_followup_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.patch("/:id", requireRole("admin", "sales"), async (req, res) => {
  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  const client = await pool.connect();
  try {
    const existingResult = await client.query(`select * from leads where id = $1 and deleted_at is null`, [
      req.params.id,
    ]);
    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const existing = existingResult.rows[0];

    if (req.user!.role === "sales" && existing.assigned_to !== req.user!.id) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    if (f.status === "Lost" && !(f.lost_reason ?? existing.lost_reason)) {
      res.status(400).json({
        error: "invalid_input",
        details: { lost_reason: "lost_reason is required when status is set to Lost" },
      });
      return;
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(f)) {
      setClauses.push(`${key} = $${i++}`);
      values.push(value);
    }
    if (setClauses.length === 0) {
      res.status(400).json({ error: "no_fields_to_update" });
      return;
    }
    setClauses.push(`updated_by = $${i++}`, `updated_at = now()`);
    values.push(req.user!.id);
    values.push(req.params.id);

    await client.query("begin");

    const updateResult = await client.query(
      `update leads set ${setClauses.join(", ")} where id = $${i} returning *`,
      values
    );

    if (f.status && f.status !== existing.status) {
      await writeActivityLog(client, {
        entityType: "lead",
        entityId: req.params.id,
        actorId: req.user!.id,
        action: "status_changed",
        detail: { from: existing.status, to: f.status },
      });
    }

    await client.query("commit");

    if (f.assigned_to !== undefined && f.assigned_to && f.assigned_to !== existing.assigned_to) {
      await createNotification(pool, {
        userId: f.assigned_to,
        type: "lead_assigned",
        entityType: "lead",
        entityId: req.params.id,
        title: `You were assigned a lead: ${updateResult.rows[0].company}`,
      });
    }

    res.json(updateResult.rows[0]);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const result = await pool.query(
    `update leads set deleted_at = now(), updated_by = $1, updated_at = now() where id = $2 and deleted_at is null returning id`,
    [req.user!.id, req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

const convertSchema = z.object({
  won_value: z.number().nonnegative().optional(),
  tally_ledger_name: z.string().optional(),
  gstin: z.string().optional(),
  billing_address: z.string().optional(),
});

// POST /api/leads/:id/convert — atomic: lead -> Won + client row created + linked back.
router.post("/:id/convert", requireRole("admin", "sales"), async (req, res) => {
  const parsed = convertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  const client = await pool.connect();
  try {
    const existingResult = await client.query(`select * from leads where id = $1 and deleted_at is null`, [
      req.params.id,
    ]);
    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const lead = existingResult.rows[0];

    if (req.user!.role === "sales" && lead.assigned_to !== req.user!.id) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (lead.converted_to_client_id) {
      res.status(409).json({ error: "already_converted" });
      return;
    }

    const wonValue = f.won_value ?? lead.value_estimate;

    await client.query("begin");

    const clientResult = await client.query(
      `insert into clients (company, gstin, billing_address, tally_ledger_name, converted_from_lead_id, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $6)
       returning *`,
      [lead.company, f.gstin ?? null, f.billing_address ?? null, f.tally_ledger_name ?? null, lead.id, req.user!.id]
    );
    const newClient = clientResult.rows[0];

    await client.query(
      `insert into client_contacts (client_id, name, email, mobile, designation, is_primary, created_by, updated_by)
       values ($1, $2, $3, $4, $5, true, $6, $6)`,
      [newClient.id, lead.contact_person, lead.email, lead.mobile, lead.designation, req.user!.id]
    );

    await client.query(
      `update leads set status = 'Won', won_value = $1, converted_to_client_id = $2, updated_by = $3, updated_at = now()
       where id = $4`,
      [wonValue, newClient.id, req.user!.id, lead.id]
    );

    await writeActivityLog(client, {
      entityType: "lead",
      entityId: lead.id,
      actorId: req.user!.id,
      action: "status_changed",
      detail: { from: lead.status, to: "Won" },
    });
    await writeActivityLog(client, {
      entityType: "client",
      entityId: newClient.id,
      actorId: req.user!.id,
      action: "created",
      detail: { converted_from_lead_id: lead.id },
    });

    await client.query("commit");
    res.status(201).json({ client: newClient, lead_id: lead.id });
  } catch (err) {
    await client.query("rollback");
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "client_already_exists", message: err.message });
      return;
    }
    throw err;
  } finally {
    client.release();
  }
});

// --- Phase 7: log interaction + message template rendering ---

const logInteractionSchema = z.object({
  note: z.string().min(1),
  next_followup_date: z.string().optional(),
  no_further_followup: z.boolean().optional(),
});

router.post("/:id/log-interaction", requireRole("admin", "sales"), async (req, res) => {
  const parsed = logInteractionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  if (!f.next_followup_date && !f.no_further_followup) {
    res.status(400).json({
      error: "invalid_input",
      details: { next_followup_date: "Set a next follow-up date, or explicitly mark no further follow-up needed." },
    });
    return;
  }

  const client = await pool.connect();
  try {
    const existingResult = await client.query(`select * from leads where id = $1 and deleted_at is null`, [
      req.params.id,
    ]);
    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const existing = existingResult.rows[0];

    if (req.user!.role === "sales" && existing.assigned_to !== req.user!.id) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    if (f.no_further_followup && !["Won", "Lost"].includes(existing.status)) {
      res.status(400).json({
        error: "invalid_input",
        details: { no_further_followup: "Only allowed when the lead's status is Won or Lost." },
      });
      return;
    }

    const nextFollowup = f.no_further_followup ? null : f.next_followup_date;
    const mergedNotes = existing.notes ? `${existing.notes}\n\n[${new Date().toISOString()}] ${f.note}` : f.note;

    await client.query("begin");
    const updateResult = await client.query(
      `update leads set notes = $1, next_followup_date = $2, updated_by = $3, updated_at = now() where id = $4 returning *`,
      [mergedNotes, nextFollowup, req.user!.id, req.params.id]
    );
    await writeActivityLog(client, {
      entityType: "lead",
      entityId: req.params.id,
      actorId: req.user!.id,
      action: "note_added",
      detail: { note: f.note, next_followup_date: nextFollowup },
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

function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? "");
}

router.get("/:id/templates/:templateId/render", async (req, res) => {
  if (!assertLeadsAccess(req.user!.role, res)) return;

  const leadResult = await pool.query(
    `select l.*, s.name as service_name from leads l left join services s on s.id = l.service_id
     where l.id = $1 and l.deleted_at is null`,
    [req.params.id]
  );
  if (leadResult.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const lead = leadResult.rows[0];
  if (req.user!.role === "sales" && lead.assigned_to !== req.user!.id) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const templateResult = await pool.query(`select * from message_templates where id = $1`, [req.params.templateId]);
  if (templateResult.rows.length === 0) {
    res.status(404).json({ error: "template_not_found" });
    return;
  }
  const template = templateResult.rows[0];

  const placeholderValues: Record<string, string> = {
    name: lead.contact_person ?? "",
    service: lead.service_name ?? "",
    amount: lead.value_estimate ? `₹${Number(lead.value_estimate).toLocaleString("en-IN")}` : "",
    date: lead.next_followup_date ? new Date(lead.next_followup_date).toLocaleDateString("en-IN") : "",
  };

  res.json({
    subject: template.subject ? fillTemplate(template.subject, placeholderValues) : null,
    body: fillTemplate(template.body, placeholderValues),
  });
});

export default router;
