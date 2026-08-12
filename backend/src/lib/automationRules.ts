import { pool } from "../db/pool";
import { createNotification } from "./notifications";

export type AutomationEntityType = "lead" | "opportunity" | "invoice" | "project";

// Called right after any status/stage field actually changes (never on every
// PATCH — only when the new value differs from the old one), from each
// entity's own route. Deliberately narrow: one trigger shape (status/stage
// reached a value), one action shape (notify a role or a specific person).
export async function runAutomationRules(
  entityType: AutomationEntityType,
  entityId: string,
  newStatus: string,
  entityLabel: string
): Promise<void> {
  const rulesResult = await pool.query(
    `select * from automation_rules where entity_type = $1 and trigger_status = $2 and is_active and deleted_at is null`,
    [entityType, newStatus]
  );
  if (rulesResult.rows.length === 0) return;

  for (const rule of rulesResult.rows) {
    const title = rule.message_template
      .replace(/\{company\}/g, entityLabel)
      .replace(/\{status\}/g, newStatus);

    let recipientIds: string[] = [];
    if (rule.notify_user_id) {
      recipientIds = [rule.notify_user_id];
    } else if (rule.notify_role) {
      const usersResult = await pool.query(`select id from users where role = $1 and is_active = true`, [rule.notify_role]);
      recipientIds = usersResult.rows.map((r: { id: string }) => r.id);
    }

    for (const userId of recipientIds) {
      await createNotification(pool, {
        userId,
        type: "automation_rule",
        entityType,
        entityId,
        title,
      });
    }
  }
}
