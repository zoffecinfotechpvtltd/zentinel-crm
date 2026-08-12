-- Up Migration
-- Every "when X happens, notify Y" behavior in this app has been hardcoded
-- in source so far (round-robin assignment, overdue detection, reminders).
-- This adds the one class of automation that's genuinely admin-configurable
-- without needing a visual rule builder: "when <entity> moves to <status>,
-- notify <role or person>". Narrow on purpose — covers the handful of rules
-- that actually recur in this business, not a general workflow engine.

create table automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entity_type text not null check (entity_type in ('lead', 'opportunity', 'invoice', 'project')),
  trigger_status text not null,
  notify_role text check (notify_role in ('admin', 'sales', 'finance', 'ops')),
  notify_user_id uuid references users(id),
  message_template text not null,
  is_active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint notify_target_required check (notify_role is not null or notify_user_id is not null)
);

create index idx_automation_rules_trigger on automation_rules(entity_type, trigger_status) where is_active and deleted_at is null;

-- Down Migration

drop table if exists automation_rules;
