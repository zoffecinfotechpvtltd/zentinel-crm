# Zentinel

Internal CRM & operations platform for Zoffec Infotech Pvt. Ltd. — leads,
clients, projects, GST-correct invoicing, payments, follow-up automation,
notifications, and reporting, in one tool.

Four roles — **Admin**, **Sales**, **Finance**, **Ops** — each see only
their slice of the business. Access is enforced on the server, not just
hidden in the UI: a role that can't see a page can't hit its API either.

| Section | Admin | Sales | Finance | Ops |
|---|---|---|---|---|
| Dashboard / Reports / Notifications | ✅ | ✅ | ✅ | ✅ |
| Leads | ✅ | ✅ | ❌ | ❌ |
| Opportunities | ✅ | ✅ | ❌ | ❌ |
| Clients (incl. pricing) | ✅ | ❌ | ✅ | ✅ |
| Projects | ✅ | ❌ | ✅ | ✅ |
| Invoices | ✅ | ❌ | ✅ | ❌ |
| Follow-ups — Sales track | ✅ | ✅ | ❌ | ❌ |
| Follow-ups — Finance track | ✅ | ❌ | ✅ | ❌ |
| Users, Templates, Settings, Audit Log | ✅ | ❌ | ❌ | ❌ |
| Automation Rules, Custom Fields, API Keys | ✅ | ❌ | ❌ | ❌ |

Sales is walled off from Clients entirely once a lead is Won — from there
the client, its contract, and its money belong to Finance and Ops.

## What's inside

- **Leads** — full pipeline (New → Contacted → Qualified → Proposal Sent →
  Negotiation → Won/Lost), lead score (0–100), duplicate detection,
  lead→client conversion.
- **Opportunities** — service/product sales pipeline separate from Leads,
  multi-type tags, Excel bulk import/export with duplicate detection,
  deal value on every stage, pipeline trend report, follow-up→client
  conversion.
- **Clients** — multiple contacts, multiple contracts per client, computed
  Active/Inactive status, parent/subsidiary account hierarchy, onboarding
  docs with e-signature requests (no external e-sign vendor needed),
  document versioning.
- **Projects** — tracker with status, progress %, due-date/overdue
  detection, task checklists, per-user time logging, linked to the
  Opportunity that produced them.
- **Invoices** — GST-correct line items, Draft→Final locking with
  gap-free sequential numbering, PDF import (reads a Tally-exported PDF and
  pre-fills the form), credit notes, recurring/subscription templates that
  auto-generate on schedule.
- **Payments** — manual recording (multiple partial payments per invoice)
  plus "Export for Tally" for TallyPrime import.
- **Follow-up automation** — Today/Upcoming/Overdue tracking per role,
  escalation alerts, reusable message templates, `.ics` calendar export,
  WhatsApp (`wa.me`) prefilled links.
- **Automation rules** — admin-configurable "when a lead/opportunity/
  invoice/project reaches status X, notify role or person Y" rules, no
  code required. Manage under **Admin → Automation Rules**.
- **Custom fields** — admin-defined extra fields (text/number/date/
  boolean/dropdown) on Leads, Opportunities, and Clients, shown inline on
  each record's form. Manage under **Admin → Custom Fields**.
- **Notifications** — in-app + optional email (any SMTP provider,
  configured in-app under Settings), daily digest, weekly business summary
  for Admin/Finance.
- **Reporting** — live dashboard, conversion funnel, pipeline trend,
  revenue trend, service-wise breakdown, Excel export.
- **Security/account** — session list with device/location, "log out
  other sessions," optional 2FA, custom delete-confirmation dialogs on
  every destructive action.
- **Automation hooks** — an inbound webhook your company website can call
  to create a lead (`POST /api/public/leads`), and an outbound webhook
  (Slack/Make/n8n/Zapier) that fires on lead Won/Lost, invoice paid, or
  project completion.
- **Public REST API** — token-authenticated, read-only `/api/v1/leads`,
  `/api/v1/clients`, `/api/v1/invoices` for external tools (Zapier, a BI
  dashboard, a script). Keys are created and revoked under
  **Admin → API Keys**; the raw key is shown once at creation and never
  again.
- **Backup & restore** — full JSON export of every table from
  **Admin → Settings**, and a restore path that wipes and replaces all
  data from an uploaded backup file (typed confirmation required).
- **Duplicate & data tools** — duplicate lead/client merge, bulk Excel
  value import for historical records.
- **PWA** — installable from the browser (desktop address-bar icon or
  mobile "Add to Home Screen"), opens without browser chrome.

## Tech stack

Node.js + TypeScript + Express + PostgreSQL on the backend, React + Vite on
the frontend. Fully cloud-hosted — the backend and frontend deploy as two
independent services (no bundled/desktop runtime).

```
backend/    REST API, migrations, scheduled jobs
frontend/   React SPA
```

---

## Running from source (development)

### Prerequisites

- Node.js 22+ and npm
- PostgreSQL 16 — either a local install, or use the included
  `docker-compose.yml` (requires Docker)

### 1. Clone and get a database running

```bash
git clone <this-repo-url>
cd zoffeccms

# starts Postgres 16 in a container: user zoffec / db zoffec_cms, port 5432
docker compose up -d
```

If you'd rather use an existing PostgreSQL instance, just create a
database and point `DATABASE_URL` at it in the next step — the Docker
service is only a convenience.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env      # defaults already match docker-compose.yml
```

`.env` fields:

| Variable | Purpose | Default is fine unless... |
|---|---|---|
| `PORT` | API port | you have something else on 4000 |
| `DATABASE_URL` | Postgres connection string | you're not using `docker compose up -d` above |
| `SESSION_COOKIE_NAME` / `SESSION_TTL_HOURS` / `SESSION_REMEMBER_TTL_DAYS` | session cookie behavior | rarely needs changing |
| `APP_BASE_URL` | used to build password-reset links, and the whitelist for CORS | matches the frontend dev URL (`http://localhost:5173`) by default — **in production this must also include your deployed frontend's exact origin(s), comma-separated, or login will fail with a CORS error** |
| `SMTP_*` / `MAIL_FROM` | optional fallback mail sender | leave blank — SMTP is normally configured later, in-app, under **Settings** (works with any provider: Gmail, Zoho, your own server). With these blank, emails just log to the console instead of sending. |

Run migrations, then start the API in watch mode:

```bash
npm run migrate:up
npm run dev
```

Backend is now serving on `http://localhost:4000`. Other useful scripts:

```bash
npm run seed     # optional demo data
npm test         # vitest
npm run lint     # eslint
npm run build    # compile to dist/
```

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:5173` (Vite prints the exact URL) and proxies
API calls to the backend on port 4000. Visit it, and you'll land on the
first-run **Setup** screen to create the admin account — no default
credentials ship with the app.

Other scripts: `npm run build` (production build to `dist/`),
`npm run lint`, `npm run preview`.

### 4. Everyday use

With both servers running, backend and frontend hot-reload independently
on file changes — no restart needed for most edits. Stop either with
`Ctrl+C`; `docker compose down` stops the database (add `-v` to also wipe
its data volume, which forces a fresh `migrate:up` next time).

---

## Deploying

Backend and frontend deploy as two independent services (e.g. Render/Fly
for the backend + its Postgres, Vercel/Netlify for the frontend). Set
`APP_BASE_URL` on the backend to the frontend's exact deployed origin(s)
(comma-separated if more than one) — it's both the CORS whitelist and the
base for password-reset links — and `VITE_API_URL` on the frontend build to
the backend's deployed origin. Run `npm run migrate:up` against the
production `DATABASE_URL` before first boot.

---

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: backend
(lint, typecheck, `vitest`, build) and frontend (lint, typecheck, build)
in parallel, each against its own `package-lock.json`.
