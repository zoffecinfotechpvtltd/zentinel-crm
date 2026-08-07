-- Up Migration
-- Client onboarding needs specific documents tracked (engagement letter,
-- PO, proposal) rather than just an undifferentiated file list — this is
-- an optional label on the existing generic attachment, not a new table,
-- so it works the same way for every entity type that already has files.

alter table attachments add column document_type text;

-- Down Migration

alter table attachments drop column if exists document_type;
