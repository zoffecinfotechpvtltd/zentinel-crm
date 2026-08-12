import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { mountNotesAndAttachments } from "../lib/attachNotesAndFiles";
import { writeActivityLog } from "../lib/activityLog";

const router = Router();

router.use(requireAuth);

// Sales' job ends at a Won lead — the client, its pricing, and its contracts
// are Finance/Ops territory from there on. Blocked router-wide (rather than
// per-field) so pricing can never leak to Sales through this API regardless
// of which endpoint they hit.
router.use((req, res, next) => {
  if (req.user!.role === "sales") {
    res.status(403).json({ error: "forbidden", message: "Clients and pricing are managed by Finance/Ops. Sales works Leads through to conversion." });
    return;
  }
  next();
});

// Computed status per Clients README: Active if not archived and at least one
// contract has no end_date or an end_date in the future; Inactive otherwise.
// Never stored — always derived at query time.
const STATUS_EXPR = `
  case
    when c.is_archived then 'Inactive'
    when exists (
      select 1 from contracts ct
      where ct.client_id = c.id and ct.deleted_at is null
        and (ct.end_date is null or ct.end_date >= current_date)
    ) then 'Active'
    else 'Inactive'
  end
`;

router.get("/", async (req, res) => {
  const conditions: string[] = ["c.deleted_at is null"];
  const values: unknown[] = [];
  let i = 1;

  if (req.query.search) {
    conditions.push(`c.company ilike $${i++}`);
    values.push(`%${req.query.search}%`);
  }
  if (req.query.status === "Active" || req.query.status === "Inactive") {
    conditions.push(`(${STATUS_EXPR}) = $${i++}`);
    values.push(req.query.status);
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page) || 20));
  const offset = (page - 1) * perPage;

  const whereClause = conditions.join(" and ");
  const countResult = await pool.query(`select count(*) from clients c where ${whereClause}`, values);
  const dataResult = await pool.query(
    `select c.*, (${STATUS_EXPR}) as status,
       (select cc.name from client_contacts cc where cc.client_id = c.id and cc.is_primary and cc.deleted_at is null limit 1) as primary_contact_name,
       (select cc.email from client_contacts cc where cc.client_id = c.id and cc.is_primary and cc.deleted_at is null limit 1) as primary_contact_email,
       (select cc.mobile from client_contacts cc where cc.client_id = c.id and cc.is_primary and cc.deleted_at is null limit 1) as primary_contact_mobile,
       (select s.name from contracts ct join services s on s.id = ct.service_id
          where ct.client_id = c.id and ct.deleted_at is null order by ct.created_at desc limit 1) as primary_service_name,
       (select coalesce(sum(ct.value), 0) from contracts ct where ct.client_id = c.id and ct.deleted_at is null) as contract_value_total,
       (select max(ct.end_date) from contracts ct where ct.client_id = c.id and ct.deleted_at is null) as contract_end_date
     from clients c
     where ${whereClause}
     order by c.created_at desc
     limit $${i} offset $${i + 1}`,
    [...values, perPage, offset]
  );

  res.json({ data: dataResult.rows, total: Number(countResult.rows[0].count), page, per_page: perPage });
});

// Registered before "/:id" for the same route-ordering reason as elsewhere
// in this codebase. company has a DB-level unique constraint, so exact
// duplicates can't exist here the way they can for Leads — this instead
// catches near-duplicates: same GSTIN, or the same company name once
// punctuation/spacing/case differences are stripped out ("Acme Pvt. Ltd."
// vs "Acme Pvt Ltd").
router.get("/duplicates", requireRole("admin"), async (_req, res) => {
  const result = await pool.query(
    `select
       c1.id as id1, c1.company as company1, c1.gstin as gstin1, c1.created_at as created_at1,
       c2.id as id2, c2.company as company2, c2.gstin as gstin2, c2.created_at as created_at2
     from clients c1
     join clients c2 on c1.id < c2.id
       and c1.deleted_at is null and c2.deleted_at is null
       and (
         (c1.gstin is not null and c1.gstin = c2.gstin)
         or regexp_replace(lower(c1.company), '[^a-z0-9]', '', 'g') = regexp_replace(lower(c2.company), '[^a-z0-9]', '', 'g')
       )
     order by c1.created_at desc`
  );
  res.json(
    result.rows.map((r) => ({
      client1: { id: r.id1, company: r.company1, gstin: r.gstin1, created_at: r.created_at1 },
      client2: { id: r.id2, company: r.company2, gstin: r.gstin2, created_at: r.created_at2 },
    }))
  );
});

router.get("/:id", async (req, res) => {
  const clientResult = await pool.query(
    `select c.*, (${STATUS_EXPR}) as status from clients c where c.id = $1 and c.deleted_at is null`,
    [req.params.id]
  );
  if (clientResult.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const client = clientResult.rows[0];

  const contactsResult = await pool.query(
    `select * from client_contacts where client_id = $1 and deleted_at is null order by is_primary desc, name`,
    [req.params.id]
  );
  const contractsResult = await pool.query(
    `select * from contracts where client_id = $1 and deleted_at is null order by start_date desc nulls last`,
    [req.params.id]
  );

  let originatingLead = null;
  if (client.converted_from_lead_id) {
    const leadResult = await pool.query(
      `select id, company, contact_person, status, created_at from leads where id = $1`,
      [client.converted_from_lead_id]
    );
    originatingLead = leadResult.rows[0] ?? null;
  }

  let originatingOpportunity = null;
  if (client.converted_from_opportunity_id) {
    const opportunityResult = await pool.query(
      `select id, kind, company, stage, lead_date, created_at from opportunities where id = $1`,
      [client.converted_from_opportunity_id]
    );
    originatingOpportunity = opportunityResult.rows[0] ?? null;
  }

  // Every opportunity linked to this client (not just the one it originally
  // converted from) — upsell/renewal opportunities opened after conversion
  // show up here too, so a Client's full pipeline history is visible in
  // one place.
  const opportunitiesResult = await pool.query(
    `select id, kind, company, stage, follow_up_date, lead_date, created_at from opportunities where client_id = $1 order by created_at desc`,
    [req.params.id]
  );
  const projectsResult = await pool.query(
    `select id, name, status, progress, due_date from projects where client_id = $1 and deleted_at is null order by created_at desc`,
    [req.params.id]
  );
  const invoicesResult = await pool.query(
    `select id, invoice_number, status, total, due_date from invoices where client_id = $1 and deleted_at is null order by created_at desc`,
    [req.params.id]
  );

  res.json({
    ...client,
    contacts: contactsResult.rows,
    contracts: contractsResult.rows,
    contract_value_total: contractsResult.rows.reduce((sum: number, c: { value: string | null }) => sum + Number(c.value ?? 0), 0),
    originating_lead: originatingLead,
    originating_opportunity: originatingOpportunity,
    opportunities: opportunitiesResult.rows,
    projects: projectsResult.rows,
    invoices: invoicesResult.rows,
  });
});

const createClientSchema = z.object({
  company: z.string().min(1),
  gstin: z.string().optional(),
  billing_address: z.string().optional(),
  tally_ledger_name: z.string().optional(),
});

router.post("/", requireRole("admin"), async (req, res) => {
  const parsed = createClientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;
  const result = await pool.query(
    `insert into clients (company, gstin, billing_address, tally_ledger_name, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$5) returning *`,
    [f.company, f.gstin ?? null, f.billing_address ?? null, f.tally_ledger_name ?? null, req.user!.id]
  );
  await writeActivityLog(pool, {
    entityType: "client",
    entityId: result.rows[0].id,
    actorId: req.user!.id,
    action: "created",
    detail: { company: result.rows[0].company },
  });
  res.status(201).json(result.rows[0]);
});

const updateClientSchema = z.object({
  company: z.string().min(1).optional(),
  gstin: z.string().nullable().optional(),
  billing_address: z.string().nullable().optional(),
  tally_ledger_name: z.string().nullable().optional(),
  is_archived: z.boolean().optional(),
});

router.patch("/:id", requireRole("admin", "finance"), async (req, res) => {
  const parsed = updateClientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  if (f.is_archived !== undefined && req.user!.role !== "admin") {
    res.status(403).json({ error: "forbidden", message: "Only Admin can archive/unarchive a client." });
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

  const result = await pool.query(
    `update clients set ${setClauses.join(", ")} where id = $${i} and deleted_at is null returning *`,
    values
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(result.rows[0]);
});

const mergeSchema = z.object({ merge_id: z.string().uuid() });

// Folds a duplicate client into this one: contacts, contracts, projects,
// invoices, opportunities, notes, attachments, and its lead-conversion
// history all move to the kept client, then the duplicate is soft-deleted.
router.post("/:id/merge", requireRole("admin"), async (req, res) => {
  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const keepId = req.params.id;
  const mergeId = parsed.data.merge_id;
  if (keepId === mergeId) {
    res.status(400).json({ error: "invalid_input", details: { merge_id: "Cannot merge a client into itself" } });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const rowsResult = await client.query(
      `select id, company, converted_from_lead_id, converted_from_opportunity_id from clients where id = any($1) and deleted_at is null for update`,
      [[keepId, mergeId]]
    );
    if (rowsResult.rows.length !== 2) {
      await client.query("rollback");
      res.status(404).json({ error: "not_found" });
      return;
    }
    const mergedClient = rowsResult.rows.find((r) => r.id === mergeId)!;

    // Only one contact per client can be flagged primary (DB-enforced) —
    // clear the merged client's flag before moving its contacts over so
    // that constraint doesn't reject the update if the kept client already
    // has its own primary contact.
    await client.query(`update client_contacts set is_primary = false where client_id = $1 and is_primary = true`, [mergeId]);
    await client.query(`update client_contacts set client_id = $1 where client_id = $2`, [keepId, mergeId]);
    await client.query(`update contracts set client_id = $1 where client_id = $2`, [keepId, mergeId]);
    await client.query(`update projects set client_id = $1 where client_id = $2`, [keepId, mergeId]);
    await client.query(`update invoices set client_id = $1 where client_id = $2`, [keepId, mergeId]);
    await client.query(`update opportunities set client_id = $1 where client_id = $2`, [keepId, mergeId]);
    await client.query(`update notes set entity_id = $1 where entity_type = 'client' and entity_id = $2`, [keepId, mergeId]);
    await client.query(`update attachments set entity_id = $1 where entity_type = 'client' and entity_id = $2`, [keepId, mergeId]);
    await client.query(`update notifications set entity_id = $1 where entity_type = 'client' and entity_id = $2`, [keepId, mergeId]);
    await client.query(`update activity_log set entity_id = $1 where entity_type = 'client' and entity_id = $2`, [keepId, mergeId]);
    await client.query(`update leads set converted_to_client_id = $1 where converted_to_client_id = $2`, [keepId, mergeId]);
    await client.query(
      `update clients set converted_from_lead_id = coalesce(converted_from_lead_id, $2), converted_from_opportunity_id = coalesce(converted_from_opportunity_id, $3) where id = $1`,
      [keepId, mergedClient.converted_from_lead_id, mergedClient.converted_from_opportunity_id]
    );
    await client.query(
      `update clients set deleted_at = now(), updated_by = $1, updated_at = now() where id = $2`,
      [req.user!.id, mergeId]
    );

    await writeActivityLog(client, {
      entityType: "client",
      entityId: keepId,
      actorId: req.user!.id,
      action: "merged",
      detail: { merged_client_id: mergeId, merged_company: mergedClient.company },
    });

    await client.query("commit");
    res.json({ ok: true });
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const result = await pool.query(
    `update clients set deleted_at = now(), updated_by = $1, updated_at = now() where id = $2 and deleted_at is null returning id`,
    [req.user!.id, req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

// --- client_contacts ---

const createContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  mobile: z.string().optional(),
  designation: z.string().optional(),
  is_primary: z.boolean().optional().default(false),
});

router.post("/:id/contacts", requireRole("admin", "finance"), async (req, res) => {
  const parsed = createContactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("begin");
    if (f.is_primary) {
      await client.query(`update client_contacts set is_primary = false where client_id = $1`, [req.params.id]);
    }
    const result = await client.query(
      `insert into client_contacts (client_id, name, email, mobile, designation, is_primary, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$7) returning *`,
      [req.params.id, f.name, f.email ?? null, f.mobile ?? null, f.designation ?? null, f.is_primary, req.user!.id]
    );
    await client.query("commit");
    await writeActivityLog(pool, {
      entityType: "client",
      entityId: req.params.id,
      actorId: req.user!.id,
      action: "contact_added",
      detail: { name: f.name },
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
});

const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  mobile: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  is_primary: z.boolean().optional(),
});

// Making a contact primary is a single action: this handler both sets the
// new primary and clears the old one atomically, per the Clients AC.
router.patch("/:id/contacts/:contactId", requireRole("admin", "finance"), async (req, res) => {
  const parsed = updateContactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("begin");
    if (f.is_primary === true) {
      await client.query(`update client_contacts set is_primary = false where client_id = $1`, [req.params.id]);
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(f)) {
      setClauses.push(`${key} = $${i++}`);
      values.push(value);
    }
    setClauses.push(`updated_by = $${i++}`, `updated_at = now()`);
    values.push(req.user!.id);
    values.push(req.params.contactId, req.params.id);

    const result = await client.query(
      `update client_contacts set ${setClauses.join(", ")}
       where id = $${i} and client_id = $${i + 1} and deleted_at is null returning *`,
      values
    );
    if (result.rows.length === 0) {
      await client.query("rollback");
      res.status(404).json({ error: "not_found" });
      return;
    }
    await client.query("commit");
    res.json(result.rows[0]);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
});

router.delete("/:id/contacts/:contactId", requireRole("admin", "finance"), async (req, res) => {
  const result = await pool.query(
    `update client_contacts set deleted_at = now(), updated_by = $1, updated_at = now()
     where id = $2 and client_id = $3 and deleted_at is null returning id`,
    [req.user!.id, req.params.contactId, req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

// --- contracts ---

const createContractSchema = z.object({
  service_id: z.string().uuid().optional(),
  value: z.number().nonnegative().optional(),
  start_date: z.string().optional(),
  end_date: z.string().nullable().optional(),
  status: z.enum(["active", "completed", "cancelled"]).optional().default("active"),
});

router.post("/:id/contracts", requireRole("admin", "finance"), async (req, res) => {
  const parsed = createContractSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  // Every field here is individually optional (a contract can be added
  // before its value/dates are finalized) — but a submission with NONE of
  // them set is never intentional, it's a stray click that silently created
  // a blank row with nothing to identify it by.
  if (!f.service_id && f.value == null) {
    res.status(400).json({
      error: "invalid_input",
      details: { service_id: "Pick a service or enter a value — a contract can't be completely blank" },
    });
    return;
  }
  const result = await pool.query(
    `insert into contracts (client_id, service_id, value, start_date, end_date, status, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$7) returning *`,
    [req.params.id, f.service_id ?? null, f.value ?? null, f.start_date ?? null, f.end_date ?? null, f.status, req.user!.id]
  );
  await writeActivityLog(pool, {
    entityType: "client",
    entityId: req.params.id,
    actorId: req.user!.id,
    action: "contract_added",
    detail: { value: f.value ?? null },
  });
  res.status(201).json(result.rows[0]);
});

const updateContractSchema = z.object({
  service_id: z.string().uuid().nullable().optional(),
  value: z.number().nonnegative().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  status: z.enum(["active", "completed", "cancelled"]).optional(),
});

router.patch("/:id/contracts/:contractId", requireRole("admin", "finance"), async (req, res) => {
  const parsed = updateContractSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;
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
  values.push(req.params.contractId, req.params.id);

  const result = await pool.query(
    `update contracts set ${setClauses.join(", ")}
     where id = $${i} and client_id = $${i + 1} and deleted_at is null returning *`,
    values
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(result.rows[0]);
});

router.delete("/:id/contracts/:contractId", requireRole("admin", "finance"), async (req, res) => {
  const result = await pool.query(
    `update contracts set deleted_at = now(), updated_by = $1, updated_at = now()
     where id = $2 and client_id = $3 and deleted_at is null returning id`,
    [req.user!.id, req.params.contractId, req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await writeActivityLog(pool, {
    entityType: "client",
    entityId: req.params.id,
    actorId: req.user!.id,
    action: "contract_removed",
    detail: { contract_id: req.params.contractId },
  });
  res.json({ ok: true });
});

mountNotesAndAttachments(router, "client");

export default router;
