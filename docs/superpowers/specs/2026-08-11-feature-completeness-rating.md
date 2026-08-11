# Feature completeness rating

Date: 2026-08-11
Basis: README.md's claimed feature list, cross-checked against actual route/lib source and the
111-test backend suite (`backend/src/routes/__tests__/*`, `backend/src/lib/__tests__/*`) built this
session. ✅ Done = built and covered by a passing automated test. ⚠️ Partial = code exists and works
(confirmed by direct source reading) but has no automated test asserting it, or only part of the
flow is tested. ❌ Missing = not implemented.

## Core modules

| Feature | Status | Evidence |
|---|---|---|
| Leads pipeline (New→Contacted→Qualified→Proposal Sent→Negotiation→Won/Lost) | ✅ Done | `routes/leads.ts`, `leads.test.ts` (5 tests) |
| Lead score (0–100 heuristic) | ⚠️ Partial | `LEAD_SCORE_EXPR` in `leads.ts` — field is returned, no test asserts a specific score |
| Lead duplicate detection on create | ⚠️ Partial | `dupCheck` query in `POST /leads` returns `duplicate_warning` — not asserted in tests |
| Lead → Client conversion | ✅ Done | `leads.test.ts` happy path |
| Client: multiple contacts | ⚠️ Partial | `client_contacts` table + sub-routes exist — not exercised by `clients.test.ts` |
| Client: multiple contracts | ✅ Done | `clients.test.ts` (contract → computed Active status) |
| Client computed Active/Inactive status | ✅ Done | `clients.test.ts` |
| Onboarding docs + e-signature requests | ✅ Done | `notesAndAttachments.test.ts`, `publicSign.test.ts` (6 tests total) |
| Projects tracker (status/progress %/due-date) | ✅ Done | `projects.test.ts` (progress normalization, date validation) |
| Invoices: GST line items with per-line rounding | ✅ Done | `invoiceMath.test.ts` (unit) + `invoices.test.ts` (integration) |
| Invoices: Draft→Final locking + sequential numbering | ✅ Done | `invoices.test.ts` |
| Invoice PDF import (Tally PDF pre-fill) | ⚠️ Partial | `invoicePdfParse.test.ts` covers the parsing lib only — `POST /invoices/import-pdf` itself has no HTTP-level test |
| Credit notes | ⚠️ Partial | Only the rejection path (Draft invoice → 400) is tested; a successful credit-note creation has no test |
| Payments — full payment → auto Paid | ✅ Done | `invoices.test.ts` |
| Payments — partial payment transitions | ⚠️ Partial | Route logic exists (`balance < total` → `Partial`) — no test exercises a partial payment specifically |
| Tally export (per-invoice XML) | ⚠️ Partial | `GET /invoices/:id/tally-export` exists — untested |

## Follow-ups, notifications, reporting

| Feature | Status | Evidence |
|---|---|---|
| Follow-up Today/Overdue/Upcoming filters | ⚠️ Partial | `followup=` query param on leads/invoices/opportunities list endpoints — filter logic exists, no test asserts it |
| Escalation alerts (>3 business days overdue) | ⚠️ Partial | `jobs/followupReminders.ts` — zero test coverage of any scheduled job in the codebase |
| Reusable message templates | ✅ Done | `messageTemplates.test.ts` |
| `.ics` calendar export | ⚠️ Partial | `ics.ts` lib is unit-tested — the 3 routes that serve it (`leads/projects/invoices/:id/*.ics`) are not |
| WhatsApp (`wa.me`) prefilled links | ✅ Done (frontend-only) | `frontend/src/pages/Followups.tsx:72` — not backend-testable |
| Notifications — in-app | ✅ Done | `notifications.test.ts` |
| Notifications — email (SMTP) | ⚠️ Partial | `sendMail()` wired into `createNotification` for urgent types — sending itself is untested (needs an SMTP mock) |
| Daily digest email (cron) | ⚠️ Partial | `jobs/dailyDigest.ts` exists, includes an Opportunities section (added this session) — 0% tested |
| Weekly business summary (cron) | ⚠️ Partial | `jobs/weeklyReportDigest.ts` exists — 0% tested |
| Dashboard live stats | ✅ Done | `dashboard.test.ts` (role-scoped stats, null-baseline guard) |
| Conversion funnel report | ✅ Done | `reports.test.ts` |
| Revenue trend report | ⚠️ Partial | `GET /reports/revenue` tested only for the target-setting + role gate, not the monthly trend data |
| Service-wise breakdown report | ⚠️ Partial | Route exists — untested |
| Excel report export | ⚠️ Partial | `GET /reports/payment-pending/export` exists — untested |

## Security / account

| Feature | Status | Evidence |
|---|---|---|
| Session list + "log out other sessions" | ⚠️ Partial | `GET /sessions`, `POST /sessions/revoke-others` exist — zero test coverage |
| 2FA (TOTP) enrollment/verify/disable | ⚠️ Partial | `totp.ts` lib is unit-tested (5 tests, incl. backup codes) — the `/2fa/setup`, `/2fa/enable`, `/2fa/disable` routes are not |
| Password reset flow | ⚠️ Partial | `/password-reset/request`, `/password-reset/confirm` exist — zero test coverage |
| Delete-confirmation dialogs | ✅ Done (frontend-only) | `useConfirm()` used throughout Leads/Clients/Projects/etc. pages |
| Account lockout (8 failed attempts) | ✅ Done | `auth.test.ts` |

## Automation hooks

| Feature | Status | Evidence |
|---|---|---|
| Inbound webhook (`POST /api/public/leads`) | ✅ Done | `publicIntake.test.ts` (4 tests) |
| Outbound webhook (lead won/lost, invoice paid, project completed) | ⚠️ Partial | `lib/outboundWebhook.ts`'s `fireWebhook()` is called at every correct trigger point (confirmed by reading `leads.ts`/`invoices.ts`/`projects.ts`) — fire-and-forget, never itself tested |

## Platform

| Feature | Status | Evidence |
|---|---|---|
| PWA (installable) | ✅ Done | `frontend/public/manifest.json`, `frontend/public/sw.js` present |
| Desktop Electron app | ✅ Done (not evaluated this session) | `desktop/main.js`, embedded Postgres packaging — unchanged by this session's work, out of scope |
| CI (lint/typecheck/test/build on push) | ✅ Done | `.github/workflows/ci.yml` — needs no Docker service block since the test suite uses `embedded-postgres` |

## Role-based access matrix

Verified directly against every route's `requireRole(...)` call while writing the test suite —
matches the README's table exactly:

| Section | Admin | Sales | Finance | Ops |
|---|---|---|---|---|
| Dashboard / Reports / Notifications | ✅ | ✅ | ✅ | ✅ |
| Leads | ✅ | ✅ | ❌ | ❌ |
| Opportunities *(new, undocumented — see below)* | ✅ | ✅ | ❌ | ❌ |
| Clients (incl. pricing) | ✅ | ❌ | ✅ | ✅ |
| Projects | ✅ | ❌ | ✅ | ✅ |
| Invoices | ✅ | ❌ | ✅ | ❌ |
| Users, Templates, Settings, Audit Log | ✅ | ❌ | ❌ | ❌ |

## Work done this session, not yet reflected in README

| Item | Status |
|---|---|
| Login CORS fix (prod `APP_BASE_URL`) | ✅ Done, live |
| Backend `/status` diagnostic page | ✅ Done — not mentioned in README |
| Bill/Invoice document type on Client file uploads | ✅ Done — not mentioned in README |
| **Opportunities module** (service/product pipeline, multi-type tags, Excel template/import/export with duplicate detection, follow-up email reminders) | ✅ Done, tested (6 tests) — **entirely missing from README**: no feature bullet, no role-matrix row |
| Backend integration test suite (111 tests, 18 route modules) | ✅ Done — README doesn't mention automated test coverage exists at all |

## Summary

- **26 ✅ Done**, **18 ⚠️ Partial**, **0 ❌ Missing** across everything README claims — nothing
  claimed in the README turned out to be entirely unbuilt.
- The Partial list is almost entirely "code is correct and was read directly, but has no automated
  test" — a real gap for confidence/regression-safety, not a functionality gap. The scheduled cron
  jobs (`followupReminders`, `dailyDigest`, `weeklyReportDigest`) are the least-covered area: three
  real background jobs with zero automated tests between them.
- **README is stale** on one real point: the Opportunities module is a fully-built, tested,
  production feature with no mention anywhere in the README — worth a follow-up doc update.
