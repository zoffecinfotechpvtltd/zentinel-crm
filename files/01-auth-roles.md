# Feature: Auth & Roles

## Outcome

Anyone opening the CMS must log in, and what they can see and do depends on their role. Nobody can view client financials, delete records, or reassign leads without the system knowing exactly who they are and being able to prove it later. This replaces the prototype's hardcoded "Admin User / Admin" badge with a real login and permission system.

## Why this exists

The prototype has zero auth — anyone with the file can see all client contracts, invoice amounts, and personal contact details. For an internal tool sitting on real client financial data and personal contact info (subject to Zoffec's own DPDP compliance advice to its clients — it would be a bad look for Zoffec's own internal tool to fail the standard it sells), this is the first thing to build, not an afterthought.

## Requirements

**Roles (keep this small — 4 roles, not a generic permission-builder):**

| Role | Can do |
|---|---|
| **Admin** | Everything, including user management, viewing all financials, deleting records, managing Tally sync config |
| **Sales** | Full CRUD on Leads, read/edit their assigned Clients, read-only on Invoices for their clients, cannot see other reps' leads unless Admin grants visibility |
| **Finance** | Full CRUD on Invoices/Payments, read-only on Leads/Clients/Projects, manages Tally sync reconciliation queue |
| **Ops/Delivery** | Full CRUD on Projects, read-only on Clients, no access to Invoices/financials |

- Login: email + password. Passwords hashed with bcrypt/argon2, never stored plain, never logged.
- Session via httpOnly secure cookie (see architecture doc). Session expires after 12 hours of inactivity; "remember me" extends to 30 days.
- Password reset via emailed one-time link (expires in 1 hour, single use).
- Account lockout after 8 failed login attempts within 15 minutes (prevents brute force; doesn't need to be fancier than this at this team size).
- Every user has `is_active` — Admin can deactivate a departed employee's account without deleting their historical activity log entries (their name must still show correctly on old records: "Assigned by Riya Sharma" should still work after Riya leaves).
- No self-service signup. Admin creates accounts. This is an internal tool for a known, small team.

## Explicitly out of scope (don't build these)

- SSO/SAML/OAuth login providers — not worth the complexity for ~10-20 users. Revisit only if Zoffec adopts Google Workspace SSO company-wide and wants it for everything.
- Fine-grained per-record permission overrides ("let this one sales rep also see this one other rep's lead") — if this becomes a real need, Admin can just reassign the lead's owner instead.
- Multi-factor authentication — reasonable to add later (it's a security company, after all — this is genuinely worth revisiting once the core system is stable) but not required for v1 given it's an internal tool with account lockout already in place.

## Data model

```sql
users(
  id, email unique, password_hash, name,
  role text check (role in ('admin','sales','finance','ops')),
  is_active boolean default true,
  last_login_at timestamptz,
  created_at, created_by, updated_at, updated_by
)
sessions(
  id, user_id references users(id), expires_at, created_at,
  user_agent text, ip_address text
)
password_reset_tokens(
  id, user_id references users(id), token_hash, expires_at, used_at
)
```

## Acceptance criteria

- [ ] Visiting any page while logged out redirects to `/login`; no page content, API data, or even list counts are fetchable without a valid session (verify via direct API call with no cookie, not just by checking the UI hides links).
- [ ] Logging in with wrong password 8 times in 15 minutes locks the account for 15 minutes and shows a clear message; correct password during lockout still fails.
- [ ] A Sales user cannot see another Sales rep's leads unless Admin has explicitly granted cross-visibility; a Sales user hitting the Invoices API directly gets read-only responses, and any PATCH/DELETE attempt returns 403.
- [ ] A Finance user can create/edit invoices and record payments but a direct API call to edit a Lead returns 403.
- [ ] Deactivating a user immediately invalidates all their active sessions (they're logged out on their next request, not just blocked from future logins).
- [ ] Deactivated users' names still render correctly on historical records they created/were assigned (`created_by`/`assigned_to` joins don't break or show "unknown user").
- [ ] Password reset link works once; using it a second time shows "link expired or already used," not a silent failure.
- [ ] All role checks are enforced server-side on every endpoint — a frontend-only check (hiding a button) is not sufficient and will fail review.
