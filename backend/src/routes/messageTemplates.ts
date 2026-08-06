import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (_req, res) => {
  const result = await pool.query(`select * from message_templates order by category, name`);
  res.json(result.rows);
});

const createSchema = z.object({
  name: z.string().min(1),
  channel: z.enum(["email", "whatsapp"]),
  subject: z.string().optional(),
  body: z.string().min(1),
  category: z.enum(["proposal_followup", "payment_reminder", "checkin"]),
});

router.post("/", requireRole("admin"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;
  const result = await pool.query(
    `insert into message_templates (name, channel, subject, body, category, created_by)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [f.name, f.channel, f.subject ?? null, f.body, f.category, req.user!.id]
  );
  res.status(201).json(result.rows[0]);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  channel: z.enum(["email", "whatsapp"]).optional(),
  subject: z.string().nullable().optional(),
  body: z.string().min(1).optional(),
  category: z.enum(["proposal_followup", "payment_reminder", "checkin"]).optional(),
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
    `update message_templates set ${setClauses.join(", ")} where id = $${i} returning *`,
    values
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(result.rows[0]);
});

export default router;
