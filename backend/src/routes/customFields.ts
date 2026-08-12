import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// Admin defines what fields exist; every role that can already edit the
// underlying entity can read the definitions (needed to render the form),
// so only writes are admin-gated below, not the whole router.
router.use(requireAuth);

const ENTITY_TYPES = ["lead", "opportunity", "client"] as const;
const FIELD_TYPES = ["text", "number", "date", "boolean", "select"] as const;

router.get("/", async (req, res) => {
  const conditions = ["deleted_at is null"];
  const values: unknown[] = [];
  if (req.query.entity_type) {
    conditions.push(`entity_type = $1`);
    values.push(req.query.entity_type);
  }
  const result = await pool.query(
    `select * from custom_field_definitions where ${conditions.join(" and ")} order by entity_type, label`,
    values
  );
  res.json(result.rows);
});

const createSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  key: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, "Key must be lowercase letters, numbers, and underscores, starting with a letter"),
  label: z.string().min(1),
  field_type: z.enum(FIELD_TYPES),
  select_options: z.array(z.string().min(1)).optional(),
});

router.post("/", requireRole("admin"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;
  if (f.field_type === "select" && (!f.select_options || f.select_options.length === 0)) {
    res.status(400).json({ error: "invalid_input", details: { select_options: "At least one option is required for a select field" } });
    return;
  }
  try {
    const result = await pool.query(
      `insert into custom_field_definitions (entity_type, key, label, field_type, select_options, created_by)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [f.entity_type, f.key, f.label, f.field_type, f.select_options ? JSON.stringify(f.select_options) : null, req.user!.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "duplicate_key", message: `A field with key "${f.key}" already exists for ${f.entity_type}.` });
      return;
    }
    throw err;
  }
});

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  select_options: z.array(z.string().min(1)).optional(),
  is_active: z.boolean().optional(),
});

router.patch("/:id", requireRole("admin"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (f.label !== undefined) { setClauses.push(`label = $${i++}`); values.push(f.label); }
  if (f.select_options !== undefined) { setClauses.push(`select_options = $${i++}`); values.push(JSON.stringify(f.select_options)); }
  if (f.is_active !== undefined) { setClauses.push(`is_active = $${i++}`); values.push(f.is_active); }
  if (setClauses.length === 0) {
    res.status(400).json({ error: "no_fields_to_update" });
    return;
  }
  values.push(req.params.id);
  const result = await pool.query(
    `update custom_field_definitions set ${setClauses.join(", ")} where id = $${i} and deleted_at is null returning *`,
    values
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(result.rows[0]);
});

// Field definitions are soft-deleted, not their values — a Lead/Opportunity/
// Client's own custom_fields JSONB keeps whatever was already recorded even
// after the definition disappears from the form; deleting a definition
// stops collecting new values, it doesn't erase history.
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const result = await pool.query(
    `update custom_field_definitions set deleted_at = now() where id = $1 and deleted_at is null returning id`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
