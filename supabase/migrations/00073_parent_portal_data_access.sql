-- 00073_parent_portal_data_access.sql
--
-- Adds two missing guardian SELECT policies that prevent the Parent Portal
-- from reading data it needs to display:
--
-- 1. school_years — RLS used has_finance_view_access() (staff-only), so
--    getMyChildrenFinance() got an empty year list and returned [] immediately.
--    Fix: any org member can read school year metadata (labels, dates — not PII).
--
-- 2. curriculum_enrollments — migration 00030 tightened SELECT to
--    is_staff_or_above(), so getStudentGradeProfile() got no enrollments
--    and returned "No active courses for this quarter."
--    Fix: guardians can SELECT rows for their own children only, using the
--    existing get_guardian_student_ids() helper.

-- ── 1. school_years ──────────────────────────────────────────────────────────

drop policy if exists "member_view_school_years" on school_years;

create policy "member_view_school_years"
  on school_years for select
  using (is_org_member(organization_id));

-- ── 2. curriculum_enrollments ────────────────────────────────────────────────

drop policy if exists "guardian_view_own_children_curriculum" on curriculum_enrollments;

create policy "guardian_view_own_children_curriculum"
  on curriculum_enrollments for select
  using (
    is_guardian_of_student(organization_id, student_id)
  );
