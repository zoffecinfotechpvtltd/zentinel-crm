-- Up Migration

create table invoice_number_counters (
  year int primary key,
  last_number int not null default 0
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique,
  client_id uuid not null references clients(id),
  contract_id uuid references contracts(id),
  project_id uuid references projects(id),
  invoice_date date not null default current_date,
  due_date date,
  status text not null default 'Draft' check (status in (
    'Draft','Final','Sent','Partial','Paid','Overdue','Cancelled'
  )),
  subtotal numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  tally_sync_status text not null default 'not_synced' check (tally_sync_status in (
    'not_synced','pending','synced','failed'
  )),
  tally_voucher_ref text,
  finalized_at timestamptz,
  finalized_by uuid references users(id),
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz
);

create index idx_invoices_client_id on invoices(client_id) where deleted_at is null;
create index idx_invoices_status on invoices(status) where deleted_at is null;
create index idx_invoices_due_date on invoices(due_date) where deleted_at is null;

create table invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  description text not null,
  quantity numeric(10,2) not null default 1,
  rate numeric(14,2) not null,
  gst_rate numeric(5,2) not null default 18,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_invoice_line_items_invoice_id on invoice_line_items(invoice_id);

create table credit_notes (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  reason text not null,
  amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create index idx_credit_notes_invoice_id on credit_notes(invoice_id);

-- Down Migration

drop table if exists credit_notes;
drop table if exists invoice_line_items;
drop table if exists invoices;
drop table if exists invoice_number_counters;
