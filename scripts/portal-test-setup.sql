-- =============================================================
-- PARENT PORTAL TEST SETUP
-- Run this in: Supabase Dashboard → SQL Editor
-- =============================================================
-- This script:
-- 1. Applies the multi-role migration (adds `roles` column)
-- 2. Updates the profile name to "Elisa Johnson"
-- 3. Assigns multi-role access (full_admin + teacher + parent)
-- 4. Creates a test family + student + guardianship
-- =============================================================
-- SAFETY: Read the whole script before running.
-- All test records are labeled data_label = 'test' so they are
-- never confused with future real imported student data.
-- =============================================================

-- ── Step 1: Apply multi-role migration columns ────────────────

alter table organization_members
  add column if not exists roles text[] not null default '{}';

update organization_members
  set roles = array[role::text]
  where roles = '{}';

create index if not exists idx_org_members_roles_gin
  on organization_members using gin (roles);

alter table organization_members
  add column if not exists data_label text default null;

alter table students
  add column if not exists data_label text default null;

alter table families
  add column if not exists data_label text default null;

-- ── Step 2: Update profile name ───────────────────────────────
-- Finds the profile by the email address and renames it.

update profiles
  set full_name = 'Elisa Johnson'
  where id = (
    select id from auth.users where email = 'grow.happytogetherco@gmail.com'
  );

-- Verify:
select id, full_name from profiles
  where id = (select id from auth.users where email = 'grow.happytogetherco@gmail.com');

-- ── Step 3: Assign multi-role access ─────────────────────────
-- Keeps the primary role = 'full_admin' for staff routing.
-- Adds 'teacher' and 'parent' to the roles array.
-- The view-picker will appear when 'parent' is detected in roles.

update organization_members
  set roles = array['full_admin', 'teacher', 'parent']
  where profile_id = (
    select id from auth.users where email = 'grow.happytogetherco@gmail.com'
  )
  and status = 'active';

-- Verify:
select profile_id, role, roles, status
  from organization_members
  where profile_id = (
    select id from auth.users where email = 'grow.happytogetherco@gmail.com'
  );

-- ── Step 4: Capture IDs for use below ─────────────────────────

-- We'll reference these in the subsequent inserts.
-- Replace <YOUR_ORG_ID> with the org UUID from the verify query above.
-- Or let the subqueries do it automatically.

-- Get the org_id for the active membership:
-- select organization_id from organization_members
--   where profile_id = (select id from auth.users where email = 'grow.happytogetherco@gmail.com')
--   and status = 'active';

-- ── Step 5: Create a test family ─────────────────────────────

insert into families (
  id,
  organization_id,
  family_name,
  family_display_id,
  is_split_household,
  data_label,
  status
)
select
  gen_random_uuid(),
  om.organization_id,
  'Johnson Test Family',
  'TEST-FAM-001',
  false,
  'test',
  'active'
from organization_members om
where om.profile_id = (
  select id from auth.users where email = 'grow.happytogetherco@gmail.com'
)
and om.status = 'active'
limit 1
on conflict do nothing;

-- ── Step 6: Create a test student ─────────────────────────────

insert into students (
  id,
  organization_id,
  family_id,
  first_name,
  last_name,
  preferred_name,
  grade_level,
  enrollment_status,
  track,
  data_label,
  student_display_id
)
select
  gen_random_uuid(),
  om.organization_id,
  f.id,
  'Mia',
  'Johnson',
  null,
  'Grade 3',
  'enrolled',
  'Rising Leaders',
  'test',
  'TEST-STU-001'
from organization_members om
join families f on f.organization_id = om.organization_id
  and f.family_display_id = 'TEST-FAM-001'
where om.profile_id = (
  select id from auth.users where email = 'grow.happytogetherco@gmail.com'
)
and om.status = 'active'
limit 1
on conflict do nothing;

-- ── Step 7: Create guardian relationship ──────────────────────

insert into guardianships (
  id,
  organization_id,
  profile_id,
  student_id,
  household_id,
  relationship_type,
  custody_type,
  is_legal_guardian,
  is_primary_contact,
  is_emergency_contact,
  can_pickup,
  status
)
select
  gen_random_uuid(),
  om.organization_id,
  om.profile_id,
  s.id,
  null,                 -- no household needed for test
  'legal_guardian',     -- valid relationship_type enum value (not 'parent')
  'joint',
  true,
  true,
  true,
  true,
  'active'
from organization_members om
join students s on s.organization_id = om.organization_id
  and s.student_display_id = 'TEST-STU-001'
where om.profile_id = (
  select id from auth.users where email = 'grow.happytogetherco@gmail.com'
)
and om.status = 'active'
limit 1
on conflict (organization_id, profile_id, student_id) do nothing;

-- ── Step 8: Verify everything ─────────────────────────────────

-- Profile check:
select id, full_name from profiles
  where id = (select id from auth.users where email = 'grow.happytogetherco@gmail.com');

-- Membership + roles:
select profile_id, role, roles, status, organization_id
  from organization_members
  where profile_id = (select id from auth.users where email = 'grow.happytogetherco@gmail.com');

-- Test family:
select id, family_name, family_display_id, data_label, organization_id
  from families where family_display_id = 'TEST-FAM-001';

-- Test student:
select id, first_name, last_name, grade_level, data_label, enrollment_status
  from students where student_display_id = 'TEST-STU-001';

-- Guardianship:
select g.id, g.relationship_type, g.status, p.full_name, s.first_name, s.last_name
  from guardianships g
  join profiles p on p.id = g.profile_id
  join students s on s.id = g.student_id
  where g.profile_id = (select id from auth.users where email = 'grow.happytogetherco@gmail.com');
