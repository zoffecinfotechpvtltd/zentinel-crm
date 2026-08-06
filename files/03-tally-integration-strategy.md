# Tally Integration Strategy

Read this before building Invoices or Payments — it determines how those two features must be shaped.

## What Tally actually offers (as of 2026)

TallyPrime has **no public REST or cloud API**. What it actually exposes:

| Interface | What it does | Key limitation |
|---|---|---|
| **XML over HTTP** (port 9000, local) | POST XML envelopes to create/import vouchers (sales invoices, receipts); GET XML to export masters/reports | Synchronous request/response only, **no webhooks/event callbacks** — Tally never tells you something changed, you must ask. Operates on whichever company is currently the "active company" in the running Tally instance. |
| **ODBC** | Read-only SQL-style querying of Tally's data | Read-only; fine for pulling ledger/outstanding data, useless for pushing invoices in. |
| **TDL (Tally Definition Language)** | Native scripting inside Tally itself; can trigger outbound HTTP calls from within Tally on events like save/print | Runs *inside* Tally's process — powerful but means logic lives in Tally, not your app, and every Tally version upgrade risks breaking custom TDL. |

The critical constraint underneath all three: **Tally must be a running, reachable application** — either on a machine on the same local network as whatever's talking to it, or reachable over VPN/remote-desktop to that machine. There is no cloud endpoint you call from the internet the way you'd call Stripe or Razorpay's API. Any "Tally REST API" you see advertised by third parties is **always a middleware layer they built** that translates REST/JSON calls into Tally's native XML on their end — not something Tally itself provides.

## What this means concretely for Zoffec

- The CMS backend (wherever it's hosted) **cannot talk to Tally directly** unless it's on the same network as the machine running TallyPrime, or Tally is exposed over a VPN Zoffec controls. Realistically, the office's Tally installation runs on a local machine/local network — the CMS should assume it is **not** directly reachable from wherever the CMS server lives, and plan for a bridge.
- **There are no webhooks.** The CMS cannot be told "a payment was recorded in Tally" the instant it happens — it has to ask periodically (poll), which means there is always a lag between something happening in Tally and the CMS knowing about it.
- **Full, real-time, zero-touch bidirectional sync is not honestly achievable** with this architecture, and no vendor claiming otherwise is describing something fundamentally different from what Tally exposes. What *is* achievable, reliably, is described below.

## The realistic architecture: a local Bridge Agent

Build a small, single-purpose **Tally Bridge Agent** — a lightweight Node.js (or Python) service that:

1. **Runs on a Windows machine on the same LAN as TallyPrime** (the office machine that already runs Tally, or a small always-on machine in the office network). It is *not* part of the main cloud-hosted CMS app.
2. Talks to Tally locally over `http://localhost:9000` (or the LAN IP) using XML-over-HTTP.
3. Talks to the CMS backend over the internet using a normal authenticated REST call (the CMS exposes `/api/tally-sync/*` endpoints; the bridge agent is just another API client with its own service credentials).
4. Runs on a schedule (e.g., every 5–15 minutes) rather than being triggered by Tally — because Tally can't trigger it.

This is the standard, realistic pattern every integrator in this research converged on (aiaccountant.com, precisiontech.in, tallyexperts.co.in all independently describe the same bridge-agent shape) — there is no shortcut around it.

### Direction 1 — CMS → Tally (push invoices out): the reliable direction

1. When an invoice in the CMS is marked **Approved/Final** (not while still a draft — see Invoices README), the CMS queues it in a `tally_sync_queue` table with status `pending`.
2. The Bridge Agent polls `GET /api/tally-sync/pending-invoices` on its schedule.
3. For each pending invoice, the Bridge Agent builds a Tally XML "Sales Voucher" envelope (ledger = the client, mapped via a `clients.tally_ledger_name` field the finance team sets up once per client — Tally ledger names and CMS client names will not always match exactly, so this mapping must be explicit, never inferred by string similarity) and POSTs it to Tally on `localhost:9000`.
4. Tally returns a response indicating success/failure per voucher. The Bridge Agent reports this back to `POST /api/tally-sync/report`, and the CMS updates the invoice's sync status to `synced` (storing Tally's voucher ID/GUID for traceability) or `failed` (with the error message, surfaced to whoever manages finance — see Notifications README).
5. **This direction is reliable** because it's a single push, Zoffec controls the timing (only syncing invoices that are genuinely final), and failures are visible and retryable.

### Direction 2 — Tally → CMS (pull payments in): the harder direction, handle carefully

1. On the same schedule, the Bridge Agent queries Tally (via XML export or ODBC) for **receipt vouchers** against ledgers mapped to CMS clients, since the last successful sync timestamp.
2. It posts any new receipts to `POST /api/tally-sync/payments` with a **stable external reference** (Tally voucher GUID) so the CMS can de-duplicate — the same receipt must never be recorded twice even if the agent's polling window overlaps or it retries after a network blip. This is the idempotency requirement from doc 02: unique constraint on `(invoice_id, tally_voucher_guid)`.
3. The CMS attempts to **auto-match** the receipt to an open invoice by client + amount. If it matches cleanly, record the payment automatically and update the invoice balance/status. **If it doesn't match unambiguously (split payments, advance payments, amount doesn't equal any single invoice's balance), do not guess — flag it in an "Unmatched Payments" queue for a human to reconcile manually.** Silent wrong-matching is worse than requiring a 30-second manual click.

## Where full automation is explicitly not achievable, and why

Be upfront about these with Zoffec rather than overpromising:

- **No instant sync.** There will always be a poll-interval lag (recommend 10–15 min) between something happening in Tally/CMS and the other side knowing. This is a hard limit of Tally having no webhooks — not an implementation shortcoming to "fix" later.
- **The Bridge Agent machine must stay on and networked to Tally.** If the office machine running Tally is off, or the Bridge Agent service isn't running, sync simply pauses — there is no cloud fallback, because Tally itself isn't cloud-reachable. Build a simple "last successful sync" heartbeat visible in the CMS (see Notifications README) so this is visible immediately rather than silently going stale for days.
- **Ambiguous payment matching requires a human.** Any time a receipt in Tally can't be tied to exactly one invoice with confidence, route it to manual reconciliation rather than auto-assigning — this is a deliberate design choice, not a gap to close later.
- **GST e-invoicing, if/when Zoffec crosses ₹5 crore aggregate turnover**, requires every B2B sales voucher to carry a valid IRN (Invoice Reference Number) from the government's Invoice Registration Portal before it's a valid tax invoice — this is generated by Tally's own e-invoicing flow (or GSP middleware), not something the CMS should attempt to replicate. The CMS's job here is only to make sure invoices reach Tally *before* they're presented to the client as final, so Tally's e-invoicing step can run on them normally. If Zoffec is currently under the ₹5cr threshold this doesn't block anything, but the `tally_sync_queue` design above (sync happens before final delivery, not after) is what keeps this option open without rework later.
- **Multi-company switching isn't handled.** Tally's XML interface operates on whichever company is "active" in the running instance. This spec assumes Zoffec syncs against a single company file. If that changes, the Bridge Agent needs company-switching logic (see the "split company data" reference in Tally's own docs) — out of scope unless it becomes a real requirement.

## Fallback if the Bridge Agent approach is rejected

If Zoffec doesn't want to run a dedicated always-on Windows service, the alternative is: the CMS produces a clean, correctly formatted **Tally-importable XML/Excel export** on demand (button in the Invoices screen: "Export for Tally Import"), and finance manually imports it into Tally via Tally's own Import Data feature, then manually marks the CMS invoice as synced. This trades automation for zero new infrastructure — worth offering as an MVP fallback (build this first, it's a fraction of the effort) before committing to the full Bridge Agent, and is documented as Phase 1 in the Payments & Tally Sync feature README.
