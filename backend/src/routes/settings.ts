import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendTestMail } from "../lib/mail";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/integrations", async (_req, res) => {
  const result = await pool.query(`select key, value from settings where key in ('lead_webhook_secret', 'outbound_webhook_url')`);
  const byKey = Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
  res.json({
    lead_webhook_secret: byKey.lead_webhook_secret?.secret ?? null,
    outbound_webhook_url: byKey.outbound_webhook_url?.url ?? null,
  });
});

router.post("/integrations/lead-webhook-secret/regenerate", async (req, res) => {
  const secret = crypto.randomBytes(24).toString("hex");
  await pool.query(
    `insert into settings (key, value, updated_by, updated_at) values ('lead_webhook_secret', $1, $2, now())
     on conflict (key) do update set value = $1, updated_by = $2, updated_at = now()`,
    [JSON.stringify({ secret }), req.user!.id]
  );
  res.json({ lead_webhook_secret: secret });
});

const outboundWebhookSchema = z.object({ url: z.string().url().optional().or(z.literal("")) });

router.put("/integrations/outbound-webhook", async (req, res) => {
  const parsed = outboundWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  await pool.query(
    `insert into settings (key, value, updated_by, updated_at) values ('outbound_webhook_url', $1, $2, now())
     on conflict (key) do update set value = $1, updated_by = $2, updated_at = now()`,
    [JSON.stringify({ url: parsed.data.url || null }), req.user!.id]
  );
  res.json({ ok: true });
});

router.get("/smtp", async (_req, res) => {
  const result = await pool.query(`select value from settings where key = 'smtp_config'`);
  if (result.rows.length === 0) {
    res.json(null);
    return;
  }
  const { pass: _pass, ...safe } = result.rows[0].value;
  res.json(safe);
});

const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  user: z.string().min(1),
  pass: z.string().min(1),
  from: z.string().min(1),
});

router.put("/smtp", async (req, res) => {
  const parsed = smtpConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  await pool.query(
    `insert into settings (key, value, updated_by, updated_at) values ('smtp_config', $1, $2, now())
     on conflict (key) do update set value = $1, updated_by = $2, updated_at = now()`,
    [JSON.stringify(parsed.data), req.user!.id]
  );
  const { pass: _pass, ...safe } = parsed.data;
  res.json(safe);
});

const testMailSchema = z.object({ to: z.string().email() });

router.post("/smtp/test", async (req, res) => {
  const parsed = testMailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }

  const configResult = await pool.query(`select value from settings where key = 'smtp_config'`);
  if (configResult.rows.length === 0) {
    res.status(400).json({ error: "smtp_not_configured", message: "Save SMTP settings before sending a test email." });
    return;
  }

  try {
    await sendTestMail(configResult.rows[0].value, parsed.data.to);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({
      error: "smtp_send_failed",
      message: err instanceof Error ? err.message : "Failed to send test email — check your SMTP settings.",
    });
  }
});

export default router;
