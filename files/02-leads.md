# Feature: Lead Management

## Outcome

Sales can track every prospective client from first contact through won/lost, know exactly who owns each lead and what's next, and never lose a lead to someone forgetting to follow up. This replaces the prototype's in-memory `leads` array with a persisted, real, multi-user-safe pipeline.

## Requirements

**Fields** (matches the prototype's lead modal, made relationally correct):
- Company name, contact person, designation, email, mobile, website
- Industry (enum: Banking & Finance, IT/Software, Healthcare, Government, Manufacturing, E-commerce, Telecom, Other)
- Lead source (enum: Website, Referral, LinkedIn, Cold Call, Event, Email Campaign)
- Service interested in — **this should be a proper `services` lookup table**, not a hardcoded dropdown baked into the frontend, since Zoffec's service list (SEBI CSCRF, Accessibility Audit, DPDP Compliance, VAPT, Cyber Security, MSOC today) will change as they add offerings, and a hardcoded list means an engineer has to redeploy the frontend every time sales adds a service.
- Status: New → Contacted → Qualified → Proposal Sent → Negotiation → **Won** | **Lost** (this is a pipeline, order matters for the funnel report — see Reporting README)
- `lost_reason` (free text, required when status is set to Lost — the prototype has this as a `notes` field but doesn't require it; capturing *why* leads are lost is the single most useful thing for sales retros and currently isn't structured data)
- Assigned to (real FK to `users`, not a hardcoded name list)
- Next follow-up date + notes
- Value estimate (₹) — **missing from the prototype entirely.** Without an estimated deal value, the dashboard's "pipeline value" and conversion-rate-by-revenue reporting (not just by count) is impossible. Add this field.

**Behavior**
- Creating a lead defaults status to "New" and requires company, contact, email at minimum.
- Every status change writes an `activity_log` entry (`lead`, `status_changed`, `{from, to}`) — this is what makes the dashboard's Recent Activity feed real instead of hardcoded.
- Setting status to Lost requires `lost_reason` to be filled (enforce server-side).
- **Convert to Client**: the prototype's `convertLead()` button is the one piece of real business logic worth keeping and hardening. On conversion: set lead status to Won (with a required `won_value` if different from the estimate), create a new `clients` row pre-filled from the lead's data, and link them (`clients.converted_from_lead_id`) so history isn't lost. This must be a single atomic DB transaction — a lead that's marked Won but failed to create the client record (or vice versa) is a real data-integrity bug, not a UI edge case.
- Duplicate detection on create: warn (don't block) if a lead with the same company name or contact email already exists, active or not — prevents two reps unknowingly working the same prospect.

## Explicitly out of scope for v1

- Multi-stage approval workflows for status changes — a single dropdown change by the assigned rep is enough at this team size.
- Lead scoring algorithms — "value estimate + manual judgment" is sufficient; don't build a scoring model nobody asked for.

## Data model

```sql
leads(
  id, company text not null, contact_person text not null,
  designation text, email text not null, mobile text, website text,
  industry text, source text, service_id uuid references services(id),
  status text check (status in ('New','Contacted','Qualified','Proposal Sent','Negotiation','Won','Lost')),
  lost_reason text, value_estimate numeric(14,2),
  assigned_to uuid references users(id),
  next_followup_date date, notes text,
  converted_to_client_id uuid references clients(id),
  created_at, created_by, updated_at, updated_by, deleted_at
)
services(id, name text unique, is_active boolean default true)
```

## Acceptance criteria

- [ ] Creating a lead without company/contact/email is rejected server-side with a clear field-level error, not a silent default like the prototype's `||''`.
- [ ] Changing a lead's status writes exactly one `activity_log` row with correct `from`/`to` values, and it shows up on the dashboard activity feed within the same request cycle (no separate manual step to "log activity").
- [ ] Setting status to "Lost" without a `lost_reason` is rejected by the API even if the frontend somehow allows submitting it.
- [ ] Converting a lead to a client creates exactly one client record linked back via `converted_from_lead_id`; if the client creation step fails for any reason, the lead's status change is rolled back too (test by forcing a DB constraint failure mid-conversion).
- [ ] Two reps can each be assigned different leads and each only sees their own in the default list view; Admin sees all.
- [ ] The services dropdown in the lead form is populated from the `services` table at request time — adding a new service via an admin screen makes it appear in the lead form without a code deploy.
- [ ] Filtering/searching leads (company, contact, status, service, source) happens via API query params and is correct against >500 seeded leads, not just the ~12 demo rows (verifies it's real server-side filtering, not the prototype's client-side `Array.filter` over everything).
