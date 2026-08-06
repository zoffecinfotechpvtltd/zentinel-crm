import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

const CLIENT_STATUS_EXPR = `
  case
    when c.is_archived then 'Inactive'
    when exists (
      select 1 from contracts ct where ct.client_id = c.id and ct.deleted_at is null
        and (ct.end_date is null or ct.end_date >= current_date)
    ) then 'Active'
    else 'Inactive'
  end
`;

async function scalar(sql: string, params: unknown[] = []): Promise<number> {
  const result = await pool.query(sql, params);
  return Number(result.rows[0].value ?? 0);
}

router.get("/", async (_req, res) => {
  const [
    totalLeads,
    activeClients,
    proposalsSent,
    projectsActive,
    pendingPaymentsCount,
    pendingPaymentsSum,
    revenueThisMonth,
    revenueLastMonth,
    newLeadsThisMonth,
    newLeadsLastMonth,
    followupsToday,
    wonCount,
    lostCount,
  ] = await Promise.all([
    scalar(`select count(*) as value from leads where deleted_at is null`),
    scalar(`select count(*) as value from clients c where deleted_at is null and (${CLIENT_STATUS_EXPR}) = 'Active'`),
    scalar(`select count(*) as value from leads where deleted_at is null and status = 'Proposal Sent'`),
    scalar(`select count(*) as value from projects where deleted_at is null and status <> 'Completed'`),
    scalar(
      `select count(*) as value from invoices i where deleted_at is null and status not in ('Draft','Cancelled')
       and (i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)) > 0`
    ),
    scalar(
      `select coalesce(sum(i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)), 0) as value
       from invoices i where deleted_at is null and status not in ('Draft','Cancelled')`
    ),
    scalar(
      `select coalesce(sum(amount), 0) as value from payments
       where date_trunc('month', payment_date) = date_trunc('month', current_date)`
    ),
    scalar(
      `select coalesce(sum(amount), 0) as value from payments
       where date_trunc('month', payment_date) = date_trunc('month', current_date - interval '1 month')`
    ),
    scalar(
      `select count(*) as value from leads where deleted_at is null
       and date_trunc('month', created_at) = date_trunc('month', current_date)`
    ),
    scalar(
      `select count(*) as value from leads where deleted_at is null
       and date_trunc('month', created_at) = date_trunc('month', current_date - interval '1 month')`
    ),
    scalar(
      `select count(*) as value from leads where deleted_at is null and status not in ('Won','Lost')
       and next_followup_date = current_date`
    ),
    scalar(`select count(*) as value from leads where deleted_at is null and status = 'Won'`),
    scalar(`select count(*) as value from leads where deleted_at is null and status = 'Lost'`),
  ]);

  const conversionRate = wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : 0;
  const revenueChangePct = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 : null;
  const leadsChangePct = newLeadsLastMonth > 0 ? ((newLeadsThisMonth - newLeadsLastMonth) / newLeadsLastMonth) * 100 : null;

  const recentActivityResult = await pool.query(
    `select a.id, a.entity_type, a.entity_id, a.action, a.detail, a.created_at, u.name as actor_name
     from activity_log a left join users u on u.id = a.actor_id
     order by a.created_at desc limit 20`
  );

  const upcomingFollowupsResult = await pool.query(
    `select id, company, contact_person, next_followup_date, assigned_to
     from leads where deleted_at is null and status not in ('Won','Lost') and next_followup_date <= current_date
     order by next_followup_date limit 20`
  );

  res.json({
    stats: {
      total_leads: totalLeads,
      active_clients: activeClients,
      proposals_sent: proposalsSent,
      projects_active: projectsActive,
      pending_payments_count: pendingPaymentsCount,
      pending_payments_amount: pendingPaymentsSum,
      revenue_this_month: revenueThisMonth,
      revenue_change_pct: revenueChangePct,
      new_leads_this_month: newLeadsThisMonth,
      new_leads_change_pct: leadsChangePct,
      followups_today: followupsToday,
      conversion_rate_pct: Math.round(conversionRate * 100) / 100,
    },
    recent_activity: recentActivityResult.rows,
    upcoming_followups: upcomingFollowupsResult.rows,
  });
});

export default router;
