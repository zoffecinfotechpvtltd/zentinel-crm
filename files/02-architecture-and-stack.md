# Architecture & Stack

Read this before building any feature — it defines conventions every feature README assumes rather than restates.

## Stack

- **Database:** PostgreSQL. Non-negotiable for this app specifically because of invoices/payments: need real transactions (an invoice + its first payment must commit atomically), numeric precision for money, and foreign keys to stop the prototype's "client is a free-text string" problem.
- **Backend:** Node.js + TypeScript, any framework (Express/Fastify/Hono all fine — pick whatever the team already knows, this app is not large enough for the framework choice to matter). REST, not GraphQL — there's no client complex enough to justify GraphQL's overhead for a ~10-screen internal tool.
- **Frontend:** Either keep the prototype's vanilla-JS SPA pattern (page-swap + fetch calls) or port to React. Recommend React only because the prototype already hand-rolls the exact bug class React exists to prevent (manual `renderX()` calls scattered after every mutation, index-based instead of ID-based row identity). Not a hard requirement — every feature README below is written as a data/behavior contract, not tied to either choice.
- **Auth:** httpOnly session cookie, Postgres-backed session store. Simpler to reason about and revoke than JWT for a single-tenant internal tool with ~10–20 users.
- **Background jobs:** a single lightweight scheduler (`node-cron` or equivalent) running in-process is sufficient at this scale — no need for Redis/queue infrastructure for a company this size. Used for: overdue-invoice detection, follow-up reminder firing, Tally sync polling.
- **Hosting:** one small VM/container for app + Postgres. The **Tally Bridge Agent** (see doc 03) is a separate small Windows service that must run on the same LAN as the Tally installation — it is not hosted with the rest of the app.

## Data model conventions (apply everywhere)

Every table gets:
```sql
id            uuid primary key default gen_random_uuid(),
created_at    timestamptz not null default now(),
created_by    uuid references users(id),
updated_at    timestamptz not null default now(),
updated_by    uuid references users(id),
deleted_at    timestamptz          -- soft delete; null = active
```

Money: `numeric(14,2)` in the base currency unit (rupees, not paise, for readability in this codebase — but always `numeric`, never `float`/`double`).

Relationships are real foreign keys, not free-text:
- `projects.client_id → clients.id` (not a `client` text column)
- `invoices.client_id → clients.id`, `invoices.project_id → projects.id` (nullable — some invoices aren't tied to a specific project)
- `leads.assigned_to → users.id`, `projects.assigned_to → users.id` (not a name string picked from a hardcoded `<select>`)

**Activity log** — one shared table, not per-entity duplication:
```sql
activity_log(
  id, entity_type text,      -- 'lead' | 'client' | 'project' | 'invoice'
  entity_id uuid,
  actor_id uuid references users(id),
  action text,                -- 'status_changed' | 'created' | 'note_added' | 'payment_recorded' ...
  detail jsonb,                -- e.g. {"from":"Qualified","to":"Proposal Sent"}
  created_at timestamptz default now()
)
```
Every feature README below says "write an activity_log entry" for its key transitions — this table is what powers the dashboard's Recent Activity feed and the audit trail, replacing the prototype's hardcoded fake activity array.

## API conventions

- REST, resource-based: `GET/POST /api/leads`, `GET/PATCH/DELETE /api/leads/:id`, etc.
- All list endpoints support `?search=&status=&page=&per_page=` server-side — the prototype's client-side-only filtering (`Array.filter` over the full dataset) does not scale past a few hundred rows and, more importantly, doesn't work once data isn't all loaded into the browser at once.
- All mutating endpoints return the full updated resource (not just `{success:true}`) so the frontend can update its local state without a second round-trip.
- Validation happens server-side, always — even if the frontend also validates. The prototype has zero server validation because it has no server; production must not repeat the "amount can be blank or negative" gap.

## Error handling & idempotency (relevant beyond just Tally)

- Any endpoint that can be called by both a human and an automated job (invoice status updates, payment recording) must be idempotent — recording the same payment twice (e.g., a retried webhook or a double-click) must not double-count revenue. Use a client-supplied idempotency key or a natural uniqueness constraint (e.g., `(invoice_id, external_reference)` unique index on payments).

## Environments

- `local` (developer machine, seeded fake data resembling the prototype's demo dataset — useful for keeping the same realistic Indian-enterprise-client flavor for demos/screenshots)
- `staging` (for testing the Tally bridge safely against a sandbox Tally company file before touching real books)
- `production`

Seed data for `local`/`staging` should reuse the prototype's existing fake dataset (HDFC Securities, Infosys BPM, etc.) — it's already realistic and saves time re-inventing fixtures.
