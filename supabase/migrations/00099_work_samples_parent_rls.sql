-- Migration: 00099_work_samples_parent_rls.sql
-- Restrict work_samples SELECT to staff + guardians of the specific student.
-- Previously the only policy (staff_view_work_samples) used is_org_member(),
-- which includes parents, volunteers, and future students — too broad.

-- Drop existing broad policy
drop policy if exists "staff_view_work_samples" on work_samples;

-- Staff can view all work samples for their org
create policy "staff_view_work_samples"
  on work_samples for select
  using (is_staff_or_above(organization_id));

-- Parents can view work samples marked visible_to_parent for their guardian students only
create policy "parent_view_work_samples"
  on work_samples for select
  using (
    visible_to_parent = true
    and student_id in (select get_guardian_student_ids(organization_id))
  );
