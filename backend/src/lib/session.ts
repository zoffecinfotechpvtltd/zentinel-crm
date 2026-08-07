import type { Response } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db/pool";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "zoffec_sid";
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 12;
const REMEMBER_TTL_DAYS = Number(process.env.SESSION_REMEMBER_TTL_DAYS) || 30;
// Browsers refuse to store/send a `secure` cookie over plain HTTP. The desktop
// build serves the app over http://localhost (a loopback-only address, so the
// lack of TLS isn't a real exposure the way it would be for an internet-facing
// service) — the Electron main process sets DESKTOP_MODE=1 when it spawns this
// server, which turns the secure flag off regardless of NODE_ENV.
const COOKIE_SECURE = process.env.NODE_ENV === "production" && process.env.DESKTOP_MODE !== "1";
// "lax" is correct (and simplest) when the frontend and backend share a
// registrable domain — e.g. sentinel.ztplsolutions.com talking to
// api.ztplsolutions.com counts as same-site. Only override to "none" (which
// requires COOKIE_SECURE, i.e. HTTPS) if the frontend and backend are on
// genuinely different domains, e.g. a Vercel *.vercel.app default URL
// talking to a Render *.onrender.com default URL.
const COOKIE_SAME_SITE = (process.env.COOKIE_SAME_SITE as "lax" | "strict" | "none" | undefined) || "lax";

export function sessionTtlMs(rememberMe: boolean): number {
  return rememberMe ? REMEMBER_TTL_DAYS * 24 * 60 * 60 * 1000 : SESSION_TTL_HOURS * 60 * 60 * 1000;
}

export async function createSession(
  db: PoolClient | typeof pool,
  params: { userId: string; rememberMe: boolean; userAgent?: string; ipAddress?: string }
): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + sessionTtlMs(params.rememberMe));
  const result = await db.query(
    `insert into sessions (user_id, expires_at, remember_me, user_agent, ip_address)
     values ($1, $2, $3, $4, $5)
     returning id, expires_at`,
    [params.userId, expiresAt, params.rememberMe, params.userAgent ?? null, params.ipAddress ?? null]
  );
  return { id: result.rows[0].id, expiresAt: result.rows[0].expires_at };
}

export function setSessionCookie(res: Response, sessionId: string, rememberMe: boolean): void {
  res.cookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    maxAge: sessionTtlMs(rememberMe),
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME);
}

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}
