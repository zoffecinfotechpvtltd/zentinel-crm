-- Up Migration
-- Links Opportunities into the same company graph as Leads/Clients instead
-- of sitting as an island keyed only by a free-text company name: an
-- opportunity can now point at an existing Lead and/or Client, and a Won
-- opportunity can be converted into a real Client the same way Lead
-- conversion already works (clients.converted_from_lead_id).

alter table opportunities
  add column client_id uuid references clients(id),
  add column lead_id uuid references leads(id);

create index idx_opportunities_client_id on opportunities(client_id) where deleted_at is null;
create index idx_opportunities_lead_id on opportunities(lead_id) where deleted_at is null;

alter table clients
  add column converted_from_opportunity_id uuid references opportunities(id);

alter table activity_log drop constraint if exists activity_log_entity_type_check;
alter table activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('lead', 'client', 'project', 'invoice', 'opportunity'));

-- Down Migration

alter table activity_log drop constraint if exists activity_log_entity_type_check;
alter table activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('lead', 'client', 'project', 'invoice'));

alter table clients drop column if exists converted_from_opportunity_id;
drop index if exists idx_opportunities_lead_id;
drop index if exists idx_opportunities_client_id;
alter table opportunities drop column if exists lead_id;
alter table opportunities drop column if exists client_id;
