# Feature: Client Management

## Outcome

Once a lead is won, there's one authoritative record for that client — their contract details, contacts, active projects, and full invoice/payment history — that anyone at Zoffec can pull up in one place instead of piecing it together from emails and spreadsheets.

## Requirements

**Fields** (extends the prototype's client modal):
- Company name, SPOC (single point of contact) name/email/mobile — **plus support for multiple contacts**, not just one. The prototype allows only one SPOC per client; real accounts (especially BFSI/government clients like the demo data's ICICI Prudential, Indian Oil Corp) have multiple stakeholders (technical contact, commercial/procurement contact, executive sponsor). Add a `client_contacts` table, keep one designated as "primary."
- Service(s) — a client can have **more than one active service** over time (the prototype's single `service` field per client can't represent a client who's both a SEBI CSCRF client and later adds VAPT). Model this as multiple `contracts` per client, each with its own service, value, start/end date, status — not a single field on the client row.
- Status: Active / Inactive (kept from prototype, but derive it — see below)
- `tally_ledger_name` — **required for Tally sync** (see doc 03). This is the exact ledger name Finance uses for this client inside Tally, set once when the client is onboarded to invoicing. Without this explicit mapping field, Tally sync has no reliable way to know which Tally ledger an invoice belongs to.
- GSTIN, billing address — needed for invoice generation, missing entirely from the prototype.

**Behavior**
- Client status (Active/Inactive) should be **computed, not manually toggled**: Active if the client has at least one contract with an end date in the future (or no end date) and not explicitly archived; Inactive otherwise. The prototype's HCL Technologies row (status "Inactive" with an end date of `2025-06-30` already passed) shows exactly the kind of drift a manual status field produces — nobody remembers to flip it. Keep a manual "Archive client" override for edge cases (e.g., a client relationship ending early for a reason unrelated to contract dates), but default to computed.
- Client detail page shows: contract history, linked projects, linked invoices with running balance, and full activity timeline — this is the "one place" the outcome above promises, and doesn't exist as a concept in the prototype at all (the prototype only has a flat table row, no detail/drill-down view).
- Contract value roll-up: total contracted value across all contracts, shown on the client detail page and used in reporting (client-wise revenue, currently hardcoded fake data in the prototype's revenue report tab).

## Data model

```sql
clients(
  id, company text not null unique, gstin text, billing_address text,
  tally_ledger_name text, is_archived boolean default false,
  converted_from_lead_id uuid references leads(id),
  created_at, created_by, updated_at, updated_by, deleted_at
)
client_contacts(
  id, client_id references clients(id), name, email, mobile, designation,
  is_primary boolean default false
)
contracts(
  id, client_id references clients(id), service_id references services(id),
  value numeric(14,2), start_date date, end_date date,
  status text check (status in ('active','completed','cancelled'))
)
```

## Acceptance criteria

- [ ] A client can have 2+ contacts, exactly one marked primary; changing which one is primary is a single action, not delete-and-recreate.
- [ ] A client can have 2+ contracts for different services simultaneously; each shows independently on the client detail page with its own value/dates/status.
- [ ] Client "Active/Inactive" status on the list view matches the computed rule automatically — seed a client whose only contract's `end_date` is yesterday and confirm it shows Inactive without anyone touching a status field.
- [ ] Client detail page correctly lists all projects and invoices linked via foreign key (not string matching on company name) — rename a client's `company` field and confirm linked projects/invoices still resolve correctly (this is the exact bug class the prototype's free-text client field would produce).
- [ ] `tally_ledger_name` is a required field before an invoice can be created for that client (enforced at invoice-creation time, not client-creation time, since it may not be known until Finance sets up the client in Tally).
- [ ] Converting a lead pre-fills a new client's company/contact/service from the lead and links `converted_from_lead_id`; opening the client detail page shows a link back to the originating lead's full history.
