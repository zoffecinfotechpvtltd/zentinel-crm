import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { API_BASE } from "../lib/api";
import { formatMoney, formatMoneyExact, formatDate } from "../lib/format";
import { Badge } from "../components/Badge";
import { PageHeader } from "../components/PageHeader";
import { IconReports } from "../components/Icons";

const TABS = [
  { key: "conversion", label: "Lead Conversion" },
  { key: "revenue", label: "Revenue" },
  { key: "payment", label: "Payment Pending" },
  { key: "service", label: "Service-wise" },
];

type ConversionReport = {
  funnel: { status: string; count: string; value_sum: string }[];
  won_count: number; lost_count: number;
  conversion_rate_by_count_pct: number; conversion_rate_by_value_pct: number;
};
type RevenueReport = {
  monthly_trend: { month: string; total: string }[];
  client_wise: { client_id: string; company: string; total: string }[];
  outstanding: number; fy_target: { amount: number; fiscal_year: string } | null; fy_actual: number;
};
type PendingRow = { id: string; invoice_number: string | null; client_company: string; due_date: string | null; status: string; balance: string };
type ServiceReport = {
  revenue_by_service: { service_id: string; name: string; revenue: string }[];
  lead_volume_by_service: { service_id: string; name: string; lead_count: string }[];
};

export function Reports() {
  const [tab, setTab] = useState("conversion");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const range = `${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

  const { data: conversion } = useFetch<ConversionReport>(`/reports/lead-conversion?x${range}`, [tab, from, to]);
  const { data: revenue } = useFetch<RevenueReport>(`/reports/revenue?x${range}`, [tab, from, to]);
  const { data: pending } = useFetch<{ data: PendingRow[] }>(`/reports/payment-pending${statusFilter ? `?status=${statusFilter}` : ""}`, [tab, statusFilter]);
  const { data: service } = useFetch<ServiceReport>(`/reports/service-wise?x${range}`, [tab, from, to]);

  function exportPending() {
    window.open(`${API_BASE}/api/reports/payment-pending/export${statusFilter ? `?status=${statusFilter}` : ""}`, "_blank");
  }

  return (
    <div>
      <PageHeader icon={<IconReports size={19} />} title="Reports & Analytics" subtitle="Pipeline, revenue, and payment visibility across the company" />
      <div className="tab-bar">
        {TABS.map((t) => <button type="button" key={t.key} className={`tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {(tab === "conversion" || tab === "revenue" || tab === "service") && (
        <div className="filter-bar">
          <input className="filter-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
          <input className="filter-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
        </div>
      )}

      {tab === "conversion" && conversion && (
        <div>
          <div className="stat-grid">
            <div className="report-stat"><div className="report-stat-val" style={{ color: "var(--success)" }}>{conversion.won_count}</div><div className="report-stat-label">Won</div></div>
            <div className="report-stat"><div className="report-stat-val" style={{ color: "var(--danger)" }}>{conversion.lost_count}</div><div className="report-stat-label">Lost</div></div>
            <div className="report-stat"><div className="report-stat-val" style={{ color: "var(--accent)" }}>{conversion.conversion_rate_by_count_pct}%</div><div className="report-stat-label">Conversion (by count)</div></div>
            <div className="report-stat"><div className="report-stat-val" style={{ color: "var(--accent)" }}>{conversion.conversion_rate_by_value_pct}%</div><div className="report-stat-label">Conversion (by value)</div></div>
          </div>
          <div className="card">
            <div className="card-title">Funnel by Stage</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Stage</th><th>Count</th><th>Pipeline Value</th></tr></thead>
                <tbody>
                  {conversion.funnel.map((f) => (
                    <tr key={f.status}><td><Badge status={f.status} /></td><td>{f.count}</td><td className="mono">{formatMoney(f.value_sum)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "revenue" && revenue && (
        <div>
          <div className="stat-grid">
            <div className="report-stat"><div className="report-stat-val" style={{ color: "var(--warning)" }}>{formatMoney(revenue.outstanding)}</div><div className="report-stat-label">Outstanding</div></div>
            <div className="report-stat"><div className="report-stat-val" style={{ color: "var(--success)" }}>{formatMoney(revenue.fy_actual)}</div><div className="report-stat-label">FY Actual</div></div>
            <div className="report-stat"><div className="report-stat-val" style={{ color: "var(--accent)" }}>{revenue.fy_target ? formatMoney(revenue.fy_target.amount) : "not set"}</div><div className="report-stat-label">FY Target</div></div>
            <div className="report-stat"><div className="report-stat-val" style={{ color: "var(--info)" }}>{revenue.fy_target ? `${Math.round((revenue.fy_actual / revenue.fy_target.amount) * 100)}%` : "—"}</div><div className="report-stat-label">of Target</div></div>
          </div>
          <div className="grid2">
            <div className="card">
              <div className="card-title">Client-wise Revenue</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Client</th><th>Revenue</th></tr></thead>
                  <tbody>{revenue.client_wise.map((c) => <tr key={c.client_id}><td>{c.company}</td><td className="mono">{formatMoney(c.total)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Monthly Trend</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
                  <tbody>{revenue.monthly_trend.map((m) => <tr key={m.month}><td>{new Date(m.month).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</td><td className="mono">{formatMoney(m.total)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "payment" && (
        <div>
          <div className="filter-bar">
            <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Pending</option><option value="Overdue">Overdue only</option><option value="Sent">Sent</option><option value="Partial">Partial</option>
            </select>
            <button type="button" className="btn btn-ghost" onClick={exportPending}>⭳ Export Excel</button>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Invoice #</th><th>Client</th><th>Due</th><th>Status</th><th>Balance</th></tr></thead>
                <tbody>
                  {pending?.data.length === 0 && <tr><td colSpan={5}><div className="empty">Nothing pending</div></td></tr>}
                  {pending?.data.map((r) => (
                    <tr key={r.id}><td className="mono">{r.invoice_number}</td><td>{r.client_company}</td><td style={{ fontSize: 12 }}>{formatDate(r.due_date)}</td><td><Badge status={r.status} /></td><td className="mono">{formatMoneyExact(r.balance)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "service" && service && (
        <div className="grid2">
          <div className="card">
            <div className="card-title">Revenue by Service</div>
            <div className="table-wrap">
              <table><thead><tr><th>Service</th><th>Revenue</th></tr></thead>
                <tbody>{service.revenue_by_service.map((s) => <tr key={s.service_id}><td>{s.name}</td><td className="mono">{formatMoney(s.revenue)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Lead Volume by Service</div>
            <div className="table-wrap">
              <table><thead><tr><th>Service</th><th>Leads</th></tr></thead>
                <tbody>{service.lead_volume_by_service.map((s) => <tr key={s.service_id}><td>{s.name}</td><td>{s.lead_count}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
