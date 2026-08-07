-- Up Migration
-- Indexes for query patterns added after the original 9 phases: client
-- ownership-via-lead lookups (now used by Clients list, Invoices list,
-- Invoices summary, and the PDF-import client match) and the new audit-log
-- viewer's actor filter.

create index idx_clients_converted_from_lead_id on clients(converted_from_lead_id) where deleted_at is null;
create index idx_activity_log_actor_id on activity_log(actor_id);
create index idx_invoices_invoice_date on invoices(invoice_date) where deleted_at is null;

-- Down Migration

drop index if exists idx_invoices_invoice_date;
drop index if exists idx_activity_log_actor_id;
drop index if exists idx_clients_converted_from_lead_id;
