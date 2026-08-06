-- Up Migration
-- Phase 3 schema, built alongside Phase 2 since lead conversion needs it
-- (leads.converted_to_client_id -> clients.id, clients.converted_from_lead_id -> leads.id).

create table clients (
  id uuid primary key default gen_random_uuid(),
  company text not null unique,
  gstin text,
  billing_address text,
  tally_ledger_name text,
  is_archived boolean not null default false,
  converted_from_lead_id uuid references leads(id),
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz
);

alter table leads
  add constraint leads_converted_to_client_id_fkey
  foreign key (converted_to_client_id) references clients(id);

create table client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  name text not null,
  email text,
  mobile text,
  designation text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz
);

create index idx_client_contacts_client_id on client_contacts(client_id) where deleted_at is null;

-- exactly one primary contact per client, enforced at the DB level
create unique index uq_client_contacts_one_primary
  on client_contacts(client_id)
  where is_primary and deleted_at is null;

create table contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  service_id uuid references services(id),
  value numeric(14,2),
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz
);

create index idx_contracts_client_id on contracts(client_id) where deleted_at is null;

-- Down Migration

drop table if exists contracts;
drop table if exists client_contacts;
alter table leads drop constraint if exists leads_converted_to_client_id_fkey;
drop table if exists clients;
