-- Up Migration
-- Multi-location/multi-brand clients today need a separate, unlinked
-- Client record per location — this adds an optional parent so branches
-- can be tied back to the account they roll up under, without forcing a
-- single "one company = one client row" shape on every business.

alter table clients add column parent_client_id uuid references clients(id);

create index idx_clients_parent_client_id on clients(parent_client_id) where deleted_at is null;

-- Down Migration

drop index if exists idx_clients_parent_client_id;
alter table clients drop column if exists parent_client_id;
