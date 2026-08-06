-- Up Migration
-- Phase 0: base scaffolding tables every later feature depends on.
-- Per 02-architecture-and-stack.md conventions: uuid PKs, audit columns, soft delete.

create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('admin', 'sales', 'finance', 'ops')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  user_agent text,
  ip_address text
);

create index idx_sessions_user_id on sessions(user_id);
create index idx_sessions_expires_at on sessions(expires_at);

create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_password_reset_tokens_user_id on password_reset_tokens(user_id);

create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

-- shared append-only audit trail / activity feed source, per architecture doc
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('lead', 'client', 'project', 'invoice')),
  entity_id uuid not null,
  actor_id uuid references users(id),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_activity_log_entity on activity_log(entity_type, entity_id);
create index idx_activity_log_created_at on activity_log(created_at desc);

-- Down Migration

drop table if exists activity_log;
drop table if exists services;
drop table if exists password_reset_tokens;
drop table if exists sessions;
drop table if exists users;
