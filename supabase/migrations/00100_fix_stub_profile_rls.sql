-- ============================================================
-- Migration 00100 — Fix RLS for stub-profile users
-- ============================================================
-- Problem: When a guardian is imported as a "stub" profile
-- (profiles.id = stub UUID, profiles.auth_user_id = auth UUID),
-- then later signs up as a staff member, their organization_members
-- record stores profile_id = stub UUID. But all RLS helper functions
-- check `profile_id = auth.uid()` where auth.uid() = the auth UUID.
-- These don't match → all RLS checks fail for stub-profile staff.
--
-- Fix: Add current_profile_id() which resolves auth.uid() to the
-- canonical profiles.id (the stub UUID when one exists), then rewrite
-- all helpers to use it instead of auth.uid() for profile_id comparisons.
-- ============================================================

-- ── current_profile_id() ─────────────────────────────────────────────────────
-- Returns the canonical profiles.id for the current auth user.
-- For native users: profiles.auth_user_id = profiles.id = auth.uid() → returns auth.uid().
-- For stub-profile users: profiles.auth_user_id = auth.uid() but profiles.id ≠ auth.uid()
--   → returns the stub UUID so it matches organization_members.profile_id.
-- Falls back to auth.uid() when no matching profile row exists (new user before onboarding).

create or replace function current_profile_id()
returns uuid
language sql
security definer
stable
as $$
  select coalesce(
    (select id from profiles where auth_user_id = auth.uid() limit 1),
    auth.uid()
  );
$$;

comment on function current_profile_id is
  'Resolves auth.uid() to the canonical profiles.id, handling stub-profile users '
  'where profiles.id != auth.uid() but profiles.auth_user_id = auth.uid().';

grant execute on function current_profile_id() to authenticated;

-- ── Rewrite all RLS helpers to use current_profile_id() ──────────────────────

create or replace function is_org_member(org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from organization_members
    where organization_id = org_id
      and profile_id      = current_profile_id()
      and status          = 'active'
  );
$$;

comment on function is_org_member is
  'Returns true if the current user is an active member of the given organization. '
  'Handles both native and stub-profile users. Used in RLS policies.';


create or replace function has_org_role(org_id uuid, required_role user_role)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from organization_members
    where organization_id = org_id
      and profile_id      = current_profile_id()
      and role            = required_role
      and status          = 'active'
  );
$$;

comment on function has_org_role is
  'Returns true if the current user has exactly the specified role in the given org. '
  'Handles stub-profile users.';


create or replace function is_org_admin(org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from organization_members
    where organization_id = org_id
      and profile_id      = current_profile_id()
      and role            in ('admin', 'full_admin', 'platform_admin')
      and status          = 'active'
  );
$$;

comment on function is_org_admin is
  'Returns true if the current user is admin, full_admin, or platform_admin. '
  'Handles stub-profile users.';


create or replace function is_full_admin_or_above(org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from organization_members
    where organization_id = org_id
      and profile_id      = current_profile_id()
      and role            in ('full_admin', 'platform_admin')
      and status          = 'active'
  );
$$;

comment on function is_full_admin_or_above is
  'Returns true if the current user is full_admin or platform_admin. '
  'Handles stub-profile users.';


create or replace function is_platform_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from organization_members
    where profile_id = current_profile_id()
      and role       = 'platform_admin'
      and status     = 'active'
  );
$$;

comment on function is_platform_admin is
  'Returns true if the current user is a platform_admin in any organization. '
  'Handles stub-profile users.';


create or replace function is_staff_or_above(org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from organization_members
    where organization_id = org_id
      and profile_id      = current_profile_id()
      and role            in ('teacher', 'staff', 'registrar', 'admin', 'full_admin', 'platform_admin')
      and status          = 'active'
  );
$$;

comment on function is_staff_or_above is
  'Returns true if the current user is teacher or above in the given org. '
  'Handles stub-profile users. Controls student record access.';


create or replace function has_min_org_role(org_id uuid, min_role user_role)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  role_levels user_role[] := array[
    'student_future'::user_role,
    'parent'::user_role,
    'volunteer'::user_role,
    'teacher'::user_role,
    'staff'::user_role,
    'registrar'::user_role,
    'admin'::user_role,
    'full_admin'::user_role,
    'platform_admin'::user_role
  ];
  user_role_val  user_role;
  user_level     int;
  min_level      int;
begin
  select om.role into user_role_val
  from organization_members om
  where om.organization_id = org_id
    and om.profile_id      = current_profile_id()
    and om.status          = 'active'
  limit 1;

  if user_role_val is null then
    return false;
  end if;

  user_level := array_position(role_levels, user_role_val);
  min_level  := array_position(role_levels, min_role);

  return user_level >= min_level;
end;
$$;

comment on function has_min_org_role is
  'Returns true if the user''s role in the org is at or above the minimum required role. '
  'Role hierarchy: student_future < parent < volunteer < teacher < staff '
  '< registrar < admin < full_admin < platform_admin. Handles stub-profile users.';

-- ── Also fix the inline RLS policy on authorized_pickup_persons ───────────────
-- Migration 00015 wrote inline SQL (not using helpers) for authorized_pickup_persons.
-- Update those policies to use current_profile_id() too.

drop policy if exists "staff can view pickup persons"    on authorized_pickup_persons;
drop policy if exists "staff can create pickup persons"  on authorized_pickup_persons;
drop policy if exists "staff can update pickup persons"  on authorized_pickup_persons;
drop policy if exists "admin can delete pickup persons"  on authorized_pickup_persons;

create policy "staff can view pickup persons"
  on authorized_pickup_persons for select
  using (
    exists (
      select 1 from organization_members om
      where om.organization_id = authorized_pickup_persons.organization_id
        and om.profile_id      = current_profile_id()
        and om.role in ('staff','teacher','registrar','admin','full_admin','platform_admin')
        and om.status = 'active'
    )
  );

create policy "staff can create pickup persons"
  on authorized_pickup_persons for insert
  with check (
    exists (
      select 1 from organization_members om
      where om.organization_id = authorized_pickup_persons.organization_id
        and om.profile_id      = current_profile_id()
        and om.role in ('staff','teacher','registrar','admin','full_admin','platform_admin')
        and om.status = 'active'
    )
  );

create policy "staff can update pickup persons"
  on authorized_pickup_persons for update
  using (
    exists (
      select 1 from organization_members om
      where om.organization_id = authorized_pickup_persons.organization_id
        and om.profile_id      = current_profile_id()
        and om.role in ('staff','teacher','registrar','admin','full_admin','platform_admin')
        and om.status = 'active'
    )
  );

create policy "admin can delete pickup persons"
  on authorized_pickup_persons for delete
  using (
    exists (
      select 1 from organization_members om
      where om.organization_id = authorized_pickup_persons.organization_id
        and om.profile_id      = current_profile_id()
        and om.role in ('admin','full_admin','platform_admin')
        and om.status = 'active'
    )
  );
