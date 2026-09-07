-- Up Migration
-- Lead->Client conversion was dropping Industry entirely (clients had no
-- column to carry it into) and Service/Value Estimate along with it (there
-- was no contract row created at conversion time, which is also why a
-- freshly-converted client's computed status came out "Inactive" - the
-- STATUS_EXPR in routes/clients.ts requires an active contract to read as
-- Active, and conversion never created one).
alter table clients add column industry text;

-- Down Migration
-- alter table clients drop column industry;
