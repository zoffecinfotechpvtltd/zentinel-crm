-- Up Migration
-- Read-only public API, v1: external tools can now pull Lead/Client/Invoice
-- data with a token instead of needing a person to hand-export it. Deliberately
-- read-only and scoped to a stable, smaller field set than the internal
-- routes return — write access and finer scoping are a later decision, not
-- a default to grow into by accident.

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  is_active boolean not null default true,
  deleted_at timestamptz
);

create index idx_api_keys_key_hash on api_keys(key_hash) where deleted_at is null;

-- Down Migration

drop table if exists api_keys;
