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

router.get("/", async (req, res) => {
  // Sales' job is leads through to conversion — no company-wide pricing,
  // client, or project figures, and every count scoped to leads THEY own
  // (mirrors the same scoping GET /leads already applies). Everyone else
  // (Admin/Finance/Ops) sees the company-wide view.
  const isSales = req.user!.role === "sales";
  const ownFilter = isSales ? `and assigned_to = $1` : "";
  const ownParams = isSales ? [req.user!.id] : [];

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
    scalar(`select count(*) as value from leads where deleted_at is null ${ownFilter}`, ownParams),
    isSales ? Promise.resolve(0) : scalar(`select count(*) as value from clients c where deleted_at is null and (${CLIENT_STATUS_EXPR}) = 'Active'`),
    scalar(`select count(*) as value from leads where deleted_at is null and status = 'Proposal Sent' ${ownFilter}`, ownParams),
    isSales ? Promise.resolve(0) : scalar(`select count(*) as value from projects where deleted_at is null and status <> 'Completed'`),
    isSales ? Promise.resolve(0) : scalar(
      `select count(*) as value from invoices i where deleted_at is null and status not in ('Draft','Cancelled')
       and (i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)) > 0`
    ),
    isSales ? Promise.resolve(0) : scalar(
      `select coalesce(sum(i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)), 0) as value
       from invoices i where deleted_at is null and status not in ('Draft','Cancelled')`
    ),
    isSales ? Promise.resolve(0) : scalar(
      `select coalesce(sum(amount), 0) as value from payments
       where date_trunc('month', payment_date) = date_trunc('month', current_date)`
    ),
    isSales ? Promise.resolve(0) : scalar(
      `select coalesce(sum(amount), 0) as value from payments
       where date_trunc('month', payment_date) = date_trunc('month', current_date - interval '1 month')`
    ),
    scalar(
      `select count(*) as value from leads where deleted_at is null
       and date_trunc('month', created_at) = date_trunc('month', current_date) ${ownFilter}`,
      ownParams
    ),
    scalar(
      `select count(*) as value from leads where deleted_at is null
       and date_trunc('month', created_at) = date_trunc('month', current_date - interval '1 month') ${ownFilter}`,
      ownParams
    ),
    scalar(
      `select count(*) as value from leads where deleted_at is null and status not in ('Won','Lost')
       and next_followup_date = current_date ${ownFilter}`,
      ownParams
    ),
    scalar(`select count(*) as value from leads where deleted_at is null and status = 'Won' ${ownFilter}`, ownParams),
    scalar(`select count(*) as value from leads where deleted_at is null and status = 'Lost' ${ownFilter}`, ownParams),
  ]);

  const conversionRate = wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : 0;
  const revenueChangePct = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 : null;
  const leadsChangePct = newLeadsLastMonth > 0 ? ((newLeadsThisMonth - newLeadsLastMonth) / newLeadsLastMonth) * 100 : null;

  const upcomingFollowupsResult = await pool.query(
    `select id, company, contact_person, next_followup_date, assigned_to
     from leads where deleted_at is null and status not in ('Won','Lost') and next_followup_date <= current_date
     ${isSales ? "and assigned_to = $1" : ""}
     order by next_followup_date limit 20`,
    isSales ? [req.user!.id] : []
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
    upcoming_followups: upcomingFollowupsResult.rows,
  });
});

// GET /api/dashboard/activity — the full, paginated version of what the
// dashboard's "Recent Activity" widget used to show inline (moved to its
// own page instead of a capped-at-20, no-pagination card). Same scoping as
// before: a Sales rep only sees activity on leads assigned to them,
// everyone else sees the company-wide feed.
router.get("/activity", async (req, res) => {
  const isSales = req.user!.role === "sales";
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 25));
  const offset = (page - 1) * perPage;

  if (isSales) {
    const countResult = await pool.query(
      `select count(*) from activity_log a
       join leads l on l.id = a.entity_id and a.entity_type = 'lead'
       where l.assigned_to = $1`,
      [req.user!.id]
    );
    const dataResult = await pool.query(
      `select a.id, a.entity_type, a.entity_id, a.action, a.detail, a.created_at, u.name as actor_name
       from activity_log a
       left join users u on u.id = a.actor_id
       join leads l on l.id = a.entity_id and a.entity_type = 'lead'
       where l.assigned_to = $1
       order by a.created_at desc limit $2 offset $3`,
      [req.user!.id, perPage, offset]
    );
    res.json({ data: dataResult.rows, total: Number(countResult.rows[0].count), page, per_page: perPage });
    return;
  }

  const countResult = await pool.query(`select count(*) from activity_log`);
  const dataResult = await pool.query(
    `select a.id, a.entity_type, a.entity_id, a.action, a.detail, a.created_at, u.name as actor_name
     from activity_log a left join users u on u.id = a.actor_id
     order by a.created_at desc limit $1 offset $2`,
    [perPage, offset]
  );
  res.json({ data: dataResult.rows, total: Number(countResult.rows[0].count), page, per_page: perPage });
});

export default router;
