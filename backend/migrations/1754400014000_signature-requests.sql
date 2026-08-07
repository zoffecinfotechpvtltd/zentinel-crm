-- Up Migration
-- Lightweight in-house e-signature for onboarding documents (Engagement
-- Letter, PO, Proposal). This is a typed-name-plus-audit-trail click-to-
-- accept, not a legally-certified signature product like DocuSign — no
-- identity verification beyond "had the link." Good enough to close the
-- "client acknowledged this document" loop for an internal tool; not a
-- substitute for a real e-signature vendor if that legal weight is ever
-- needed.

create table signature_requests (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references attachments(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'signed', 'cancelled')),
  signer_name text,
  signer_email text,
  signed_at timestamptz,
  signed_ip text,
  signed_user_agent text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index signature_requests_attachment_id_idx on signature_requests(attachment_id);

-- Down Migration

drop table if exists signature_requests;
