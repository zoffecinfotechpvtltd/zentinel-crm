import "dotenv/config";
import { hashPassword } from "../lib/password";
import { generateRandomPassword } from "../lib/tokens";
import { pool } from "./pool";

// Phase 4 seed: two Ops users + a batch of clients (if needed) + 200+ projects
// with due dates deliberately spanning past/today/future, for verifying
// overdue/due-this-week computed flags and server-side filtering at volume.

const PROJECT_NAME_PREFIXES = [
  "SEBI CSCRF Audit", "VAPT Engagement", "DPDP Compliance Review",
  "Accessibility Audit", "MSOC Onboarding", "Cyber Security Assessment",
];
const STATUSES = ["Not Started", "In Progress", "Awaiting Client", "Completed", "On Hold"];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seedProjects() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const opsEmails = ["ops1@zoffec.com", "ops2@zoffec.com"];
    const opsIds: string[] = [];
    for (const email of opsEmails) {
      const rawPassword = generateRandomPassword();
      const hash = await hashPassword(rawPassword);
      console.log(`Seeded ops user ${email} / ${rawPassword}`);
      const result = await client.query(
        `insert into users (email, password_hash, name, role)
         values ($1, $2, $3, 'ops')
         on conflict (email) do update set password_hash = excluded.password_hash
         returning id`,
        [email, hash, email === "ops1@zoffec.com" ? "Karan Rao" : "Ananya Menon"]
      );
      opsIds.push(result.rows[0].id);
    }

    let clientRows = (await client.query(`select id from clients where deleted_at is null`)).rows;
    const neededClients = 30 - clientRows.length;
    for (let n = 0; n < neededClients; n++) {
      await client.query(
        `insert into clients (company, created_by, updated_by)
         values ($1, $2, $2) on conflict (company) do nothing`,
        [`Seeded Project Client ${n}`, opsIds[0]]
      );
    }
    clientRows = (await client.query(`select id from clients where deleted_at is null`)).rows;
    const clientIds: string[] = clientRows.map((r) => r.id);

    const existingCount = Number((await client.query(`select count(*) from projects`)).rows[0].count);
    const target = 220;

    if (existingCount >= target) {
      console.log(`Already have ${existingCount} projects, skipping bulk insert.`);
    } else {
      const toInsert = target - existingCount;
      for (let n = 0; n < toInsert; n++) {
        const status = pick(STATUSES);
        const startOffsetDays = Math.floor(Math.random() * 60) - 40;
        const dueOffsetDays = startOffsetDays + Math.floor(Math.random() * 30) + 1;
        const start = new Date(Date.now() + startOffsetDays * 24 * 60 * 60 * 1000);
        const due = new Date(Date.now() + dueOffsetDays * 24 * 60 * 60 * 1000);
        const progress = status === "Completed" ? 100 : status === "Not Started" ? 0 : Math.floor(Math.random() * 90);

        await client.query(
          `insert into projects (name, client_id, assigned_to, start_date, due_date, status, progress, created_by, updated_by)
           values ($1,$2,$3,$4,$5,$6,$7,$3,$3)`,
          [
            `${pick(PROJECT_NAME_PREFIXES)} ${n}`,
            pick(clientIds),
            pick(opsIds),
            start.toISOString().slice(0, 10),
            due.toISOString().slice(0, 10),
            status,
            progress,
          ]
        );
      }
      console.log(`Seeded ${toInsert} projects (${target} total).`);
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seedProjects().catch((err) => {
  console.error("Project seed failed:", err);
  process.exit(1);
});
