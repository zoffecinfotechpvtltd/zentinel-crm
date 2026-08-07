-- Up Migration
-- Payment follow-ups for Finance — the same "when do I next chase this"
-- concept Leads already has for Sales, applied to invoices instead. Kept
-- separate from due_date: due_date is when payment is contractually owed,
-- next_followup_date is when Finance next intends to actually chase it —
-- those two dates diverge in practice (e.g. "I'll call again Friday" even
-- though the invoice was due last week).

alter table invoices add column next_followup_date date;

-- Down Migration

alter table invoices drop column if exists next_followup_date;
