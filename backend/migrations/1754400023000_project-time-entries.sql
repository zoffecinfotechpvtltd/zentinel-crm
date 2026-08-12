-- Up Migration
-- Delivery hours aren't captured anywhere in the system today — this adds
-- simple per-project time logging (who, how many hours, which day, an
-- optional note) so utilization/effort is at least visible per project,
-- without building a full timesheet/billing-rate system.

create table project_time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  user_id uuid not null references users(id),
  hours numeric(6,2) not null check (hours > 0),
  entry_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_project_time_entries_project_id on project_time_entries(project_id) where deleted_at is null;

-- Down Migration

drop table if exists project_time_entries;
