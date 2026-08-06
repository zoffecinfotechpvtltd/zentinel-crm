import "dotenv/config";
import argon2 from "argon2";
import { pool } from "./pool";

// Phase 2 seed: two sales reps + 500+ leads spread across them, for verifying
// server-side filtering/pagination/visibility scoping at realistic volume.
// Prototype's original fixture data (HDFC Securities, Infosys BPM, etc.) was
// unavailable — using invented but realistic Indian-enterprise names instead.

const COMPANY_PREFIXES = [
  "Reliance", "Tata", "Infosys", "Wipro", "HCL", "ICICI", "HDFC", "Axis",
  "Kotak", "Bajaj", "Adani", "Mahindra", "Larsen", "Godrej", "Aditya Birla",
  "JSW", "Vedanta", "IndusInd", "Yes Bank", "SBI", "PNB", "Canara",
  "IndianOil", "BharatPetroleum", "NTPC", "PowerGrid", "ONGC", "Coal India",
  "SAIL", "GAIL",
];
const COMPANY_SUFFIXES = [
  "Retail", "Industries", "Technologies", "Financial Services", "Capital",
  "Infotech", "Solutions", "Pharma", "Motors", "Energy", "Digital", "BPM",
  "Consulting", "Logistics", "Insurance",
];
const FIRST_NAMES = ["Riya", "Aman", "Priya", "Vikram", "Sneha", "Arjun", "Kavya", "Rohan", "Ananya", "Karan"];
const LAST_NAMES = ["Sharma", "Verma", "Iyer", "Nair", "Gupta", "Reddy", "Menon", "Kapoor", "Rao", "Chatterjee"];
const INDUSTRIES = [
  "Banking & Finance", "IT/Software", "Healthcare", "Government",
  "Manufacturing", "E-commerce", "Telecom", "Other",
];
const SOURCES = ["Website", "Referral", "LinkedIn", "Cold Call", "Event", "Email Campaign"];
const STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seedLeads() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const repEmails = ["rep1@zoffec.com", "rep2@zoffec.com"];
    const repIds: string[] = [];
    for (const email of repEmails) {
      const hash = await argon2.hash("RepPass123!");
      const result = await client.query(
        `insert into users (email, password_hash, name, role)
         values ($1, $2, $3, 'sales')
         on conflict (email) do update set email = excluded.email
         returning id`,
        [email, hash, email === "rep1@zoffec.com" ? "Aman Verma" : "Sneha Iyer"]
      );
      repIds.push(result.rows[0].id);
    }

    const serviceRows = await client.query(`select id from services`);
    const serviceIds: string[] = serviceRows.rows.map((r) => r.id);

    const existingCount = await client.query(`select count(*) from leads`);
    const alreadySeeded = Number(existingCount.rows[0].count);
    const target = 520;

    if (alreadySeeded >= target) {
      console.log(`Already have ${alreadySeeded} leads, skipping bulk insert.`);
    } else {
      const toInsert = target - alreadySeeded;
      for (let n = 0; n < toInsert; n++) {
        const company = `${pick(COMPANY_PREFIXES)} ${pick(COMPANY_SUFFIXES)} ${n}`;
        const contact = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
        const status = pick(STATUSES);
        const lostReason = status === "Lost" ? "Budget constraints" : null;
        const assignedTo = pick(repIds);
        await client.query(
          `insert into leads (
             company, contact_person, email, industry, source, service_id,
             status, lost_reason, value_estimate, assigned_to, next_followup_date, created_by
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$10)`,
          [
            company,
            contact,
            `lead${n}@example.com`,
            pick(INDUSTRIES),
            pick(SOURCES),
            serviceIds.length > 0 ? pick(serviceIds) : null,
            status,
            lostReason,
            Math.round(Math.random() * 500000),
            assignedTo,
            new Date(Date.now() + (Math.random() * 30 - 15) * 24 * 60 * 60 * 1000),
          ]
        );
      }
      console.log(`Seeded ${toInsert} leads (${target} total).`);
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

seedLeads().catch((err) => {
  console.error("Lead seed failed:", err);
  process.exit(1);
});
