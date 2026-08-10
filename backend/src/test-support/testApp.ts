import supertest from "supertest";
import { createApp } from "../app";
import { pool } from "../db/pool";
import { hashPassword } from "../lib/password";

export const app = createApp();

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
