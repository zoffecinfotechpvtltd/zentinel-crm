-- Up Migration
-- Generic notes + file attachments, usable against any of the four entity
-- types that already carry activity_log/notifications (lead, client,
-- project, invoice). No FK to the target row itself (entity_type/entity_id
-- pair, same pattern as activity_log) since one table can't FK into four
-- different parents.

create table notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('lead', 'client', 'project', 'invoice')),
  entity_id uuid not null,
  body text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_notes_entity on notes(entity_type, entity_id) where deleted_at is null;

create table attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('lead', 'client', 'project', 'invoice')),
  entity_id uuid not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  storage_path text not null,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_attachments_entity on attachments(entity_type, entity_id) where deleted_at is null;

-- Down Migration

drop table if exists attachments;
drop table if exists notes;
