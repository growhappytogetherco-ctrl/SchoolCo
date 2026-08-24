-- ── Migration 00045 — Fix all remaining guardian-stub auth.uid() references ─
-- Migration 00044 fixed is_org_member, is_staff_or_above, is_org_admin,
-- get_guardian_student_ids, and several RLS policies.
--
-- MISSED: is_guardian_of() and many other helper functions still use
-- profile_id = auth.uid() directly. This breaks guardian stubs where
-- profiles.id (b2e4be66) ≠ auth.uid() (71804e35).
--
-- ROOT CAUSE OF "No children linked yet":
--   students_guardian_select policy calls is_guardian_of(id).
--   is_guardian_of uses: WHERE g.profile_id = auth.uid()
--   For Kenny: profile_id=b2e4be66 ≠ auth.uid()=71804e35 → no match → returns false.
--   The guardianships JOIN on students returns null for every row.
--   Portal filter strips all null-student rows → 0 children rendered.
--
-- Fix: replace auth.uid() with auth_uid_to_profile_id() in every affected function.

-- ── is_guardian_of ───────────────────────────────────────────────────────────
-- Used by students_guardian_select RLS policy — the critical one.

CREATE OR REPLACE FUNCTION is_guardian_of(student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM guardianships g
    WHERE g.student_id  = is_guardian_of.student_id
      AND g.profile_id  = auth_uid_to_profile_id()
      AND g.status      = 'active'
      AND g.archived_at IS NULL
  );
END;
$$;

-- ── can_view_student ─────────────────────────────────────────────────────────
-- Checks split-household visibility_json fields for a parent.

CREATE OR REPLACE FUNCTION can_view_student(student_id uuid, field text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visible boolean;
BEGIN
  SELECT (visibility_json ->> field)::boolean
  INTO v_visible
  FROM guardianships
  WHERE guardianships.student_id  = can_view_student.student_id
    AND guardianships.profile_id  = auth_uid_to_profile_id()
    AND guardianships.status      = 'active'
    AND guardianships.archived_at IS NULL
  LIMIT 1;

  RETURN coalesce(v_visible, false);
END;
$$;

-- ── get_guardian_family_ids ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_guardian_family_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT s.family_id
  FROM   guardianships g
  JOIN   students s ON s.id = g.student_id
  WHERE  g.profile_id   = auth_uid_to_profile_id()
    AND  g.status        = 'active'
    AND  g.archived_at   IS NULL
    AND  s.family_id     IS NOT NULL;
END;
$$;

-- ── get_guardian_household_ids ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_guardian_household_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT g.household_id
  FROM   guardianships g
  WHERE  g.profile_id   = auth_uid_to_profile_id()
    AND  g.status        = 'active'
    AND  g.archived_at   IS NULL
    AND  g.household_id  IS NOT NULL;
END;
$$;

-- ── get_my_family_ids ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_family_ids(org_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT s.family_id
  FROM   guardianships g
  JOIN   students s ON s.id = g.student_id
  WHERE  g.profile_id       = auth_uid_to_profile_id()
    AND  g.status            = 'active'
    AND  s.organization_id   = org_id
    AND  s.family_id         IS NOT NULL;
$$;

-- ── is_conversation_participant ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_conversation_participant(conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   conversation_participants cp
    WHERE  cp.conversation_id = conv_id
      AND  cp.profile_id      = auth_uid_to_profile_id()
  );
$$;

-- ── has_min_org_role ─────────────────────────────────────────────────────────
-- Used in guardianship update/insert policies. Staff users have native profiles
-- (id = auth.uid()) so this already works for them — but fix for completeness.

CREATE OR REPLACE FUNCTION has_min_org_role(org_id uuid, min_role user_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_levels user_role[] := ARRAY[
    'student_future'::user_role, 'parent'::user_role, 'volunteer'::user_role,
    'teacher'::user_role, 'staff'::user_role, 'registrar'::user_role,
    'admin'::user_role, 'full_admin'::user_role, 'platform_admin'::user_role
  ];
  user_role_val  user_role;
  user_level     int;
  min_level      int;
BEGIN
  SELECT om.role INTO user_role_val
  FROM organization_members om
  WHERE om.organization_id = org_id
    AND om.profile_id      = auth_uid_to_profile_id()
    AND om.status          = 'active'
  LIMIT 1;

  IF user_role_val IS NULL THEN RETURN false; END IF;

  user_level := array_position(role_levels, user_role_val);
  min_level  := array_position(role_levels, min_role);

  RETURN user_level >= min_level;
END;
$$;

-- ── has_org_role ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION has_org_role(org_id uuid, required_role user_role)
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
      AND role            = required_role
      AND status          = 'active'
  );
$$;

-- ── is_full_admin_or_above ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_full_admin_or_above(org_id uuid)
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
      AND role            IN ('full_admin', 'platform_admin')
      AND status          = 'active'
  );
$$;

-- ── is_platform_admin ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE profile_id = auth_uid_to_profile_id()
      AND role       = 'platform_admin'
      AND status     = 'active'
  );
$$;

-- ── is_staff_in_org ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_staff_in_org(p_organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM organization_members
    WHERE profile_id      = auth_uid_to_profile_id()
      AND organization_id = p_organization_id
      AND status          = 'active'
      AND role            IN ('teacher','staff','registrar','admin','full_admin','platform_admin')
  );
END;
$$;

-- ── Kenny Johnson — add staff role ───────────────────────────────────────────
-- Kenny must have staff + parent access.
-- Current state: role = 'parent', roles = ['parent']
-- Target state:  role = 'staff',  roles = ['staff', 'parent']
-- This gives him the /select-view picker (staff dashboard + parent portal).

UPDATE organization_members
SET
  role       = 'staff',
  roles      = ARRAY['staff', 'parent']::user_role[],
  updated_at = now()
WHERE profile_id      = 'b2e4be66-152c-4875-acd5-16173a442840'
  AND organization_id = '9fd43346-f43b-41d1-9b4c-fe8702471b07';
