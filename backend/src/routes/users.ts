import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { hashPassword } from "../lib/password";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/", async (_req, res) => {
  const result = await pool.query(
    `select id, email, name, role, is_active, last_login_at, created_at
     from users
     where deleted_at is null
     order by created_at desc`
  );
  res.json(result.rows);
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(["admin", "sales", "finance", "ops"]),
});

router.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const { email, password, name, role } = parsed.data;

  const existing = await pool.query(`select id from users where email = $1`, [email]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: "email_already_exists" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    `insert into users (email, password_hash, name, role, created_by)
     values ($1, $2, $3, $4, $5)
     returning id, email, name, role, is_active, created_at`,
    [email, passwordHash, name, role, req.user!.id]
  );

  res.status(201).json(result.rows[0]);
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["admin", "sales", "finance", "ops"]).optional(),
  is_active: z.boolean().optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }

  const fields = parsed.data;
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const [key, value] of Object.entries(fields)) {
    setClauses.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }

  if (setClauses.length === 0) {
    res.status(400).json({ error: "no_fields_to_update" });
    return;
  }

  setClauses.push(`updated_by = $${i}`);
  values.push(req.user!.id);
  i++;
  setClauses.push(`updated_at = now()`);

  values.push(req.params.id);

  const result = await pool.query(
    `update users set ${setClauses.join(", ")} where id = $${i} and deleted_at is null
     returning id, email, name, role, is_active`,
    values
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // Deactivating a user must immediately invalidate their active sessions,
  // not just block future logins.
  if (fields.is_active === false) {
    await pool.query(`delete from sessions where user_id = $1`, [req.params.id]);
  }

  res.json(result.rows[0]);
});

export default router;
