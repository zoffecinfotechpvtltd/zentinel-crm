import type { PoolClient } from "pg";
import { pool } from "../db/pool";

export type EntityType = "lead" | "client" | "project" | "invoice";

export async function writeActivityLog(
  db: PoolClient | typeof pool,
  entry: {
    entityType: EntityType;
    entityId: string;
    actorId: string | null;
    action: string;
    detail?: Record<string, unknown>;
  }
): Promise<void> {
  await db.query(
    `insert into activity_log (entity_type, entity_id, actor_id, action, detail)
     values ($1, $2, $3, $4, $5)`,
    [entry.entityType, entry.entityId, entry.actorId, entry.action, entry.detail ?? {}]
  );
}
