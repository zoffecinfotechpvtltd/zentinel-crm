import { pool } from "../db/pool";

// Purges data that's genuinely safe to hard-delete — nothing else in the
// schema references it by foreign key, so there's no cascade risk.
//
// Deliberately narrow scope: soft-deleted business records (clients,
// invoices, projects) are NOT hard-deleted here, even when old. Those tables
// are cross-referenced by FK (invoices -> clients, payments -> invoices,
// etc.), so a generic purge risks either an FK violation or silently
// orphaning financial history — that needs a dedicated, carefully-reviewed
// job per entity, not a blanket sweep. Soft-deleted leads that were never
// converted to a client are the one safe exception: nothing references them.
export async function runCleanupOldRecordsJob(): Promise<{ sessions: number; resetTokens: number; leads: number }> {
  const sessions = await pool.query(
    `delete from sessions where expires_at < now() - interval '7 days' returning id`
  );
  const resetTokens = await pool.query(
    `delete from password_reset_tokens
     where (used_at is not null or expires_at < now()) and created_at < now() - interval '30 days'
     returning id`
  );
  const leads = await pool.query(
    `delete from leads
     where deleted_at is not null and deleted_at < now() - interval '2 years' and converted_to_client_id is null
     returning id`
  );
  return {
    sessions: sessions.rowCount ?? 0,
    resetTokens: resetTokens.rowCount ?? 0,
    leads: leads.rowCount ?? 0,
  };
}
