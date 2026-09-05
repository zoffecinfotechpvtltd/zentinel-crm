-- Up Migration
-- Adds "superadmin" as a role above "admin" — reserved for technical/config
-- surfaces (Automation Rules, Custom Fields, API Keys) that a regular admin
-- shouldn't have access to. superadmin is treated as a superset of admin
-- everywhere else in the app (see isAdminRole() in src/middleware/auth.ts).
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin', 'sales', 'finance', 'ops', 'superadmin'));

-- One-off promotion: this account is the technical owner of the deployment
-- and should hold the new superadmin role instead of plain admin.
update users set role = 'superadmin' where email = 'support@zoffec.com' and role = 'admin';

-- Down Migration
-- update users set role = 'admin' where email = 'support@zoffec.com' and role = 'superadmin';
-- alter table users drop constraint users_role_check;
-- alter table users add constraint users_role_check check (role in ('admin', 'sales', 'finance', 'ops'));
