-- Up Migration
-- Lets a user set a profile picture, alongside the existing self-service
-- name/password fields — same storage_path convention as attachments
-- (local disk path, or "s3://<key>" when object storage is configured).
alter table users add column avatar_path text;

-- Down Migration
-- alter table users drop column avatar_path;
