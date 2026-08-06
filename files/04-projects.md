# Feature: Project Management

## Outcome

Delivery/ops can see exactly what work is in flight, for which client, who owns it, and what's overdue — without digging through email threads. This is deliberately a lightweight tracker, not a full project-management tool (no Gantt charts, no task-level breakdown) — Zoffec doesn't need Jira, it needs "what's the status of the SEBI audit for ICICI and is it late."

## Requirements

**Fields** (matches the prototype's project modal, with FK corrections):
- Project name, client (FK to `clients`, not free text), service (FK to `services`), linked contract (FK to `contracts`, optional — ties the project to the specific engagement it's delivering against)
- Assigned to (FK to `users`, filtered to Ops/Delivery role — not a hardcoded 4-name list)
- Start date, due date, status (Not Started / In Progress / Awaiting Client / Completed / On Hold), progress % (0-100)
- Remarks/notes

**Behavior**
- Due-date validation: due date must be on/after start date (the prototype has zero validation here — nothing stops a project with a due date before its start date).
- Status changes write `activity_log` entries, same pattern as leads.
- Progress % and status are somewhat independent (a project can be "On Hold" at 40%), but **Completed status should force progress to 100** and **Not Started should force progress to 0** — auto-correct these rather than allowing "Completed, 60%" to sit in the data, which is a reporting-integrity issue (the dashboard's "Projects Active" count and average-progress calculations would be wrong).
- "Due this week" and "overdue" (`due_date < today AND status != Completed`) should be computed flags, surfaced on the dashboard and driving a notification (see Notifications README) — not something someone has to notice manually.
- Each project detail view shows its parent client's other active projects, for context on delivery load per client.

## Data model

```sql
projects(
  id, name text not null, client_id references clients(id) not null,
  service_id references services(id), contract_id references contracts(id),
  assigned_to references users(id),
  start_date date, due_date date check (due_date >= start_date),
  status text check (status in ('Not Started','In Progress','Awaiting Client','Completed','On Hold')),
  progress int check (progress between 0 and 100),
  remarks text,
  created_at, created_by, updated_at, updated_by, deleted_at
)
```

## Acceptance criteria

- [ ] Submitting a due date before the start date is rejected server-side with a clear error.
- [ ] Setting status to Completed auto-sets progress to 100 (and vice versa — setting progress to 100 doesn't force status to Completed, since "100% done but awaiting client sign-off" is a real state; only the Completed→100 direction is auto-enforced).
- [ ] The dashboard's "Projects due this week" / "overdue" counts match a direct query against `due_date`/`status` — verified against seeded data with dates deliberately spanning past/today/future.
- [ ] Reassigning a project's `assigned_to` writes an activity log entry and the person's name updates correctly everywhere it's displayed (no stale cached name).
- [ ] Filtering the project list by status and by assignee works via server-side query params against 200+ seeded projects, matching the same pattern established in the Leads acceptance criteria.
