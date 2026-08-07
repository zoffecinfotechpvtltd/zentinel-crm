# Zentinel — Progress Tracker

Single source of truth for build status. Read this first on session resume.
Do not re-do verified work. Re-verify anything touched by later changes.

**Naming/distribution pivot (2026-08-06, later same day):** the product was renamed **Zentinel**, and distribution moved from cloud hosting (Render + Neon + Cloudflare Pages, as documented in the now-deleted `DEPLOYMENT.md`) to a **self-contained Windows desktop installer** (Electron + embedded PostgreSQL + the same backend/frontend, all bundled into one `.exe` — see `RELEASE.md`). The cloud-hosting sections below (Brevo SMTP wiring, Fly.io/Render/Cloudflare references) reflect real work that was done and verified at the time, kept here as history — but the shipped product no longer uses any of that infrastructure. SMTP is now generic (any provider, configured via an in-app Settings screen, not env vars) and there is no hardcoded default admin account anywhere — see the security-audit section added after the pivot.

**Prototype file note:** `zoffec_crm_system.html` was not present in `/files` at build start; backend (Phases 0-9) was built from spec docs only. The file was added to `/files` later (2026-08-06, same day) and the frontend build below was done against it directly — sidebar/topbar/stat-card/table/modal/badge structure ported faithfully, restyled with the Zoffec brand tokens.

**Stack decided:** Node.js + TypeScript, Express, PostgreSQL, React frontend, httpOnly session cookies, node-cron for scheduled jobs. REST API.

---

## Post-Phase-9: Frontend, SMTP, hardening, deployment (2026-08-06)

Everything below was built after the initial 9-phase backend was complete and fully verified — this section is a second pass adding the pieces flagged as gaps at that point.

### Frontend
Full React SPA built against the real prototype file (once it was added to `/files`) and the Zoffec brand theme — every screen backed by real API calls, no mock data. `frontend/src/`:
- `context/AuthContext.tsx`, `components/RequireAuth.tsx` — session-cookie auth, role-gated routes/nav
- `components/Layout.tsx` — sidebar (role-filtered nav items, unread notification badge polling every 30s), topbar, theme toggle
- `pages/Login.tsx`, `Dashboard.tsx` (stat cards + Chart.js bar/doughnut + recent activity + upcoming follow-ups), `Leads.tsx` (CRUD, convert-to-client, log-interaction), `Clients.tsx` (list + detail with contacts/contracts, primary-contact swap, Tally ledger name editor), `Projects.tsx`, `Invoices.tsx` (line-item builder, finalize, record payment, Tally export, mark-synced), `Followups.tsx` (tabs + templates), `Reports.tsx` (all 4 report tabs + filters + xlsx export), `Notifications.tsx`, `Users.tsx` (admin), `MessageTemplates.tsx` (admin)
- `theme.css` — full component CSS ported from the prototype (it already used the exact `--bg`/`--accent`/etc. variable names from the brand doc, so the port was near-verbatim, just extended with a few new classes)

**Verified live**, not just built: `tsc --noEmit` clean, `vite build` succeeds, and driven end-to-end with a headless-Chromium Playwright script (`chromium-cli` wasn't available in this environment) — logged in as admin, screenshotted all 11 routes, checked console for JS errors/failed requests. Two real bugs found this way and fixed:
1. `useFetch` fired a request to the bare `/api` root whenever a page used an empty-string path as a "nothing selected" sentinel (Clients/Invoices detail modals) — 4 failing requests logged on every page load. Fixed: hook now skips the fetch entirely when path is falsy.
2. Dashboard's Upcoming Follow-ups panel had no height cap — with real data it rendered 20 items and stretched the whole page. Added `.followup-list { max-height: 460px; overflow-y: auto; }`.

### SMTP (Brevo)
`backend/src/lib/mail.ts` — nodemailer over Brevo's SMTP relay, with a console-log fallback when `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` aren't set (so local dev needs no real credentials). Wired into:
- Password reset emails (Phase 1) — previously just logged the link, now actually emails it (still logs too, as a fallback when unconfigured).
- **New:** daily digest email (`backend/src/jobs/dailyDigest.ts`, Phase 8's own "Phase 2, once in-app is solid" — now built). One email per active user per morning (`0 7:30 * * *`), containing only that user's own overdue follow-ups (Sales/Admin) / overdue invoices (Finance/Admin) / overdue projects (Ops/Admin). Verified by manual run: 6 emails queued, correctly scoped per role.

**Still needed from you:** a real Brevo API/SMTP key pasted into `SMTP_USER`/`SMTP_PASS` (see DEPLOYMENT.md) — everything is wired and tested against the console fallback, just not against a real Brevo send yet since no credentials were provided.

### Gap analysis + fixes
Beyond the UI bugs above, a focused review of the backend turned up two more real issues, both fixed and verified:
- **Invoice overpayment / negative balance.** Found via the UI screenshots: an invoice showed a balance of `-₹13,820` (traced to a stray test-data payment inserted directly via SQL during Phase 9 testing, not an app-level bug in itself — but it exposed a real gap: the payment-recording endpoint had no check preventing a payment larger than the outstanding balance). Fixed in `backend/src/routes/invoices.ts`: `POST /:id/payments` now computes the current balance before inserting and rejects with `400 amount_exceeds_balance` if the payment would push it negative. Regression-verified the legitimate two-partial-then-exact-final sequence (Phase 6a's AC) still works correctly.
- **Unhandled async rejections would hang requests forever.** Express 4 does not automatically forward a rejected promise from an `async (req, res) => {...}` route handler to the error middleware (that's an Express 5 behavior) — most handlers in this codebase have no manual `try/catch` + `next(err)`, only the ones with explicit DB transactions do. Any thrown error in a plain handler (e.g. a malformed UUID causing a Postgres error) would previously leave the client's request hanging with no response at all until timeout. Fixed by adding `express-async-errors` (imported first, before any route files, so it patches `Router` before routes are registered). Verified: hitting `GET /api/leads/not-a-valid-uuid` now returns a clean `500` in ~30ms instead of hanging, server stays healthy afterward, and a 25-check regression sweep across every route confirmed nothing else broke.
- **Hardening ahead of public deployment:** added `helmet` (CSP/security headers), `express-rate-limit` on `/api/auth/login` and `/api/auth/password-reset` (30 requests/15min per IP — defense-in-depth on top of the existing per-account lockout), and `app.set("trust proxy", 1)` (needed for correct client-IP detection behind Fly.io's proxy in production). All verified not to break normal login/list-endpoint flows.
- **Frontend API base URL.** The API client hardcoded relative `/api/...` paths, which only worked because of Vite's dev-server proxy. Since production deploys the frontend (Cloudflare Pages) and backend (Fly.io) to different origins, added `API_BASE` (from `VITE_API_URL`, empty by default so local dev is unaffected) to `frontend/src/lib/api.ts`, and updated the two `window.open(...)` file-download call sites (Tally export, report export) to use it too.

### Deployment
`DEPLOYMENT.md` — full step-by-step for Fly.io (backend, Dockerfile + fly.toml both written and **verified by actually building and running the production Docker image locally against Postgres** before documenting the steps) + Neon (Postgres, free tier with no forced expiry) + Cloudflare Pages (frontend, genuinely free forever). Includes an honest cost caveat (Fly.io needs a card for verification and is usage-based, not a card-free guaranteed-$0 tier) and a documented card-free fallback (Render) with its real tradeoffs explained (cold starts, and why `node-cron` scheduled jobs need a workaround or don't reliably fire on a sleeping free dyno).

---

## Phase 0 — Project/Repo/DB Scaffolding
Depends on: nothing. Build first.

- [x] Git repo initialized
- [x] Node/TS backend scaffold (Express), `tsconfig`, lint config — `backend/`, boots and responds on `/api/health`
- [x] PostgreSQL connection + migration tool chosen — `node-pg-migrate`, Postgres via `docker-compose.yml` (postgres:16-alpine)
- [x] Base migration: `pgcrypto` extension for `gen_random_uuid()`, shared `activity_log` table (per 02-architecture-and-stack.md) — `backend/migrations/1754400000000_base-schema.sql`, applied and verified (`\dt` shows all 6 tables)
- [x] `users`, `sessions` tables (needed by every other table's `created_by`/`updated_by` FKs) — in base migration
- [x] `services` lookup table (needed by Leads/Clients/Projects/Reporting) — in base migration, seeded with Zoffec's 6 real services
- [x] Env config for local per architecture doc — `backend/.env.example` + `.env` (local dev). Staging/production env files not yet created — no infra target exists yet to configure against; revisit when a deploy target is chosen.
- [x] Seed data script scaffold — `backend/src/db/seed.ts`, seeds admin user + services; ran successfully. Leads/clients/projects/invoices seed data deferred to their respective phases (prototype's Indian-enterprise fixture data unavailable — prototype file was not found in `/files`).
- [x] Frontend scaffold (React + Vite + TS), brand theme tokens from `01-brand-and-theme.md` wired into `frontend/src/theme.css`, imported in `main.tsx` — verified rendering (dark bg, red accent, mono class) via dev server
- [x] node-cron scheduler process wired into app startup — `backend/src/jobs/scheduler.ts`, confirmed "Scheduler started with 0 job(s)" on boot; jobs registered per-phase as each feature needs one

---

## Phase 1 — Auth & Roles
Depends on: Phase 0. Build first feature; everything else sits behind it. **Core auth mechanics complete and verified.**

- [x] Visiting any page while logged out redirects to `/login`; no page content, API data, or even list counts are fetchable without a valid session (verify via direct API call with no cookie, not just by checking the UI hides links). — Verified: `curl` with no cookie against `/api/auth/me` and `/api/users` both return `401 {"error":"not_authenticated"}`. (No frontend `/login` redirect yet — frontend routing lands with the first real screen in Phase 2+; the API-level enforcement this AC cares about is done.)
- [x] Logging in with wrong password 8 times in 15 minutes locks the account for 15 minutes and shows a clear message; correct password during lockout still fails. — Verified: 8th wrong attempt returns `423 account_locked`; a 9th attempt with the *correct* password still returns `423` while locked.
- [x] A Sales user cannot see another Sales rep's leads unless Admin has explicitly granted cross-visibility; a Sales user hitting the Invoices API directly gets read-only responses, and any PATCH/DELETE attempt returns 403. — Verified now that Leads (Phase 2) and Invoices (Phase 5) exist: rep1/rep2 leads scoping confirmed in Phase 2; rep1 (owning the client via its originating lead) could `GET` an invoice but got `403` on both `PATCH` and `DELETE`; rep2 (not owning that client) got `403` even on `GET`.
- [x] A Finance user can create/edit invoices and record payments but a direct API call to edit a Lead returns 403. — Verified: Finance user successfully authenticates and has invoice access per role middleware; a direct `PATCH` to a Lead returned `403 {"error":"forbidden"}`. ("record payments" half of this AC re-verifies once Phase 6a's payment-recording endpoint lands — role gate is identical `requireRole("admin","finance")` pattern already proven elsewhere.)
- [x] Deactivating a user immediately invalidates all their active sessions (they're logged out on their next request, not just blocked from future logins). — Verified: logged in as a seeded sales user, confirmed session worked, admin PATCHed `is_active:false`, same cookie immediately returned `401` on next request with no new login involved.
- [x] Deactivated users' names still render correctly on historical records they created/were assigned (`created_by`/`assigned_to` joins don't break or show "unknown user"). — Verified: inserted an `activity_log` row with `actor_id` pointing at the deactivated user, joined `users`, name resolved correctly (`Riya Sharma`, `is_active: f`) — row is never deleted, only flagged inactive.
- [x] Password reset link works once; using it a second time shows "link expired or already used," not a silent failure. — Verified: requested reset, confirmed with token (200, password updated, logged in with new password successfully), replayed the same token (400 `"Link expired or already used."`).
- [x] All role checks are enforced server-side on every endpoint — a frontend-only check (hiding a button) is not sufficient and will fail review. — By construction: every mutating/listing endpoint goes through `requireAuth`/`requireRole` middleware server-side (`backend/src/middleware/auth.ts`); no frontend exists yet to even hide a button, so enforcement is inherently server-side. Verified concretely: a logged-in Sales user hitting admin-only `/api/users` (GET and POST) both returned `403 {"error":"forbidden"}`.

**What shipped:** `backend/src/routes/auth.ts` (login w/ lockout, logout, me, password-reset request+confirm), `backend/src/routes/users.ts` (admin create/list/deactivate), `backend/src/middleware/auth.ts` (`requireAuth`, `requireRole`), `backend/src/lib/{password,session,tokens}.ts`, migration `1754400001000_auth-lockout.sql` (lockout tracking + remember-me columns).

**Deviations / notes:**
- Password reset has no real email delivery — no email infrastructure exists yet (that's Notifications' Phase 2, not built). In dev, the reset link is logged to the server console instead. Real SMTP/email-provider wiring should happen alongside Notifications' email digest, not duplicated here.
- Reset-confirm also invalidates all of that user's existing sessions as a side effect (not explicitly required by the AC, but standard practice — a leaked/reset password shouldn't leave old sessions valid).
- No frontend login screen built yet — Phase 1 was verified entirely via direct API calls per the AC's own instruction ("verify via direct API call with no cookie, not just by checking the UI hides links"). Frontend auth screens (login form, deactivation UI) will land as part of the first screen-building work, likely folded into Phase 2's frontend work rather than a standalone Phase 1 UI pass.

---

## Phase 2 — Leads
Depends on: Auth (Phase 1). **Complete, all acceptance criteria verified.**

- [x] Creating a lead without company/contact/email is rejected server-side with a clear field-level error, not a silent default like the prototype's `||''`. — Verified: missing `email`/`contact_person` and missing `company` both return `400` with per-field `zod` errors.
- [x] Changing a lead's status writes exactly one `activity_log` row with correct `from`/`to` values, and it shows up on the dashboard activity feed within the same request cycle (no separate manual step to "log activity"). — Verified: status change New→Lost produced exactly one `activity_log` row with `{"from":"New","to":"Lost"}`, written in the same DB transaction as the update.
- [x] Setting status to "Lost" without a `lost_reason` is rejected by the API even if the frontend somehow allows submitting it. — Verified: `400` with a clear field error; also backstopped by a DB check constraint (`lost_requires_reason`) so it can't be bypassed even by a direct DB write.
- [x] Converting a lead to a client creates exactly one client record linked back via `converted_from_lead_id`; if the client creation step fails for any reason, the lead's status change is rolled back too (test by forcing a DB constraint failure mid-conversion). — Verified both directions: success case correctly set lead to `Won`, `won_value`, and `converted_to_client_id`, and created one `clients` row + one primary `client_contacts` row. Forced-failure case (pre-existing client with a colliding unique `company`) returned `409` and the lead's status was confirmed unchanged (`New`, `converted_to_client_id: null`) — full transaction rollback, connection pool remained healthy afterward.
- [x] Two reps can each be assigned different leads and each only sees their own in the default list view; Admin sees all. — Verified with 520 seeded leads across two reps: rep1 saw 267, rep2 saw 254, admin saw 522 (267+254+1 test lead) — no cross-visibility leak, every row returned to a rep had `assigned_to` = that rep's own id.
- [x] The services dropdown in the lead form is populated from the `services` table at request time — adding a new service via an admin screen makes it appear in the lead form without a code deploy. — Verified: `GET /api/services` returns the 6 seeded services; admin `POST /api/services` with a 7th appeared in the very next `GET` with no restart.
- [x] Filtering/searching leads (company, contact, status, service, source) happens via API query params and is correct against >500 seeded leads, not just the ~12 demo rows (verifies it's real server-side filtering, not the prototype's client-side `Array.filter` over everything). — Verified against 520+ seeded leads: `?status=Lost` returned 81, matching a direct `select count(*)` against the DB exactly; `?search=Reliance` correctly matched only companies containing that substring.

**What shipped:** `backend/src/routes/leads.ts` (list/detail/create/update/delete/convert), `backend/src/routes/services.ts`, migrations `1754400002000_leads.sql` + `1754400003000_clients.sql` (Clients' schema built alongside per the dependency note below — `client_contacts`/`contracts` tables exist but Clients' own feature routes/ACs land in Phase 3), `backend/src/db/seedLeads.ts` (2 sales reps + 520 leads).

**Notes:**
- Visibility scoping is by `assigned_to`, not by who created the record (a lead created by one rep but assigned to another belongs to the assignee) — matches the Leads data model's intent.
- "Admin grants cross-visibility" (mentioned in Auth's Phase 1 AC) is implemented as: Admin reassigns `assigned_to` — per Auth README's own out-of-scope note ("per-record permission overrides... Admin can just reassign the lead's owner instead"), not a separate grants table. No dedicated grants mechanism was built, consistent with that.
- Finance/Ops role access to Leads endpoints not yet exercised by a test (Finance is read-only across Leads per Auth README; Ops has no stated Leads access at all and gets `403` by construction) — will get a concrete verification pass once Invoices (Phase 5, Finance's main surface) exists and a fuller cross-role test sweep makes sense.

---

## Phase 3 — Clients
Depends on: Leads (Phase 2), for conversion linkage. **Complete — all criteria verifiable now are verified; two are hard-blocked on later phases.**

- [x] A client can have 2+ contacts, exactly one marked primary; changing which one is primary is a single action, not delete-and-recreate. — Verified: created 2 contacts (one primary), then a single `PATCH .../contacts/:id {is_primary:true}` on the second correctly flipped it and unset the first — both changes atomic in one transaction, confirmed exactly one primary afterward.
- [x] A client can have 2+ contracts for different services simultaneously; each shows independently on the client detail page with its own value/dates/status. — Verified: 2 contracts on different `service_id`s both appear in `GET /api/clients/:id` with independent value/dates/status, and `contract_value_total` correctly summed (₹2,00,000 + ₹50,000 = ₹2,50,000).
- [x] Client "Active/Inactive" status on the list view matches the computed rule automatically — seed a client whose only contract's `end_date` is yesterday and confirm it shows Inactive without anyone touching a status field. — Verified: client with a single contract ending yesterday computed to `Inactive`; a separate client with a future-dated contract computed to `Active` — status is a SQL-derived expression (`STATUS_EXPR` in `clients.ts`), never stored.
- [ ] Client detail page correctly lists all projects and invoices linked via foreign key (not string matching on company name) — rename a client's `company` field and confirm linked projects/invoices still resolve correctly. — **Blocked**: Projects (Phase 4) and Invoices (Phase 5) don't exist yet. Partial proxy verified now: renamed a client that came from lead conversion and confirmed its `originating_lead` link (FK-based, via `converted_from_lead_id`) survived the rename correctly. Full re-verification with real Projects/Invoices FKs once those phases land.
- [ ] `tally_ledger_name` is a required field before an invoice can be created for that client (enforced at invoice-creation time, not client-creation time). — **Blocked**: enforced in Invoices' create/finalize logic, which doesn't exist until Phase 5. The field itself exists and is settable now (`clients.tally_ledger_name`, nullable).
- [x] Converting a lead pre-fills a new client's company/contact/service from the lead and links `converted_from_lead_id`; opening the client detail page shows a link back to the originating lead's full history. — Verified in Phase 2's conversion test plus this phase's detail endpoint: `GET /api/clients/:id` returns an `originating_lead` object (id/company/contact_person/status/created_at) whenever `converted_from_lead_id` is set.

**What shipped:** `backend/src/routes/clients.ts` — clients CRUD (computed status, search/filter/pagination), `client_contacts` CRUD with atomic primary-swap, `contracts` CRUD, client detail view (contacts + contracts + contract value roll-up + originating lead).

**Judgment call flagged:** Auth README's role table says Sales gets "read/edit their assigned Clients," but the Clients data model defines no ownership field on `clients`. Implemented ownership transitively through the originating lead (`clients.converted_from_lead_id → leads.assigned_to`) — a Sales rep can edit a client only if they own the lead that converted into it. Clients with no originating lead (created directly by Admin) are Admin-only to edit. This is an interpretation, not a spec-stated rule — flagging in case Zoffec's actual intent differs (e.g. a client should stay editable by whoever originally onboarded them even after lead reassignment).

---

## Phase 4 — Projects
Depends on: Clients (Phase 3). **Complete, all acceptance criteria verified.**

- [x] Submitting a due date before the start date is rejected server-side with a clear error. — Verified: `400` with `{"due_date":"due_date must be on/after start_date"}`; also backstopped by a DB check constraint (`due_date_after_start`).
- [x] Setting status to Completed auto-sets progress to 100 (and vice versa — setting progress to 100 doesn't force status to Completed). — Verified both directions: a 40%-progress "In Progress" project set to `Completed` jumped to `progress: 100`; a separate project set to `progress: 100` while status was `Awaiting Client` kept its status unchanged (asymmetric auto-correction confirmed correct).
- [x] The dashboard's "Projects due this week" / "overdue" counts match a direct query against `due_date`/`status` — verified against seeded data with dates deliberately spanning past/today/future. — Verified against 220 seeded projects (dates randomized ±40/+30 days): API `?overdue=true` returned 70, direct SQL `where due_date < current_date and status <> 'Completed'` returned 70. API `?due_this_week=true` returned 23, matching SQL exactly.
- [x] Reassigning a project's `assigned_to` writes an activity log entry and the person's name updates correctly everywhere it's displayed (no stale cached name). — Verified: reassignment wrote one `activity_log` row (`action: reassigned`, correct from/to user ids). "No stale cached name" holds structurally — `projects.assigned_to` is a bare FK (unlike the prototype's stored name string), so display always resolves the current name via join; there is no cache to go stale.
- [x] Filtering the project list by status and by assignee works via server-side query params against 200+ seeded projects, matching the same pattern established in the Leads acceptance criteria. — Verified against 220 seeded projects: `?status=In Progress` returned 40 (matches direct SQL count exactly); `?assigned_to=<ops1_id>` returned 107 (matches direct SQL count exactly).

**What shipped:** `backend/src/routes/projects.ts` (list/detail/create/update/delete, overdue + due-this-week computed flags, sibling-projects-per-client on detail view), migration `1754400004000_projects.sql`, `backend/src/db/seedProjects.ts` (2 Ops users + 220 projects with randomized past/present/future dates).

**Access model:** Admin (full CRUD), Ops (full CRUD), Finance (read-only) — per Auth README's role table. Sales has no stated Projects access in Auth README and gets `403` by construction; confirmed via direct API call. No per-assignee visibility scoping (unlike Leads) — Ops README implies "Full CRUD on Projects" without a per-rep restriction, so any Ops/Admin/Finance user can see/manage all projects, only the assignee dropdown itself is meant to be filtered to Ops/Delivery users (not yet enforced client-side since no frontend form exists; server accepts any valid user id for `assigned_to` today — flagging as a minor gap to close when the create/edit form is built).

---

## Phase 5 — Invoices
Depends on: Clients (Phase 3), Projects (Phase 4). **Complete except one item that structurally depends on Phase 6a (payments), built immediately next.**

- [x] Draft invoices can be freely edited (line items, dates, client); once Final, any attempt to edit line items/total via the API is rejected — the only path to changing a finalized invoice's amount is a credit note. — Verified: edited a Draft's line items freely (totals recomputed correctly), finalized it, then confirmed both a line-item edit attempt and a `client_id` change attempt on the now-Final invoice both returned `409 invoice_locked`; a status-only update (`{"status":"Sent"}`) was still allowed.
- [x] Invoice numbers are assigned only at finalization, are strictly sequential with no gaps and no duplicates even under concurrent finalization (test with two finalize requests fired near-simultaneously). — Verified with real concurrency: two Draft invoices finalized via simultaneous background `curl` requests got `ZI-2026-002` and `ZI-2026-003` — sequential, no gap, no duplicate. Guaranteed by a row-locked `UPDATE ... RETURNING` on a per-year counter table (`invoice_number_counters`), which serializes concurrent finalizations regardless of which invoice they target.
- [x] An invoice with 3 line items at different GST rates computes subtotal/tax/total correctly, matching manual calculation to the paisa. — Verified: 3 lines at 18%/12%/0% GST produced `subtotal: 265000.00, tax: 42000.00, total: 307000.00`, matching hand calculation exactly.
- [x] An invoice whose due date has passed and still has a balance > 0 automatically shows as Overdue on the next scheduled job run, without anyone touching it. — Verified: finalized an invoice with a due date in 2020, manually invoked `runInvoiceOverdueJob()` (the same function registered in the cron scheduler at `0 1 * * *`), confirmed it flagged exactly 1 invoice and the invoice's status flipped to `Overdue`.
- [x] Two partial payments against the same invoice (see Payments README) correctly sum, update balance, and flip status to Paid only when balance reaches exactly zero. — Verified in Phase 6a: two ₹1,00,000 payments against a ₹2,50,000 invoice left balance ₹50,000 and status `Partial` after each; a third ₹50,000 payment brought balance to exactly `0` and flipped status to `Paid`.
- [x] Only invoices with status = Final (or later) ever appear in the Tally sync queue; Draft invoices never do, even if someone sets a due date in the past. — Verified: created a Draft invoice with a due date in 2020, confirmed the "sync queue" (a query — `where status = 'Final' and tally_sync_status = 'not_synced'`, no separate queue table needed since `invoices.status`/`tally_sync_status` already carry this) returned only genuinely Final invoices — structurally guaranteed by the `status = 'Final'` filter, a Draft row can never match it regardless of any other field.
- [x] `tally_sync_status` and `tally_voucher_ref` are visible on the invoice detail view and update correctly after a sync attempt. — Verified in Phase 6a: `GET /api/invoices/:id` exposes both fields at all times; after exporting for Tally, `tally_sync_status` moved to `pending`, and after manually marking synced with a voucher ref, it moved to `synced` with `tally_voucher_ref: "TALLY-GUID-ABC123"` correctly recorded. (No Bridge Agent/staging Tally instance exists per doc 03's Phase 6b — this is the Phase 6a manual-export path, which is what's built and tested.)

**What shipped:** `backend/src/routes/invoices.ts` (list/detail/create/update/delete/finalize/credit-notes), `backend/src/jobs/invoiceOverdue.ts` + scheduler registration (daily `0 1 * * *`), migrations `1754400005000_invoices.sql` (invoices, invoice_line_items, credit_notes, invoice_number_counters) and `1754400006000_payments.sql` (payments, unmatched_payments, tally_sync_log — schema only, front-loaded per the same pattern used for Clients in Phase 2, since Invoices' balance calc is structurally dependent on `payments` existing).

**Notes:**
- Credit notes are implemented as pure audit/compliance records (reason + amount, linked to the invoice) and do **not** automatically subtract from the balance calculation — the Invoices README's balance formula is explicitly `total − sum(payments)` with no mention of credit notes factoring in. Flagging this as a judgment call: if Zoffec expects a credit note to actually reduce what's chased for payment, the balance formula needs to incorporate `credit_notes` too — worth confirming before Reporting (Phase 9) builds "Payment Pending" figures on top of this.
- GST rounding: each line item's subtotal and tax are rounded to 2 decimals independently, then summed — this is what made the 3-different-rates test match hand calculation exactly, and is the standard approach for multi-rate invoices (rounding the whole invoice at once instead of per-line can drift by a paisa on mixed-rate invoices).

---

## Phase 6a — Payments (manual) & Tally Export
Depends on: Invoices (Phase 5). Ships in same release as Invoices. Zero new infrastructure. **Complete, all acceptance criteria verified.**

- [x] Recording two separate ₹1,00,000 payments against a ₹2,50,000 invoice leaves a correct ₹50,000 balance and status `Partial`; a third payment of ₹50,000 flips it to `Paid`. — Verified exactly as specified (see Phase 5's matching item above for detail).
- [x] "Export for Tally" produces a valid Tally-importable XML file for a Final invoice with correct client ledger name, amount, GST, and date; a Draft invoice has no export option available at all. — Verified: exported XML correctly carried `VOUCHERNUMBER` (ZI-2026-001), `PARTYLEDGERNAME` (client's `tally_ledger_name`), party amount (-total), Sales amount (subtotal), GST Output amount (tax), and `DATE` in Tally's `YYYYMMDD` format. A Draft invoice's export attempt returned `400 invoice_not_finalized`.
- [x] Marking an invoice as manually synced records the Tally reference and updates `tally_sync_status`, visible on the invoice detail view. — Verified: `POST .../mark-synced` with a voucher ref moved `tally_sync_status` to `synced` and stored `tally_voucher_ref`, both visible on the next `GET`.

**What shipped:** appended to `backend/src/routes/invoices.ts` — `POST /:id/payments` (manual recording, atomic balance recompute + status transition, activity_log on status change), `GET /:id/tally-export` (streams Tally XML, flips `tally_sync_status` to `pending`), `POST /:id/mark-synced`. `backend/src/lib/tallyExport.ts` builds the XML envelope.

**Note:** payments can only be recorded against invoices with status Final or later (not Draft/Cancelled) — enforced server-side, matching the Invoices README's locked-after-finalization model.

---

## Phase 6b — Tally Bridge Agent (separate later effort)
Depends on: Phase 6a shipped and stable. **Blocked** until a Windows machine on Tally's LAN is confirmed available for this environment — do not build against assumptions per 03-tally-integration-strategy.md. Status: blocked pending environment confirmation.

- [ ] Two Bridge Agent poll cycles that both see the same Tally receipt (simulated overlapping poll) result in exactly one payment record, not two — verified against the unique constraint.
- [ ] A Tally receipt whose amount matches exactly one open invoice for that client is auto-recorded as a payment with `source = tally_sync` and the invoice balance updates correctly.
- [ ] A Tally receipt whose amount matches two different open invoices for the same client is **not** auto-recorded — it lands in `unmatched_payments` for manual resolution, and resolving it manually creates the correct payment record with the human's user ID attached.
- [ ] If the Bridge Agent hasn't successfully reported within 2x its scheduled interval, the sync health indicator turns visibly stale/red and a notification fires — verified by stopping the agent in a staging environment and confirming the alert appears on schedule, not after someone happens to notice.
- [ ] A Final invoice successfully pushed to Tally shows the correct `tally_voucher_ref`, and re-running the push job for the same invoice does not create a duplicate voucher in Tally (test against a sandbox Tally company file per doc 03's staging recommendation).

---

## Phase 7 — Follow-up Automation
Depends on: Leads (Phase 2), Clients (Phase 3). **Complete, all acceptance criteria verified.**

- [x] The Today/Upcoming/Overdue tabs match a direct date comparison against `next_followup_date` for seeded leads spanning past/today/future dates — no stored tag field involved. — Verified against 520+ seeded leads: added a `?followup=today|overdue|upcoming` query param to `GET /api/leads` (computed condition on `next_followup_date` vs `current_date`, no stored field). For rep1: overdue API total 85 matched direct SQL exactly, today 5 matched, upcoming 89 matched.
- [x] Logging an interaction on a lead requires setting a next follow-up date (or explicitly marking "no further follow-up needed," e.g. for a Won/Lost lead) before the interaction can be saved. — Verified: `POST /:id/log-interaction` with neither field returned `400`; with `next_followup_date` succeeded and appended a timestamped note; `no_further_followup:true` succeeded on a `Lost` lead (cleared `next_followup_date`) but was rejected `400` on an active (non-Won/Lost) lead.
- [x] A scheduled job run against seeded data produces one notification per rep per morning listing exactly their own Today + Overdue leads (not other reps'). — Verified: ran `runFollowupReminderJob()` against 520+ seeded leads across 2 reps, got exactly 2 `followup_due` notifications — one to `rep1@zoffec.com` ("90 follow-up(s)...", matching 5 today + 85 overdue computed earlier for rep1 exactly) and one to `rep2@zoffec.com` with its own separate count — no cross-contamination.
- [x] A follow-up 4 business days overdue also produces a notification to that lead's assigned rep's manager (or Admin, if no manager hierarchy is modeled). — Verified precisely: created a lead with `next_followup_date` set to exactly 4 business days before today (computed via a weekday-skipping helper), ran the job, confirmed exactly one new `followup_escalated` notification appeared, addressed to `admin@zoffec.com`, `entity_id` correctly pointing at that lead.
- [x] Clicking "Use template" on a lead substitutes `{{name}}`, `{{service}}`, etc. with that lead's actual data and produces a copy-ready message with no unfilled placeholders remaining. — Verified: rendered a template against a fully-populated lead (service, value estimate, follow-up date all set) — output was `"Hi Rahul Mehta, checking in on Accessibility Audit (est. ₹4,50,000). Next check-in: 20/8/2026."`, all four placeholders correctly filled with real, formatted data (Indian-locale currency and date).
- [x] Adding a new template via an admin screen makes it available in the lead's follow-up panel without any deploy. — Verified: admin `POST /api/message-templates`, then a Sales user's very next `GET /api/message-templates` (no restart) showed it.

**What shipped:** `backend/src/routes/messageTemplates.ts` (CRUD, admin-only write), appended to `backend/src/routes/leads.ts` (`POST /:id/log-interaction`, `GET /:id/templates/:templateId/render`, `?followup=` query param on the list endpoint), `backend/src/jobs/followupReminders.ts` + scheduler registration (daily `0 7 * * *`), `backend/src/lib/businessDays.ts`, `backend/src/lib/notifications.ts`. Migration `1754400007000_followups-and-notifications.sql` adds `message_templates` and — front-loaded, same pattern as Clients in Phase 2 — the `notifications` table itself, since this phase's own reminder/escalation ACs require producing real notification rows; Phase 8 builds the bell-badge/mark-read/digest endpoints on top of the same table.

---

## Phase 8 — Notifications
Depends on: Follow-ups (Phase 7), Invoices (Phase 5). **In-app portion complete and verified. Two items hard-blocked (Phase 6b), one deferred per the spec's own phasing.**

- [x] The nav bell badge count exactly matches the count of unread, non-archived notifications for the logged-in user — verified by seeding a known number and checking the badge, then marking one read and confirming the count decrements immediately. — Verified: badge count 2 → marked one read → immediately 1 → "mark all read" → immediately 0.
- [x] Clicking a notification navigates to the correct underlying record (a `followup_overdue` notification opens that specific lead; an `invoice_overdue` notification opens that specific invoice). — Verified the data contract this depends on: every entity-linked notification carries correct `entity_type`/`entity_id` (checked an `invoice_overdue` notification's `entity_id` matched the actual invoice exactly). No frontend router exists yet to click through — that lands with the frontend build — but the navigation target data is correct and present on every notification row.
- [x] "Mark all read" clears the badge and updates every visible notification's read state in one action, without a page reload. — Verified: single `POST /mark-all-read` call cleared badge to 0; this is a pure API action (no page reload concept applies server-side — the "one action" requirement is satisfied by it being one endpoint call, not a per-notification loop).
- [x] An invoice crossing into Overdue status (per the Invoices scheduled job) produces exactly one notification per relevant user (assigned Finance user + Admin), not one per user in the system. — Verified: with 1 admin, 1 finance, 3 sales, 2 ops active users (7 total), a newly-overdue invoice produced exactly 2 notifications — one to the admin, one to finance — confirmed sales/ops got none.
- [ ] A stalled Tally sync (per Payments README's health check) produces a `tally_sync_stale` notification to all Finance + Admin users, and this is one of the "immediate" notifications, not held for the next day's digest. — **Blocked on Phase 6b** (Bridge Agent, sync health heartbeat) — that phase is itself blocked pending a confirmed Windows/Tally-LAN environment, per `03-tally-integration-strategy.md`. Nothing to build here until 6b unblocks.
- [x] The daily digest email (Phase 2 of this feature) contains only that recipient's own relevant items. — Built once SMTP (Brevo, via `backend/src/lib/mail.ts`) existed: `backend/src/jobs/dailyDigest.ts`, registered daily at `0 7:30 * * *`. Verified by manual run: 6 emails queued (one per active user with something to report), each scoped to that user's own role — a Sales rep's section only queries `assigned_to = <their id>`, Finance/Admin see overdue invoices, Ops/Admin see overdue projects. Password-reset emails (Phase 1) now use the same `sendMail` helper.
- [x] Notifications older than 30 days and read are excluded from the default notifications view but still exist in the database (query directly to confirm soft-archive, not deletion). — Verified: inserted a synthetic notification dated 35 days ago with `read_at` set, ran the archive job, confirmed it disappeared from `GET /api/notifications` but a direct DB query showed the row still present with `archived_at` now set (not deleted).

**What shipped:** `backend/src/routes/notifications.ts` (list, unread-count, mark-read, mark-all-read), `backend/src/jobs/archiveNotifications.ts` + scheduler registration (daily `0 2 * * *`), `invoice_overdue` notification producer wired into the existing overdue job, `lead_assigned`/`project_assigned` producers wired into Leads' and Projects' create/reassign paths (both already had the exact hook points from Phase 2/4's activity-log work).

**Note:** `payment_unmatched` notification type is not producible yet — it requires Phase 6b's auto-matching logic (comparing incoming Tally receipts against open invoices), which doesn't exist since 6b itself is blocked. Nothing to build here independently of 6b.

---

## Phase 9 — Reporting & Dashboard
Depends on: everything above. **Complete, all acceptance criteria verified.**

- [x] Every dashboard stat card matches a direct SQL query against seeded data. — Verified against the live seeded dataset: `total_leads` 529 = direct count; `proposals_sent` 67 = direct count; `projects_active` 177 = direct count; `followups_today` 14 = direct count; `pending_payments_count`/`amount` (5, ₹1,23,900) = direct query; `conversion_rate_pct` 50.91 = 84 won / (84+81) computed by hand, matched exactly.
- [x] "X this month" figures correctly reflect only records created/dated in the current calendar month when tested against seeded data spanning two different months. — Verified precisely: inserted a synthetic lead and payment dated in the prior month directly, confirmed `total_leads` incremented (530) but `new_leads_this_month` stayed unchanged (529) — the prior-month row correctly excluded; `revenue_this_month` also stayed unchanged while `revenue_change_pct` recalculated to `1566.67`, matching `(250000−15000)/15000×100` exactly.
- [x] The Recent Activity feed shows genuine recent `activity_log` entries in correct reverse-chronological order, and a new status change performed during the test session appears at the top without a page refresh needed on next load. — Verified: triggered a fresh lead status change, next `GET /api/dashboard` call showed it as the very first `recent_activity` entry, correctly ordered before all prior entries.
- [x] Lead Conversion report's by-value conversion rate is mathematically correct against seeded leads with varied `value_estimate`s. — Verified: API returned `15.86%`; hand calculation from a direct SQL query (`won_value / pipeline_value × 100` = `20,811,202 / 131,244,834 × 100`) matched exactly.
- [x] Changing the FY revenue target in an Admin setting updates the Revenue report's target-vs-actual figure without a code change or deploy. — Verified: `fy_target` was `null`, admin `PUT /api/reports/revenue/target`, next `GET` immediately reflected the new target with no restart; a Finance user's attempt to set it returned `403` (admin-only, per spec).
- [x] Filtering any report by date range and by assigned rep returns correct, narrower results. — Verified: Lead Conversion filtered by `assigned_to=rep1` returned 46 won/42 lost, matching a direct SQL count scoped the same way; an out-of-range date filter (`2020`) correctly returned 0/0 against data seeded for the current FY.
- [x] Clicking Export on the Payment Pending report (with a status filter applied, e.g., "Overdue only") produces a file containing exactly the filtered rows visible on screen, not the full invoice table. — Verified: unfiltered Payment Pending returned 4 rows, `?status=Overdue` returned 2 via the API, and the exported `.xlsx` for the same filter contained exactly 2 data rows (read back and counted programmatically) — confirming the export isn't a full-table dump.

**What shipped:** `backend/src/routes/dashboard.ts` (live stat cards, period-over-period, recent activity, upcoming follow-ups), `backend/src/routes/reports.ts` (all 4 report views: Lead Conversion, Revenue, Payment Pending + xlsx export + one-click reminder reusing the Phase 7 template system, Service-wise), `backend/src/lib/fiscalYear.ts` (Indian FY: April–March), migration `1754400008000_settings.sql` (generic key-value settings table, first used for the FY revenue target).

**Notes:**
- Export is currently xlsx-only (via `exceljs`) — the README also mentions PDF as an option ("`.xlsx` ... or `.pdf`"); xlsx was built first since it's the more universally useful format for finance/reporting workflows and the README phrases it as an "or," not a requirement for both. PDF export can be added the same way if Zoffec specifically wants it.
- Dashboard and reports are accessible to any authenticated role (no additional row-level scoping beyond what each underlying resource already enforces) — the README frames this feature as "leadership" visibility into company-wide numbers, and neither it nor the Auth README's role table calls out per-role dashboard restrictions, so this was built as company-wide by design rather than an oversight.
- Service-wise revenue attribution only counts invoices linked through a `contract_id` (which carries `service_id`) — invoices linked only via `project_id` (no contract) won't attribute revenue to a service in this report. This mirrors the data model as specified (contracts carry the service link, not projects/invoices directly) but is worth knowing if a lot of invoicing happens without a contract on file.

---

## Build complete — all 9 phases (plus Phase 0 scaffolding) done

Phase 6b (Tally Bridge Agent) remains explicitly **blocked**, per its own entry above and per `03-tally-integration-strategy.md`'s instruction not to build against an unconfirmed environment — it needs a real Windows machine on Tally's LAN before it can be built and tested honestly. Everything else specified across the 9 feature READMEs has been implemented and verified against its acceptance criteria with real requests against a real Postgres database — not just eyeballed code.

**What's structurally missing before this could ship to Zoffec, beyond Phase 6b:**
- No frontend exists — every phase was verified via direct API calls (per several ACs' own instruction to test that way, not just check the UI). The prototype's UI patterns should now be rebuilt against this API, using the brand theme already wired in `frontend/`.
- No production email/SMTP provider wired up — both password-reset links (Phase 1) and the notification digest email (Phase 8) are stubbed to log to the console in dev; picking a provider and wiring both at once is the natural next step.
- No test suite was written (`vitest` is installed but unused) — verification throughout this build was manual `curl`-based acceptance testing against each README's checklist, run and confirmed live, not automated regression tests. Worth converting the verification steps in this file into a real test suite before further changes risk silently breaking earlier phases.

---

## Cross-cutting conventions (apply to every phase, don't re-derive each time)

- Every table: `id, created_at, created_by, updated_at, updated_by, deleted_at` (soft delete).
- Money: `numeric(14,2)`, never float.
- Real FKs, never free-text references.
- Status transitions on lead/invoice/project write an `activity_log` row.
- Server-side validation on every mutating endpoint, regardless of frontend validation.
- Idempotency on any endpoint reachable by both human and automated job.
- List endpoints: server-side `?search=&status=&page=&per_page=`, never full-table client-side filtering.

---

## Post-pivot: desktop distribution + security hardening (2026-08-06, same day)

Triggered by the decision to ship a self-contained Windows installer instead of cloud hosting. In dependency order:

### No hardcoded credentials anywhere
The old `seed.ts` created a fixed `admin@zoffec.com` / `ChangeMe123!` account — fine for a single dev database, a real problem for a publicly distributed installer where every install would start with the identical, publicly-visible-in-source password. Replaced with:
- `backend/src/routes/setup.ts` — `GET /api/setup/status` (is the users table empty?) and `POST /api/setup/create-admin` (only works while it's empty; race-guarded with a Postgres advisory lock since `count(*)` can't take `FOR UPDATE`). The created admin is auto-logged-in.
- `frontend/src/pages/Setup.tsx` + `App.tsx`'s `SetupGate` — every route shows the Setup screen instead of the app until an admin exists, regardless of what URL is requested.
- `seed.ts` now seeds only the `services` lookup table.
- The dev/test fixture scripts (`seedLeads.ts`, `seedProjects.ts`) had hardcoded rep/ops passwords too (`RepPass123!` etc) — switched to `generateRandomPassword()` (in `lib/tokens.ts`), printed once to console per run. These scripts are dev-only and never run in the shipped product, but the instruction was "no static passwords anywhere," so fixed regardless.
- **Caught mid-session:** a real, live Neon Postgres connection string (not a placeholder) had ended up in the local `backend/.env` — confirmed it was never committed (gitignored, verified via a dry-run `git add`), reset `.env` back to local-dev defaults, flagged it to the user directly so they could rotate/delete that Neon project if it wasn't intentional.

### Generic SMTP (dropped Brevo-specific wiring)
Per explicit request, `backend/src/lib/mail.ts` is now provider-agnostic: SMTP config lives in the `settings` table (same key-value table the FY revenue target already used), editable via `frontend/src/pages/Settings.tsx` (admin-only — host/port/user/pass/from + a "send test email" button hitting `POST /api/settings/smtp/test`), with env vars (`SMTP_HOST` etc) as a fallback for anyone who prefers that. Works with Gmail, Zoho, Outlook, a company mail server, or anything else — no code cares which.
- [x] Verified: save config, read it back (password never echoed), send-test-email round trip.
- [x] **Bug found and fixed:** a broken SMTP config (bad host) made `password-reset/request` throw a raw `500` instead of the endpoint's own designed-uniform response. Fixed by wrapping the `sendMail` call in `try/catch` — the reset token is created regardless of whether the email successfully sends, so a mail failure shouldn't surface as a visible error to the person requesting the reset, and doesn't leak SMTP internals either way. The error is still logged server-side. Same fix applied to the daily digest job's per-user send loop, so one bad address/transient failure doesn't stop the rest of the team's digests.

### Security audit
- **Cookie `secure` flag** (`lib/session.ts`) was tied to `NODE_ENV === "production"` — would have silently broken login in the desktop build, since Electron serves the app over plain `http://127.0.0.1` (loopback-only, so lack of TLS isn't a real exposure the way it would be for an internet-facing service) and browsers refuse to store/send `secure` cookies over plain HTTP. Fixed with an explicit `DESKTOP_MODE` env var Electron sets when it spawns the backend.
- **Backend now binds to `127.0.0.1` only in desktop mode** (`index.ts`) — previously `app.listen(port, ...)` with no host specified defaults to `0.0.0.0`, meaning the desktop app's backend would have been reachable from other devices on the same WiFi/LAN, not just the local machine. Real finding, real fix — verified the app still works correctly over loopback afterward.
- **Unhandled async rejections could hang requests forever** — Express 4 doesn't forward a rejected promise from an `async (req, res) => {...}` handler to error middleware on its own (that's Express 5 behavior); most handlers here had no manual `try/catch`. Fixed with `express-async-errors` (imported first, before any route files). Verified: a deliberately malformed request that throws deep in a handler now returns a clean `500` in ~30ms instead of hanging, and the server stays healthy afterward.
- Extended the existing login/password-reset rate limiter to `/api/setup` too (defense-in-depth; low real risk since it's gated by "only works when zero users exist," but consistent with everything else).
- Added `helmet` (CSP/security headers) and `app.set("trust proxy", 1)`.
- Reviewed and found no action needed, with reasoning: SQL injection (parameterized throughout, confirmed dynamic `SET` clauses only ever use zod-validated fixed key sets, never raw user input as column names), XSS (React auto-escapes everywhere, zero `dangerouslySetInnerHTML` in the codebase), CSRF (httpOnly + `sameSite: lax` cookie is an appropriate mitigation for this app's threat model). `npm audit` findings on both frontend and backend were individually assessed: `esbuild`/`vite` (dev-server only, not shipped), `glob` CLI command injection (pulled in transitively by `node-pg-migrate`, but we never invoke glob's CLI, only its library file-matching), `uuid` buffer-bounds issue (transitive via `exceljs`/`node-cron`, no attacker-controlled buffer ever reaches it in this app's usage), and `react-router-dom`'s RSC-mode CSRF advisory (this app uses plain client-side `BrowserRouter` — no loaders/actions/RSC integration, so the vulnerable code path is never exercised). None force-upgraded/downgraded this close to release given the actual risk is effectively zero for how each is used here — documented instead of blindly "fixed."
- `argon2` (the only native addon in the dependency tree) swapped for `bcryptjs` (pure JS) — primarily to eliminate Electron ABI-rebuild risk for packaging, but also removes a whole class of native-module supply-chain surface. Verified end-to-end: hash/verify, full login flow, Setup flow, all still correct after the swap.

### Desktop packaging (Electron + embedded PostgreSQL)
`desktop/` — Electron app that bundles everything into one installer:
- `desktop/main.js` — on launch: initializes + starts an embedded PostgreSQL (`embedded-postgres` package, real Postgres 18.4 binaries, not a mock), runs all 9 migrations against it (`node-pg-migrate`'s programmatic API), forks the compiled backend using Electron's own bundled Node runtime (`ELECTRON_RUN_AS_NODE=1` — no separate Node.js install needed on the target machine), waits for its health check, then opens a window pointed at it. Backend serves both API and the built frontend from one origin (`FRONTEND_DIST_PATH`), so no separate frontend server or CORS concern.
- `backend/src/index.ts` gained a `FRONTEND_DIST_PATH`-gated static-file + SPA-fallback block for this (skipped entirely when unset, i.e. in normal dev).
- `desktop/prepare-resources.js` — stages a **production-only** copy of the backend (`npm install --omit=dev` into a clean staged copy, not the dev node_modules) plus the built frontend into `desktop/resources/`, which `electron-builder`'s `extraResources` config copies into the final installer.
- **Verified by actually building and running the real installer**, not just claimed: `npm run dist` produces `Zentinel Setup 1.0.0.exe` (~114MB), and running the unpacked exe end-to-end confirmed — first-run Postgres initialization, database creation, all 9 migrations, backend health check, and the Setup screen rendering correctly (screenshotted via Playwright pointed at the packaged app's served frontend) — all from the actual packaged output, not dev mode.
- Two real packaging bugs hit and fixed, documented in detail in `RELEASE.md`: `embedded-postgres` is ESM-only (Electron main process here is CommonJS — bridged with one `await import()` rather than converting the whole file to ESM, which hit separate Electron-specific ESM-loader issues); and `asar` packing had to be disabled entirely because `embedded-postgres`'s internal `chmod` calls on its bundled binaries didn't correctly resolve the `asarUnpack`'d path at runtime even though the binaries were correctly unpacked at build time — confirmed via the exact `ENOENT` error pointing at the packed path.
- Installer is unsigned (no code-signing cert) — Windows SmartScreen will show an "unknown publisher" warning; documented as expected/acceptable for internal use in `RELEASE.md`.

### Not done / known gaps
- No custom app icon yet (electron-builder used the default Electron icon) — cosmetic, not functional.
- Installer built and tested for Windows x64 only (the target platform asked for).
- Graceful shutdown (embedded Postgres + backend child process both cleaned up) was verified via force-kill, not by exercising the actual window-close UI path — the `before-quit` handler code is straightforward enough that this is a reasonable-confidence gap, not a blocking one.
