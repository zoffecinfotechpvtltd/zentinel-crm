import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFetch } from "../lib/useFetch";
import { StatCard } from "../components/StatCard";
import { StatCardSkeleton } from "../components/Skeleton";
import { PageHeader } from "../components/PageHeader";
import { formatMoney, formatDate, isOverdue } from "../lib/format";
import { Link } from "react-router-dom";
import { IconDashboard, IconInbox } from "../components/Icons";
import { useAuth, isAdminRole } from "../context/AuthContext";
import { OnboardingChecklist } from "../components/OnboardingChecklist";

type DashboardData = {
  stats: {
    total_leads: number; active_clients: number; proposals_sent: number; projects_active: number;
    pending_payments_count: number; pending_payments_amount: number;
    revenue_this_month: number; revenue_change_pct: number | null;
    new_leads_this_month: number; new_leads_change_pct: number | null;
    followups_today: number; conversion_rate_pct: number;
  };
  upcoming_followups: { id: string; company: string; contact_person: string; next_followup_date: string }[];
};

type RevenueReport = { monthly_trend: { month: string; total: string }[] };
type ConversionReport = { funnel: { status: string; count: string }[] };

const FUNNEL_COLORS = ["#06b6d4", "#94a3b8", "#16a34a", "#7c3aed", "#b45309", "#16a34a", "#dc2626"];

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return <div className="empty"><div className="empty-icon"><IconInbox size={26} /></div>{children}</div>;
}

export function Dashboard() {
  const { user } = useAuth();
  const { data, loading } = useFetch<DashboardData>("/dashboard");
  // Revenue is pricing data Sales doesn't have access to (see reports.ts) —
  // skip the request entirely rather than firing one that's always going to
  // come back 403.
  const { data: revenue } = useFetch<RevenueReport>(user?.role === "sales" ? "" : "/reports/revenue");
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
  const isSales = user?.role === "sales";

  return (
    <div>
      <PageHeader icon={<IconDashboard size={19} />} title="Dashboard" subtitle={`${greeting}, ${user?.name?.split(" ")[0] ?? ""} - here's where things stand`} />
      {isAdminRole(user?.role) && <OnboardingChecklist hasLeads={s.total_leads > 0} hasClients={s.active_clients > 0} />}
      <div className="stat-grid">
        <StatCard label={isSales ? "Your Leads" : "Total Leads"} value={String(s.total_leads)} color="var(--accent)"
          change={s.new_leads_change_pct != null ? `${s.new_leads_change_pct >= 0 ? "+" : ""}${s.new_leads_change_pct.toFixed(0)}% vs last month` : `${s.new_leads_this_month} this month`}
          changeUp={s.new_leads_change_pct == null || s.new_leads_change_pct >= 0} />
        {isSales ? (
          <StatCard label="Proposals Sent" value={String(s.proposals_sent)} color="var(--purple)" />
        ) : (
          <>
            <StatCard label="Active Clients" value={String(s.active_clients)} color="var(--success)" />
            <StatCard label="Proposals Sent" value={String(s.proposals_sent)} color="var(--purple)" />
            <StatCard label="Projects Active" value={String(s.projects_active)} color="var(--info)" />
          </>
        )}
      </div>
      <div className="stat-grid">
        {!isSales && (
          <>
            <StatCard label="Pending Payments" value={formatMoney(s.pending_payments_amount)} color="var(--warning)"
              change={`${s.pending_payments_count} invoice(s) pending`} changeUp={false} />
            <StatCard label="Revenue This Month" value={formatMoney(s.revenue_this_month)} color="var(--success)"
              change={s.revenue_change_pct != null ? `${s.revenue_change_pct >= 0 ? "+" : ""}${s.revenue_change_pct.toFixed(0)}% vs last month` : "no data last month"}
              changeUp={s.revenue_change_pct == null || s.revenue_change_pct >= 0} />
          </>
        )}
        <StatCard label="Follow-ups Today" value={String(s.followups_today)} color="var(--orange)" />
        <StatCard label="Conversion Rate" value={`${s.conversion_rate_pct}%`} color="var(--accent)" />
      </div>

      <div className="grid2">
        {!isSales && (
          <div className="card">
            <div className="card-title">Revenue Trend</div>
            <div className="chart-wrap">
              {revenue?.monthly_trend.some((m) => Number(m.total) > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenue.monthly_trend.map((m) => ({ month: new Date(m.month).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), total: Number(m.total) }))}>
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => formatMoney(v)} />
                    <Tooltip formatter={(v) => formatMoney(Number(v))} contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="total" name="Revenue" fill="#2563ff" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : revenue && (
                <ChartEmpty>No payments recorded yet</ChartEmpty>
              )}
            </div>
          </div>
        )}
        <div className="card">
          <div className="card-title">Lead Status Breakdown</div>
          <div className="chart-wrap">
            {conversion && conversion.funnel.some((f) => Number(f.count) > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={conversion.funnel.map((f) => ({ name: f.status, value: Number(f.count) }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                  >
                    {conversion.funnel.map((f, i) => <Cell key={f.status} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} stroke="none" />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : conversion && (
              <ChartEmpty>No leads yet</ChartEmpty>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Follow-ups Due
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn btn-ghost btn-sm" to="/activity">View Activity</Link>
            <Link className="btn btn-primary btn-sm" to="/followups">View All</Link>
          </div>
        </div>
        {(() => {
          const overdue = data.upcoming_followups.filter((f) => isOverdue(f.next_followup_date));
          const dueToday = data.upcoming_followups.filter((f) => !isOverdue(f.next_followup_date));
          if (overdue.length === 0 && dueToday.length === 0) {
            return <div className="empty"><div className="empty-icon"><IconInbox size={26} /></div>Nothing due</div>;
          }
          return (
            <>
              {overdue.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)", textTransform: "uppercase", letterSpacing: ".05em", margin: "4px 0 6px" }}>Overdue</div>
                  <div className="followup-list">
                    {overdue.map((f) => (
                      <div className="followup-item overdue" key={f.id}>
                        <div className="followup-company">{f.company}</div>
                        <div className="followup-detail">{f.contact_person} - due {formatDate(f.next_followup_date)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {dueToday.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", margin: "14px 0 6px" }}>Due Today</div>
                  <div className="followup-list">
                    {dueToday.map((f) => (
                      <div className="followup-item" key={f.id}>
                        <div className="followup-company">{f.company}</div>
                        <div className="followup-detail">{f.contact_person} - due {formatDate(f.next_followup_date)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
