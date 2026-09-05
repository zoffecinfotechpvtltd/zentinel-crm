import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "../components/Logo";
import {
  IconLeads, IconClients, IconProjects, IconInvoices, IconFollowups, IconReports,
  IconDashboard, IconArrowRight, IconCheck,
} from "../components/Icons";

const FEATURES = [
  { icon: <IconLeads />, title: "Lead pipeline", body: "Track every lead from first touch to close with a drag-and-drop pipeline." },
  { icon: <IconClients />, title: "Client records", body: "One home for every account — contacts, history, and open work." },
  { icon: <IconProjects />, title: "Project delivery", body: "Keep delivery work visible from kickoff through handoff." },
  { icon: <IconInvoices />, title: "Invoicing", body: "Raise, send, and reconcile invoices without leaving the CRM." },
  { icon: <IconFollowups />, title: "Follow-ups", body: "Never miss a next step — overdue items surface automatically." },
  { icon: <IconReports />, title: "Reports", body: "Live pipeline, revenue, and delivery numbers for every team." },
];

const ROLES = [
  { name: "Sales", detail: "Leads, follow-ups, pipeline" },
  { name: "Finance", detail: "Invoices, clients, reports" },
  { name: "Ops", detail: "Projects, clients, reports" },
  { name: "Admin", detail: "Full access, users, audit log" },
];

export function Marketing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <div className="marketing-nav-brand">
          <div className="logo-mark"><Logo size={30} /></div>
          <div>
            <div className="login-brand-name" style={{ color: "var(--text)" }}>Zentinel</div>
            <div className="logo-sub" style={{ color: "var(--text3)" }}>Internal CRM by Zoffec</div>
          </div>
        </div>
        <Link to="/login" className="btn btn-primary">Login</Link>
      </nav>

      <header className="marketing-hero">
        <div className="marketing-hero-watermark"><Logo size={460} /></div>
        <div className="marketing-hero-inner">
          <div className="marketing-hero-copy">
            <span className="login-brand-tag" style={{ color: "var(--indigo)" }}>Intelligent. Protected. Connected.</span>
            <h1 className="marketing-hero-title">Every lead, client, and invoice — tracked in one place.</h1>
            <p className="marketing-hero-sub">
              Zentinel is Zoffec Infotech's internal CRM — one system for sales, finance, ops, and delivery,
              where every role sees exactly the part of the business that's theirs.
            </p>
            <div className="marketing-hero-actions">
              <Link to="/login" className="btn btn-primary">
                Login to Zentinel <IconArrowRight size={15} />
              </Link>
              <a href="#features" className="btn btn-ghost">See what's inside</a>
            </div>
            <div className="marketing-hero-roles">
              {ROLES.map((r) => (
                <span className="hero-role-chip" key={r.name}>{r.name}</span>
              ))}
            </div>
          </div>

          <div className="marketing-hero-visual">
            <div className="hero-preview-card">
              <div className="hero-preview-topbar">
                <span className="hero-preview-dot" />
                <span className="hero-preview-dot" />
                <span className="hero-preview-dot" />
                <div className="hero-preview-search">Search or jump to…</div>
              </div>
              <div className="hero-preview-body">
                <div className="hero-preview-sidebar">
                  <div className="hero-preview-nav-item active"><IconDashboard size={13} /> Dashboard</div>
                  <div className="hero-preview-nav-item"><IconLeads size={13} /> Leads</div>
                  <div className="hero-preview-nav-item"><IconClients size={13} /> Clients</div>
                  <div className="hero-preview-nav-item"><IconInvoices size={13} /> Invoices</div>
                </div>
                <div className="hero-preview-main">
                  <div className="hero-preview-stats">
                    <div className="hero-preview-stat">
                      <span>Total Leads</span>
                      <strong>135</strong>
                      <em>+12% this month</em>
                    </div>
                    <div className="hero-preview-stat">
                      <span>Active Clients</span>
                      <strong>48</strong>
                      <em>+8% this month</em>
                    </div>
                  </div>
                  <svg className="hero-preview-chart" viewBox="0 0 240 64" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="hero-chart-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#6366f1" stopOpacity=".35" />
                        <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0 46 L34 40 L68 44 L102 26 L136 32 L170 14 L204 20 L240 6 L240 64 L0 64 Z" fill="url(#hero-chart-fill)" />
                    <path d="M0 46 L34 40 L68 44 L102 26 L136 32 L170 14 L204 20 L240 6" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="hero-preview-floater hero-preview-floater-1">
              <IconCheck size={13} /> Invoice #248 paid
            </div>
            <div className="hero-preview-floater hero-preview-floater-2">
              <IconFollowups size={13} /> 3 follow-ups due today
            </div>
          </div>
        </div>
      </header>

      <div className="marketing-strip">
        {FEATURES.map((f) => (
          <div className="marketing-strip-item" key={f.title}>
            {f.icon}
            <span>{f.title}</span>
          </div>
        ))}
      </div>

      <footer className="marketing-footer">
        <span>Zentinel — internal use only, Zoffec Infotech Pvt. Ltd.</span>
      </footer>
    </div>
  );
}
