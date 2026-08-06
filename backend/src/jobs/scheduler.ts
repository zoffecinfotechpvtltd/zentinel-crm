import cron from "node-cron";
import { runInvoiceOverdueJob } from "./invoiceOverdue";
import { runFollowupReminderJob } from "./followupReminders";
import { runArchiveNotificationsJob } from "./archiveNotifications";
import { runDailyDigestJob } from "./dailyDigest";

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
