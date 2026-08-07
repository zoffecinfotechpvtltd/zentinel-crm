# Zentinel

Internal CRM & operations platform for Zoffec Infotech Pvt. Ltd. — leads,
clients, projects, GST-correct invoicing, payments, follow-up automation,
notifications, and reporting, in one tool.

Ships as a **single Windows installer**. No cloud hosting, no database to
manage, no environment variables to configure. It bundles its own
PostgreSQL and starts the whole app — database, backend, and frontend — in
one process on your machine, never reachable from the network. First launch
walks you through creating the admin account; there's no default login.

## Download

Grab the latest installer from the [Releases page](../../releases/latest).
Run it, click through Windows' "unknown publisher" warning (More info → Run
anyway — the installer isn't code-signed), and open Zentinel from the
Start menu.

## What's inside

- **Leads** — full pipeline (New → Contacted → Qualified → Proposal Sent →
  Negotiation → Won/Lost), lead→client conversion, duplicate detection.
- **Clients** — multiple contacts, multiple contracts per client, computed
  Active/Inactive status.
- **Projects** — lightweight tracker with due-date/overdue detection.
- **Invoices** — GST-correct line items, Draft→Final locking with
  gap-free sequential numbering, credit notes.
- **Payments** — manual recording (multiple partial payments per invoice)
  plus a "Export for Tally" button for TallyPrime import.
- **Follow-up automation** — Today/Upcoming/Overdue tracking, escalation
  alerts, reusable message templates.
- **Notifications** — in-app + optional email (any SMTP provider, configured
  in-app under Settings — no code or env vars involved).
- **Reporting** — live dashboard, lead conversion funnel, revenue trend,
  payment-pending export, service-wise breakdown.

## Building from source

See [RELEASE.md](RELEASE.md) for the full build/release process. Short
version:

```bash
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build
cd ../desktop && npm install && npm run dist
```

Produces `desktop/release/Zentinel Setup <version>.exe`.

## Stack

Node.js + TypeScript + Express + PostgreSQL on the backend, React + Vite on
the frontend, Electron + `embedded-postgres` for desktop packaging. Full
build history and every acceptance-criteria verification is in
[PROGRESS.md](PROGRESS.md).

## Project layout

```
backend/    REST API, migrations, scheduled jobs
frontend/   React SPA
desktop/    Electron packaging (main.js, embedded Postgres, installer config)
files/      Original spec package this was built from
```
