-- Up Migration
-- The date the lead/opportunity actually came in — distinct from
-- created_at (when someone got around to entering it into the system,
-- which for the historical import batch is "whenever the import ran", not
-- when the deal was real) and from follow_up_date (when to chase it next).

alter table opportunities add column lead_date date;

-- Down Migration

alter table opportunities drop column if exists lead_date;
