-- Up Migration
-- Contracts that renew on a cadence (monthly retainers, annual compliance
-- audits) today get re-entered from scratch every cycle. This lets Finance
-- define the template once — client, line items, how often — and a daily
-- job creates the next Draft invoice automatically when it's due.

create table recurring_invoice_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  project_id uuid references projects(id),
  contract_id uuid references contracts(id),
  line_items jsonb not null,
  frequency text not null check (frequency in ('monthly', 'quarterly', 'yearly')),
  next_run_date date not null,
  is_active boolean not null default true,
  last_generated_invoice_id uuid references invoices(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_recurring_invoice_templates_next_run on recurring_invoice_templates(next_run_date) where deleted_at is null and is_active;

-- Down Migration

drop table if exists recurring_invoice_templates;
