# Feature: Invoices

## Outcome

Finance can create GST-correct invoices tied to real clients and contracts, know exactly what's outstanding at any moment, and trust that every invoice either matches what's in Tally or is clearly flagged as not-yet-synced — never silently diverging from the actual books.

## Requirements

**Fields** (extends the prototype's invoice modal):
- Invoice number — **must be sequential and gap-free per Zoffec's numbering scheme** (`ZI-2025-001`, etc.), generated server-side on finalization, never freely typed (the prototype lets you type any string into `i-num`, which risks duplicate/out-of-sequence numbers — a real compliance problem for GST filing, not just a cosmetic one).
- Client (FK, required), project/contract (FK, optional)
- Invoice date, due date
- Line items — **the prototype supports only a single flat amount + GST%.** Real invoices need at least one line item with description/quantity/rate, because "amount" alone can't represent e.g. "Phase 1: ₹2,00,000 + Phase 2 retainer: ₹50,000" on one invoice. Add an `invoice_line_items` table; keep the UI simple (most invoices will have 1-2 lines) but don't hardcode "one amount field."
- GST rate per line (usually 18%, but must be editable — some services/exemptions differ), computed subtotal/tax/total
- Status: **Draft → Final → Sent → Partial → Paid → Overdue**, plus **Cancelled**. The prototype only has Pending/Partial/Paid/Overdue — missing the Draft/Final distinction, which matters a lot: **only Final invoices should sync to Tally** (see doc 03) and only Final invoices get a real, permanent invoice number. Draft invoices can be edited freely; Final invoices are locked (see below).
- `tally_sync_status` (not_synced / pending / synced / failed) and `tally_voucher_ref` — surfaced in the UI so Finance always knows the sync state of any invoice without checking Tally directly.

**Behavior**
- **Finalizing locks the invoice.** Once status moves from Draft to Final: invoice number is permanently assigned, line items/amounts become read-only (corrections happen via a credit note, not by editing history — this is both accounting best practice and the only way Tally sync stays trustworthy), and it's queued for Tally sync per doc 03.
- Status auto-transitions to **Overdue** via the scheduled job (doc 02) when `due_date < today AND balance > 0 AND status not in (Cancelled, Paid)` — not a manually set dropdown as in the prototype. Manual override should still be possible (Finance marking something as "disputed, don't chase") but the default must be computed.
- Balance = total − sum(payments) (see Payments README) — **never a single mutable "received" field**, which is the prototype's core flaw: it can't represent two separate part-payments, only the most recent overwrite of one number.
- GST calculation: `subtotal = Σ(qty × rate)`, `tax = subtotal × gst_rate`, `total = subtotal + tax`, rounded to 2 decimals using standard rounding (not floor/ceil) — keep the prototype's live-calculation UX (recalculate as you type), just move the arithmetic to `numeric` types server-side as the source of truth, with the frontend calculation as a preview only.
- Credit notes: a Final invoice needing correction gets a linked credit note (negative line items against the same client), never an edit to the original — required for both GST compliance and Tally sync integrity.

## Explicitly out of scope for v1

- Multi-currency — Zoffec's clients are all domestic (₹ only in the demo data); add this only if/when it's a real need.
- Recurring/subscription invoice auto-generation — contracts here are project/engagement-based, not SaaS-subscription-based; revisit only if Zoffec's AMC (annual maintenance contract) business grows enough to want auto-billing.

## Data model

```sql
invoices(
  id, invoice_number text unique, -- null while Draft
  client_id references clients(id) not null,
  contract_id references contracts(id), project_id references projects(id),
  invoice_date date, due_date date,
  status text check (status in ('Draft','Final','Sent','Partial','Paid','Overdue','Cancelled')),
  subtotal numeric(14,2), tax numeric(14,2), total numeric(14,2),
  tally_sync_status text default 'not_synced',
  tally_voucher_ref text,
  finalized_at timestamptz, finalized_by uuid references users(id),
  created_at, created_by, updated_at, updated_by, deleted_at
)
invoice_line_items(
  id, invoice_id references invoices(id), description text,
  quantity numeric(10,2) default 1, rate numeric(14,2), gst_rate numeric(5,2) default 18
)
credit_notes(
  id, invoice_id references invoices(id), reason text, amount numeric(14,2),
  created_at, created_by
)
```

## Acceptance criteria

- [ ] Draft invoices can be freely edited (line items, dates, client); once Final, any attempt to edit line items/total via the API is rejected — the only path to changing a finalized invoice's amount is a credit note.
- [ ] Invoice numbers are assigned only at finalization, are strictly sequential with no gaps and no duplicates even under concurrent finalization (test with two finalize requests fired near-simultaneously) — this is a correctness requirement, not a nice-to-have, since gapped/duplicate sequences are a real audit red flag.
- [ ] An invoice with 3 line items at different GST rates computes subtotal/tax/total correctly, matching manual calculation to the paisa.
- [ ] An invoice whose due date has passed and still has a balance > 0 automatically shows as Overdue on the next scheduled job run, without anyone touching it — verified against seeded past-due invoices.
- [ ] Two partial payments against the same invoice (see Payments README) correctly sum, update balance, and flip status to Paid only when balance reaches exactly zero.
- [ ] Only invoices with status = Final (or later) ever appear in the Tally sync queue; Draft invoices never do, even if someone sets a due date in the past.
- [ ] `tally_sync_status` and `tally_voucher_ref` are visible on the invoice detail view and update correctly after a sync attempt (test against the Tally Bridge Agent's mock/staging mode from doc 03).
