import cron from "node-cron";
import { runInvoiceOverdueJob } from "./invoiceOverdue";
import { runFollowupReminderJob } from "./followupReminders";
import { runArchiveNotificationsJob } from "./archiveNotifications";
import { runDailyDigestJob } from "./dailyDigest";
import { runCleanupOldRecordsJob } from "./cleanupOldRecords";
import { runAutomatedBackupJob } from "./automatedBackup";
import { runWeeklyReportDigestJob } from "./weeklyReportDigest";
import { runRecurringInvoicesJob } from "./recurringInvoices";

type ScheduledJob = {
  name: string;
  cronExpr: string;
  task: () => Promise<void>;
};

// Jobs are registered here as each feature phase adds them:
// - invoice overdue detection (Phase 5) — daily at 01:00
// - follow-up reminder + escalation (Phase 7)
// - Tally sync poll (Phase 6b)
// - sync health check (Phase 6b)
const jobs: ScheduledJob[] = [
  {
    name: "invoice-overdue-detection",
    cronExpr: "0 1 * * *",
    task: async () => {
      const { affected } = await runInvoiceOverdueJob();
      if (affected > 0) console.log(`Invoice overdue job: flagged ${affected} invoice(s).`);
    },
  },
  {
    name: "followup-reminders",
    cronExpr: "0 7 * * *",
    task: async () => {
      const { reminders, escalations } = await runFollowupReminderJob();
      console.log(`Follow-up reminder job: ${reminders} reminder(s), ${escalations} escalation(s).`);
    },
  },
  {
    name: "archive-old-notifications",
    cronExpr: "0 2 * * *",
    task: async () => {
      const { affected } = await runArchiveNotificationsJob();
      if (affected > 0) console.log(`Notification archive job: archived ${affected} notification(s).`);
    },
  },
  {
    name: "daily-digest-email",
    cronExpr: "30 7 * * *",
    task: async () => {
      const { sent } = await runDailyDigestJob();
      console.log(`Daily digest job: sent ${sent} email(s).`);
    },
  },
  {
    name: "cleanup-old-records",
    cronExpr: "0 3 * * 0", // weekly, Sunday 03:00 — low-traffic window
    task: async () => {
      const r = await runCleanupOldRecordsJob();
      console.log(`Cleanup job: ${r.sessions} expired session(s), ${r.resetTokens} old reset token(s), ${r.leads} ancient unconverted lead(s) purged.`);
    },
  },
  {
    name: "automated-backup",
    cronExpr: "0 4 * * *",
    task: async () => {
      const r = await runAutomatedBackupJob();
      if (!r.skipped) console.log(`Automated backup job: wrote ${r.key}.`);
    },
  },
  {
    name: "weekly-report-digest",
    cronExpr: "0 8 * * 1", // Monday 08:00
    task: async () => {
      const { sent } = await runWeeklyReportDigestJob();
      console.log(`Weekly report digest job: sent ${sent} email(s).`);
    },
  },
  {
    name: "recurring-invoices",
    cronExpr: "0 5 * * *", // daily 05:00, ahead of the 07:00/07:30 digest jobs so today's generated invoices show up in them
    task: async () => {
      const { created, skipped } = await runRecurringInvoicesJob();
      if (created > 0 || skipped > 0) console.log(`Recurring invoices job: created ${created}, skipped ${skipped}.`);
    },
  },
];

export function startScheduler(): void {
  for (const job of jobs) {
    cron.schedule(job.cronExpr, () => {
      job.task().catch((err) => {
        console.error(`Scheduled job "${job.name}" failed:`, err);
      });
    });
  }
  console.log(`Scheduler started with ${jobs.length} job(s).`);
}
