-- Up Migration
-- Removes the never-completed Tally sync feature end to end: the manual
-- "Export for Tally"/"Mark Synced" flow on invoices, the ledger-name
-- requirement that blocked invoice creation for clients without one, and the
-- dead schema for the auto-sync path (Phase 6b) that was never built
-- (unmatched_payments, tally_sync_log — never read or written by any route).

drop table if exists tally_sync_log;
drop table if exists unmatched_payments;

drop index if exists uq_payments_invoice_tally_voucher;
alter table payments drop constraint if exists payments_source_check;
alter table payments add constraint payments_source_check check (source in ('manual'));
alter table payments drop column if exists tally_voucher_guid;

alter table invoices drop constraint if exists invoices_tally_sync_status_check;
alter table invoices drop column if exists tally_sync_status;
alter table invoices drop column if exists tally_voucher_ref;

alter table clients drop column if exists tally_ledger_name;

-- Down Migration
-- alter table clients add column tally_ledger_name text;
-- alter table invoices add column tally_voucher_ref text;
-- alter table invoices add column tally_sync_status text not null default 'not_synced' check (tally_sync_status in ('not_synced','pending','synced','failed'));
-- alter table payments add column tally_voucher_guid text;
-- alter table payments drop constraint if exists payments_source_check;
-- alter table payments add constraint payments_source_check check (source in ('manual','tally_sync'));
-- create unique index uq_payments_invoice_tally_voucher on payments (invoice_id, tally_voucher_guid) where tally_voucher_guid is not null;
-- create table unmatched_payments (
--   id uuid primary key default gen_random_uuid(),
--   tally_voucher_guid text,
--   amount numeric(14,2) not null,
--   payment_date date not null,
--   tally_ledger_name text,
--   status text not null default 'pending' check (status in ('pending','resolved','ignored')),
--   resolved_invoice_id uuid references invoices(id),
--   resolved_by uuid references users(id),
--   resolved_at timestamptz,
--   created_at timestamptz not null default now()
-- );
-- create table tally_sync_log (
--   id uuid primary key default gen_random_uuid(),
--   direction text not null check (direction in ('push','pull')),
--   ran_at timestamptz not null default now(),
--   success boolean not null,
--   detail jsonb not null default '{}'::jsonb,
--   invoices_affected int not null default 0
-- );
