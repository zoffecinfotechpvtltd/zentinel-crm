# Zoffec Sentinel — full walkthrough

A single realistic story, start to finish: a new company onboarding onto Zoffec Sentinel,
through to a client fully paid and closed out. Follow it once end to end and you've touched
every feature in the system.

---

## Day 0 — First launch

1. Open the app URL. Database is empty, so you land on **Setup**, not Login.
2. Fill in your name, email, password (8+ characters) → submit. You're auto-logged-in as **Admin**.
   There is no default account, ever — the first person to reach Setup on an empty database
   becomes the first admin.
3. Go to **Users** → add the rest of the team, one row each: name, email, temp password, role
   (`admin` / `sales` / `finance` / `ops`). Each new person gets a **welcome email** with a link
   to set their own password — the temp password you typed is just to satisfy the form; they
   never need to know it.
4. Go to **Settings** → **Email (SMTP)** → enter your mail provider's details (Gmail, Zoho,
   Outlook, whatever) → **Save** → **Send a test email to** yourself → confirm it arrives.
   Nothing above works (welcome emails, reminders, digests) until this is configured — until
   then, emails just log to the server console instead of failing.

**Who can do this:** Admin only. Everyone else's first action is logging in via the link in
their welcome email.

---

## Day 1 — Sales: a lead comes in

*(Role: Sales — Ravi)*

1. Ravi logs in. His sidebar shows **Dashboard, Leads, Clients, Follow-ups, Reports,
   Notifications** — no Invoices, no Projects. That's not hidden-but-reachable; the API itself
   returns 403 if he tries. Finance's domain is walled off from Sales the same way Sales'
   domain is walled off from Finance.
2. **Leads** → **+ Add Lead**. Fills in company, contact, email, industry, source, service
   interested in, estimated value, first follow-up date. Saves.
   - No `assigned_to` picked → it defaults to Ravi himself (he created it).
   - If an *Admin* creates a lead with nobody picked, it round-robins to the next Sales rep
     in rotation instead — nobody's inbox silently fills up more than anyone else's.
3. A few days later, **Follow-ups** → **Sales** tab → **Today**. Ravi sees the lead listed. He
   clicks a **Message Template** (e.g. "Proposal Follow-up") → it copies to his clipboard with
   `{{name}}`/`{{service}}`/`{{amount}}` already filled in from the real lead data → pastes it
   into email or WhatsApp (there's a direct WhatsApp icon too, using the lead's mobile number).
4. Logs the call: opens the lead, **Log** → notes what happened, sets the *next* follow-up
   date (or, if the lead is Won/Lost, ticks "no further follow-up needed" — the system won't
   let a live lead go without a next date, on purpose).
5. Lead heats up → Ravi drags it across the **Board** view (Leads → **Board** toggle) from
   *Contacted* → *Qualified* → *Proposal Sent* → *Negotiation*. Each drag is a real status
   change, logged to the audit trail with old/new value.
6. Deal closes: **Convert to Client**. One click creates the Client record, links it back to
   the originating lead permanently, and the lead's status flips to *Won*.

---

## Day 5 — Onboarding the new client

*(Role: Sales or Admin)*

1. **Clients** → find the new client → **View**.
2. Add contacts: name, email, mobile, designation — mark one **Primary**.
3. Add the contract: service, value, start/end date.
4. Set the **Tally Ledger Name** — required before Finance can ever invoice this client;
   the system blocks invoice creation until this is filled in, so it can't be forgotten.
5. **Files** panel → pick a document type (**Engagement Letter**, **PO**, **Proposal**, or
   **Other**) → **Attach** → upload the signed file. Repeat for each document you were handed
   during onboarding. Every file is tagged, timestamped, and tied to who uploaded it — nothing
   about this client's paperwork lives in someone's inbox or a shared drive with no history.
6. **Notes** panel → log anything that doesn't fit a form field ("client wants invoices CC'd
   to their CFO", etc).

---

## Day 6 — Ops: the delivery side

*(Role: Ops — or Admin)*

1. **Projects** → **+ Add Project**. Name, client, assigned-to (any Ops/Delivery person),
   start/due date, status.
2. Whoever gets assigned gets an **immediate email** — "you now own this" shouldn't wait for
   a digest.
3. As work progresses, update **Progress %** and **Status**. Set status to *Completed* and
   progress auto-jumps to 100 (doesn't work the other way around — hitting 100% manually
   doesn't force-complete the project, since "at 100% but not yet signed off" is a real state).
4. Overdue projects show a red left-rail in the list — impossible to miss on a long list.

---

## Day 10 — Finance: invoicing and getting paid

*(Role: Finance — Priya)*

1. Priya logs in. Her sidebar shows **Dashboard, Clients, Projects, Invoices, Follow-ups,
   Reports, Notifications** — no Leads. Same wall, opposite direction from Ravi.
2. **Invoices** → **+ Create Invoice**. Picks the client (blocked if no Tally ledger name is
   set — goes back to Clients to fix that first if so), adds line items with quantity/rate/GST
   rate per line. Saves as **Draft** — freely editable while in this state.
3. When it's right: **Finalize**. This is a one-way door — assigns a permanent, gapless
   invoice number, and locks every financial field. From here on, correcting an amount means
   a **Credit Note**, not an edit — an invoice number, once issued, always means what it said.
4. **Export for Tally** → downloads Tally-importable XML. After importing it into Tally,
   **Mark Synced** with the voucher reference, so the two systems agree on state.
5. Payment comes in (maybe partial): **Record Payment** → amount, date, method. Balance
   recomputes automatically; status moves Draft → Final → Partial → Paid as balances hit zero.
   The system refuses a payment larger than the remaining balance — can't accidentally put an
   invoice into negative balance.
6. Got a scanned PDF invoice instead of typing one by hand? **Import PDF** on the Invoices
   page. It reads the file, extracts what it can (invoice number, dates, amounts, party name),
   checks whether something that looks like a duplicate already exists, and shows you a
   **review screen** — nothing saves until you confirm the extracted fields are right.
7. Invoice goes past due, still has a balance → next day's overdue job flips it to
   **Overdue** automatically, and Priya (plus every Admin) gets an **immediate email** — not
   a digest, since money going overdue is exactly the kind of thing that shouldn't wait.
8. **Follow-ups** → **Finance** tab. This is a *different* list from Sales' follow-ups — it's
   every invoice with a balance still owed, not leads. Set a "chase again on this date" per
   invoice, same concept as Sales chasing a lead, applied to money instead of a deal.

---

## Ongoing — what everyone sees regardless of role

- **Dashboard**: live counts (leads, clients, projects, pending payments, revenue this month,
  conversion rate), a revenue trend chart, lead-status funnel, upcoming follow-ups, and a
  reverse-chronological activity feed. A first-login **Getting Started** checklist appears
  for Admins until the basics (first lead, first client, SMTP, invited the team) are done.
- **Reports**: Lead Conversion, Revenue (with an FY target Admin can set), Payment Pending
  (exportable to Excel), Service-wise breakdown. Every report filters by date range and rep.
- **Notifications**: bell icon badge = unread count. Click a notification, it jumps straight
  to the record it's about. Notifications older than 30 days and already read quietly
  disappear from the default view (still exist in the database — nothing is ever hard-deleted
  by the passage of time alone).
- **Auto-logout**: 10 minutes with no mouse/keyboard activity anywhere in the app → signed
  out automatically, with a toast explaining why when you land back on Login.
- **Deletes always confirm.** Every delete — a lead, a client, a project, an invoice, a note,
  a file, deactivating a user — asks first, in a dialog that names the specific thing about
  to be removed. Nothing destructive happens from a single misplaced click.

---

## Admin-only surfaces

- **Users**: create/deactivate accounts, change roles. Deactivating someone signs them out of
  every open session immediately, everywhere, not just on their next login attempt.
- **Message Templates**: the canned messages Sales' Follow-ups page offers — edit these once,
  every rep sees the update immediately, no redeploy.
- **Settings**: SMTP config, **Backup & Restore** (a full downloadable snapshot of every
  record — do this on a schedule, especially if running the LAN/desktop build, since that
  puts the whole team's data on one machine), and (if running in LAN Server mode) the network
  address other machines on the office WiFi should connect to.
- **Audit Log**: every status change and record creation, company-wide, with who and when —
  the same data the Dashboard's activity feed shows you a slice of, in full, filterable by
  record type.

## Everyone, individually

- **Account menu (top-right avatar)** → **My Account**: your own active sessions (and a
  "log out everywhere else" button), and **Two-Factor Authentication** — scan the setup key
  into an authenticator app, confirm with a code, save the one-time backup codes it shows you
  (that's the only time they're ever shown). From then on, login asks for a 6-digit code
  after your password.

---

## The two follow-up systems, side by side

| | Sales Follow-ups | Finance Follow-ups |
|---|---|---|
| Tracks | Leads still in the pipeline | Invoices with an unpaid balance |
| Who sees it | Sales, Admin | Finance, Admin |
| "Today/Upcoming/Overdue" means | next scheduled contact with a prospect | next scheduled chase for payment |
| Action | Log an interaction, use a message template | Set/update the next chase date |
| Escalation | 4 business days overdue → notifies the rep's manager/Admin | invoice flips to Overdue status → immediate email to Finance + Admin |

They look similar on purpose — same mental model, applied to two different domains that
otherwise never overlap.
