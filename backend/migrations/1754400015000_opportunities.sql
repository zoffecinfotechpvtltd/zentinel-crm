-- Up Migration
-- Sales "Opportunities" pipeline — a separate concept from Leads (which
-- tracks the company's own inbound/outbound lead funnel with an
-- Industry/Source vocabulary). Opportunities tracks service (compliance,
-- security audits, accessibility, etc.) and product (hardware, security
-- software) sales opportunities with their own Stage pipeline, a
-- multi-select Opportunity Type tag list, and a reference-document link
-- field — migrated from a manually-maintained spreadsheet with ~150 real
-- historical rows across both kinds.

create table opportunity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('service', 'product')),
  company text not null,
  client_name text,
  contact text,
  description text,
  pdf_pg_url text,
  -- Collapses the source spreadsheet's separate (and largely redundant/
  -- inconsistent) Stage + Status columns into one clean pipeline: closed-won
  -- rows become 'Won', closed-lost/dropped rows become 'Lost' (with
  -- lost_reason, same UX rule as leads.status='Lost'), everything else is
  -- 'Open' or 'Proposal Sent' depending on whether a proposal had gone out.
  stage text not null default 'Open' check (stage in ('Open', 'Proposal Sent', 'Won', 'Lost')),
  lost_reason text,
  follow_up_date date,
  remarks text,
  assigned_to uuid references users(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_opportunities_kind on opportunities(kind) where deleted_at is null;
create index idx_opportunities_stage on opportunities(stage) where deleted_at is null;
create index idx_opportunities_assigned_to on opportunities(assigned_to) where deleted_at is null;

create table opportunity_type_links (
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  opportunity_type_id uuid not null references opportunity_types(id) on delete cascade,
  primary key (opportunity_id, opportunity_type_id)
);

create index idx_opportunity_type_links_type on opportunity_type_links(opportunity_type_id);

-- Down Migration

drop table if exists opportunity_type_links;
drop table if exists opportunities;
drop table if exists opportunity_types;
