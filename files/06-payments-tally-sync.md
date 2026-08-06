# Feature: Payments & Tally Sync

**Read `03-tally-integration-strategy.md` in full before building this — it explains why this feature is architecturally split into a two-phase rollout below, and why full real-time automation isn't achievable.**

## Outcome

Every payment against an invoice is recorded exactly once, whether it was entered manually or pulled in from Tally, invoice balances are always correct, and Finance always knows which invoices match the real books and which need manual attention — with a clear, visible signal (never a silent gap) when something's out of sync.

## Requirements — Phase 1 (build first, ships value immediately, zero new infrastructure)

- Manual payment recording: Finance can record a payment against an invoice (amount, date, method, reference number, notes) — this alone already fixes the prototype's core flaw of a single mutable "received" field that can't represent multiple part-payments.
- Invoice balance/status recompute automatically from the sum of its payments (per Invoices README).
- **"Export for Tally" button** on any Final invoice not yet synced: generates a Tally-importable XML file (sales voucher, correctly mapped to the client's `tally_ledger_name`) that Finance downloads and imports into Tally themselves via Tally's native Import Data feature. On import, Finance marks the invoice `tally_sync_status = synced` in the CMS with the Tally voucher reference they can see in Tally after import.
- This phase requires no Bridge Agent, no new servers, no network access to Tally — it's shippable in the same release as core Invoices, and gives Zoffec a working (if manual-click) Tally connection on day one.

## Requirements — Phase 2 (the Bridge Agent, automates Phase 1's manual steps)

Build the Tally Bridge Agent described in doc 03:
- Small Node.js/Python service, deployed on a Windows machine on the same LAN as TallyPrime, running on a schedule (start at 15-minute intervals; tune later based on how much lag is actually acceptable to Finance).
- **Push direction**: polls the CMS for Final, not-yet-synced invoices; converts each to a Tally XML sales voucher; posts to Tally's local XML-HTTP endpoint; reports success/failure back to the CMS.
- **Pull direction**: queries Tally for new receipt vouchers against mapped client ledgers since the last sync; posts them to the CMS as candidate payments.
- **Auto-matching**: the CMS attempts to match each incoming Tally receipt to exactly one open invoice by client + exact amount. Auto-record the payment only on an unambiguous match. Anything else (amount doesn't match any single invoice, client has multiple invoices with the same balance, split payment across invoices) goes to an **Unmatched Payments queue** for manual reconciliation — never auto-guess.
- **Idempotency**: every payment pulled from Tally carries the Tally voucher GUID as an external reference; a unique constraint on `(invoice_id, tally_voucher_guid)` guarantees the same receipt is never recorded twice even if the Bridge Agent's polling window overlaps.
- **Sync health visibility**: the CMS shows a "last successful sync" timestamp prominently (dashboard + a dedicated Tally Sync status page). If the Bridge Agent hasn't reported in beyond 2x its expected interval, this triggers a notification (see Notifications README) — the whole point is that a stalled sync is loud, not silent.

## Explicitly not achievable, and why (see doc 03 for full detail — summary here)

- **Not instant.** There's an inherent poll-interval lag; Tally has no webhooks. Don't design any workflow that assumes sub-minute sync.
- **Not resilient to the Bridge Agent machine being off.** If the office machine isn't running Tally + the agent, sync pauses entirely until it's back — this is a property of Tally's local-only interface, not a bug to fix. Mitigate with the visible health indicator above, not by trying to eliminate the dependency.
- **Not safe to auto-match ambiguous payments.** Any amount that could plausibly belong to more than one invoice must go to a human. This is a deliberate accuracy-over-automation tradeoff.

## Data model

```sql
payments(
  id, invoice_id references invoices(id) not null,
  amount numeric(14,2) not null, payment_date date not null,
  method text, reference_number text,
  source text check (source in ('manual','tally_sync')) default 'manual',
  tally_voucher_guid text, -- null for manual entries
  notes text,
  created_at, created_by, updated_at, updated_by
)
-- unique constraint prevents double-recording the same Tally receipt
create unique index on payments (invoice_id, tally_voucher_guid) where tally_voucher_guid is not null;

unmatched_payments(
  id, tally_voucher_guid text, amount numeric(14,2), payment_date date,
  tally_ledger_name text, -- unresolved or ambiguous client match
  status text check (status in ('pending','resolved','ignored')) default 'pending',
  resolved_invoice_id references invoices(id), resolved_by, resolved_at,
  created_at
)
tally_sync_log(
  id, direction text check (direction in ('push','pull')),
  ran_at timestamptz, success boolean, detail jsonb, invoices_affected int
)
```

## Acceptance criteria

**Phase 1**
- [ ] Recording two separate ₹1,00,000 payments against a ₹2,50,000 invoice leaves a correct ₹50,000 balance and status `Partial`; a third payment of ₹50,000 flips it to `Paid`.
- [ ] "Export for Tally" produces a valid Tally-importable XML file for a Final invoice with correct client ledger name, amount, GST, and date; a Draft invoice has no export option available at all.
- [ ] Marking an invoice as manually synced records the Tally reference and updates `tally_sync_status`, visible on the invoice detail view.

**Phase 2**
- [ ] Two Bridge Agent poll cycles that both see the same Tally receipt (simulated overlapping poll) result in exactly one payment record, not two — verified against the unique constraint.
- [ ] A Tally receipt whose amount matches exactly one open invoice for that client is auto-recorded as a payment with `source = tally_sync` and the invoice balance updates correctly.
- [ ] A Tally receipt whose amount matches two different open invoices for the same client is **not** auto-recorded — it lands in `unmatched_payments` for manual resolution, and resolving it manually creates the correct payment record with the human's user ID attached.
- [ ] If the Bridge Agent hasn't successfully reported within 2x its scheduled interval, the sync health indicator turns visibly stale/red and a notification fires — verified by stopping the agent in a staging environment and confirming the alert appears on schedule, not after someone happens to notice.
- [ ] A Final invoice successfully pushed to Tally shows the correct `tally_voucher_ref`, and re-running the push job for the same invoice does not create a duplicate voucher in Tally (test against a sandbox Tally company file per doc 03's staging recommendation).
