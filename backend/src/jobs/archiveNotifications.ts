import { pool } from "../db/pool";

// Read + older than 30 days -> archived (soft, per architecture doc's
// soft-delete convention). Never deleted; just hidden from the default view.
export async function runArchiveNotificationsJob(): Promise<{ affected: number }> {
  const result = await pool.query(
    `update notifications set archived_at = now()
     where archived_at is null and read_at is not null and created_at < now() - interval '30 days'
     returning id`
  );
  return { affected: result.rowCount ?? 0 };
}
