import { pool } from "../db/pool";
import { sendMail } from "../lib/mail";

function fmtDate(d: string | Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

// One email per user per morning, containing only that user's own relevant
// items — never a blanket company-wide dump. Per Notifications README:
// "Phase 2, once in-app is solid" — built now that SMTP exists.
export async function runDailyDigestJob(): Promise<{ sent: number }> {
  const usersResult = await pool.query(
    `select id, email, name, role from users where is_active = true and deleted_at is null`
  );

  let sent = 0;

  for (const user of usersResult.rows) {
    const sections: string[] = [];

    if (user.role === "sales" || user.role === "admin") {
      const leadsResult = await pool.query(
        `select company, next_followup_date from leads
         where deleted_at is null and status not in ('Won','Lost') and next_followup_date <= current_date
         ${user.role === "sales" ? "and assigned_to = $1" : ""}
         order by next_followup_date limit 10`,
        user.role === "sales" ? [user.id] : []
      );
      if (leadsResult.rows.length > 0) {
        sections.push(
          `Follow-ups due today or overdue (${leadsResult.rows.length}):\n` +
            leadsResult.rows.map((l) => `  - ${l.company} (due ${fmtDate(l.next_followup_date)})`).join("\n")
        );
      }
    }

    if (user.role === "finance" || user.role === "admin") {
      const invoicesResult = await pool.query(
        `select invoice_number, due_date from invoices
         where deleted_at is null and status = 'Overdue' order by due_date limit 10`
      );
      if (invoicesResult.rows.length > 0) {
        sections.push(
          `Overdue invoices (${invoicesResult.rows.length}):\n` +
            invoicesResult.rows.map((i) => `  - ${i.invoice_number} (due ${fmtDate(i.due_date)})`).join("\n")
        );
      }
    }

    if (user.role === "ops" || user.role === "admin") {
      const projectsResult = await pool.query(
        `select name, due_date from projects
         where deleted_at is null and status <> 'Completed' and due_date < current_date
         ${user.role === "ops" ? "and assigned_to = $1" : ""}
         order by due_date limit 10`,
        user.role === "ops" ? [user.id] : []
      );
      if (projectsResult.rows.length > 0) {
        sections.push(
          `Overdue projects (${projectsResult.rows.length}):\n` +
            projectsResult.rows.map((p) => `  - ${p.name} (due ${fmtDate(p.due_date)})`).join("\n")
        );
      }
    }

    if (sections.length === 0) continue;

    try {
      await sendMail({
        to: user.email,
        subject: "Zoffec Sentinel — your daily summary",
        text: `Good morning ${user.name},\n\n${sections.join("\n\n")}\n\nOpen the app for full detail.`,
      });
      sent++;
    } catch (err) {
      // One user's send failing (bad address, transient SMTP hiccup) shouldn't
      // stop the rest of the team's digests from going out.
      console.error(`Daily digest failed to send to ${user.email}:`, err);
    }
  }

  return { sent };
}
