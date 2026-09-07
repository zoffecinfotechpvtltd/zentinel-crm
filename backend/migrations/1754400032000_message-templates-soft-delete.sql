-- Up Migration
-- message_templates had no way to remove a template once created — no
-- deleted_at column, and no DELETE route to go with it. Soft-delete,
-- matching every other entity in the app.
alter table message_templates add column deleted_at timestamptz;

-- Down Migration
-- alter table message_templates drop column deleted_at;
