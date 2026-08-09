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
| Clients (incl. pricing) | ✅ | ❌ | ✅ | ✅ |
| Projects | ✅ | ❌ | ✅ | ✅ |
| Invoices | ✅ | ❌ | ✅ | ❌ |
| Follow-ups — Sales track | ✅ | ✅ | ❌ | ❌ |
| Follow-ups — Finance track | ✅ | ❌ | ✅ | ❌ |
| Users, Templates, Settings, Audit Log | ✅ | ❌ | ❌ | ❌ |

Sales is walled off from Clients entirely once a lead is Won — from there
the client, its contract, and its money belong to Finance and Ops.

## What's inside

- **Leads** — full pipeline (New → Contacted → Qualified → Proposal Sent →
  Negotiation → Won/Lost), lead score (0–100), duplicate detection,
  lead→client conversion.
- **Clients** — multiple contacts, multiple contracts per client, computed
  Active/Inactive status, onboarding docs with e-signature requests
  (no external e-sign vendor needed).
- **Projects** — tracker with status, progress %, due-date/overdue detection.
- **Invoices** — GST-correct line items, Draft→Final locking with
  gap-free sequential numbering, PDF import (reads a Tally-exported PDF and
  pre-fills the form), credit notes.
- **Payments** — manual recording (multiple partial payments per invoice)
  plus "Export for Tally" for TallyPrime import.
- **Follow-up automation** — Today/Upcoming/Overdue tracking per role,
  escalation alerts, reusable message templates, `.ics` calendar export,
  WhatsApp (`wa.me`) prefilled links.
- **Notifications** — in-app + optional email (any SMTP provider,
  configured in-app under Settings), daily digest, weekly business summary
  for Admin/Finance.
- **Reporting** — live dashboard, conversion funnel, revenue trend,
  service-wise breakdown, Excel export.
- **Security/account** — session list with device/location, "log out
  other sessions," optional 2FA, custom delete-confirmation dialogs on
  every destructive action.
- **Automation hooks** — an inbound webhook your company website can call
  to create a lead (`POST /api/public/leads`), and an outbound webhook
  (Slack/Make/n8n/Zapier) that fires on lead Won/Lost, invoice paid, or
  project completion.
- **PWA** — installable from the browser (desktop address-bar icon or
  mobile "Add to Home Screen"), opens without browser chrome.

## Tech stack

Node.js + TypeScript + Express + PostgreSQL on the backend, React + Vite on
the frontend, Electron + `embedded-postgres` for the packaged desktop app.

```
backend/    REST API, migrations, scheduled jobs
frontend/   React SPA
desktop/    Electron packaging (main.js, embedded Postgres, installer config)
```

---

## Option A — Download the desktop app (no setup)

Zentinel also ships as a **single Windows installer** — no cloud hosting,
no database to manage, no environment variables. It bundles its own
PostgreSQL and starts the whole app (database, backend, frontend) in one
process on your machine, never reachable from the network. First launch
walks you through creating the admin account; there's no default login.

Grab the latest installer from the [Releases page](../../releases/latest),
run it, click through Windows' "unknown publisher" warning (the installer
isn't code-signed — **More info → Run anyway**), then open **Zentinel**
from the Start menu.

---

## Option B — Run from source (development)

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
| `APP_BASE_URL` | used to build password-reset links | matches the frontend dev URL (`http://localhost:5173`) by default |
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
npm run build    # compile to dist/ (needed before a desktop build)
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

## Building the Windows installer

Full detail on what's happening under the hood is inline in
`desktop/main.js`; short version:

```bash
cd backend  && npm install && npm run build
cd ../frontend && npm install && npm run build
cd ../desktop  && npm install && npm run dist
```

Produces `desktop/release/Zentinel Setup <version>.exe` — the one file to
distribute. `desktop/release/win-unpacked/Zentinel.exe` also exists for
quick local testing without running the full installer each time (delete
`%APPDATA%\zentinel-desktop` between test runs for a genuinely fresh
first-run).

**How it works:** `desktop/main.js` is the Electron main process. On
launch it starts an embedded PostgreSQL (data stored in the OS per-user
app-data folder, so it survives updates), runs migrations against it,
forks the compiled backend using Electron's own bundled Node runtime (no
separate Node.js install needed on the end user's machine), waits for its
health check, then opens a window pointed at it. The backend binds to
`127.0.0.1` only in this mode (`DESKTOP_MODE=1`) — never reachable from
the network. On quit, it kills the backend and stops Postgres cleanly.

**Known gotchas:**
- `embedded-postgres` is ESM-only; bridged into the CommonJS main process
  via a single `await import("embedded-postgres")`.
- `asar` packing is disabled (`desktop/package.json`) — `embedded-postgres`
  needs to `chmod` its bundled `postgres.exe`/`initdb.exe` at runtime,
  which doesn't work reliably from inside an asar archive under Electron.
- If `ELECTRON_RUN_AS_NODE` is already set in your shell before running
  `npm start` or the built exe, Electron boots as a plain Node process
  instead of a GUI app. Unset it first: `env -u ELECTRON_RUN_AS_NODE ...`.

**Releasing:**

```bash
git tag v1.0.0
git push origin v1.0.0
gh release create v1.0.0 "desktop/release/Zentinel Setup 1.0.0.exe" \
  --title "Zentinel v1.0.0" --notes "First release."
```

The installer is unsigned, so Windows SmartScreen shows an "unknown
publisher" warning on first run — expected for internal-only use.

---

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: backend
(lint, typecheck, `vitest`, build) and frontend (lint, typecheck, build)
in parallel, each against its own `package-lock.json`.
