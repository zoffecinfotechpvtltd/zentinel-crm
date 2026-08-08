# Zentinel — Full Walkthrough

Zentinel is Zoffec Infotech's internal CRM: leads through to cash, one system, one login per teammate. Everyone sees the whole company through the lens of their own role — nothing more, nothing less. This document walks through every screen, as each role actually experiences it.

Four roles exist: **Admin**, **Sales**, **Finance**, **Ops**. Access is enforced on the server, not just hidden in the UI — a role that can't see a page can't hit its API either.

| Section | Admin | Sales | Finance | Ops |
|---|---|---|---|---|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Leads | ✅ | ✅ | ❌ | ❌ |
| Clients (incl. pricing) | ✅ | ❌ | ✅ | ✅ |
| Projects | ✅ | ❌ | ✅ | ✅ |
| Invoices | ✅ | ❌ | ✅ | ❌ |
| Follow-ups (Sales track) | ✅ | ✅ | ❌ | ❌ |
| Follow-ups (Finance track) | ✅ | ❌ | ✅ | ❌ |
| Reports | ✅ | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ | ✅ |
| Users, Templates, Settings, Audit Log | ✅ | ❌ | ❌ | ❌ |

Sales is walled off from Clients entirely — no company can be opened, no contract value, no pricing. Sales' job stops at a **Won** lead; from there the client, its contract, and its money belong to Finance and Ops.

---

## Logging in

Go to your Zentinel URL, sign in with the email and password an Admin set up for you. First login should be through the password-reset link emailed at account creation, not the temp password the Admin typed — set your own password there.

- **10-minute idle logout** — step away, and the app signs you out automatically. Anything you were mid-typing is lost, so save first.
- **Session expires mid-action** — if you get bounced to `/login?expired=1` with a "session expired" message, that's normal; just sign back in and retry.
- **2FA** (optional, self-enabled under My Account) — adds a 6-digit authenticator-app code or backup code as a second login step.
- **Install as an app** — Zentinel is a PWA. On desktop Chrome/Edge, click the install icon in the address bar; on mobile, "Add to Home Screen." It opens in its own window without browser chrome — the practical answer to "is there a mobile app."

---

## ADMIN

Admin sees everything every other role sees, plus four sections no one else gets: **Users**, **Message Templates**, **Settings**, **Audit Log**.

### Dashboard
Company-wide numbers at a glance: open pipeline value, this month's revenue, overdue invoice count, projects due this week. Bar/doughnut charts break pipeline down by stage and by service. The Upcoming Follow-ups widget pulls from both Sales and Finance follow-up queues so nothing across either team gets missed.

### Leads
Full sales pipeline, list or kanban view (toggle persists per-browser). Each lead carries a **lead score (0–100)** — stage progress + deal size + source quality + how recently it moved — so reps and Admin can eyeball what's actually hot versus what's gone cold, without opening every record. Duplicate detection warns on company-name/email collisions at creation. New leads round-robin to Sales reps automatically unless assigned explicitly. Converting a Won lead creates the Client record and copies the deal value across — Admin can do this for any lead; Sales only for their own.

### Clients
Company record, contacts (with a designated primary), contracts (service + value + start/end date, status), computed Active/Inactive status, and the Tally ledger name required before any invoice can be raised for that client. Onboarding documents — Engagement Letter, PO, Proposal — attach here under **Files**, tagged by document type. Any attachment can get an **e-signature request**: generates a one-time link, the client opens it (no login needed), types their name, and the signature (name, IP, timestamp) is recorded against that exact document — no external e-sign vendor required.

### Projects
Delivery tracker: status (Not Started → In Progress → Awaiting Client → Completed → On Hold), progress %, due date, assignee. Overdue and due-this-week are computed, not manually flagged. Assigning someone emails them.

### Invoices
Draft → Final workflow. A Draft can be edited or deleted freely; **Finalize** locks it and stamps a permanent sequential number (`ZI-2026-001`, ...) — no going back from there, only status moves forward (Sent/Partial/Paid/Overdue/Cancelled) and payments record against it. Partial payments are supported. **Import PDF** reads a Tally-exported invoice PDF, extracts number/dates/party/amounts, matches it to an existing client, flags likely duplicates, and pre-fills the create form for review before saving — nothing is written until you confirm. **Export for Tally** produces the reverse: a file formatted for import back into Tally once you record the entry there.

### Follow-ups
Two independent tracks under one page, switchable by tab: **Sales** (today/upcoming/overdue/all leads needing a touch) and **Finance** (same, but for invoices with an outstanding balance). Each has its own `.ics` export to drop a reminder into any calendar app. Message templates can be copied to clipboard or, for WhatsApp-tagged templates, opened directly in `wa.me` with the message pre-filled.

### Reports
Funnel by stage, client-wise revenue, monthly revenue trend, revenue by service, lead volume by service — filterable by date range, exportable to Excel. A **weekly business-summary email** (pipeline value, conversion rate, revenue, overdue invoices) goes to Admin and Finance automatically every Sunday, on top of the daily task digest everyone with pending items gets.

### Users *(Admin-only)*
Create accounts (role picked at creation — this is the only place roles are assigned), deactivate/reactivate (deactivating force-logs-out every active session for that person immediately). New users get a password-reset link by email, not their temp password in plaintext.

### Message Templates *(Admin-only)*
Canned messages for follow-ups, categorized (payment reminder, proposal follow-up, check-in) and channel-tagged (email/SMS/WhatsApp).

### Settings *(Admin-only)*
- **SMTP** — outbound email config, with a "send test" button.
- **Backup/Restore** — download a full JSON dump of the database on demand; restore requires typing `REPLACE ALL DATA` plus a confirm dialog, since it overwrites everything. A nightly automated backup now also runs on its own (see Integrations below) so this isn't the only copy.
- **Server Info** — LAN address info, relevant only to the legacy desktop/office-LAN deployment mode.
- **Integrations** — two internal automation hooks:
  - *Inbound*: a secret-gated endpoint (`POST /api/public/leads`) your company website's contact form can call to create a lead automatically, round-robin assigned like any other. Regenerate the secret any time from here.
  - *Outbound*: paste any webhook URL (Slack incoming webhook, Make.com, n8n, Zapier) and it fires a JSON POST whenever a lead goes Won/Lost, an invoice is fully paid, or a project completes.

### Audit Log *(Admin-only)*
Company-wide feed of who created or changed what — leads, clients, contacts, contracts, projects, invoices — with actor and timestamp. Filterable by record type. This is now populated on creation events too (contact added, contract added, invoice created, lead created), not just status changes.

---

## FINANCE

Finance owns money: Clients (pricing included), Invoices, the Finance follow-up track, Projects, Reports, Dashboard, Notifications.

### Dashboard & Reports
Same company-wide view as Admin gets — revenue, overdue count, pipeline value, funnel, trends. Finance also lands on the weekly summary email distribution.

### Clients
Full access including contract value, renewal dates, and the Tally ledger name field (must be set before invoicing that client). Finance is the one who adds contracts and their pricing now — this moved out of Sales' hands specifically so deal pricing stays with the team that bills it.

### Invoices
The core of the role. Raise a Draft manually or via PDF import, review/edit line items and GST rate per line, Finalize when it's ready to send (this locks numbering and amounts), record payments as they land (partial payments supported, balance recalculates), export to Tally format once entered there. Deleting is only possible while still a Draft.

### Follow-ups (Finance track)
Every invoice with an outstanding balance, grouped by when you said you'd next chase it — Today / Upcoming / Overdue / All. This date is separate from the invoice's actual due date on purpose: due date is contractual, follow-up date is "when I'm actually calling next." Templates and `.ics` export work the same as the Sales track.

### Projects
Read/edit access — Finance often needs to see delivery status against what's been billed, and can be assigned as project owner like Ops can.

### What Finance doesn't see
Leads and the Sales follow-up track are off-limits — deal-stage detail and prospecting activity stay with Sales until a lead actually converts.

---

## SALES

Sales owns the pipeline end to end: prospecting through to a Won lead. Once a lead converts, the client and its money hand off to Finance/Ops — Sales has no further Clients or Invoices access from that point.

### Dashboard
Pipeline-focused numbers: leads by stage, this rep's (or, company-wide for the funnel chart) conversion shape, upcoming follow-ups.

### Leads
The main workspace. List or kanban board, filterable by stage/source/industry. Each lead shows its lead score so you know what to call first. Log every interaction (call, email, meeting) with a note — this both builds history and can push out the next follow-up date. **Convert** on a Won lead creates the Client record automatically, carrying the deal value across, and that's the last thing Sales touches on it. Duplicate-lead warnings fire at creation so the same company doesn't get entered twice by two reps. Bulk actions (export CSV, bulk delete) work off a checkbox selection in list view.

### Follow-ups (Sales track)
Today / Upcoming / Overdue / All, scoped to your own assigned leads (Admin sees everyone's). Mark done, copy a template message to clipboard, or open a WhatsApp-tagged template directly in `wa.me` pre-filled. Export any lead's follow-up to `.ics` for your calendar.

### Reports
Same page as everyone else, but the numbers that matter to Sales are the funnel and lead-volume-by-service charts — pricing/revenue figures are visible here at an aggregate level (this is reporting, not a client's individual contract) but no client record itself can be opened.

### What Sales doesn't see
Clients, Invoices, Projects, and the Finance follow-up track are all blocked — both the nav links are hidden and the API itself refuses the request (`403 forbidden`) if hit directly. This is deliberate: Sales' incentive is closing the lead, not chasing money or managing delivery.

---

## OPS

Ops runs delivery: Clients (for context, not pricing they generate — but they can see the value Finance set) and Projects, plus the shared Dashboard/Reports/Notifications.

### Projects
Primary workspace. Own or get assigned projects, update status/progress as delivery moves, track due dates. Overdue and due-this-week projects are computed automatically and surfaced on the Dashboard.

### Clients
Read/edit access to company info, contacts, and contract terms — needed to know what was actually sold before delivering it. Same access level as Finance here (both were the two roles left with client access once Sales was walled off).

### Dashboard & Reports
Company-wide, same as every role — Ops typically watches the "projects due this week" and overdue counts most closely.

### What Ops doesn't see
Leads, Invoices, and both follow-up tracks are off-limits — prospecting and money-chasing aren't Ops' job.

---

## Shared, every role

- **My Account** — session list (device/browser/location, human-readable — not raw user-agent strings), "log out other sessions," self-service password change, and 2FA setup/disable.
- **Notifications** — in-app bell plus email for anything time-sensitive: invoice overdue, follow-up escalated, security alert (repeated forbidden access attempts), lead assigned, project assigned. A daily digest email covers everything currently pending for you; Admin/Finance additionally get the weekly business summary.
- **Dark/light theme** — toggle in the top bar, persists per-browser.
- **Delete confirmations** — every destructive action (delete lead/client/project/invoice/note/file, deactivate a user, restore-replaces-everything) shows a custom in-app confirm dialog naming exactly what's being removed — never a bare browser popup, never silent.

---

## Notes on what's automated behind the scenes

- **Auto-migration on boot** — every deploy runs pending database migrations before the server starts serving traffic, so a code change and its matching schema change ship together, always.
- **Keep-alive ping** — a scheduled job pings the backend every 10 minutes so Render's free tier doesn't spin it down, which also keeps the daily/weekly digest and overdue-checking jobs firing on schedule.
- **Object storage for attachments** — when configured (see Admin's deploy notes), uploaded files survive redeploys instead of living on the host's disk, which gets wiped on every restart on Render's free tier.
- **Nightly database backup** — a scheduled job writes a full backup to the same object storage automatically, independent of anyone remembering to click "Download backup now."
