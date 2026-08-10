# Design: Opportunities module (service/product sales pipeline + Excel import)

Date: 2026-08-10
Status: Approved

## Background

User provided `Opportunities_Tracker.xlsx`, a manually-maintained spreadsheet tracking pre-sale
opportunities across 4 sheets:

- **Dashboard_2026** — monthly KPI summary (lead count, deals closed, deal value). Not imported —
  the app will compute these live from real data, same pattern as the existing Dashboard/Reports.
- **Opportunity tracker service** — compliance/security service opportunities (Accessibility,
  CSCRF, Cyber Security Audit, etc. — some rows tag more than one type at once, e.g.
  "CSCRF & Accessibility").
- **SEBI RENEWAL LIST** — a similarly-shaped list of CSCRF/Accessibility renewal opportunities.
- **Opportunity tracker product** — IT hardware/security product opportunities (firewalls,
  switches, access points).

This data doesn't fit the existing Leads pipeline (different vocabulary: Opportunity Type instead
of Industry, a Stage-based pipeline instead of Leads' status list, a PDF/PG & URL reference link,
service vs. product split) — confirmed with the user this becomes its own module rather than
stretching Leads to cover it.

## Scope

1. New `opportunities` module: table, backend routes, frontend page — parallel to Leads, not
   replacing it.
2. Opportunity Type as an admin-editable, multi-select tag list (same pattern as the existing
   `services` table), so a single opportunity can carry more than one type.
3. Downloadable Excel import template + bulk upload (many rows at once) + a modal for adding one
   opportunity at a time.
4. One-time migration of the ~50 real historical rows from the user's actual spreadsheet into the
   new table, as part of this work.
5. Access: Admin + Sales (same as Leads).

## Data model

```sql
create table opportunity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('service', 'product')),
  company text not null,
  client_name text,
  contact text,
  description text,
  pdf_pg_url text,
  stage text not null default 'Open' check (stage in ('Open', 'Proposal Sent', 'Won', 'Lost')),
  lost_reason text,
  follow_up_date date,
  remarks text,
  assigned_to uuid references users(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table opportunity_type_links (
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  opportunity_type_id uuid not null references opportunity_types(id) on delete cascade,
  primary key (opportunity_id, opportunity_type_id)
);
```

`stage` intentionally collapses the spreadsheet's separate (and largely redundant/inconsistent)
Stage + Status columns into one clean 4-value pipeline: `Open → Proposal Sent → Won` or `Lost`
(`lost_reason` required when set to Lost, same UX rule as Leads). Source data like "Closed (Won)"
maps to `Won`; "Closed (Lost)" maps to `Lost`; blank/anything pre-close maps to `Open` or
`Proposal Sent` depending on whether a proposal had gone out (judged per-row during migration).

## Backend

`backend/src/routes/opportunities.ts`, mounted at `/api/opportunities`, `requireAuth +
requireRole("admin", "sales")` router-wide (DELETE further restricted to `admin`, matching Leads'
pattern):

- `GET /` — filters: `search` (company/client_name), `kind`, `stage`, `opportunity_type_id`,
  `followup` (today/overdue/upcoming, like Leads). Pagination.
- `GET /:id`
- `POST /` — body includes `opportunity_type_ids: string[]`.
- `PATCH /:id`
- `DELETE /:id` (admin only, soft delete)
- `GET /types` — list active opportunity types (any role with router access).
- `POST /types` (admin only) — create a new type.
- `GET /import-template` — generates and streams an `.xlsx` (via `exceljs`, already a backend
  dependency — used today for the Payment Pending report export) with the real column headers
  (Kind, Company, Client Name, Contact, Opportunity Types, Description, PDF/PG & URL, Stage,
  Follow-up Date, Remarks), one example row, and a second reference sheet listing valid Stage
  values and current Opportunity Type names.
- `POST /import` — multipart `file` upload (same 25MB-class multer pattern already used for
  attachments), parses the template-shaped sheet, validates each row, auto-creates any Opportunity
  Type name encountered that doesn't exist yet, inserts all valid rows in one transaction, returns
  `{imported: number, skipped: [{row: number, reason: string}]}` so the UI can show exactly what
  succeeded and what didn't.

## Frontend

- `frontend/src/pages/Opportunities.tsx` — new page at `/opportunities`, nav entry, following the
  existing Leads.tsx table/filter/detail-modal pattern.
- "Add Opportunity" modal — one at a time, Opportunity Type as a multi-select (checkbox list),
  same visual language as existing forms.
- "Import" modal — "Download Template" button (hits `GET /import-template`), a file picker/upload
  area, "Import" submit, then an inline results summary (N imported, list of skipped rows with
  reasons) rendered in the same modal after the request completes.

## Historical data migration

A one-time script (not a permanent app feature) reads the user's actual `Opportunities_Tracker.xlsx`
(already inspected: `Opportunity tracker service` ~9 rows, `SEBI RENEWAL LIST` ~11 rows,
`Opportunity tracker product` ~33 rows) and inserts them directly via SQL against the dev/prod
database once, using the same `stage` normalization rules above. This is separate from the
reusable template-based bulk-import feature — the legacy sheet's column layout doesn't match the
clean template this feature ships, so it isn't run through the general import endpoint.

## Testing strategy

Given the account-level spend constraint hit during the parallel test-coverage-sweep work, this
feature is implemented directly in this session (not via heavy subagent dispatch) to conserve
budget. Verification: `npm run build` (backend + frontend), a manual pass through the dev server
(create one opportunity by hand, download the template, re-upload it, confirm the historical
migration produced the right row counts per sheet), and the existing `npm test` suite must stay
green throughout.
