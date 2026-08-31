-- Migration 00057: Fix RLS helper functions to use auth_uid_to_profile_id()
--
-- Problem: is_org_member(), is_staff_or_above(), is_org_admin(),
-- is_full_admin_or_above(), and has_min_org_role() all compare
-- organization_members.profile_id = auth.uid() directly.
--
-- For stub guardian accounts where auth.uid() ≠ profiles.id (e.g. Mel),
-- these functions return FALSE even when the user is an active member.
-- This silently blocks:
--   - SELECT on attendance_records (via staff_select_attendance policy)
--   - Any other table that uses these functions in its RLS policy
--
-- The INSERT/UPDATE RLS on attendance_records was already fixed in migration 00053
-- to use auth_uid_to_profile_id() directly in those policies. This migration fixes
-- the shared helper functions so all other affected policies also work correctly
-- for stub accounts.
--
-- auth_uid_to_profile_id() is a SECURITY DEFINER function defined in migration 00046.
-- It resolves auth.uid() → canonical profiles.id regardless of account type.
-- For native accounts: returns auth.uid() (no change).
-- For stub accounts (auth_user_id set): returns the stub profiles.id.

-- ── is_org_member(org_id) ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   organization_members
    WHERE  organization_id = org_id
      AND  profile_id      = auth_uid_to_profile_id()
      AND  status          = 'active'
  );
$$;

-- ── is_staff_or_above(org_id) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_staff_or_above(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   organization_members
    WHERE  organization_id = org_id
      AND  profile_id      = auth_uid_to_profile_id()
      AND  role            IN ('teacher', 'staff', 'registrar', 'admin', 'full_admin', 'platform_admin')
      AND  status          = 'active'
  );
$$;

-- ── is_org_admin(org_id) ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_org_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   organization_members
    WHERE  organization_id = org_id
      AND  profile_id      = auth_uid_to_profile_id()
      AND  role            IN ('admin', 'full_admin', 'platform_admin')
      AND  status          = 'active'
  );
$$;

-- ── is_full_admin_or_above(org_id) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_full_admin_or_above(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   organization_members
    WHERE  organization_id = org_id
      AND  profile_id      = auth_uid_to_profile_id()
      AND  role            IN ('full_admin', 'platform_admin')
      AND  status          = 'active'
  );
$$;

-- ── has_min_org_role(org_id, min_role) ────────────────────────────────────

CREATE OR REPLACE FUNCTION has_min_org_role(org_id uuid, min_role user_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  role_levels user_role[] := ARRAY[
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
BEGIN
  SELECT role INTO user_role_val
  FROM   organization_members
  WHERE  organization_id = org_id
    AND  profile_id      = auth_uid_to_profile_id()
    AND  status          = 'active'
  LIMIT 1;

  IF user_role_val IS NULL THEN
    RETURN false;
  END IF;

  SELECT array_position(role_levels, user_role_val) INTO user_level;
  SELECT array_position(role_levels, min_role)      INTO min_level;

  RETURN COALESCE(user_level >= min_level, false);
END;
$$;
