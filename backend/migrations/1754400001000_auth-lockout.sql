-- Up Migration
-- Phase 1: account lockout tracking + session "remember me" support.

alter table users
  add column failed_login_attempts int not null default 0,
  add column last_failed_login_at timestamptz,
  add column locked_until timestamptz;

alter table sessions
  add column remember_me boolean not null default false;

-- Down Migration

alter table sessions
  drop column remember_me;

alter table users
  drop column failed_login_attempts,
  drop column last_failed_login_at,
  drop column locked_until;
