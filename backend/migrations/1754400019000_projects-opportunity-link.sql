-- Up Migration
-- Closes the last gap in the Lead/Opportunity/Client/Project/Invoice chain:
-- a Project knew its Client but not which Opportunity actually produced it,
-- so the "how did this deal become this delivery work" trail broke at the
-- Project boundary.

alter table projects add column opportunity_id uuid references opportunities(id);

create index idx_projects_opportunity_id on projects(opportunity_id) where deleted_at is null;

-- Down Migration

drop index if exists idx_projects_opportunity_id;
alter table projects drop column if exists opportunity_id;
