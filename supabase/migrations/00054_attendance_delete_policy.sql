-- Migration 00054: Add DELETE RLS policy for attendance_records
--
-- Root cause of broken Reset: no DELETE policy existed on attendance_records.
-- With RLS enabled and no DELETE policy, Supabase filters all rows via RLS,
-- resulting in 0 rows deleted and no error — silent no-op.
--
-- Only full_admin and above can permanently delete attendance records.
-- Staff/teachers can still INSERT and UPDATE (daily operations unchanged).
-- The server action also enforces full_admin via role check before calling
-- the admin client, so this policy is belt-and-suspenders defense-in-depth.

DROP POLICY IF EXISTS "admin_delete_attendance" ON attendance_records;
CREATE POLICY "admin_delete_attendance"
  ON attendance_records FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE  profile_id = auth_uid_to_profile_id()
        AND  status     = 'active'
        AND  role IN ('full_admin', 'platform_admin')
    )
  );
