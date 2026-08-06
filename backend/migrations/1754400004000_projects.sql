-- Up Migration

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid not null references clients(id),
  service_id uuid references services(id),
  contract_id uuid references contracts(id),
  assigned_to uuid references users(id),
  start_date date,
  due_date date,
  status text not null default 'Not Started' check (status in (
    'Not Started','In Progress','Awaiting Client','Completed','On Hold'
  )),
  progress int not null default 0 check (progress between 0 and 100),
  remarks text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz,
  constraint due_date_after_start check (due_date is null or start_date is null or due_date >= start_date)
);

create index idx_projects_client_id on projects(client_id) where deleted_at is null;
create index idx_projects_assigned_to on projects(assigned_to) where deleted_at is null;
create index idx_projects_status on projects(status) where deleted_at is null;
create index idx_projects_due_date on projects(due_date) where deleted_at is null;

-- Down Migration

drop table if exists projects;
