-- Up Migration
-- Project delivery tracking today is one manual 0-100% progress number with
-- no breakdown of what's actually left — this adds a simple checklist per
-- project so "what's left" is visible as discrete items, not just a guess
-- at a percentage. Deliberately not wired to auto-update progress: that's
-- a separate, explicit field admins/ops set themselves.

create table project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  title text not null,
  is_done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  completed_at timestamptz,
  deleted_at timestamptz
);

create index idx_project_tasks_project_id on project_tasks(project_id) where deleted_at is null;

-- Down Migration

drop table if exists project_tasks;
