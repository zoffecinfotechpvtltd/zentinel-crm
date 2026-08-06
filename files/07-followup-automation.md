# Feature: Follow-up Automation

## Outcome

No lead goes cold because someone forgot to follow up, and reps spend their time actually reaching out rather than remembering to check whether they're supposed to. This turns the prototype's static "here's a list of follow-ups, go remember to look at it" screen into something that actively surfaces what needs attention and reduces the manual work of writing the outreach.

## Requirements

- Every lead has a `next_followup_date`. The Follow-ups screen (kept from the prototype: Today / Upcoming / Overdue / All tabs) is driven entirely by querying leads/clients against this field and today's date — same pattern as Invoices' computed Overdue status, applied here too.
- **Auto-flagging, not manual tagging.** The prototype's `tag: 'today'/'upcoming'/'overdue'` field on each followup record is manually set in the fake data — in the real system this must be computed from `next_followup_date` vs. the current date on every request, never a stored/stale field someone has to update.
- When a rep logs a follow-up interaction (call, email, note) against a lead, they set the *next* follow-up date as part of that same action — the workflow should make it structurally hard to log "had a call" without also setting when to check in next, since that's exactly the gap that lets leads go stale.
- **Reminder notifications**: a scheduled job (see architecture doc) runs each morning and creates a notification (see Notifications README) for each rep with their Today + Overdue follow-ups — surfaced proactively rather than requiring someone to open the Follow-ups tab to discover it.
- **Escalation**: a follow-up more than 3 business days overdue also notifies the rep's manager/Admin — not to punish, but because a 3-day-stale follow-up on a live deal is exactly the kind of thing that should be visible before it becomes a lost deal with no clear reason.

**Message templates — make them real, not decorative**
- The prototype shows three static template cards (Proposal Follow-up email, WhatsApp check-in, Payment Reminder) with a "Customize with AI ↗" button that calls an undefined `sendPrompt()` function — currently inert.
- Real version: templates are stored records (`message_templates` table) with `{placeholders}` (`[Name]`, `[Service]`, `[Amount]`, `[Date]`) that get **actually substituted** with the specific lead/invoice's real data when a rep clicks "Use template," producing ready-to-send, ready-to-copy text — not just a static example a rep has to manually edit.
- Admin can add/edit templates without a code change (this is a lean, real requirement — not scope creep — since sales/marketing will want to tune wording over time and shouldn't need an engineer for it).
- **AI drafting is a legitimate v1.5 feature** (an LLM call that personalizes a template using the lead's notes/industry/service) but ship the deterministic template-substitution version first — it alone is a large upgrade over the current static-text-you-copy-by-hand state, and doesn't require deciding on an AI provider/cost model to deliver value.

## Explicitly out of scope for v1

- Automated sending (auto-emailing/auto-WhatsApp-ing on someone's behalf without a human clicking send) — Zoffec's outreach is relationship-driven B2B sales; automating the send itself risks sending something that reads as robotic to a CISO at a bank. Automate the *reminder to act* and the *drafting*, not the *sending*.

## Data model

```sql
message_templates(
  id, name text, channel text check (channel in ('email','whatsapp')),
  subject text, -- email only
  body text, -- contains {{name}}, {{service}}, {{amount}}, {{date}} placeholders
  category text, -- 'proposal_followup' | 'payment_reminder' | 'checkin'
  created_by, created_at, updated_at
)
-- next_followup_date and notes already live on `leads` (see Leads README);
-- no separate followups table needed — it's a derived view, not separate storage.
```

## Acceptance criteria

- [ ] The Today/Upcoming/Overdue tabs match a direct date comparison against `next_followup_date` for seeded leads spanning past/today/future dates — no stored tag field involved.
- [ ] Logging an interaction on a lead requires setting a next follow-up date (or explicitly marking "no further follow-up needed," e.g. for a Won/Lost lead) before the interaction can be saved.
- [ ] A scheduled job run against seeded data produces one notification per rep per morning listing exactly their own Today + Overdue leads (not other reps') — verified by seeding leads assigned to two different users and confirming each rep's notification only contains their own.
- [ ] A follow-up 4 business days overdue also produces a notification to that lead's assigned rep's manager (or Admin, if no manager hierarchy is modeled) — verified with a seeded lead whose `next_followup_date` is set accordingly.
- [ ] Clicking "Use template" on a lead substitutes `{{name}}`, `{{service}}`, etc. with that lead's actual data and produces a copy-ready message with no unfilled placeholders remaining.
- [ ] Adding a new template via an admin screen makes it available in the lead's follow-up panel without any deploy — confirms templates are data-driven, not hardcoded HTML as in the prototype.
