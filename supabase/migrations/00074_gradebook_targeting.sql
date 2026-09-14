-- Migration 00074: Gradebook — Assignment Targeting + Staff Permission Fix
--
-- PART A: Fix assignment / grade RLS to allow all staff (not just admins + section teacher)
--   Root cause: teacher_manage_assignments required is_org_admin OR cs.teacher_id match.
--   All course_sections have teacher_id = NULL → only Elisa (full_admin) could write.
--   Fix: any is_staff_or_above user can manage assignments and grades in their org.
--   Rationale: course_sections INSERT/UPDATE already uses is_staff_or_above — consistent.
--   Hard delete (destructive) stays admin-only on both tables.
--
-- PART B: assignment_student_targets — assignment targeting per student
--   Adds target_mode to assignments ('all' | 'selected') and a join table
--   that records exactly which students an assignment targets.
--   On creation:
--     target_mode='all'      → caller snapshots current roster into targets
--     target_mode='selected' → caller inserts only chosen student rows
--   Gradebook:
--     assigned     = student_id in assignment_student_targets for this assignment
--     not_assigned = student_id NOT in targets → show N/A, exclude from grade calc
--     not_graded   = assigned but no grade row yet → excluded from calc by calculator
--     missing      = assigned, grade_status='missing' → 0/possible (counts against)
--   Grade calculation: unchanged — calculator already excludes not_graded from totals.
--   New: gradebook data query must filter inputs to only assigned assignments per student.
--
-- BACKFILL: existing assignments have no target rows → treat as target_mode='all' and
--   snapshot all currently enrolled students into assignment_student_targets.
--   This is safe: if a student had no grade row they were already excluded (not_graded).
--   The snapshot makes the "assigned to all" contract explicit and queryable.

-- ── PART A: Fix assignment RLS ───────────────────────────────────────────────

-- assignments: allow any staff to create/update (not just admin or teacher of section)
drop policy if exists "teacher_manage_assignments" on assignments;
drop policy if exists "teacher_update_assignments" on assignments;

create policy "staff_manage_assignments"
  on assignments for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_assignments"
  on assignments for update
  using (is_staff_or_above(organization_id));

-- student_assignment_grades: same — any staff can enter/update grades
drop policy if exists "teacher_manage_student_grades" on student_assignment_grades;
drop policy if exists "teacher_update_student_grades" on student_assignment_grades;

create policy "staff_manage_student_grades"
  on student_assignment_grades for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_student_grades"
  on student_assignment_grades for update
  using (is_staff_or_above(organization_id));

-- ── PART B: target_mode on assignments ──────────────────────────────────────

alter table assignments
  add column if not exists target_mode text not null default 'all'
    check (target_mode in ('all', 'selected'));

-- ── PART B: assignment_student_targets ──────────────────────────────────────
-- One row per (assignment, student) the assignment applies to.
-- organization_id is denormalized for RLS efficiency (avoids a join to assignments).

create table if not exists assignment_student_targets (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references organizations(id) on delete cascade,
  assignment_id   uuid        not null references assignments(id)   on delete cascade,
  student_id      uuid        not null references students(id)      on delete cascade,
  created_at      timestamptz not null default now(),

  constraint ast_unique unique (assignment_id, student_id)
);

create index if not exists idx_ast_assignment
  on assignment_student_targets(assignment_id);

create index if not exists idx_ast_student_org
  on assignment_student_targets(student_id, organization_id);

create index if not exists idx_ast_org
  on assignment_student_targets(organization_id);

alter table assignment_student_targets enable row level security;

-- Staff: full CRUD
drop policy if exists "staff_manage_targets"   on assignment_student_targets;
drop policy if exists "staff_view_targets"     on assignment_student_targets;

create policy "staff_view_targets"
  on assignment_student_targets for select
  using (is_staff_or_above(organization_id));

create policy "staff_manage_targets"
  on assignment_student_targets for all
  using  (is_staff_or_above(organization_id))
  with check (is_staff_or_above(organization_id));

-- Parents: read targets only for their authorized children
drop policy if exists "parent_view_targets" on assignment_student_targets;

create policy "parent_view_targets"
  on assignment_student_targets for select
  using (
    student_id in (select get_guardian_student_ids(organization_id))
  );

-- ── PART B: Backfill existing assignments ───────────────────────────────────
-- For every active assignment that currently has no target rows,
-- snapshot all students currently enrolled in that assignment's course section.
-- This makes existing whole-course assignments explicit.

DO $$
DECLARE
  asgn RECORD;
  enrolled RECORD;
  insert_count int := 0;
BEGIN
  FOR asgn IN
    SELECT a.id AS assignment_id,
           a.organization_id,
           a.course_section_id
    FROM   assignments a
    WHERE  a.status = 'active'
      AND  NOT EXISTS (
             SELECT 1 FROM assignment_student_targets ast
             WHERE  ast.assignment_id = a.id
           )
  LOOP
    -- Set target_mode='all' for these legacy assignments
    UPDATE assignments SET target_mode = 'all' WHERE id = asgn.assignment_id;

    -- Insert one target row per enrolled student
    FOR enrolled IN
      SELECT ce.student_id
      FROM   curriculum_enrollments ce
      WHERE  ce.course_section_id = asgn.course_section_id
        AND  ce.status = 'active'
    LOOP
      INSERT INTO assignment_student_targets
        (organization_id, assignment_id, student_id)
      VALUES
        (asgn.organization_id, asgn.assignment_id, enrolled.student_id)
      ON CONFLICT (assignment_id, student_id) DO NOTHING;

      insert_count := insert_count + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Backfilled % assignment_student_targets rows for existing assignments.', insert_count;
END $$;

-- ── Helper: get_assignment_targets(assignment_id) ────────────────────────────
-- Returns the student IDs targeted by a given assignment.
-- Used by the gradebook data query to determine "assigned vs not assigned".

create or replace function get_assignment_targets(p_assignment_id uuid)
returns table (student_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select student_id
  from   assignment_student_targets
  where  assignment_id = p_assignment_id;
$$;
