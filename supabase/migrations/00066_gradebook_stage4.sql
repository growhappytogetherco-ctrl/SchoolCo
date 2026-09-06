-- Stage 4: Course grading settings per section + parent grade access
-- Adds grading_method + category_weights to course_sections.
-- Tightens student_assignment_grades SELECT to scope parents to their children only.
-- All other grade write policies (teacher insert/update) are unchanged.

-- ── 1. Grading settings on course_sections ───────────────────────────────────
-- grading_method: 'points' (total earned / total possible)
--                 'weighted' (category weights sum to 100)
-- category_weights: {"homework":20,"quiz":30,"test":50} — null when points-based
-- Existing sections default to 'points'; no data migration required.

alter table course_sections
  add column if not exists grading_method text not null default 'points',
  add column if not exists category_weights jsonb;

alter table course_sections
  drop constraint if exists course_sections_grading_method_check;

alter table course_sections
  add constraint course_sections_grading_method_check
    check (grading_method in ('points', 'weighted'));

-- ── 2. Fix student_assignment_grades SELECT ──────────────────────────────────
-- Previous policy used is_org_member — parents could read ALL students' grades.
-- New policy: staff-or-above see all; parents see only their guardian children.

drop policy if exists "staff_view_grades" on student_assignment_grades;

create policy "staff_view_grades"
  on student_assignment_grades for select
  using (
    is_staff_or_above(organization_id)
    or student_id in (select get_guardian_student_ids(organization_id))
  );

-- ── 3. Parent SELECT on assignments ─────────────────────────────────────────
-- Current policy is is_org_member which already allows parents to read assignments.
-- Parents legitimately need to read assignments to show the assignment list.
-- No change needed — assignments are not sensitive (no teacher_note exposure in UI).

-- ── 4. course_sections SELECT already allows is_org_member (parents included) ─
-- Parents need to read section metadata (teacher name, grading method) for their
-- children's enrolled sections. The existing "staff_view_course_sections" policy
-- uses is_org_member which covers this. No change needed.
