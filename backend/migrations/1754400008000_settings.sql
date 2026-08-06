-- Up Migration
-- Generic key-value settings, used first for the FY revenue target
-- (Reporting README: "Admin sets it once per fiscal year, not a hardcoded string").

create table settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

-- Down Migration

drop table if exists settings;
