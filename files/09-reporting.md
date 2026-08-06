# Feature: Reporting & Dashboard

## Outcome

Leadership can answer "how's the business doing" — pipeline health, revenue, what's overdue, what's converting — by looking at real, current numbers derived from actual data, not the prototype's hardcoded dashboard figures that are already inconsistent with its own demo dataset a few hundred lines below them.

## Requirements

**Dashboard (the landing page)** — keep the prototype's exact layout and chart choices (they're well-chosen: bar for revenue trend, doughnut for status breakdown, funnel bar for pipeline), but every number becomes a real query:
- Total Leads, Active Clients, Proposals Sent, Projects Active, Pending Payments, Revenue This Month, Follow-ups Today, Conversion Rate — each is a live aggregate query against the actual tables, not a hardcoded number in the HTML.
- "X this month" / "+Y% vs last month" comparisons need real period-over-period calculation (current calendar month vs. previous), not a static string.
- Recent Activity feed reads directly from the shared `activity_log` table (architecture doc) — this single change is what makes the dashboard's most visually prominent "live" feeling element actually live.
- Upcoming Follow-ups panel reuses the same query as the Follow-ups screen's Today/Overdue tabs (don't duplicate the logic in two places).

**Reports tab** (four views, matching the prototype's structure):
1. **Lead Conversion** — funnel by stage, won/lost counts, conversion rate. Add: conversion rate *by value* (won ₹ / total pipeline ₹) alongside conversion rate by count, now possible because Leads gained a `value_estimate` field (see Leads README) — count-only conversion rate can be misleading if reps win many small deals and lose a few large ones.
2. **Revenue** — monthly trend, client-wise revenue, outstanding, FY target-vs-actual. Target FY value should be a configurable setting (Admin sets it once per fiscal year), not a hardcoded `₹1.82Cr` string as in the prototype.
3. **Payment Pending** — overdue + pending invoice table with one-click reminder (reuses the Follow-up Automation template system for the payment reminder template, rather than a separate stub).
4. **Service-wise** — revenue and lead-volume breakdown by service, pulling from the same `services` lookup table used across Leads/Clients/Projects (architecture doc) so adding a new service automatically shows up here too.

**Filters**: every report should support a date-range filter (default: current FY) and, where relevant, a filter by assigned rep — useful for 1:1s and individual performance conversations, absent from the prototype entirely.

**Export**: the prototype's "Export Excel" / "Export PDF" buttons are currently stub prompts. Real version: server-generates an actual `.xlsx` (via a library like `exceljs`) or `.pdf` of the currently-viewed report with its current filters applied — not a generic full-database dump, the *filtered view the user is looking at*.

## Explicitly out of scope for v1

- A generic/configurable report builder (drag-and-drop fields, custom pivot tables) — four well-designed fixed reports covering the real questions leadership asks is a better use of a small team's time than building reporting infrastructure nobody outside Zoffec will ever reuse.
- Real-time streaming dashboards / auto-refresh — a dashboard that's accurate as of the last page load is entirely sufficient at this scale; don't add websocket infrastructure for this.

## Acceptance criteria

- [ ] Every dashboard stat card matches a direct SQL query against seeded data — verified by seeding a known dataset (e.g., exactly 12 leads, 3 won) and confirming the card shows the derived numbers, not placeholder text.
- [ ] "X this month" figures correctly reflect only records created/dated in the current calendar month when tested against seeded data spanning two different months.
- [ ] The Recent Activity feed shows genuine recent `activity_log` entries in correct reverse-chronological order, and a new status change performed during the test session appears at the top without a page refresh needed on next load.
- [ ] Lead Conversion report's by-value conversion rate is mathematically correct against seeded leads with varied `value_estimate`s (verify by hand-calculating expected % against the seed data).
- [ ] Changing the FY revenue target in an Admin setting updates the Revenue report's target-vs-actual figure without a code change or deploy.
- [ ] Filtering any report by date range and by assigned rep returns correct, narrower results — verified against seeded data spanning multiple reps and date ranges.
- [ ] Clicking Export on the Payment Pending report (with a status filter applied, e.g., "Overdue only") produces a file containing exactly the filtered rows visible on screen, not the full invoice table.
