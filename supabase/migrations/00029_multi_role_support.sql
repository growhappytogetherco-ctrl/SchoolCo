-- Multi-role support: one user can hold multiple roles in the same org.
-- The `role` column remains the primary routing role (backward compat).
-- The `roles` array lists every role the user holds; used for portal-view switching.
--
-- Specifically enables: a single user being both an admin/teacher AND a parent,
-- supporting the dual staff/parent portal experience.

alter table organization_members
  add column if not exists roles text[] not null default '{}';

-- Backfill: every existing member gets their current role in the array
update organization_members
  set roles = array[role::text]
  where roles = '{}';

-- Index for role-array lookups (e.g. "does this user have 'parent' in their roles?")
create index if not exists idx_org_members_roles_gin
  on organization_members using gin (roles);

-- Add a label column so demo/test/real data can be distinguished
alter table organization_members
  add column if not exists data_label text default null;

-- Same for students, families — future-proof for real data import
alter table students
  add column if not exists data_label text default null;

alter table families
  add column if not exists data_label text default null;

comment on column organization_members.roles is
  'All roles this member holds in the org. The primary `role` column drives '
  'routing; `roles` drives the portal-view picker for multi-role users. '
  'Always keep in sync when adding/removing secondary roles.';

comment on column organization_members.data_label is
  'Optional label to distinguish data sets: ''demo'', ''test'', ''imported'', etc. '
  'Displayed in the UI when non-null. Never mix demo/test data with real student records.';

comment on column students.data_label is
  'Optional label: ''demo'', ''test'', ''imported''. Set on seeded test students.';

comment on column families.data_label is
  'Optional label: ''demo'', ''test'', ''imported''. Set on seeded test families.';
