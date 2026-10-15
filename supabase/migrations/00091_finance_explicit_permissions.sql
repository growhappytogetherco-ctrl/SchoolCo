-- Migration 00091: Explicit Finance Permissions
--
-- SECURITY CHANGE: Remove automatic finance access for general staff roles.
--
-- BEFORE: has_finance_view_access() and has_finance_manage_access() granted
--         automatic full finance access to any user with role 'full_admin'
--         or 'platform_admin'. This meant adding a user as full_admin (for
--         operational or administrative reasons) would silently grant them
--         access to all student financial records.
--
-- AFTER:  Finance access is ALWAYS explicit:
--           can_view_finances = true  → read-only finance access
--           can_manage_finances = true → full read+write finance access
--         No role automatically grants finance access.
--         Even full_admin and platform_admin must have can_manage_finances
--         explicitly set.
--
-- AUTHORIZED USERS FOR RLA (Rising Leaders Academy):
--   Elisa Johnson   — profile_id: 7ba9a63f-c33d-4a25-b716-125e27bdf1b5
--   Jerradyn Farr   — profile_id: e5a548b4-23ea-4105-96c2-6f42dfd68550
--
-- Both are granted can_manage_finances = true.
-- All other staff members retain can_view_finances = false AND
-- can_manage_finances = false (already the case in production).
--
-- ROLLBACK:
--   Run _rollback_00091.sql — restores role-based bypass in RLS functions
--   and removes Jerradyn Farr's can_manage_finances grant.
--
-- MULTI-ORG NOTE:
--   This migration is safe for future organizations. Because no role triggers
--   automatic finance access, each org must explicitly grant can_manage_finances
--   to their authorized finance users. The per-org scoping in organization_members
--   ensures grants for one org never affect another.

-- ── Step 1: Replace RLS helper functions ─────────────────────────────────
--
-- Remove the role-based bypass. Access is now exclusively via the explicit
-- can_view_finances and can_manage_finances columns.

CREATE OR REPLACE FUNCTION has_finance_view_access(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   organization_members
    WHERE  organization_id = org_id
      AND  profile_id = auth_uid_to_profile_id()
      AND  status = 'active'
      AND (
        can_view_finances = true
        OR can_manage_finances = true
      )
  );
$$;

CREATE OR REPLACE FUNCTION has_finance_manage_access(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   organization_members
    WHERE  organization_id = org_id
      AND  profile_id = auth_uid_to_profile_id()
      AND  status = 'active'
      AND  can_manage_finances = true
  );
$$;

-- ── Step 2: Grant can_manage_finances to authorized RLA finance users ─────
--
-- Elisa Johnson (full_admin, grow.happytogetherco@gmail.com)
-- Jerradyn Farr (staff, jerradyn1@outlook.com)
--
-- Profile IDs verified from organization_members on 2026-10-15.
-- The DO block guards against the profile not existing (safe on blank staging).

DO $$
DECLARE
  rla_org uuid := '9fd43346-f43b-41d1-9b4c-fe8702471b07';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = rla_org) THEN
    RAISE NOTICE '00091: RLA org not found — skipping finance permission grants.';
    RETURN;
  END IF;

  -- Elisa Johnson
  UPDATE organization_members
  SET can_manage_finances = true,
      can_view_finances   = true
  WHERE organization_id = rla_org
    AND profile_id = '7ba9a63f-c33d-4a25-b716-125e27bdf1b5'
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE NOTICE '00091: Elisa Johnson org member row not found — skipping.';
  ELSE
    RAISE NOTICE '00091: Granted can_manage_finances to Elisa Johnson.';
  END IF;

  -- Jerradyn Farr
  UPDATE organization_members
  SET can_manage_finances = true,
      can_view_finances   = true
  WHERE organization_id = rla_org
    AND profile_id = 'e5a548b4-23ea-4105-96c2-6f42dfd68550'
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE NOTICE '00091: Jerradyn Farr org member row not found — skipping.';
  ELSE
    RAISE NOTICE '00091: Granted can_manage_finances to Jerradyn Farr.';
  END IF;

  -- Confirm all other active staff have no finance access
  RAISE NOTICE '00091: Staff without finance access: %',
    (SELECT COUNT(*) FROM organization_members
     WHERE organization_id = rla_org
       AND status = 'active'
       AND role IN ('staff','teacher','registrar','volunteer')
       AND can_view_finances = false
       AND can_manage_finances = false);
END $$;

-- ── Step 3: Verify result ─────────────────────────────────────────────────

DO $$
DECLARE
  rla_org uuid := '9fd43346-f43b-41d1-9b4c-fe8702471b07';
  finance_count INTEGER;
  elisa_ok      BOOLEAN;
  jerradyn_ok   BOOLEAN;
  leakage       INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = rla_org) THEN
    RAISE NOTICE '00091 verify: RLA org not found — skipping verification.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO finance_count
  FROM organization_members
  WHERE organization_id = rla_org
    AND status = 'active'
    AND (can_view_finances = true OR can_manage_finances = true);

  -- elisa_ok: true if she has can_manage_finances, NULL/false if row doesn't exist
  SELECT COALESCE(
    (SELECT can_manage_finances FROM organization_members
     WHERE organization_id = rla_org
       AND profile_id = '7ba9a63f-c33d-4a25-b716-125e27bdf1b5'
       AND status = 'active'),
    NULL
  ) INTO elisa_ok;

  SELECT COALESCE(
    (SELECT can_manage_finances FROM organization_members
     WHERE organization_id = rla_org
       AND profile_id = 'e5a548b4-23ea-4105-96c2-6f42dfd68550'
       AND status = 'active'),
    NULL
  ) INTO jerradyn_ok;

  -- Count users with finance access who are NOT the two authorized users
  -- (leakage guard applies regardless of whether the authorized profiles exist)
  SELECT COUNT(*) INTO leakage
  FROM organization_members
  WHERE organization_id = rla_org
    AND status = 'active'
    AND (can_view_finances = true OR can_manage_finances = true)
    AND profile_id NOT IN (
      '7ba9a63f-c33d-4a25-b716-125e27bdf1b5',
      'e5a548b4-23ea-4105-96c2-6f42dfd68550'
    );

  RAISE NOTICE '00091 verify: finance_count=%, elisa_ok=%, jerradyn_ok=%, leakage=%',
    finance_count, elisa_ok, jerradyn_ok, leakage;

  -- Leakage is always fatal: unauthorized users have finance access
  IF leakage > 0 THEN
    RAISE EXCEPTION '00091 ABORTED: % unauthorized user(s) have finance access. Check organization_members.', leakage;
  END IF;

  -- Individual user checks: only fail if the profile ROW EXISTS but was not granted.
  -- If the row is missing (staging/blank DB), skip with a warning.
  IF elisa_ok IS NULL THEN
    RAISE NOTICE '00091: Elisa Johnson org member row not present — skipping grant check (staging/blank DB).';
  ELSIF NOT elisa_ok THEN
    RAISE EXCEPTION '00091: Elisa Johnson org member row exists but can_manage_finances was NOT set.';
  END IF;

  IF jerradyn_ok IS NULL THEN
    RAISE NOTICE '00091: Jerradyn Farr org member row not present — skipping grant check (staging/blank DB).';
  ELSIF NOT jerradyn_ok THEN
    RAISE EXCEPTION '00091: Jerradyn Farr org member row exists but can_manage_finances was NOT set.';
  END IF;

  RAISE NOTICE '00091: PASS — leakage=0, authorized users granted (or not present in this environment).';
END $$;
