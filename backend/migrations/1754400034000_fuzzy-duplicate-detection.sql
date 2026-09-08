-- Up Migration
-- Duplicate detection (Leads and Clients) was exact-match only (same
-- company/email, or same GSTIN/normalized company for clients) - real
-- near-duplicates like "Acme Corp" vs "Acme Corporation" or a typo'd
-- email domain were invisible to it. pg_trgm's similarity() gives a
-- cheap, already-native-to-Postgres way to surface those as a distinct
-- "possible match" tier, without touching the existing exact-match logic.
create extension if not exists pg_trgm;

create index if not exists idx_leads_company_trgm on leads using gin (company gin_trgm_ops) where deleted_at is null;
create index if not exists idx_clients_company_trgm on clients using gin (company gin_trgm_ops) where deleted_at is null;

-- Down Migration
-- drop index if exists idx_leads_company_trgm;
-- drop index if exists idx_clients_company_trgm;
-- drop extension if exists pg_trgm;
