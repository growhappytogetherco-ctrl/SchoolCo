-- Migration 00053: Fix attendance_records RLS to use auth_uid_to_profile_id()
--
-- Problem: migration 00030 defined staff_insert_attendance and staff_update_attendance
-- using bare auth.uid() to look up organization_members.profile_id.
-- For stub guardian accounts (profiles.id ≠ auth.uid()), no org member row matches,
-- so INSERT and UPDATE are silently blocked — they appear to succeed but do nothing.
--
-- Mel St Gerard is now a dual-role staff+parent account (msmel86@gmail.com).
-- Her auth.uid() = 93fce525 but canonical profiles.id = dac173ef.
-- Without this fix she cannot save any attendance records.
--
-- Fix: replace auth.uid() with auth_uid_to_profile_id() in both policies.
-- auth_uid_to_profile_id() is a SECURITY DEFINER function (migration 00046)
-- that resolves auth.uid() → canonical profiles.id regardless of account type.

-- ── INSERT ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "staff_insert_attendance" ON attendance_records;
CREATE POLICY "staff_insert_attendance"
  ON attendance_records FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE  profile_id = auth_uid_to_profile_id()
        AND  status     = 'active'
        AND  role NOT IN ('parent', 'student_future')
    )
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "staff_update_attendance" ON attendance_records;
CREATE POLICY "staff_update_attendance"
  ON attendance_records FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE  profile_id = auth_uid_to_profile_id()
        AND  status     = 'active'
        AND  role NOT IN ('parent', 'student_future')
    )
  );
