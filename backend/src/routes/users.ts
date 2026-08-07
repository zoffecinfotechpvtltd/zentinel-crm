import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { hashPassword } from "../lib/password";
import { requireAuth, requireRole } from "../middleware/auth";
import { generateRawToken, hashToken } from "../lib/tokens";
import { sendMail } from "../lib/mail";
import { getAppBaseUrl } from "../lib/appUrl";

const router = Router();

router.use(requireAuth);

// Any authenticated user can see who's available to assign work to (name/role
// only, no email/status) — needed for the Projects "Assigned To" picker,
// which isn't admin-only. Everything else on this router stays admin-gated.
router.get("/assignable", async (_req, res) => {
  const result = await pool.query(
    `select id, name, role from users where is_active and deleted_at is null order by name`
  );
  res.json(result.rows);
});

router.use(requireRole("admin"));

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
  const newUser = result.rows[0];

  // Welcome email carries a password-reset link, not the temp password the
  // admin typed — the admin already knows that password, but emailing
  // plaintext credentials is bad practice regardless of who set them, and
  // this lets the new hire pick their own on first login instead.
  try {
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const WELCOME_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    await pool.query(
      `insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)`,
      [newUser.id, tokenHash, new Date(Date.now() + WELCOME_LINK_TTL_MS)]
    );
    const appBaseUrl = getAppBaseUrl();
    const resetLink = `${appBaseUrl}/reset-password?token=${rawToken}`;
    await sendMail({
      to: email,
      subject: "Your Zoffec Sentinel account is ready",
      text: `Hi ${name},\n\n${req.user!.name} set up a Zoffec Sentinel account for you (role: ${role}).\n\nSet your own password here (link valid 7 days):\n${resetLink}\n\nOnce set, log in at ${appBaseUrl} with ${email}.`,
      html: `<p>Hi ${name},</p><p>${req.user!.name} set up a Zoffec Sentinel account for you (role: <strong>${role}</strong>).</p><p><a href="${resetLink}">Set your password</a> (link valid 7 days).</p><p>Once set, log in at <a href="${appBaseUrl}">${appBaseUrl}</a> with ${email}.</p>`,
    });
  } catch (err) {
    console.error("Failed to send welcome email to new user:", err);
  }

  res.status(201).json(newUser);
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
