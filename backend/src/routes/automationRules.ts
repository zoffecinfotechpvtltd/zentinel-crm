import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// Admin-only, same footing as Users/Settings — these rules fire
// notifications org-wide regardless of who triggered the status change.
router.use(requireAuth, requireRole("admin"));

const ENTITY_TYPES = ["lead", "opportunity", "invoice", "project"] as const;
const ROLES = ["admin", "sales", "finance", "ops"] as const;

router.get("/", async (_req, res) => {
  const result = await pool.query(
    `select ar.*, u.name as notify_user_name from automation_rules ar
     left join users u on u.id = ar.notify_user_id
     where ar.deleted_at is null order by ar.created_at desc`
  );
  res.json(result.rows);
});

const baseSchema = {
  name: z.string().min(1),
  entity_type: z.enum(ENTITY_TYPES),
  trigger_status: z.string().min(1),
  notify_role: z.enum(ROLES).optional(),
  notify_user_id: z.string().uuid().optional(),
  message_template: z.string().min(1),
};

const createSchema = z.object(baseSchema).refine((f) => f.notify_role || f.notify_user_id, {
  message: "Either notify_role or notify_user_id is required",
  path: ["notify_role"],
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;
  const result = await pool.query(
    `insert into automation_rules (name, entity_type, trigger_status, notify_role, notify_user_id, message_template, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [f.name, f.entity_type, f.trigger_status, f.notify_role ?? null, f.notify_user_id ?? null, f.message_template, req.user!.id]
  );
  res.status(201).json(result.rows[0]);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  entity_type: z.enum(ENTITY_TYPES).optional(),
  trigger_status: z.string().min(1).optional(),
  notify_role: z.enum(ROLES).nullable().optional(),
  notify_user_id: z.string().uuid().nullable().optional(),
  message_template: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
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
  setClauses.push(`updated_at = now()`);
  values.push(req.params.id);
  const result = await pool.query(
    `update automation_rules set ${setClauses.join(", ")} where id = $${i} and deleted_at is null returning *`,
    values
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(result.rows[0]);
});

router.delete("/:id", async (req, res) => {
  const result = await pool.query(
    `update automation_rules set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null returning id`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
