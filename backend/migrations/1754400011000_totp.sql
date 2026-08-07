-- Up Migration
-- TOTP two-factor auth. totp_secret is only meaningful once totp_enabled is
-- true — a secret can exist mid-setup (generated but not yet confirmed with
-- a real code) without turning 2FA on, so login flow only checks the flag.
-- Backup codes are stored hashed (bcrypt, same as password_hash), never
-- plaintext — they're shown once at enrollment and that's the only time
-- they're recoverable.

alter table users
  add column totp_secret text,
  add column totp_enabled boolean not null default false,
  add column totp_backup_codes jsonb;

-- Down Migration

alter table users
  drop column if exists totp_backup_codes,
  drop column if exists totp_enabled,
  drop column if exists totp_secret;
