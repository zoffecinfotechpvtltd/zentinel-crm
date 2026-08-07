import "chart.js/auto";
import { Bar, Doughnut } from "react-chartjs-2";
import { useFetch } from "../lib/useFetch";
import { StatCard } from "../components/StatCard";
import { StatCardSkeleton } from "../components/Skeleton";
import { PageHeader } from "../components/PageHeader";
import { formatMoney, formatDateTime, formatDate } from "../lib/format";
import { Link } from "react-router-dom";
import { IconDashboard, IconInbox } from "../components/Icons";
import { useAuth } from "../context/AuthContext";
import { OnboardingChecklist } from "../components/OnboardingChecklist";

type DashboardData = {
  stats: {
    total_leads: number; active_clients: number; proposals_sent: number; projects_active: number;
    pending_payments_count: number; pending_payments_amount: number;
    revenue_this_month: number; revenue_change_pct: number | null;
    new_leads_this_month: number; new_leads_change_pct: number | null;
    followups_today: number; conversion_rate_pct: number;
  };
  recent_activity: { id: string; entity_type: string; action: string; detail: Record<string, unknown>; created_at: string; actor_name: string | null }[];
  upcoming_followups: { id: string; company: string; contact_person: string; next_followup_date: string }[];
};

type RevenueReport = { monthly_trend: { month: string; total: string }[] };
type ConversionReport = { funnel: { status: string; count: string }[] };

function describeActivity(a: DashboardData["recent_activity"][number]): string {
  const who = a.actor_name ?? "Someone";
  if (a.action === "status_changed") {
    const d = a.detail as { from?: string; to?: string; invoice_number?: string };
    return `${who} changed ${a.entity_type} status from ${d.from} to ${d.to}${d.invoice_number ? ` (${d.invoice_number})` : ""}`;
  }
  if (a.action === "created") return `${who} created a new ${a.entity_type}`;
  if (a.action === "reassigned") return `${who} reassigned a ${a.entity_type}`;
  if (a.action === "note_added") return `${who} logged an interaction`;
  return `${who} — ${a.action} on ${a.entity_type}`;
}

export function Dashboard() {
  const { user } = useAuth();
  const { data, loading } = useFetch<DashboardData>("/dashboard");
  const { data: revenue } = useFetch<RevenueReport>("/reports/revenue");
  const { data: conversion } = useFetch<ConversionReport>("/reports/lead-conversion");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading || !data) {
    return (
      <div>
        <PageHeader icon={<IconDashboard size={19} />} title="Dashboard" />
        <div className="stat-grid">{Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
        <div className="stat-grid">{Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
      </div>
    );
  }
  const s = data.stats;

  return (
    <div>
      <PageHeader icon={<IconDashboard size={19} />} title="Dashboard" subtitle={`${greeting}, ${user?.name?.split(" ")[0] ?? ""} — here's where things stand`} />
      {user?.role === "admin" && <OnboardingChecklist hasLeads={s.total_leads > 0} hasClients={s.active_clients > 0} />}
      <div className="stat-grid">
        <StatCard label="Total Leads" value={String(s.total_leads)} color="var(--accent)"
          change={s.new_leads_change_pct != null ? `${s.new_leads_change_pct >= 0 ? "+" : ""}${s.new_leads_change_pct.toFixed(0)}% vs last month` : `${s.new_leads_this_month} this month`}
          changeUp={s.new_leads_change_pct == null || s.new_leads_change_pct >= 0} />
        <StatCard label="Active Clients" value={String(s.active_clients)} color="var(--success)" />
        <StatCard label="Proposals Sent" value={String(s.proposals_sent)} color="var(--purple)" />
        <StatCard label="Projects Active" value={String(s.projects_active)} color="var(--info)" />
      </div>
      <div className="stat-grid">
        <StatCard label="Pending Payments" value={formatMoney(s.pending_payments_amount)} color="var(--warning)"
          change={`${s.pending_payments_count} invoice(s) pending`} changeUp={false} />
        <StatCard label="Revenue This Month" value={formatMoney(s.revenue_this_month)} color="var(--success)"
          change={s.revenue_change_pct != null ? `${s.revenue_change_pct >= 0 ? "+" : ""}${s.revenue_change_pct.toFixed(0)}% vs last month` : "no data last month"}
          changeUp={s.revenue_change_pct == null || s.revenue_change_pct >= 0} />
        <StatCard label="Follow-ups Today" value={String(s.followups_today)} color="var(--orange)" />
        <StatCard label="Conversion Rate" value={`${s.conversion_rate_pct}%`} color="var(--accent)" />
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">Revenue Trend</div>
          <div className="chart-wrap">
            {revenue && (
              <Bar
                data={{
                  labels: revenue.monthly_trend.map((m) => new Date(m.month).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })),
                  datasets: [{ label: "Revenue", data: revenue.monthly_trend.map((m) => Number(m.total)), backgroundColor: "#ff7a00", borderRadius: 4 }],
                }}
                options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }}
              />
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Lead Status Breakdown</div>
          <div className="chart-wrap">
            {conversion && (
              <Doughnut
                data={{
                  labels: conversion.funnel.map((f) => f.status),
                  datasets: [{ data: conversion.funnel.map((f) => Number(f.count)), backgroundColor: ["#0ea5e9", "#94a3b8", "#22c55e", "#8b5cf6", "#ffb703", "#16a34a", "#ef4444"], borderWidth: 0 }],
                }}
                options={{ maintainAspectRatio: false }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">Upcoming Follow-ups <Link className="btn btn-primary btn-sm" to="/followups">View All</Link></div>
          <div className="followup-list">
            {data.upcoming_followups.length === 0 && <div className="empty"><div className="empty-icon"><IconInbox size={26} /></div>Nothing due</div>}
            {data.upcoming_followups.map((f) => (
              <div className="followup-item" key={f.id}>
                <div className="followup-company">{f.company}</div>
                <div className="followup-detail">{f.contact_person} — due {formatDate(f.next_followup_date)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Recent Activity</div>
          <div className="timeline">
            {data.recent_activity.map((a) => (
              <div className="timeline-item" key={a.id}>
                <div className={`timeline-dot${a.action === "status_changed" && (a.detail as { to?: string }).to === "Won" ? " won" : ""}${a.action === "status_changed" && (a.detail as { to?: string }).to === "Lost" ? " lost" : ""}`} />
                <div>
                  <div className="timeline-text">{describeActivity(a)}</div>
                  <div className="timeline-time">{formatDateTime(a.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
