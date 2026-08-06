import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { verifyPassword, hashPassword } from "../lib/password";
import { createSession, setSessionCookie, clearSessionCookie, getSessionCookieName } from "../lib/session";
import { generateRawToken, hashToken } from "../lib/tokens";
import { requireAuth } from "../middleware/auth";
import { sendMail } from "../lib/mail";

const router = Router();

const LOCKOUT_THRESHOLD = 8;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(false),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const { email, password, rememberMe } = parsed.data;

  const result = await pool.query(
    `select id, email, name, role, password_hash, is_active,
            failed_login_attempts, last_failed_login_at, locked_until
     from users
     where email = $1 and deleted_at is null`,
    [email]
  );

  if (result.rows.length === 0) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const user = result.rows[0];

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    res.status(423).json({
      error: "account_locked",
      message: "Account locked due to too many failed login attempts. Try again later.",
    });
    return;
  }

  if (!user.is_active) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const passwordOk = await verifyPassword(user.password_hash, password);

  if (!passwordOk) {
    const now = Date.now();
    const withinWindow =
      user.last_failed_login_at && now - new Date(user.last_failed_login_at).getTime() < LOCKOUT_WINDOW_MS;
    const attempts = withinWindow ? user.failed_login_attempts + 1 : 1;
    const lockedUntil = attempts >= LOCKOUT_THRESHOLD ? new Date(now + LOCKOUT_DURATION_MS) : null;

    await pool.query(
      `update users set failed_login_attempts = $1, last_failed_login_at = now(), locked_until = $2 where id = $3`,
      [attempts, lockedUntil, user.id]
    );

    if (lockedUntil) {
      res.status(423).json({
        error: "account_locked",
        message: "Account locked due to too many failed login attempts. Try again later.",
      });
      return;
    }

    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  await pool.query(
    `update users set failed_login_attempts = 0, last_failed_login_at = null, locked_until = null, last_login_at = now() where id = $1`,
    [user.id]
  );

  const session = await createSession(pool, {
    userId: user.id,
    rememberMe,
    userAgent: req.get("user-agent") ?? undefined,
    ipAddress: req.ip,
  });
  setSessionCookie(res, session.id, rememberMe);

  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

router.post("/logout", async (req, res) => {
  const sessionId = req.cookies?.[getSessionCookieName()];
  if (sessionId) {
    await pool.query(`delete from sessions where id = $1`, [sessionId]);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

const resetRequestSchema = z.object({ email: z.string().email() });

router.post("/password-reset/request", async (req, res) => {
  const parsed = resetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  const result = await pool.query(
    `select id from users where email = $1 and deleted_at is null and is_active = true`,
    [parsed.data.email]
  );

  // Always respond the same way regardless of whether the account exists,
  // so this endpoint can't be used to enumerate registered emails.
  if (result.rows.length > 0) {
    const userId = result.rows[0].id;
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await pool.query(
      `insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    const resetLink = `${process.env.APP_BASE_URL}/reset-password?token=${rawToken}`;
    await sendMail({
      to: parsed.data.email,
      subject: "Reset your Zoffec CMS password",
      text: `Click the link below to reset your password. This link expires in 1 hour and can only be used once.\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`,
      html: `<p>Click the link below to reset your password. This link expires in 1 hour and can only be used once.</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    });
  }

  res.json({ ok: true, message: "If that email exists, a reset link has been sent." });
});

const resetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post("/password-reset/confirm", async (req, res) => {
  const parsed = resetConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }

  const tokenHash = hashToken(parsed.data.token);
  const result = await pool.query(
    `select id, user_id, expires_at, used_at from password_reset_tokens where token_hash = $1`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    res.status(400).json({ error: "invalid_or_expired_token", message: "Link expired or already used." });
    return;
  }

  const tokenRow = result.rows[0];

  if (tokenRow.used_at || new Date(tokenRow.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: "invalid_or_expired_token", message: "Link expired or already used." });
    return;
  }

  const newHash = await hashPassword(parsed.data.newPassword);

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`update password_reset_tokens set used_at = now() where id = $1`, [tokenRow.id]);
    await client.query(`update users set password_hash = $1 where id = $2`, [newHash, tokenRow.user_id]);
    await client.query(`delete from sessions where user_id = $1`, [tokenRow.user_id]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  res.json({ ok: true, message: "Password updated. Please log in again." });
});

export default router;
