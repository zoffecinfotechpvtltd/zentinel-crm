import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

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

// A client is "assigned" to a Sales rep transitively through the lead that
// converted into it (Clients README defines no direct ownership field).
async function isClientOwnedBySales(clientId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `select 1 from clients c
     join leads l on l.id = c.converted_from_lead_id
     where c.id = $1 and l.assigned_to = $2`,
    [clientId, userId]
  );
  return result.rows.length > 0;
}

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
    `select c.*, (${STATUS_EXPR}) as status
     from clients c
     where ${whereClause}
     order by c.created_at desc
     limit $${i} offset $${i + 1}`,
    [...values, perPage, offset]
  );

  res.json({ data: dataResult.rows, total: Number(countResult.rows[0].count), page, per_page: perPage });
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

  res.json({
    ...client,
    contacts: contactsResult.rows,
    contracts: contractsResult.rows,
    contract_value_total: contractsResult.rows.reduce((sum: number, c: { value: string | null }) => sum + Number(c.value ?? 0), 0),
    originating_lead: originatingLead,
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
  res.status(201).json(result.rows[0]);
});

const updateClientSchema = z.object({
  company: z.string().min(1).optional(),
  gstin: z.string().nullable().optional(),
  billing_address: z.string().nullable().optional(),
  tally_ledger_name: z.string().nullable().optional(),
  is_archived: z.boolean().optional(),
});

router.patch("/:id", requireRole("admin", "sales"), async (req, res) => {
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

  if (req.user!.role === "sales" && !(await isClientOwnedBySales(req.params.id, req.user!.id))) {
    res.status(403).json({ error: "forbidden" });
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

// --- client_contacts ---

const createContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  mobile: z.string().optional(),
  designation: z.string().optional(),
  is_primary: z.boolean().optional().default(false),
});

router.post("/:id/contacts", requireRole("admin", "sales"), async (req, res) => {
  const parsed = createContactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  if (req.user!.role === "sales" && !(await isClientOwnedBySales(req.params.id, req.user!.id))) {
    res.status(403).json({ error: "forbidden" });
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
router.patch("/:id/contacts/:contactId", requireRole("admin", "sales"), async (req, res) => {
  const parsed = updateContactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  if (req.user!.role === "sales" && !(await isClientOwnedBySales(req.params.id, req.user!.id))) {
    res.status(403).json({ error: "forbidden" });
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

// --- contracts ---

const createContractSchema = z.object({
  service_id: z.string().uuid().optional(),
  value: z.number().nonnegative().optional(),
  start_date: z.string().optional(),
  end_date: z.string().nullable().optional(),
  status: z.enum(["active", "completed", "cancelled"]).optional().default("active"),
});

router.post("/:id/contracts", requireRole("admin", "sales"), async (req, res) => {
  const parsed = createContractSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  if (req.user!.role === "sales" && !(await isClientOwnedBySales(req.params.id, req.user!.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const f = parsed.data;
  const result = await pool.query(
    `insert into contracts (client_id, service_id, value, start_date, end_date, status, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$7) returning *`,
    [req.params.id, f.service_id ?? null, f.value ?? null, f.start_date ?? null, f.end_date ?? null, f.status, req.user!.id]
  );
  res.status(201).json(result.rows[0]);
});

const updateContractSchema = z.object({
  service_id: z.string().uuid().nullable().optional(),
  value: z.number().nonnegative().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  status: z.enum(["active", "completed", "cancelled"]).optional(),
});

router.patch("/:id/contracts/:contractId", requireRole("admin", "sales"), async (req, res) => {
  const parsed = updateContractSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  if (req.user!.role === "sales" && !(await isClientOwnedBySales(req.params.id, req.user!.id))) {
    res.status(403).json({ error: "forbidden" });
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

export default router;
