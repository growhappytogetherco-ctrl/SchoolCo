-- ── Stage: Staff Portal Invitations ────────────────────────────────────────
-- Creates staff_invitations table for tracking portal invite state.
-- staff_roster.profile_id already exists (nullable) — no new column needed.
-- Roles are stored server-side; callback reads them from DB, not user input.

CREATE TABLE IF NOT EXISTS staff_invitations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_roster_id   uuid        REFERENCES staff_roster(id) ON DELETE SET NULL,
  email             text        NOT NULL,
  invited_by        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  invited_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at       timestamptz,
  revoked_at        timestamptz,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','accepted','revoked','expired')),
  intended_roles    text[]      NOT NULL DEFAULT '{}',
  auth_user_id      uuid,   -- filled when accepted (references auth.users)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Only one pending invite per staff roster member per org
CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_pending_roster_unique
  ON staff_invitations (organization_id, staff_roster_id)
  WHERE status = 'pending' AND staff_roster_id IS NOT NULL;

-- Only one pending invite per email per org (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_pending_email_unique
  ON staff_invitations (organization_id, lower(email))
  WHERE status = 'pending';

-- Index for callback lookup by email
CREATE INDEX IF NOT EXISTS staff_invitations_email_idx
  ON staff_invitations (lower(email), organization_id, status);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can fully manage invitations within their org
DROP POLICY IF EXISTS "admin_manage_invitations" ON staff_invitations;
CREATE POLICY "admin_manage_invitations" ON staff_invitations
  FOR ALL
  USING  (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- Staff can see invitations for their org (for status display)
DROP POLICY IF EXISTS "staff_view_invitations" ON staff_invitations;
CREATE POLICY "staff_view_invitations" ON staff_invitations
  FOR SELECT
  USING (is_staff_or_above(organization_id));

-- ── Updated-at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_invitations_updated_at ON staff_invitations;
CREATE TRIGGER staff_invitations_updated_at
  BEFORE UPDATE ON staff_invitations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
