-- ── Migration 00044 — Fix guardian stub auth ────────────────────────────────
-- After migration 00041 (profile stubs), guardian profiles have:
--   profiles.id        = a new UUID (e.g. b2e4be66-...)
--   profiles.auth_user_id = the auth.users.id after invite acceptance (e.g. 71804e35-...)
--
-- Every RLS policy and helper that checks `profile_id = auth.uid()` or
-- `id = auth.uid()` returns nothing for guardian stubs, because
-- auth.uid() = auth.users.id ≠ profiles.id for those rows.
--
-- Fix: add a SECURITY DEFINER helper that resolves the canonical profile.id
-- from auth.uid(), then rewrite all affected policies and functions.

-- ── 1. Canonical profile-ID resolver ────────────────────────────────────────
-- Returns the profiles.id for the current session's auth.uid().
-- For native users:  profiles.id = auth.uid()
-- For guardian stubs: profiles.id is the stub UUID; auth_user_id = auth.uid()
-- SECURITY DEFINER bypasses RLS so it can always read profiles.

CREATE OR REPLACE FUNCTION auth_uid_to_profile_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM profiles
  WHERE id = auth.uid() OR auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- ── 2. Fix helper functions ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = org_id
      AND profile_id      = auth_uid_to_profile_id()
      AND status          = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_staff_or_above(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = org_id
      AND profile_id      = auth_uid_to_profile_id()
      AND role            IN ('teacher', 'staff', 'registrar', 'admin', 'full_admin', 'platform_admin')
      AND status          = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_org_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = org_id
      AND profile_id      = auth_uid_to_profile_id()
      AND role            IN ('admin', 'full_admin', 'platform_admin')
      AND status          = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION get_guardian_student_ids(org_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.student_id
  FROM   guardianships g
  JOIN   students s ON s.id = g.student_id
  WHERE  g.profile_id        = auth_uid_to_profile_id()
    AND  s.organization_id   = org_id
    AND  g.status            = 'active';
$$;

-- ── 3. Fix profile policies ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;
CREATE POLICY "users_view_own_profile" ON profiles
  FOR SELECT USING (
    id = auth.uid() OR auth_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE USING (
    id = auth.uid() OR auth_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "parents_can_view_staff_profiles" ON profiles;
CREATE POLICY "parents_can_view_staff_profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM organization_members viewer_mem
      JOIN organization_members target_mem
        ON target_mem.organization_id = viewer_mem.organization_id
      WHERE viewer_mem.profile_id = auth_uid_to_profile_id()
        AND viewer_mem.role       = 'parent'
        AND viewer_mem.status     = 'active'
        AND target_mem.profile_id = profiles.id
        AND target_mem.status     = 'active'
        AND target_mem.role       = ANY(ARRAY[
              'teacher','staff','registrar','admin','full_admin'
            ]::user_role[])
    )
  );

-- ── 4. Fix organization_members policies ────────────────────────────────────

DROP POLICY IF EXISTS "users_view_own_memberships" ON organization_members;
CREATE POLICY "users_view_own_memberships" ON organization_members
  FOR SELECT USING (
    profile_id = auth_uid_to_profile_id()
  );

-- ── 5. Fix guardianships policy ─────────────────────────────────────────────

DROP POLICY IF EXISTS "guardianships_own_select" ON guardianships;
CREATE POLICY "guardianships_own_select" ON guardianships
  FOR SELECT USING (
    profile_id  = auth_uid_to_profile_id()
    AND status  = 'active'
    AND archived_at IS NULL
  );
