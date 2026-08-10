import type { PoolClient } from "pg";
import { pool } from "../db/pool";
import { sendMail } from "./mail";

// Notification types that email immediately rather than waiting for the
// next morning's digest: money/deadline urgency, plus "you now own this" —
// someone getting handed a lead or project should know right away, not
// find out from a summary email the next morning.
const EMAIL_IMMEDIATELY = new Set([
  "invoice_overdue",
  "followup_escalated",
  "security_alert",
  "lead_assigned",
  "project_assigned",
  "opportunity_followup_due",
]);

export async function createNotification(
  db: PoolClient | typeof pool,
  n: {
    userId: string;
    type: string;
    entityType?: string;
    entityId?: string;
    title: string;
    body?: string;
  }
): Promise<void> {
  await db.query(
    `insert into notifications (user_id, type, entity_type, entity_id, title, body)
     values ($1,$2,$3,$4,$5,$6)`,
    [n.userId, n.type, n.entityType ?? null, n.entityId ?? null, n.title, n.body ?? null]
  );

  if (!EMAIL_IMMEDIATELY.has(n.type)) return;

  try {
    const userResult = await pool.query(`select email, name from users where id = $1 and is_active`, [n.userId]);
    const user = userResult.rows[0];
    if (!user) return;
    await sendMail({
      to: user.email,
      subject: n.title,
      text: `Hi ${user.name},\n\n${n.title}${n.body ? `\n\n${n.body}` : ""}\n\n— Zentinel`,
      html: `<p>Hi ${user.name},</p><p><strong>${n.title}</strong></p>${n.body ? `<p>${n.body}</p>` : ""}<p style="color:#64748b;font-size:12px">— Zentinel</p>`,
    });
  } catch (err) {
    // A mail failure must never break whatever triggered the notification —
    // the in-app notification row above already landed regardless.
    console.error(`Failed to send notification email (type=${n.type}, user=${n.userId}):`, err);
  }
}
