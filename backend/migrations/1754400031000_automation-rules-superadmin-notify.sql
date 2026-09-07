-- Up Migration
-- Superadmin is a real, assignable role now (see the superadmin-role
-- migration) but automation_rules.notify_role's check constraint never
-- grew to allow targeting it — picking "Role: Superadmin" in the UI would
-- have failed this constraint on insert.
alter table automation_rules drop constraint if exists automation_rules_notify_role_check;
alter table automation_rules add constraint automation_rules_notify_role_check
  check (notify_role in ('admin', 'sales', 'finance', 'ops', 'superadmin'));

-- Down Migration
-- alter table automation_rules drop constraint if exists automation_rules_notify_role_check;
-- alter table automation_rules add constraint automation_rules_notify_role_check
--   check (notify_role in ('admin', 'sales', 'finance', 'ops'));
