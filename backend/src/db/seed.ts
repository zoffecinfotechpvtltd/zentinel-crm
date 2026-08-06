import "dotenv/config";
import argon2 from "argon2";
import { pool } from "./pool";

// Phase 0 seed: admin bootstrap user + services lookup table.
// Later phases append their own seed logic here (leads, clients, projects,
// invoices) reusing the prototype's Indian-enterprise-client flavor
// (HDFC Securities, Infosys BPM, etc.) once that data is available.

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

    const adminEmail = "admin@zoffec.com";
    const adminPasswordHash = await argon2.hash("ChangeMe123!");
    const adminResult = await client.query(
      `insert into users (email, password_hash, name, role)
       values ($1, $2, $3, 'admin')
       on conflict (email) do nothing
       returning id`,
      [adminEmail, adminPasswordHash, "Admin User"]
    );

    if (adminResult.rows.length > 0) {
      const adminId = adminResult.rows[0].id;
      await client.query(`update users set created_by = $1 where id = $1`, [adminId]);
      console.log(`Seeded admin user: ${adminEmail} / ChangeMe123! (change on first login)`);
    } else {
      console.log(`Admin user ${adminEmail} already exists, skipped.`);
    }

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
