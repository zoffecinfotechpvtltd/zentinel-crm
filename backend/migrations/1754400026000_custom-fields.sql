-- Up Migration
-- Every field on Leads/Opportunities/Clients has been hardcoded in the
-- schema so far — tracking one new attribute has meant a migration + code
-- change, not an admin setting. This adds a JSONB column per entity (not a
-- full EAV table — right-sized for this app's scale) plus an admin-managed
-- definition table describing what fields exist and how to render them.
-- Values aren't validated server-side against field_type; the admin UI is
-- responsible for collecting the right shape, same trust level custom
-- fields get in most systems this size.

create table custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('lead', 'opportunity', 'client')),
  key text not null,
  label text not null,
  field_type text not null check (field_type in ('text', 'number', 'date', 'boolean', 'select')),
  select_options jsonb,
  is_active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (entity_type, key)
);

alter table leads add column custom_fields jsonb not null default '{}'::jsonb;
alter table opportunities add column custom_fields jsonb not null default '{}'::jsonb;
alter table clients add column custom_fields jsonb not null default '{}'::jsonb;

-- Down Migration

alter table clients drop column if exists custom_fields;
alter table opportunities drop column if exists custom_fields;
alter table leads drop column if exists custom_fields;
drop table if exists custom_field_definitions;
