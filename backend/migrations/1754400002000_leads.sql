-- Up Migration
-- Phase 2: Leads. converted_to_client_id is a bare uuid column here (no FK yet) —
-- clients table doesn't exist until the next migration, which also adds the FK back.

create table leads (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_person text not null,
  designation text,
  email text not null,
  mobile text,
  website text,
  industry text check (industry in (
    'Banking & Finance','IT/Software','Healthcare','Government',
    'Manufacturing','E-commerce','Telecom','Other'
  )),
  source text check (source in (
    'Website','Referral','LinkedIn','Cold Call','Event','Email Campaign'
  )),
  service_id uuid references services(id),
  status text not null default 'New' check (status in (
    'New','Contacted','Qualified','Proposal Sent','Negotiation','Won','Lost'
  )),
  lost_reason text,
  value_estimate numeric(14,2),
  won_value numeric(14,2),
  assigned_to uuid references users(id),
  next_followup_date date,
  notes text,
  converted_to_client_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz,
  constraint lost_requires_reason check (status <> 'Lost' or lost_reason is not null)
);

create index idx_leads_assigned_to on leads(assigned_to) where deleted_at is null;
create index idx_leads_status on leads(status) where deleted_at is null;
create index idx_leads_company on leads(company);
create index idx_leads_email on leads(email);

-- Down Migration

drop table if exists leads;
