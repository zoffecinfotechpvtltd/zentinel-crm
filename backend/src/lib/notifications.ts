import type { PoolClient } from "pg";
import { pool } from "../db/pool";

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
}
