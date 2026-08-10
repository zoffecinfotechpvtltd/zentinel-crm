# Design: Login CORS fix, backend status page, invoice/bill upload, test coverage sweep, feature audit

Date: 2026-08-10
Status: Approved

## Background

Five related but independent workstreams, requested together:

1. Login is broken in production (CORS error).
2. Need a public page to see whether the backend is reachable, with a manual "force refresh" retry.
3. Need a way to upload a bill/invoice file against a specific client (company) — separate from the
   structured GST Invoices module.
4. Need automated test coverage — 3 scenarios per feature, covering the whole app.
5. Need a feature-completeness rating table cross-checking the README's claimed features against
   what actually exists and (per #4) is verified working.

Agreed order: login fix → status page → invoice upload → test sweep → rating table.

## 1. Login CORS fix

### Root cause

`backend/src/index.ts` restricts CORS to origins listed in the `APP_BASE_URL` env var
(`backend/src/lib/appUrl.ts::getAllowedOrigins`). The deployed frontend origin
(`https://zentinel.ztplsolutions.com`) is not present in the `APP_BASE_URL` configured on the Render
backend (`zoffec-sentinel-api.onrender.com`), so the browser's CORS preflight for
`POST /api/auth/login` is rejected before it reaches the route handler.

On the frontend, `frontend/src/pages/Login.tsx` only recognizes `ApiError` (a well-formed HTTP
error response). A CORS-blocked request throws a raw `TypeError` from `fetch`, which falls into
the `else` branch and shows the generic "Something went wrong. Try again." — this is why the real
cause wasn't visible from the UI.

### Fix

- **Infra (user action, not code):** set `APP_BASE_URL` on the Render backend service to
  `https://zentinel.ztplsolutions.com` (comma-separate if other origins — e.g. a Vercel preview URL —
  also need to call this API). Redeploy/restart picks it up since it's read at request time via
  `process.env`.
- **Code — CORS rejection visibility:** log the rejected `Origin` header server-side in the CORS
  error callback (`index.ts`), so a future misconfiguration shows up in Render logs instead of a
  silent black box.
- **Code — clearer frontend failure message:** in `Login.tsx`, distinguish "request never reached
  the server" (network/CORS failure, `TypeError`) from a real API error, and show "Can't reach the
  server. It may be waking up — try again in a moment." instead of the generic message. This also
  covers Render free-tier cold starts, which produce the same class of failure.

No database or API contract changes.

## 2. Backend status page

### Goal

A page a non-technical person can open to see "is the backend up right now," with a button to
force a re-check (useful because Render's free tier sleeps the service after idle and takes ~30-50s
to wake on the next request).

### Design

- New route `GET /status` on the backend (`backend/src/index.ts`), registered **before** the
  `FRONTEND_DIST_PATH` catch-all (`app.get(/^(?!\/api).*/, ...)`) so it isn't swallowed by the SPA
  fallback in the desktop build. Serves a single self-contained HTML file (inline `<style>` and
  `<script>`, no build step, no external requests) — same pattern already used for
  `desktop/mode-select.html`.
- No authentication — this is a diagnostic page, and it exposes nothing beyond "reachable: yes/no" +
  DB connectivity, which `/api/health` already returns unauthenticated today.
- On load, and every time "Force Refresh" is clicked, the page calls `GET /api/health` (relative
  URL — same origin as the page, so no CORS concerns) and renders:
  - **● Online** (green) — `{ok: true, db: "connected"}`
  - **● Degraded** (amber) — backend reachable but `{ok: false, db: "unreachable"}` (DB down)
  - **● Waking up / Offline** (red, with a spinner) while a check is in flight or has failed
  - Last-checked timestamp, response time in ms
  - "Force Refresh" retries with short backoff (e.g. up to 3 attempts, a few seconds apart) rather
    than a single shot, since a cold Render instance needs the first request to "land" before it's
    actually up.
- Reuses the existing brand palette (indigo/navy, matches `frontend/src/pages` marketing styling) for
  visual consistency, but is fully independent of the frontend build/deploy.

### Out of scope

No historical uptime log, no email/Slack alerting — just current-state check + manual retry, per
what was asked.

## 3. Invoice/bill upload per company

### Existing infrastructure (reused, not rebuilt)

The generic attachments system already covers this:

- `attachments` table (`backend/migrations/1754400010000_notes-and-attachments.sql`,
  `...013000_attachment-document-type.sql`) — generic file storage keyed by `(entity_type,
  entity_id)`, with an optional `document_type` label, supporting local disk or S3-compatible object
  storage (`backend/src/lib/objectStorage.ts`).
- `mountNotesAndAttachments(router, "client")` (`backend/src/lib/attachNotesAndFiles.ts`) is already
  mounted on the clients router, giving `GET/POST /api/clients/:id/attachments`,
  `GET .../attachments/:id/file` (download), `DELETE .../attachments/:id`, and even an
  e-signature-request flow — all already scoped to a specific client (company).
- `NotesAndFiles.tsx` already renders this as a "Files" section inside the Client detail modal
  (`frontend/src/pages/Clients.tsx:263`) — upload, list, download, delete are all functional today.

### Gap and fix

The only thing missing is that a bill/invoice isn't a selectable document type, and the file picker
doesn't hint at the expected file types:

- Add `"Bill/Invoice"` to `DOCUMENT_TYPES` in `frontend/src/components/NotesAndFiles.tsx`.
- Add `accept=".pdf,image/*"` to the file `<input>` so the OS file picker filters sensibly (backend
  validation is unchanged — it already accepts any mimetype up to 25MB, which is fine here).

No new table, no new route, no new component — this is a two-line UI change on top of infra that
already does everything asked (upload, list, link to a specific company, download, delete,
permission-scoped to admin/uploader).

## 4. Test coverage sweep (3 scenarios × every feature)

### Current state

`backend/src/lib/__tests__/*` and `backend/src/middleware/__tests__/auth.test.ts` are pure unit
tests of standalone logic (date math, TOTP, PDF parsing, invoice math) — no test touches a real
route or a real database. There is no `supertest`, no test-database setup, no way today to assert
"POST /api/leads with a Sales-role session returns 201."

### Harness (built once, used by every module)

**Revised 2026-08-10, before planning:** the original approach below called for a Docker-based
Postgres and per-test transaction rollback. Both are changed, for reasons validated live (not just
argued) before the plan was written:

- **Test database: `embedded-postgres`, not Docker.** This package is already a dependency of
  `desktop/package.json` (the Electron build uses it to run Postgres with no external install).
  A throwaway instance was spun up in a plain Node script during planning — `initialise()`,
  `start()`, connect, query, `stop()` — and it worked with zero Docker, zero network dependency,
  on this machine. Using it for tests means `npm test` never depends on Docker being installed or
  running, locally or in CI (no `services:` block needed in `.github/workflows/ci.yml` either).
  A vitest `globalSetup` starts one instance for the whole test run (data directory under the OS
  temp dir, removed on teardown), runs migrations against it once, and sets `DATABASE_URL` before
  any test file imports the app.
- **Isolation: `TRUNCATE` between tests, not transaction rollback.** Every route handler calls
  `pool.query(...)` directly (grabbing a fresh client per query from the pool), not a single
  held connection — so real per-test `BEGIN`/`ROLLBACK` would require mocking the `pool` module to
  route all of a test's queries through one shared client. That's fragile (every route must
  actually go through the mock, easy to silently bypass) for a marginal speed win at this test
  count (~50 tests). Simpler and robust instead: an `afterEach` hook runs a single
  `TRUNCATE <every app table> RESTART IDENTITY CASCADE` — one statement, order-independent (CASCADE
  handles FK dependents), no mocking, no shared-connection bookkeeping.
- Add `supertest` as a dev dependency.
- `backend/src/index.ts` currently builds the Express app AND calls `app.listen()` in one file, so
  importing it for tests would start a real server and the cron scheduler. Extract everything up to
  (not including) `app.listen()` into a new `createApp(): express.Application` in
  `backend/src/app.ts`; `index.ts` becomes a thin `createApp()` + `listen()` + `startScheduler()`
  caller. This is the one production-code change the test sweep requires, and it's mechanical.
- A shared test helper builds on `createApp()` and provides `loginAs(role)` — hashes a fixed test
  password with the app's own `hashPassword` (`src/lib/password.ts`), inserts a `users` row
  directly (fast, avoids needing an existing admin to create every test user), then calls the real
  `POST /api/auth/login` and returns an authenticated `supertest` agent — so the login flow itself
  stays exercised by every other module's tests, not bypassed.

### Scope and the "3 scenarios" definition

Applied per route module (leads, clients, projects, invoices, payments-within-invoices, follow-ups,
notifications, dashboard, reports, settings, users, message-templates, services, public-intake,
public-sign, system, auth/2FA/password-reset, setup) — roughly 16-18 modules:

1. **Happy path** — valid request, correct role, expected 2xx and correct shape/side-effect
   (row created/updated, computed field correct, etc.).
2. **Validation / edge case** — bad input (missing required field, invalid enum, boundary value like
   an already-Won lead, a Draft invoice being finalized twice, duplicate detection) → expected 4xx
   with a useful error body.
3. **Authorization / not-found** — wrong role for that route (per the README's role matrix) → 403,
   or a nonexistent/soft-deleted id → 404. Where a module has meaningful role-based row scoping
   (e.g. Sales only seeing their own leads), this scenario tests that instead of a generic 403.

This is real code, not a checklist — it runs in CI (`backend/package.json` already has
`npm test` wired into `.github/workflows/ci.yml`).

### Out of scope

Frontend component/E2E tests (Playwright etc.) — not requested, and a second harness of that size
is its own project. This sweep is backend route/API coverage only.

## 5. Feature completeness rating table

A markdown/table deliverable (not code) produced after the test sweep, so ratings are backed by
evidence rather than a read-through:

- One row per feature/capability the README claims (leads pipeline, lead scoring, duplicate
  detection, client contracts, e-sign, invoices/GST/locking/numbering, credit notes, payments +
  Tally export, follow-up automation + escalation + templates + `.ics` + WhatsApp links,
  notifications + digest/summary, reporting + Excel export, sessions/2FA/delete-confirmations,
  inbound/outbound webhooks, PWA, and the new status page / invoice upload from this design).
- Columns: Feature | Status (✅ Done / ⚠️ Partial / ❌ Missing) | Evidence (route/file, and whether a
  test now covers it) | Notes (gaps found, if any).
- Delivered as a doc in the repo (and optionally an Artifact, if a shareable view is wanted at that
  point) — decided when this stage is reached.

## Testing strategy for THIS design's own changes

- Login fix: manual verification against the live Render deployment once `APP_BASE_URL` is updated
  (can't be unit-tested — it's a deployed-config issue) + no regression to existing CORS behavior
  for already-allowed origins.
- Status page: manual check (`/status` loads, reflects health, force-refresh works) — it's a static
  page with no business logic worth a vitest test.
- Invoice upload: covered by the invoices/clients scenarios in the test sweep (#4), plus a quick
  manual upload-and-download check in the browser.
- Test sweep itself: its own correctness is that `npm test` passes in CI.
