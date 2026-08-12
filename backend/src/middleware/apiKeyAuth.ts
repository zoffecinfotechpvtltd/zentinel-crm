import type { Request, Response, NextFunction } from "express";
import { pool } from "../db/pool";
import { hashToken } from "../lib/tokens";

// Separate from the cookie-session requireAuth used by the SPA — this is
// for external tools authenticating with a long-lived key instead of a
// browser session. Same hash-at-rest pattern as signature-request tokens:
// the raw key is only ever known at creation time, never stored.
export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_api_key", message: "Provide an API key via Authorization: Bearer <key>." });
    return;
  }
  const rawKey = authHeader.slice("Bearer ".length).trim();
  if (!rawKey) {
    res.status(401).json({ error: "missing_api_key" });
    return;
  }
  const keyHash = hashToken(rawKey);
  const result = await pool.query(
    `select id from api_keys where key_hash = $1 and is_active and deleted_at is null`,
    [keyHash]
  );
  if (result.rows.length === 0) {
    res.status(401).json({ error: "invalid_api_key" });
    return;
  }
  // Fire-and-forget — a slow/failed usage-tracking write must never block
  // or fail the actual request the key was presented for.
  pool.query(`update api_keys set last_used_at = now() where id = $1`, [result.rows[0].id]).catch(() => {});
  next();
}
