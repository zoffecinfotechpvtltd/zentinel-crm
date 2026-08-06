import "dotenv/config";
import { pool } from "./pool";

// Seeds only the services lookup table. No default admin account is created
// here or anywhere else in this codebase — the first person to open the app
// creates the admin account themselves via the Setup screen (see
// routes/setup.ts). This is deliberate: a publicly distributed installer
// must never ship a hardcoded default credential, since it would be
// identical (and known, since the source is public) on every install.

const SERVICES = [
  "SEBI CSCRF",
  "Accessibility Audit",
  "DPDP Compliance",
  "VAPT",
  "Cyber Security",
  "MSOC",
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    for (const name of SERVICES) {
      await client.query(
        `insert into services (name) values ($1) on conflict (name) do nothing`,
        [name]
      );
    }
    console.log(`Seeded ${SERVICES.length} services.`);

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
