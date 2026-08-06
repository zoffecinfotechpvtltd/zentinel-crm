import type { Request, Response, NextFunction } from "express";
import { pool } from "../db/pool";
import { getSessionCookieName, setSessionCookie, sessionTtlMs } from "../lib/session";

export type Role = "admin" | "sales" | "finance" | "ops";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sessionId = req.cookies?.[getSessionCookieName()];
  if (!sessionId) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const result = await pool.query(
    `select s.id as session_id, s.expires_at, s.remember_me,
            u.id, u.email, u.name, u.role, u.is_active
     from sessions s
     join users u on u.id = s.user_id
     where s.id = $1`,
    [sessionId]
  );

  if (result.rows.length === 0) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const row = result.rows[0];

  if (new Date(row.expires_at).getTime() < Date.now() || !row.is_active) {
    if (!row.is_active) {
      await pool.query(`delete from sessions where user_id = $1`, [row.id]);
    } else {
      await pool.query(`delete from sessions where id = $1`, [row.session_id]);
    }
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  // sliding expiry: extend on activity
  const newExpiresAt = new Date(Date.now() + sessionTtlMs(row.remember_me));
  await pool.query(`update sessions set expires_at = $1 where id = $2`, [newExpiresAt, row.session_id]);
  setSessionCookie(res, row.session_id, row.remember_me);

  req.user = { id: row.id, email: row.email, name: row.name, role: row.role };
  req.sessionId = row.session_id;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}
