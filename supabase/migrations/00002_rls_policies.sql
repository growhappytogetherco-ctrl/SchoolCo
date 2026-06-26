-- ============================================================
-- SchoolCo — Row Level Security Policies
-- Migration: 00002_rls_policies
-- Run AFTER 00001_initial_schema.sql
-- ============================================================
-- SECURITY MODEL: DEFAULT DENY.
-- Every table has RLS enabled.
-- No data is accessible unless an explicit policy grants it.
-- All policies use the helper functions defined below.
-- Frontend hiding is NOT a security control — RLS is.
-- ============================================================

-- ── Enable RLS on all tables ──────────────────────────────────────────────

alter table organizations        enable row level security;
alter table profiles             enable row level security;
alter table organization_members enable row level security;
alter table audit_logs           enable row level security;

-- ============================================================
-- SECTION 1: HELPER FUNCTIONS
-- These are used inside every RLS policy below.
-- Using functions keeps policies readable and maintainable.
-- All functions are SECURITY DEFINER + STABLE for performance.
-- ============================================================

-- ── is_org_member(org_id) ─────────────────────────────────────────────────
-- Returns true if the current user is an active member of the given org.

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
      and profile_id      = auth.uid()
      and status          = 'active'
  );
$$;

comment on function is_org_member is
  'Returns true if the current user is an active member of the given organization. '
  'Used in RLS policies.';

-- ── has_org_role(org_id, role) ────────────────────────────────────────────
-- Returns true if the current user has exactly the given role in the given org.

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
      and profile_id      = auth.uid()
      and role            = required_role
      and status          = 'active'
  );
$$;

comment on function has_org_role is
  'Returns true if the current user has exactly the specified role in the given org.';

-- ── is_org_admin(org_id) ──────────────────────────────────────────────────
-- Returns true if the user is admin, full_admin, or platform_admin in the org.

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
      and profile_id      = auth.uid()
      and role            in ('admin', 'full_admin', 'platform_admin')
      and status          = 'active'
  );
$$;

comment on function is_org_admin is
  'Returns true if the current user is admin, full_admin, or platform_admin in the given org.';

-- ── is_full_admin_or_above(org_id) ────────────────────────────────────────
-- Returns true if the user is full_admin or platform_admin in the org.
-- Used for audit logs and sensitive data access.

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
      and profile_id      = auth.uid()
      and role            in ('full_admin', 'platform_admin')
      and status          = 'active'
  );
$$;

comment on function is_full_admin_or_above is
  'Returns true if the current user is full_admin or platform_admin in the given org. '
  'Required for audit log access and compliance record viewing.';

-- ── is_platform_admin() ───────────────────────────────────────────────────
-- Returns true if the user is a platform_admin in ANY organization.
-- Platform admins can manage organizations across the platform.

create or replace function is_platform_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from organization_members
    where profile_id = auth.uid()
      and role       = 'platform_admin'
      and status     = 'active'
  );
$$;

comment on function is_platform_admin is
  'Returns true if the current user is a platform_admin in any organization. '
  'Platform admins can manage multiple organizations.';

-- ── is_staff_or_above(org_id) ─────────────────────────────────────────────
-- Returns true if user is teacher, staff, registrar, admin, full_admin, or platform_admin.
-- Used to grant access to student records and internal org data.

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
      and profile_id      = auth.uid()
      and role            in ('teacher', 'staff', 'registrar', 'admin', 'full_admin', 'platform_admin')
      and status          = 'active'
  );
$$;

comment on function is_staff_or_above is
  'Returns true if the current user is teacher, staff, registrar, admin, full_admin, '
  'or platform_admin in the given org. Controls student record access.';

-- ── has_min_org_role(org_id, min_role) ────────────────────────────────────
-- Returns true if the user's role rank is >= the minimum required role rank.
-- Role hierarchy (lowest to highest):
-- student_future → parent → volunteer → teacher → staff → registrar → admin → full_admin → platform_admin

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
    and om.profile_id      = auth.uid()
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
  '< registrar < admin < full_admin < platform_admin.';

-- ============================================================
-- SECTION 2: RLS POLICIES
-- ============================================================

-- ── Organizations ─────────────────────────────────────────────────────────

-- Any active member of an org can view that org's record.
create policy "org_members_can_view_their_org"
  on organizations for select
  using ( is_org_member(id) );

-- Only full_admin or platform_admin can update org settings.
create policy "full_admin_can_update_org"
  on organizations for update
  using  ( is_full_admin_or_above(id) )
  with check ( is_full_admin_or_above(id) );

-- Only platform_admin can insert new organizations.
-- (In practice this is done via the service role; this is a safety net.)
create policy "platform_admin_can_insert_org"
  on organizations for insert
  with check ( is_platform_admin() );

-- No one can delete organizations via RLS.
-- Deactivate using is_active = false instead.
-- (No DELETE policy = delete is denied for everyone.)

-- ── Profiles ──────────────────────────────────────────────────────────────

-- Users always see their own profile.
create policy "users_view_own_profile"
  on profiles for select
  using ( id = auth.uid() );

-- Users can update their own profile.
create policy "users_update_own_profile"
  on profiles for update
  using     ( id = auth.uid() )
  with check ( id = auth.uid() );

-- Staff and above can view profiles of other members in a shared org.
-- This allows teachers to look up parent contact info, etc.
create policy "staff_can_view_org_member_profiles"
  on profiles for select
  using (
    exists (
      -- Viewer must be staff+ in an org where the target profile is also a member
      select 1
      from organization_members viewer_mem
      join organization_members target_mem
        on target_mem.organization_id = viewer_mem.organization_id
      where viewer_mem.profile_id = auth.uid()
        and viewer_mem.status     = 'active'
        and is_staff_or_above(viewer_mem.organization_id)
        and target_mem.profile_id = profiles.id
        and target_mem.status     = 'active'
    )
  );

-- Parents can view staff/teacher profiles in their org (to see their child's teachers).
-- Parents CANNOT view other parent profiles or student profiles via this policy.
create policy "parents_can_view_staff_profiles"
  on profiles for select
  using (
    exists (
      select 1
      from organization_members viewer_mem
      join organization_members target_mem
        on target_mem.organization_id = viewer_mem.organization_id
      where viewer_mem.profile_id = auth.uid()
        and viewer_mem.role        = 'parent'
        and viewer_mem.status      = 'active'
        and target_mem.profile_id  = profiles.id
        and target_mem.status      = 'active'
        and target_mem.role        in ('teacher', 'staff', 'registrar', 'admin', 'full_admin')
    )
  );

-- Platform admin can view any profile.
create policy "platform_admin_can_view_all_profiles"
  on profiles for select
  using ( is_platform_admin() );

-- ── Organization Members ──────────────────────────────────────────────────

-- Users can always see their own membership records (needed for org switcher).
create policy "users_view_own_memberships"
  on organization_members for select
  using ( profile_id = auth.uid() );

-- Any active org member can view other membership records in their org.
-- (Role information is not sensitive — knowing who is in the org is expected.)
create policy "org_members_view_memberships_in_their_org"
  on organization_members for select
  using ( is_org_member(organization_id) );

-- Only admins and above can create new memberships in their org.
create policy "admins_can_create_memberships"
  on organization_members for insert
  with check ( is_org_admin(organization_id) );

-- Only admins and above can update memberships (change roles, suspend members, etc.).
create policy "admins_can_update_memberships"
  on organization_members for update
  using     ( is_org_admin(organization_id) )
  with check ( is_org_admin(organization_id) );

-- No one can delete membership records.
-- Set status = 'inactive' or 'suspended' instead (preserves history).
-- (No DELETE policy = delete is denied for everyone.)

-- ── Audit Logs ────────────────────────────────────────────────────────────

-- Only full_admin and platform_admin can view audit logs.
-- Staff, teachers, and parents CANNOT view audit logs.
create policy "full_admin_can_view_audit_logs"
  on audit_logs for select
  using ( is_full_admin_or_above(organization_id) );

-- Platform admin can view all audit logs across all organizations.
create policy "platform_admin_can_view_all_audit_logs"
  on audit_logs for select
  using ( is_platform_admin() );

-- Any authenticated user can INSERT audit logs (the app controls what is logged).
-- actor_id must match the authenticated user to prevent impersonation.
create policy "authenticated_can_insert_audit_logs"
  on audit_logs for insert
  with check ( actor_id = auth.uid() );

-- EXPLICIT SECURITY: No UPDATE policy → updates are denied for everyone.
-- EXPLICIT SECURITY: No DELETE policy → deletes are denied for everyone.
-- Audit logs are append-only. This is a compliance requirement.

-- ============================================================
-- SECTION 3: VERIFICATION QUERIES
-- Run these after applying to confirm RLS is active.
-- ============================================================

-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public'
-- order by tablename;
--
-- Expected result:
-- audit_logs            | true
-- organization_members  | true
-- organizations         | true
-- profiles              | true
