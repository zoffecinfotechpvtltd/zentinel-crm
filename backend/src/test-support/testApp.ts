import { afterAll } from "vitest";
import "express-async-errors";
import supertest from "supertest";
import { createApp } from "../app";
import { pool } from "../db/pool";
import { hashPassword } from "../lib/password";

export const app = createApp();

// Vitest forks a fresh child process per test file even with
// fileParallelism: false (verified empirically: distinct process.pid and
// distinct `pool` object identity across two test files in this sandbox) —
// so this module, and the `pool` above, are freshly created once per test
// file, not shared across the whole run or with globalSetup.ts (which runs
// in a separate, unrelated process). That makes this afterAll — registered
// exactly once per file, right here, at the point pool.ts's module is first
// created for that file — the correct place to close it: it runs after all
// of that file's tests (and their resetDb() calls) are done, and well
// before globalSetup's teardown stops the shared Postgres instance. Without
// this, idle connections got torn down by the Postgres process shutting
// down underneath them (harmless but noisy), and pool.ts's own
// `pool.on("error", ...)` handler calls `process.exit(1)` on any
// unexpected idle-client error — a badly-timed one during shutdown could
// exit the test run nonzero and look like a flake.
afterAll(async () => {
  await pool.end();
});

// Verified against every `create table` in backend/migrations/*.sql as of this
// plan being written (23 tables) — if a later migration adds a table, add it
// here too, or that table's rows will leak between tests.
const APP_TABLES = [
  "activity_log", "attachments", "notes", "signature_requests",
  "payments", "unmatched_payments", "tally_sync_log",
  "credit_notes", "invoice_line_items", "invoices", "invoice_number_counters",
  "projects", "contracts", "client_contacts", "clients",
  "leads", "message_templates", "services",
  "notifications", "password_reset_tokens", "sessions", "users",
  "settings",
  // Opportunities module, added after this harness was first written —
  // merged in from a sibling branch (docs/superpowers/specs/2026-08-10-opportunities-module-design.md).
  "opportunity_type_links", "opportunities", "opportunity_types",
];

export async function resetDb(): Promise<void> {
  await pool.query(`TRUNCATE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

const TEST_PASSWORD = "TestPass123";

export async function loginAs(
  role: "admin" | "sales" | "finance" | "ops",
  overrides: Partial<{ name: string; email: string }> = {}
): Promise<{ agent: ReturnType<typeof supertest.agent>; user: { id: string; email: string; name: string; role: string } }> {
  const email = overrides.email ?? `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const name = overrides.name ?? `Test ${role}`;
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const result = await pool.query(
    `insert into users (email, password_hash, name, role) values ($1, $2, $3, $4) returning id, email, name, role`,
    [email, passwordHash, name, role]
  );
  const user = result.rows[0];

  const agent = supertest.agent(app);
  const loginRes = await agent.post("/api/auth/login").send({ email, password: TEST_PASSWORD });
  if (loginRes.status !== 200) {
    throw new Error(`loginAs(${role}) failed: POST /api/auth/login returned ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }

  return { agent, user };
}
