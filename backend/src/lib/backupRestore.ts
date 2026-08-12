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
// clients.converted_from_opportunity_id and opportunities.client_id form a
// genuine FK cycle (a client can point at the opportunity it converted
// from, and an opportunity can point at the client it's linked to) — no
// single insert order satisfies both directions. clients is restored with
// that one column left null, opportunities inserts normally, then a
// second pass (see restoreDatabase) fills converted_from_opportunity_id
// back in now that the row it points to exists.
const CLIENTS_DEFERRED_COLUMN = "converted_from_opportunity_id";

export const BACKUP_TABLES_IN_ORDER = [
  "users",
  "services",
  "opportunity_types",
  "custom_field_definitions",
  "api_keys",
  "password_reset_tokens",
  "leads",
  "clients",
  "opportunities",
  "client_contacts",
  "contracts",
  "opportunity_type_links",
  "projects",
  "project_tasks",
  "project_time_entries",
  "invoice_number_counters",
  "invoices",
  "invoice_line_items",
  "credit_notes",
  "payments",
  "unmatched_payments",
  "tally_sync_log",
  "recurring_invoice_templates",
  "message_templates",
  "notifications",
  "settings",
  "activity_log",
  "notes",
  "attachments",
  "signature_requests",
  "automation_rules",
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
    // Postgres refuses to TRUNCATE a table while any other table still has
    // a live FK constraint pointing at it — that check is per-statement,
    // not per-row-count, so no per-table loop order can satisfy it (e.g.
    // leads.converted_to_client_id -> clients, clients.converted_from_opportunity_id
    // -> opportunities, opportunities.lead_id -> leads all form a cycle).
    // Truncating every table together in one statement sidesteps ordering
    // entirely — Postgres only requires that all referencing tables be
    // included in the same TRUNCATE command. `sessions` isn't part of the
    // backup/restore data (see comment above) but it has sessions.user_id
    // -> users(id), so it must still be truncated here even though it's
    // never reinserted — wiping sessions on restore is correct anyway.
    await client.query(`truncate table ${BACKUP_TABLES_IN_ORDER.join(", ")}, sessions`);

    // clients rows insert with converted_from_opportunity_id left out —
    // opportunities doesn't exist yet at this point in the insert order,
    // so that column is backfilled in a second pass below once it does.
    const deferredClientValues = new Map<string, unknown>();

    let rowsRestored = 0;
    for (const table of BACKUP_TABLES_IN_ORDER) {
      const entry = backup.tables.find((t) => t.table === table)!;
      for (const row of entry.rows) {
        let cols = Object.keys(row);
        if (table === "clients" && cols.includes(CLIENTS_DEFERRED_COLUMN)) {
          if (row[CLIENTS_DEFERRED_COLUMN] != null) deferredClientValues.set(row.id as string, row[CLIENTS_DEFERRED_COLUMN]);
          cols = cols.filter((c) => c !== CLIENTS_DEFERRED_COLUMN);
        }
        if (cols.length === 0) continue;
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
        const values = cols.map((c) => toParamValue(row[c]));
        await client.query(`insert into ${table} (${cols.join(",")}) values (${placeholders})`, values);
        rowsRestored++;
      }
    }

    for (const [clientId, opportunityId] of deferredClientValues) {
      await client.query(`update clients set ${CLIENTS_DEFERRED_COLUMN} = $1 where id = $2`, [opportunityId, clientId]);
    }

    await client.query("commit");
    return { tablesRestored: BACKUP_TABLES_IN_ORDER.length, rowsRestored };
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}
