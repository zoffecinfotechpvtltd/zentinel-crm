import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { hashToken } from "../lib/tokens";

const router = Router();

// Unauthenticated by design — the person opening this link is a client,
// not a Zentinel user. The random 32-byte token in the URL is the only
// thing gating access, same trust model as the password-reset link flow.
router.get("/:token", async (req, res) => {
  const result = await pool.query(
    `select sr.status, sr.expires_at, sr.signer_name, sr.signed_at, a.filename
     from signature_requests sr join attachments a on a.id = sr.attachment_id
     where sr.token_hash = $1`,
    [hashToken(req.params.token)]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found", message: "This signing link isn't valid." });
    return;
  }
  const sr = result.rows[0];
  if (sr.status === "pending" && new Date(sr.expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: "expired", message: "This signing link has expired." });
    return;
  }
  res.json({ filename: sr.filename, status: sr.status, signer_name: sr.signer_name, signed_at: sr.signed_at });
});

const signSchema = z.object({ signer_name: z.string().min(1), signer_email: z.string().email().optional() });

router.post("/:token", async (req, res) => {
  const parsed = signSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }

  const tokenHash = hashToken(req.params.token);
  const result = await pool.query(`select id, status, expires_at from signature_requests where token_hash = $1`, [tokenHash]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const sr = result.rows[0];
  if (sr.status !== "pending") {
    res.status(400).json({ error: "already_resolved", message: "This document has already been signed." });
    return;
  }
  if (new Date(sr.expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: "expired", message: "This signing link has expired." });
    return;
  }

  await pool.query(
    `update signature_requests set status = 'signed', signer_name = $1, signer_email = $2,
       signed_at = now(), signed_ip = $3, signed_user_agent = $4
     where id = $5`,
    [parsed.data.signer_name, parsed.data.signer_email ?? null, req.ip ?? null, req.get("user-agent") ?? null, sr.id]
  );

  res.json({ ok: true });
});

export default router;
