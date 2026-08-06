-- Up Migration
-- Phase 6 schema, built alongside Phase 5 since invoice balance = total - sum(payments)
-- is structural to Invoices itself. Payments' own feature routes/ACs land in Phase 6a/6b.

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  amount numeric(14,2) not null,
  payment_date date not null,
  method text,
  reference_number text,
  source text not null default 'manual' check (source in ('manual','tally_sync')),
  tally_voucher_guid text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

create index idx_payments_invoice_id on payments(invoice_id);

-- prevents double-recording the same Tally receipt
create unique index uq_payments_invoice_tally_voucher
  on payments (invoice_id, tally_voucher_guid)
  where tally_voucher_guid is not null;

create table unmatched_payments (
  id uuid primary key default gen_random_uuid(),
  tally_voucher_guid text,
  amount numeric(14,2) not null,
  payment_date date not null,
  tally_ledger_name text,
  status text not null default 'pending' check (status in ('pending','resolved','ignored')),
  resolved_invoice_id uuid references invoices(id),
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table tally_sync_log (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('push','pull')),
  ran_at timestamptz not null default now(),
  success boolean not null,
  detail jsonb not null default '{}'::jsonb,
  invoices_affected int not null default 0
);

-- Down Migration

drop table if exists tally_sync_log;
drop table if exists unmatched_payments;
drop table if exists payments;
