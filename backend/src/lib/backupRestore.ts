import type { Pool, PoolClient } from "pg";

// The embedded-postgres package (desktop build) ships only the Postgres
// server binaries, not the client tools (pg_dump/psql) — so there's no
// pg_dump to shell out to here. This does the same job in pure JS with the
// `pg` driver already in the dependency tree: walk every app table in
// FK-safe dependency order, dump rows as JSON, and on restore, truncate and
// reinsert in that same order so foreign keys are always satisfied.
//
// Note: the `attachments` table only carries file *metadata* (filename,
// size, disk path) — the actual uploaded file bytes live on disk under
// UPLOADS_DIR, not in Postgres, so this backup does NOT include them. A
// restore onto a different machine will show attachment records pointing
// at files that don't exist there. Backing up the uploads folder alongside
// this JSON file is a real gap worth closing if attachments see heavy use.
//
// Deliberately excludes `pgmigrations` (node-pg-migrate's own bookkeeping
// table — irrelevant to app data and would conflict with the target
// database's own migration history) and `sessions` (restoring old sessions
// would resurrect stale login state; everyone just logs in again after a
// restore, which is the correct behavior anyway).
export const BACKUP_TABLES_IN_ORDER = [
  "users",
  "services",
  "password_reset_tokens",
  "leads",
  "clients",
  "client_contacts",
  "contracts",
  "projects",
  "invoice_number_counters",
  "invoices",
  "invoice_line_items",
  "credit_notes",
  "payments",
  "unmatched_payments",
  "tally_sync_log",
  "message_templates",
  "notifications",
  "settings",
  "activity_log",
  "notes",
  "attachments",
] as const;

export type BackupFile = {
  version: 1;
  exported_at: string;
  tables: { table: string; rows: Record<string, unknown>[] }[];
};

export async function dumpDatabase(pool: Pool): Promise<BackupFile> {
  const tables: BackupFile["tables"] = [];
  for (const table of BACKUP_TABLES_IN_ORDER) {
    const result = await pool.query(`select * from ${table}`);
    tables.push({ table, rows: result.rows });
  }
  return { version: 1, exported_at: new Date().toISOString(), tables };
}

function toParamValue(v: unknown): unknown {
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

export async function restoreDatabase(client: PoolClient, backup: BackupFile): Promise<{ tablesRestored: number; rowsRestored: number }> {
  const dumpedTableNames = new Set(backup.tables.map((t) => t.table));
  for (const table of BACKUP_TABLES_IN_ORDER) {
    if (!dumpedTableNames.has(table)) {
      throw new Error(`Backup file is missing table "${table}" — refusing to restore a partial/incompatible backup.`);
    }
  }

  await client.query("begin");
  try {
    for (const table of [...BACKUP_TABLES_IN_ORDER].reverse()) {
      await client.query(`truncate table ${table}`);
    }

    let rowsRestored = 0;
    for (const table of BACKUP_TABLES_IN_ORDER) {
      const entry = backup.tables.find((t) => t.table === table)!;
      for (const row of entry.rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
        const values = cols.map((c) => toParamValue(row[c]));
        await client.query(`insert into ${table} (${cols.join(",")}) values (${placeholders})`, values);
        rowsRestored++;
      }
    }

    await client.query("commit");
    return { tablesRestored: BACKUP_TABLES_IN_ORDER.length, rowsRestored };
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}
