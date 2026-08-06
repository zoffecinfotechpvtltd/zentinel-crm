-- Up Migration

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null check (channel in ('email','whatsapp')),
  subject text,
  body text not null,
  category text not null check (category in ('proposal_followup','payment_reminder','checkin')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Phase 8 schema, front-loaded: Follow-up Automation's own reminder/escalation
-- ACs require producing real notification rows, so the table has to exist now.
-- Phase 8 builds the bell-badge/mark-read/digest UI-facing endpoints on top of it.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  type text not null,
  entity_type text,
  entity_id uuid,
  title text not null,
  body text,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_id on notifications(user_id);
create index idx_notifications_unread on notifications(user_id, read_at) where read_at is null and archived_at is null;

-- Down Migration

drop table if exists notifications;
drop table if exists message_templates;
