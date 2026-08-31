-- Migration 00055: Staff QR Attendance
--
-- Adds STF- attendance QR token to staff_roster.
-- Creates staff_attendance_records — one canonical row per staff member per day.
--
-- Design decisions:
--   • Keyed on staff_roster_id, NOT profile_id or auth.uid().
--     Staff roster members may have no Supabase auth account (profile_id nullable).
--     This makes QR attendance work for ALL staff, not just those who log in.
--   • Does NOT touch attendance_records (student-only, do not mix concerns).
--   • Does NOT touch staff_profiles (compliance data, unrelated).
--   • Writes use admin client in application code (bypasses RLS for stub accounts).
--   • generate_qr_token() defined in migration 00010 is reused here.

-- ── Add QR token column to staff_roster ───────────────────────────────────

ALTER TABLE staff_roster
  ADD COLUMN IF NOT EXISTS attendance_qr_token TEXT UNIQUE;

-- Backfill all existing staff that don't yet have a token
UPDATE staff_roster
SET attendance_qr_token = generate_qr_token('STF-')
WHERE attendance_qr_token IS NULL;

-- Index for fast QR lookup (the scan hot path)
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_roster_qr_token
  ON staff_roster(attendance_qr_token)
  WHERE attendance_qr_token IS NOT NULL;

-- Auto-assign token on every new staff_roster INSERT
CREATE OR REPLACE FUNCTION assign_staff_roster_qr_token()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF new.attendance_qr_token IS NULL THEN
    new.attendance_qr_token := generate_qr_token('STF-');
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS staff_roster_assign_qr_token ON staff_roster;
CREATE TRIGGER staff_roster_assign_qr_token
  BEFORE INSERT ON staff_roster
  FOR EACH ROW EXECUTE FUNCTION assign_staff_roster_qr_token();

-- ── staff_attendance_records ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_attendance_records (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_roster_id   UUID        NOT NULL REFERENCES staff_roster(id)  ON DELETE CASCADE,
  date              DATE        NOT NULL,
  check_in_at       TIMESTAMPTZ,
  check_out_at      TIMESTAMPTZ,
  check_in_method   TEXT,    -- 'qr' | 'manual'
  check_out_method  TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One record per staff member per day — enforces Section 10 (single canonical record)
  UNIQUE (staff_roster_id, date)
);

COMMENT ON TABLE staff_attendance_records IS
  'One row per active staff member per school date. '
  'Keyed on staff_roster_id so it works for staff with no Supabase auth account. '
  'check_in_at = first scan; check_out_at = checkout scan. '
  'Powers the Staff on Duty display in Daily Operations.';

CREATE TRIGGER trg_staff_attend_updated_at
  BEFORE UPDATE ON staff_attendance_records
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_staff_attend_org_date
  ON staff_attendance_records(organization_id, date);

CREATE INDEX IF NOT EXISTS idx_staff_attend_roster_date
  ON staff_attendance_records(staff_roster_id, date);

-- Partial index for the "Staff on Duty" hot path: checked in, not yet out
CREATE INDEX IF NOT EXISTS idx_staff_attend_on_duty
  ON staff_attendance_records(organization_id, date)
  WHERE check_in_at IS NOT NULL AND check_out_at IS NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE staff_attendance_records ENABLE ROW LEVEL SECURITY;

-- Staff and above can read all records in their org
CREATE POLICY "staff_attend_select"
  ON staff_attendance_records FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE  profile_id = auth_uid_to_profile_id()
        AND  status     = 'active'
        AND  role NOT IN ('parent', 'student_future')
    )
  );

-- Writes come through admin client (bypasses RLS, handles stub accounts).
-- These policies provide defense-in-depth if admin client is ever unavailable.
CREATE POLICY "staff_attend_insert"
  ON staff_attendance_records FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE  profile_id = auth_uid_to_profile_id()
        AND  status     = 'active'
        AND  role NOT IN ('parent', 'student_future')
    )
  );

CREATE POLICY "staff_attend_update"
  ON staff_attendance_records FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE  profile_id = auth_uid_to_profile_id()
        AND  status     = 'active'
        AND  role NOT IN ('parent', 'student_future')
    )
  );
