-- _rollback_00091.sql
-- Rollback for 00091_finance_explicit_permissions.sql
--
-- WHAT THIS REVERSES:
--   1. Restores role-based bypass in has_finance_view_access() and
--      has_finance_manage_access() (full_admin, platform_admin auto-grant).
--   2. Removes Jerradyn Farr's can_manage_finances grant.
--      (Elisa Johnson's grant is left in place — she had can_view_finances
--       and can_manage_finances set by this migration and may need them
--       if rollback is due to a staging issue, not a permission reversal.)
--
-- WHEN TO USE:
--   Only if 00091 is being rolled back on staging due to a test failure.
--   On production: do not roll back finance permissions without explicit
--   user authorization.

-- ── Step 1: Restore role-based bypass ────────────────────────────────────

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
        role IN ('full_admin', 'platform_admin')
        OR can_view_finances = true
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
      AND (
        role IN ('full_admin', 'platform_admin')
        OR can_manage_finances = true
      )
  );
$$;

-- ── Step 2: Remove Jerradyn Farr's explicit grant ─────────────────────────

DO $$
DECLARE
  rla_org uuid := '9fd43346-f43b-41d1-9b4c-fe8702471b07';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = rla_org) THEN
    RAISE NOTICE '_rollback_00091: RLA org not found — skipping.';
    RETURN;
  END IF;

  UPDATE organization_members
  SET can_manage_finances = false,
      can_view_finances   = false
  WHERE organization_id = rla_org
    AND profile_id = 'e5a548b4-23ea-4105-96c2-6f42dfd68550';

  RAISE NOTICE '_rollback_00091: Jerradyn Farr finance permissions reverted.';
END $$;

RAISE NOTICE '_rollback_00091: complete. Role-based bypass restored.';
