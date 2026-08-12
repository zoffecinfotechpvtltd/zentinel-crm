import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Managed Postgres (Render et al.) defaults its session timezone to UTC
// regardless of where the app server itself runs. Every "due today" /
// "overdue" check in this app (follow-up reminders, escalation, dashboard
// stats) leans on bare current_date/now() — under UTC those flip over up to
// 5.5 hours later than they should for a team working India business
// hours, e.g. a follow-up "due today" at 8pm IST still reads as tomorrow
// until UTC midnight. Setting the session timezone once per connection
// makes current_date/now() resolve to IST everywhere, without touching
// every query that uses them.
pool.on("connect", (client) => {
  client.query("SET TIME ZONE 'Asia/Kolkata'").catch((err) => {
    console.error("Failed to set session timezone to Asia/Kolkata", err);
  });
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
  process.exit(1);
});
