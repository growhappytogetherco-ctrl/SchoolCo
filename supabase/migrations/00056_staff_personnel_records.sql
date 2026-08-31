-- Migration 00056: Staff Personnel Records
--
-- Creates staff_personnel_records — an internal administrative table for
-- documenting employment-related interactions: coaching, warnings, commendations, etc.
--
-- SECURITY:
--   Only full_admin and platform_admin may read or write these records.
--   This is intentional — ordinary staff (teacher, staff, registrar, admin)
--   do NOT have access. A future migration can add a manage_staff_records
--   permission column to organization_members to grant narrower access.
--
-- These records are NOT mixed with student incident reports (staff_notes table).
-- auth_uid_to_profile_id() is used throughout — required for stub accounts.

CREATE TABLE IF NOT EXISTS staff_personnel_records (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_roster_id     UUID        NOT NULL REFERENCES staff_roster(id) ON DELETE CASCADE,

  -- Record classification
  record_type         TEXT        NOT NULL,  -- see VALID_TYPES check below
  title               TEXT        NOT NULL,
  notes               TEXT        NOT NULL,
  date                DATE        NOT NULL,

  -- Optional fields
  related_policy      TEXT,
  action_taken        TEXT,
  private_admin_notes TEXT,       -- extra-restricted; only surfaced to full_admin

  -- Follow-up
  follow_up_required  BOOLEAN     NOT NULL DEFAULT false,
  follow_up_date      DATE,
  follow_up_status    TEXT        NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed'

  -- Record lifecycle
  status              TEXT        NOT NULL DEFAULT 'open',  -- 'open' | 'resolved' | 'no_further_action'
  archived_at         TIMESTAMPTZ,

  -- Authorship
  created_by          UUID        NOT NULL REFERENCES profiles(id),
  updated_by          UUID        REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_record_type CHECK (record_type IN (
    'documented_conversation',
    'coaching',
    'verbal_warning',
    'written_warning',
    'policy_violation',
    'performance_concern',
    'corrective_action',
    'commendation',
    'other'
  )),
  CONSTRAINT valid_status CHECK (status IN ('open', 'resolved', 'no_further_action')),
  CONSTRAINT valid_follow_up_status CHECK (follow_up_status IN ('pending', 'completed'))
);

COMMENT ON TABLE staff_personnel_records IS
  'Internal administrative personnel documentation. '
  'Access restricted to full_admin and platform_admin. '
  'NOT mixed with student incident reports.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_staff_pr_org_roster
  ON staff_personnel_records(organization_id, staff_roster_id);

CREATE INDEX IF NOT EXISTS idx_staff_pr_follow_up
  ON staff_personnel_records(organization_id, follow_up_date)
  WHERE follow_up_required = true
    AND follow_up_status = 'pending'
    AND archived_at IS NULL;

-- Auto-update updated_at
CREATE TRIGGER trg_staff_pr_updated_at
  BEFORE UPDATE ON staff_personnel_records
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE staff_personnel_records ENABLE ROW LEVEL SECURITY;

-- Only full_admin and platform_admin in the org may SELECT
CREATE POLICY "staff_pr_select"
  ON staff_personnel_records FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE  profile_id = auth_uid_to_profile_id()
        AND  status     = 'active'
        AND  role IN ('full_admin', 'platform_admin')
    )
  );

-- Only full_admin and platform_admin may INSERT
CREATE POLICY "staff_pr_insert"
  ON staff_personnel_records FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE  profile_id = auth_uid_to_profile_id()
        AND  status     = 'active'
        AND  role IN ('full_admin', 'platform_admin')
    )
  );

-- Only full_admin and platform_admin may UPDATE
CREATE POLICY "staff_pr_update"
  ON staff_personnel_records FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE  profile_id = auth_uid_to_profile_id()
        AND  status     = 'active'
        AND  role IN ('full_admin', 'platform_admin')
    )
  );

-- Hard delete is blocked — only archive (set archived_at).
-- No DELETE policy is defined, so all deletes are denied.
