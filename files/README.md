# Zoffec Internal CMS — Build Documentation

This folder is the complete spec package for turning the `zoffec_crm_system.html` prototype into a real internal tool. It's written so an engineer (human or AI coding agent) can build each piece without needing to ask clarifying questions.

## How to use this package

1. Read **`00-prototype-analysis.md`** first — it tells you exactly what in the prototype is real UI you should keep, and what's decorative fake data you're replacing.
2. Read **`01-brand-and-theme.md`** — the visual system to apply across every screen.
3. Read **`02-architecture-and-stack.md`** — the technical foundation every feature README assumes (data model conventions, stack choice, environments).
4. Read **`03-tally-integration-strategy.md`** — the single most important constraint on this whole project. Read this before building Invoices or Payments.
5. Build features in this order (each has its own README in `features/`), because later features depend on earlier ones:

| # | Feature | Depends on |
|---|---------|-----------|
| 1 | [Auth & Roles](features/01-auth-roles.md) | — (build first, everything else sits behind it) |
| 2 | [Leads](features/02-leads.md) | Auth |
| 3 | [Clients](features/03-clients.md) | Leads (conversion) |
| 4 | [Projects](features/04-projects.md) | Clients |
| 5 | [Invoices](features/05-invoices.md) | Clients, Projects |
| 6 | [Payments & Tally Sync](features/06-payments-tally-sync.md) | Invoices |
| 7 | [Follow-up Automation](features/07-followup-automation.md) | Leads, Clients |
| 8 | [Notifications](features/08-notifications.md) | Follow-ups, Invoices |
| 9 | [Reporting](features/09-reporting.md) | Everything above |

## What this is, deliberately, not

Per the brief: this is a **small internal tool for one company**, not a commercial multi-tenant product. Every README below defaults to the leanest thing that solves the actual problem:

- One tenant, one database, no multi-org abstraction.
- No plugin system, no white-labeling, no public API surface beyond what Tally sync needs.
- Auth is email/password + roles, not SSO/SAML/OAuth-provider infrastructure — Zoffec is ~10–20 people.
- Reporting is pre-built dashboards, not a generic report builder.
- Automation is aggressive where it's reliable (reminders, status transitions, overdue detection) and explicitly manual where reliability can't be guaranteed (see the Tally doc — this is the one place full automation is not honestly achievable).

## Recommended stack (assumed by every README)

- **Backend:** Node.js (TypeScript) + PostgreSQL. Postgres because invoices/payments need real transactions and numeric precision (`numeric`, not float, for money).
- **Frontend:** Keep the prototype's structure (vanilla JS SPA with page-switching) or port to React — either works with these specs, since the specs describe data contracts and behavior, not implementation. React is recommended only because it removes the manual DOM-sync bugs visible in the prototype (see analysis doc).
- **Auth:** Session cookies (httpOnly, secure) or JWT — either is fine at this scale; session cookies are simpler to revoke.
- **Hosting:** A single small VM or container (this app will never need to scale horizontally at Zoffec's size) with the Postgres DB alongside it, plus the **Tally Bridge Agent** described in doc 03, which must run on a Windows machine on the same LAN as the Tally installation.
- **File storage:** Local disk or S3-compatible bucket for invoice PDFs / uploaded documents.

## Non-negotiable engineering conventions (apply to every feature)

- **Money is stored as integer paise (or `numeric(14,2)`), never float.** The prototype's `parseFloat` arithmetic for invoice totals is fine for a demo and not fine for production — see analysis doc.
- **Every write is attributed and timestamped.** `created_by`, `created_at`, `updated_by`, `updated_at` on every table.
- **Nothing is hard-deleted.** Leads, clients, invoices — soft-delete (`deleted_at`) only. Financial records especially must never disappear from the database even if hidden from the UI.
- **Every status change on a lead, invoice, or project writes an activity/timeline entry.** The prototype's dashboard "Recent Activity" feed is currently hardcoded fake data — in the real system it must be a genuine append-only log driven by real writes, because it's also the audit trail.
- **All money and date formatting is centralized** in one utility, not repeated inline (the prototype repeats `₹${(x/1000).toFixed(0)}K` formatting logic in multiple places).
