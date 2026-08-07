import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { pool } from "../db/pool";
import { verifyPassword, hashPassword } from "../lib/password";
import { createSession, setSessionCookie, clearSessionCookie, getSessionCookieName } from "../lib/session";
import { generateRawToken, hashToken } from "../lib/tokens";
import { requireAuth } from "../middleware/auth";
import { sendMail } from "../lib/mail";
import { generateSecret, buildOtpauthUri, verifyTotpCode, generateBackupCodes, hashBackupCodes, tryConsumeBackupCode } from "../lib/totp";
import { getAppBaseUrl } from "../lib/appUrl";
import { passwordSchema } from "../lib/passwordPolicy";

const router = Router();

const LOCKOUT_THRESHOLD = 8;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// Password verified, code not yet entered — bridges the two /login requests
// without a session cookie existing yet. In-memory is fine (same tradeoff
// as the 403-burst tracker): a restart just means re-entering the password,
// not a security gap.
const PENDING_2FA_TTL_MS = 5 * 60 * 1000;
const pending2fa = new Map<string, { userId: string; rememberMe: boolean; expiresAt: number }>();

function cleanupExpiredPending2fa(): void {
  const now = Date.now();
  for (const [token, entry] of pending2fa) {
    if (entry.expiresAt < now) pending2fa.delete(token);
  }
}

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
    `select id, email, name, role, password_hash, is_active, totp_enabled,
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

  if (user.totp_enabled) {
    cleanupExpiredPending2fa();
    const pendingToken = crypto.randomUUID();
    pending2fa.set(pendingToken, { userId: user.id, rememberMe, expiresAt: Date.now() + PENDING_2FA_TTL_MS });
    res.json({ requires_2fa: true, pending_token: pendingToken });
    return;
  }

  const session = await createSession(pool, {
    userId: user.id,
    rememberMe,
    userAgent: req.get("user-agent") ?? undefined,
    ipAddress: req.ip,
  });
  setSessionCookie(res, session.id, rememberMe);

  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

const login2faSchema = z.object({
  pending_token: z.string().min(1),
  code: z.string().min(1),
});

router.post("/login/2fa", async (req, res) => {
  const parsed = login2faSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  cleanupExpiredPending2fa();
  const pending = pending2fa.get(parsed.data.pending_token);
  if (!pending) {
    res.status(400).json({ error: "invalid_or_expired", message: "That code entry session has expired — please log in again." });
    return;
  }

  const result = await pool.query(
    `select id, email, name, role, is_active, totp_secret, totp_backup_codes from users where id = $1 and deleted_at is null`,
    [pending.userId]
  );
  if (result.rows.length === 0 || !result.rows[0].is_active) {
    pending2fa.delete(parsed.data.pending_token);
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  const user = result.rows[0];

  let ok = user.totp_secret ? verifyTotpCode(user.totp_secret, parsed.data.code) : false;
  if (!ok && Array.isArray(user.totp_backup_codes) && user.totp_backup_codes.length > 0) {
    const remaining = await tryConsumeBackupCode(user.totp_backup_codes, parsed.data.code);
    if (remaining) {
      ok = true;
      await pool.query(`update users set totp_backup_codes = $1 where id = $2`, [JSON.stringify(remaining), user.id]);
    }
  }

  if (!ok) {
    res.status(401).json({ error: "invalid_code", message: "That code isn't right. Check your authenticator app's time is in sync, or try a backup code." });
    return;
  }

  pending2fa.delete(parsed.data.pending_token);
  const session = await createSession(pool, {
    userId: user.id,
    rememberMe: pending.rememberMe,
    userAgent: req.get("user-agent") ?? undefined,
    ipAddress: req.ip,
  });
  setSessionCookie(res, session.id, pending.rememberMe);
  await pool.query(`update users set last_login_at = now() where id = $1`, [user.id]);

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

router.get("/2fa/status", requireAuth, async (req, res) => {
  const result = await pool.query(`select totp_enabled from users where id = $1`, [req.user!.id]);
  res.json({ enabled: result.rows[0]?.totp_enabled ?? false });
});

// Generates (or regenerates, if setup is abandoned and restarted) a secret
// and stores it un-confirmed — totp_enabled only flips on in /2fa/enable,
// once the user has proven they can actually generate a matching code.
router.post("/2fa/setup", requireAuth, async (req, res) => {
  const secret = generateSecret();
  await pool.query(`update users set totp_secret = $1, totp_enabled = false where id = $2`, [secret, req.user!.id]);
  res.json({ secret, otpauth_uri: buildOtpauthUri(secret, req.user!.email) });
});

const enable2faSchema = z.object({ code: z.string().min(1) });

router.post("/2fa/enable", requireAuth, async (req, res) => {
  const parsed = enable2faSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const result = await pool.query(`select totp_secret from users where id = $1`, [req.user!.id]);
  const secret = result.rows[0]?.totp_secret;
  if (!secret) {
    res.status(400).json({ error: "no_pending_setup", message: "Start setup first (POST /2fa/setup)." });
    return;
  }
  if (!verifyTotpCode(secret, parsed.data.code)) {
    res.status(400).json({ error: "invalid_code", message: "That code doesn't match — check the app and try again." });
    return;
  }

  const backupCodes = generateBackupCodes();
  const hashed = await hashBackupCodes(backupCodes);
  await pool.query(`update users set totp_enabled = true, totp_backup_codes = $1 where id = $2`, [JSON.stringify(hashed), req.user!.id]);

  res.json({ ok: true, backup_codes: backupCodes });
});

const disable2faSchema = z.object({ password: z.string().min(1) });

router.post("/2fa/disable", requireAuth, async (req, res) => {
  const parsed = disable2faSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const result = await pool.query(`select password_hash from users where id = $1`, [req.user!.id]);
  const passwordOk = result.rows[0] && (await verifyPassword(result.rows[0].password_hash, parsed.data.password));
  if (!passwordOk) {
    res.status(401).json({ error: "invalid_credentials", message: "Password didn't match." });
    return;
  }
  await pool.query(`update users set totp_enabled = false, totp_secret = null, totp_backup_codes = null where id = $1`, [req.user!.id]);
  res.json({ ok: true });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

// Self-service password change — the gap left by the fact that the only
// existing paths to a new password are the admin-issued welcome link and
// the "forgot password" email flow, neither of which helps someone who's
// already logged in and just wants to update their own password. Keeps the
// current session alive (unlike password-reset/confirm, which assumes the
// old session may be compromised) but revokes every other session, same as
// a security-sensitive change should.
router.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const result = await pool.query(`select password_hash from users where id = $1`, [req.user!.id]);
  const passwordOk = result.rows[0] && (await verifyPassword(result.rows[0].password_hash, parsed.data.currentPassword));
  if (!passwordOk) {
    res.status(401).json({ error: "invalid_credentials", message: "Current password didn't match." });
    return;
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  const currentSessionId = req.cookies?.[getSessionCookieName()];
  await pool.query(`update users set password_hash = $1 where id = $2`, [newHash, req.user!.id]);
  await pool.query(`delete from sessions where user_id = $1 and id <> $2`, [req.user!.id, currentSessionId]);

  res.json({ ok: true });
});

router.get("/sessions", requireAuth, async (req, res) => {
  const currentSessionId = req.cookies?.[getSessionCookieName()];
  const result = await pool.query(
    `select id, user_agent, ip_address, created_at, expires_at
     from sessions where user_id = $1 order by created_at desc`,
    [req.user!.id]
  );
  res.json(result.rows.map((r) => ({ ...r, is_current: r.id === currentSessionId })));
});

router.post("/sessions/revoke-others", requireAuth, async (req, res) => {
  const currentSessionId = req.cookies?.[getSessionCookieName()];
  const result = await pool.query(
    `delete from sessions where user_id = $1 and id <> $2 returning id`,
    [req.user!.id, currentSessionId]
  );
  res.json({ ok: true, revoked: result.rowCount ?? 0 });
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

    const resetLink = `${getAppBaseUrl()}/reset-password?token=${rawToken}`;
    try {
      await sendMail({
        to: parsed.data.email,
        subject: "Reset your Zentinel password",
        text: `Click the link below to reset your password. This link expires in 1 hour and can only be used once.\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`,
        html: `<p>Click the link below to reset your password. This link expires in 1 hour and can only be used once.</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
      });
    } catch (err) {
      // The reset token was created successfully regardless — don't let a
      // broken SMTP config (wrong host, bad credentials, network hiccup)
      // turn into a visible error for the person requesting the reset, and
      // don't leak SMTP internals in the response either way. Log it so
      // whoever manages Settings notices and fixes the mail config.
      console.error("Password reset email failed to send:", err);
    }
  }

  res.json({ ok: true, message: "If that email exists, a reset link has been sent." });
});

const resetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
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
