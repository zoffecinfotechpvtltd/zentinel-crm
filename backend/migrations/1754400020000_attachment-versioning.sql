-- Up Migration
-- Document versioning: replacing a file previously meant delete-and-reupload,
-- which threw away history (and any signature request already attached to
-- the old file). supersedes_id chains a new upload to the file it replaces;
-- version is a denormalized counter so the UI can show "v3" without walking
-- the chain on every render.

alter table attachments add column supersedes_id uuid references attachments(id);
alter table attachments add column version int not null default 1;

create index idx_attachments_supersedes_id on attachments(supersedes_id);

-- Down Migration

drop index if exists idx_attachments_supersedes_id;
alter table attachments drop column if exists version;
alter table attachments drop column if exists supersedes_id;
