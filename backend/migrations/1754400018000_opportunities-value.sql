-- Up Migration
-- Deal value on Opportunities. Without this, the pipeline can't drive
-- forecasting, weighted-pipeline, or win-rate-by-value reporting — every
-- other field on the row was present except the one a "pipeline" concept
-- is actually built around.

alter table opportunities add column value numeric(14,2);

-- Down Migration

alter table opportunities drop column if exists value;
