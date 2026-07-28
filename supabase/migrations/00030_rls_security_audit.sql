-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00030: RLS Security Audit Fixes
--
-- PROBLEM: 16+ tables used is_org_member() as their "staff" guard, which
-- includes parents, volunteers, and student_future accounts. This allowed
-- parents to read all student records and write data they have no business
-- touching.
--
-- FIX PATTERN: Replace is_org_member() with is_staff_or_above() on all
-- staff-only tables. Add scoped parent SELECT policies where the parent
-- portal legitimately reads the data (own children only).
--
-- NEW HELPER: get_guardian_student_ids() — returns IDs of students where
-- the current user has an active guardianship in the active org.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helper: get_guardian_student_ids ──────────────────────────────────────
-- Returns the set of student IDs for which the current user is an active
-- guardian within a given org. Used to scope parent-facing SELECT policies.

create or replace function get_guardian_student_ids(org_id uuid)
returns setof uuid
language sql security definer stable
as $$
  select g.student_id
  from   guardianships g
  join   students s on s.id = g.student_id
  where  g.profile_id = auth.uid()
    and  s.organization_id = org_id
    and  g.status = 'active';
$$;

-- ── 1. attendance_records ─────────────────────────────────────────────────
-- Was: is_org_member (parents could read ALL attendance + fake check-ins)
-- Fix: staff SELECT + INSERT/UPDATE; parents SELECT own children only.
-- Volunteers retain INSERT/UPDATE so check-in kiosks still work.

drop policy if exists "staff_view_attendance"   on attendance_records;
drop policy if exists "staff_insert_attendance" on attendance_records;
drop policy if exists "staff_update_attendance" on attendance_records;

create policy "staff_select_attendance"
  on attendance_records for select
  using (is_staff_or_above(organization_id));

create policy "parent_select_attendance"
  on attendance_records for select
  using (
    student_id in (select get_guardian_student_ids(organization_id))
  );

-- Volunteers (check-in kiosk) and staff can insert
create policy "staff_insert_attendance"
  on attendance_records for insert
  with check (
    organization_id in (
      select organization_id from organization_members
      where  profile_id = auth.uid()
        and  status     = 'active'
        and  role not in ('parent', 'student_future')
    )
  );

create policy "staff_update_attendance"
  on attendance_records for update
  using (
    organization_id in (
      select organization_id from organization_members
      where  profile_id = auth.uid()
        and  status     = 'active'
        and  role not in ('parent', 'student_future')
    )
  );

-- ── 2. incidents ──────────────────────────────────────────────────────────
-- Was: is_org_member (parents could read/write ALL incidents)

drop policy if exists "staff_view_incidents"   on incidents;
drop policy if exists "staff_insert_incidents" on incidents;
drop policy if exists "staff_update_incidents" on incidents;

create policy "staff_select_incidents"
  on incidents for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_incidents"
  on incidents for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_incidents"
  on incidents for update
  using (is_staff_or_above(organization_id));

-- ── 3. medication_alerts ──────────────────────────────────────────────────
-- Was: is_org_member (parents could read/write medical alert data)

drop policy if exists "staff_view_medication_alerts"   on medication_alerts;
drop policy if exists "staff_manage_medication_alerts"  on medication_alerts;
drop policy if exists "staff_update_medication_alerts"  on medication_alerts;

create policy "staff_select_medication_alerts"
  on medication_alerts for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_medication_alerts"
  on medication_alerts for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_medication_alerts"
  on medication_alerts for update
  using (is_staff_or_above(organization_id));

-- ── 4. student_documents ──────────────────────────────────────────────────
-- Was: is_org_member (parents could read ALL student documents)

drop policy if exists "staff_view_student_docs"   on student_documents;
drop policy if exists "staff_manage_student_docs"  on student_documents;
drop policy if exists "staff_update_student_docs"  on student_documents;

create policy "staff_select_student_docs"
  on student_documents for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_student_docs"
  on student_documents for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_student_docs"
  on student_documents for update
  using (is_staff_or_above(organization_id));

-- ── 5. leadership_badges ──────────────────────────────────────────────────
-- Was: is_org_member (parents could award badges)

drop policy if exists "staff_view_leadership_badges"   on leadership_badges;
drop policy if exists "staff_award_leadership_badges"   on leadership_badges;
drop policy if exists "staff_update_leadership_badges"  on leadership_badges;

create policy "staff_select_leadership_badges"
  on leadership_badges for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_leadership_badges"
  on leadership_badges for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_leadership_badges"
  on leadership_badges for update
  using (is_staff_or_above(organization_id));

-- ── 6. entrepreneurship_projects ─────────────────────────────────────────
-- Was: is_org_member (parents could create/edit projects)

drop policy if exists "staff_view_entrepreneur_projects"   on entrepreneurship_projects;
drop policy if exists "staff_manage_entrepreneur_projects"  on entrepreneurship_projects;
drop policy if exists "staff_update_entrepreneur_projects"  on entrepreneurship_projects;

create policy "staff_select_entrepreneur_projects"
  on entrepreneurship_projects for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_entrepreneur_projects"
  on entrepreneurship_projects for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_entrepreneur_projects"
  on entrepreneurship_projects for update
  using (is_staff_or_above(organization_id));

-- ── 7. student_medical ────────────────────────────────────────────────────
-- Was: is_org_member SELECT + ALL (parents could read/write doctor/insurance/conditions)
-- Note: staff_notes table in 00011 was already fixed in 00025 — leave it alone.

drop policy if exists "student_medical_select" on student_medical;
drop policy if exists "student_medical_write"  on student_medical;

create policy "staff_select_student_medical"
  on student_medical for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_student_medical"
  on student_medical for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_student_medical"
  on student_medical for update
  using (is_staff_or_above(organization_id));

-- ── 8. service_hours ─────────────────────────────────────────────────────
-- Was: is_org_member ALL (parents could log service hours for any student)

drop policy if exists "service_hours_all" on service_hours;

create policy "staff_select_service_hours"
  on service_hours for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_service_hours"
  on service_hours for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_service_hours"
  on service_hours for update
  using (is_staff_or_above(organization_id));

-- ── 9. student_drive_folders ──────────────────────────────────────────────
-- Was: is_org_member SELECT (parents could enumerate all drive folders)
-- admin_manage_drive_folders (for all) is fine — already admin-scoped.

drop policy if exists "staff_view_drive_folders" on student_drive_folders;

create policy "staff_select_drive_folders"
  on student_drive_folders for select
  using (is_staff_or_above(organization_id));

-- ── 10. work_samples ─────────────────────────────────────────────────────
-- Was: is_org_member SELECT/INSERT/UPDATE (parents could read/write work samples)
-- staff_delete_work_samples already uses is_org_admin — leave it.

drop policy if exists "staff_view_work_samples"   on work_samples;
drop policy if exists "staff_insert_work_samples"  on work_samples;
drop policy if exists "staff_update_work_samples"  on work_samples;

create policy "staff_select_work_samples"
  on work_samples for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_work_samples"
  on work_samples for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_work_samples"
  on work_samples for update
  using (is_staff_or_above(organization_id));

-- ── 11. student_goals ────────────────────────────────────────────────────
-- Was: is_org_member SELECT/INSERT/UPDATE (parents could read ALL goals + write any)
-- Fix: staff SELECT/write; parents SELECT only goals marked parent_visible for own children.

drop policy if exists "staff_view_goals"   on student_goals;
drop policy if exists "staff_insert_goals" on student_goals;
drop policy if exists "staff_update_goals" on student_goals;

create policy "staff_select_goals"
  on student_goals for select
  using (is_staff_or_above(organization_id));

create policy "parent_select_goals"
  on student_goals for select
  using (
    visibility = 'parent_visible'
    and student_id in (select get_guardian_student_ids(organization_id))
  );

create policy "staff_insert_goals"
  on student_goals for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_goals"
  on student_goals for update
  using (is_staff_or_above(organization_id));

-- ── 12. support_flags ────────────────────────────────────────────────────
-- Was: is_org_member ALL (comment even said "STAFF ONLY" — bug)

drop policy if exists "staff_all_support_flags" on support_flags;

create policy "staff_select_support_flags"
  on support_flags for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_support_flags"
  on support_flags for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_support_flags"
  on support_flags for update
  using (is_staff_or_above(organization_id));

create policy "staff_delete_support_flags"
  on support_flags for delete
  using (is_staff_or_above(organization_id));

-- ── 13. curriculum_enrollments ───────────────────────────────────────────
-- Was: is_org_member SELECT/INSERT/UPDATE

drop policy if exists "staff_view_curriculum"   on curriculum_enrollments;
drop policy if exists "staff_manage_curriculum"  on curriculum_enrollments;
drop policy if exists "staff_update_curriculum"  on curriculum_enrollments;

create policy "staff_select_curriculum"
  on curriculum_enrollments for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_curriculum"
  on curriculum_enrollments for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_curriculum"
  on curriculum_enrollments for update
  using (is_staff_or_above(organization_id));

-- ── 14. student_allergies ────────────────────────────────────────────────
-- Was: is_org_member SELECT/INSERT/UPDATE (parents could read ALL + insert fake ones)

drop policy if exists "org_member_select_allergies" on student_allergies;
drop policy if exists "org_member_insert_allergies" on student_allergies;
drop policy if exists "org_member_update_allergies" on student_allergies;

create policy "staff_select_allergies"
  on student_allergies for select
  using (is_staff_or_above(organization_id));

create policy "parent_select_allergies"
  on student_allergies for select
  using (
    student_id in (select get_guardian_student_ids(organization_id))
  );

create policy "staff_insert_allergies"
  on student_allergies for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_allergies"
  on student_allergies for update
  using (is_staff_or_above(organization_id));

-- ── 15. student_conditions ───────────────────────────────────────────────
-- Was: is_org_member SELECT/INSERT/UPDATE (parents could read/write ALL conditions)

drop policy if exists "org_member_select_conditions" on student_conditions;
drop policy if exists "org_member_insert_conditions" on student_conditions;
drop policy if exists "org_member_update_conditions" on student_conditions;

create policy "staff_select_conditions"
  on student_conditions for select
  using (is_staff_or_above(organization_id));

create policy "parent_select_conditions"
  on student_conditions for select
  using (
    student_id in (select get_guardian_student_ids(organization_id))
  );

create policy "staff_insert_conditions"
  on student_conditions for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_conditions"
  on student_conditions for update
  using (is_staff_or_above(organization_id));

-- ── 16. staff_compliance_records ─────────────────────────────────────────
-- Was: is_org_member (parents could read staff background check / training records)

drop policy if exists "compliance_records_select" on staff_compliance_records;
drop policy if exists "compliance_records_insert" on staff_compliance_records;
drop policy if exists "compliance_records_update" on staff_compliance_records;

create policy "staff_select_compliance_records"
  on staff_compliance_records for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_compliance_records"
  on staff_compliance_records for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_compliance_records"
  on staff_compliance_records for update
  using (is_staff_or_above(organization_id));

-- ── 17. staff_compliance_requirements ────────────────────────────────────
-- Was: is_org_member (parents could read org compliance requirement definitions)

drop policy if exists "compliance_req_select" on staff_compliance_requirements;
drop policy if exists "compliance_req_insert" on staff_compliance_requirements;
drop policy if exists "compliance_req_update" on staff_compliance_requirements;

create policy "staff_select_compliance_req"
  on staff_compliance_requirements for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_compliance_req"
  on staff_compliance_requirements for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_compliance_req"
  on staff_compliance_requirements for update
  using (is_staff_or_above(organization_id));

-- ── 18. academic_progress — add parent SELECT ────────────────────────────
-- The 00023 migration correctly tightened this to staff-only, but the parent
-- portal's getProgressCheckinsForParent() queries this table. Parents need a
-- scoped SELECT for their own children where parent_visible = true.

create policy "parent_select_progress"
  on academic_progress for select
  using (
    parent_visible = true
    and student_id in (select get_guardian_student_ids(organization_id))
  );
