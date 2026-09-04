-- Migration 00062: Gradebook Stage 2 — Assignments + Student Grade Records
--
-- Creates:
--   assignments                 — one row per assignment per course section
--   student_assignment_grades   — one row per student per assignment
--   resolve_assignment_period() — DB function: date → quarter lookup
--
-- Grade status semantics (enforced here; calculation engine enforces rules):
--   graded      → points_earned is used in numerator AND denominator
--   missing     → 0 points earned against full points_possible (configurable later)
--   excused     → excluded from BOTH earned and possible (does not affect percentage)
--   absent      → excluded from calculation until teacher resolves
--   incomplete  → excluded from calculation until resolved
--   not_graded  → excluded from calculation permanently
--
-- Points-based calculation (from TypeScript engine, not SQL):
--   earned / possible × 100 — never average percentages
--   Semester: aggregate raw points from child quarters, do not average quarter %s
--
-- Soft-delete: assignments use status='archived' — never physically deleted if grades exist.

-- ── 1. assignments ───────────────────────────────────────────────────────────

create table if not exists assignments (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null references organizations(id)    on delete cascade,
  course_section_id uuid          not null references course_sections(id)  on delete cascade,
  grading_period_id uuid          not null references grading_periods(id),

  -- Identity
  title             text          not null,
  description       text,

  -- Category (check constraint follows SchoolCo convention; extend via migration)
  category          text          not null default 'homework'
    check (category in (
      'homework','classwork','project','quiz','test','participation','lab','other'
    )),

  -- Dates
  assigned_date     date,
  due_date          date,

  -- Scoring
  points_possible   numeric(8,2)  not null check (points_possible > 0),
  is_graded         boolean       not null default true,

  -- Soft-delete via status (prefer archive over delete when grades exist)
  status            text          not null default 'active'
    check (status in ('active','archived')),

  -- Audit
  created_by        uuid          references profiles(id),
  created_at        timestamptz   not null default now(),
  updated_by        uuid          references profiles(id),
  updated_at        timestamptz   not null default now()
);

create index if not exists idx_assignments_section_period
  on assignments(course_section_id, grading_period_id)
  where status = 'active';

create index if not exists idx_assignments_org
  on assignments(organization_id);

create index if not exists idx_assignments_period
  on assignments(grading_period_id);

create trigger assignments_updated_at
  before update on assignments
  for each row execute function update_updated_at_column();

alter table assignments enable row level security;

drop policy if exists "staff_view_assignments"    on assignments;
drop policy if exists "teacher_manage_assignments" on assignments;
drop policy if exists "teacher_update_assignments" on assignments;
drop policy if exists "admin_delete_assignments"   on assignments;

-- All staff can view assignments in their org
create policy "staff_view_assignments"
  on assignments for select
  using (is_org_member(organization_id));

-- Staff-or-above can create; teacher must own the section, or be admin
create policy "teacher_manage_assignments"
  on assignments for insert
  with check (
    is_staff_or_above(organization_id)
    and (
      is_org_admin(organization_id)
      or exists (
        select 1 from course_sections cs
        where cs.id = course_section_id
          and cs.teacher_id = auth.uid()
      )
    )
  );

create policy "teacher_update_assignments"
  on assignments for update
  using (
    is_staff_or_above(organization_id)
    and (
      is_org_admin(organization_id)
      or exists (
        select 1 from course_sections cs
        where cs.id = course_section_id
          and cs.teacher_id = auth.uid()
      )
    )
  );

-- Admin-only hard delete (soft-archive is the preferred path)
create policy "admin_delete_assignments"
  on assignments for delete
  using (is_org_admin(organization_id));

-- ── 2. student_assignment_grades ─────────────────────────────────────────────
-- One row per (assignment, student). Unique constraint enforced at DB level.
-- points_earned is NULL for all non-graded statuses — NEVER use a sentinel like -1.
-- grade_status drives calculation inclusion rules (see TypeScript engine).

create table if not exists student_assignment_grades (
  id              uuid          primary key default gen_random_uuid(),
  organization_id uuid          not null references organizations(id) on delete cascade,
  assignment_id   uuid          not null references assignments(id)   on delete cascade,
  student_id      uuid          not null references students(id)      on delete cascade,

  -- Score: null when status is not 'graded'
  points_earned   numeric(8,2),

  -- Status drives how this row is included in calculation
  grade_status    text          not null default 'graded'
    check (grade_status in (
      'graded','missing','excused','absent','incomplete','not_graded'
    )),

  -- Notes (teacher-visible only — not parent-facing in Stage 2)
  teacher_note    text,

  -- Audit
  entered_by      uuid          references profiles(id),
  created_at      timestamptz   not null default now(),
  updated_by      uuid          references profiles(id),
  updated_at      timestamptz   not null default now(),

  -- One grade row per student per assignment
  constraint student_grades_unique unique (assignment_id, student_id),

  -- When status='graded', points_earned must be a non-negative number
  constraint student_grades_points_check check (
    grade_status <> 'graded'
    or (points_earned is not null and points_earned >= 0)
  )
);

create index if not exists idx_sag_assignment
  on student_assignment_grades(assignment_id);

create index if not exists idx_sag_student_org
  on student_assignment_grades(student_id, organization_id);

create index if not exists idx_sag_org
  on student_assignment_grades(organization_id);

create trigger student_grades_updated_at
  before update on student_assignment_grades
  for each row execute function update_updated_at_column();

alter table student_assignment_grades enable row level security;

drop policy if exists "staff_view_student_grades"    on student_assignment_grades;
drop policy if exists "teacher_manage_student_grades" on student_assignment_grades;
drop policy if exists "teacher_update_student_grades" on student_assignment_grades;
drop policy if exists "admin_delete_student_grades"   on student_assignment_grades;

create policy "staff_view_student_grades"
  on student_assignment_grades for select
  using (is_org_member(organization_id));

-- Teacher can enter grades only for assignments in sections they teach
create policy "teacher_manage_student_grades"
  on student_assignment_grades for insert
  with check (
    is_staff_or_above(organization_id)
    and (
      is_org_admin(organization_id)
      or exists (
        select 1 from assignments a
        join course_sections cs on cs.id = a.course_section_id
        where a.id = assignment_id
          and cs.teacher_id = auth.uid()
      )
    )
  );

create policy "teacher_update_student_grades"
  on student_assignment_grades for update
  using (
    is_staff_or_above(organization_id)
    and (
      is_org_admin(organization_id)
      or exists (
        select 1 from assignments a
        join course_sections cs on cs.id = a.course_section_id
        where a.id = assignment_id
          and cs.teacher_id = auth.uid()
      )
    )
  );

create policy "admin_delete_student_grades"
  on student_assignment_grades for delete
  using (is_org_admin(organization_id));

-- ── 3. DB helper: resolve assignment grading period from date ────────────────
-- Given an org, a course section, and an assignment date, returns the quarter
-- (is_assignment_period=true) whose date range contains the date.
-- Returns NULL if no quarter matches — caller must treat this as a validation error.
-- Used by server actions when teacher does not manually pick a period.

create or replace function resolve_assignment_period(
  p_organization_id   uuid,
  p_course_section_id uuid,
  p_date              date
) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select gp.id
  from grading_periods gp
  join course_sections cs
    on cs.school_year_id = gp.school_year_id
   and cs.organization_id = gp.organization_id
  where cs.id                   = p_course_section_id
    and gp.organization_id      = p_organization_id
    and gp.is_assignment_period = true
    and gp.start_date           <= p_date
    and gp.end_date             >= p_date
  limit 1;
$$;

-- ── 4. DB helper: get students enrolled in a course section ──────────────────
-- Returns student IDs linked to a section via curriculum_enrollments.
-- This is the enrollment validation check used before creating grade records.
-- Returns all active curriculum enrollments linked to the section.

create or replace function get_section_students(
  p_course_section_id uuid
) returns table (student_id uuid, student_name text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id as student_id,
         (s.first_name || ' ' || s.last_name) as student_name
  from curriculum_enrollments ce
  join students s on s.id = ce.student_id
  where ce.course_section_id = p_course_section_id
    and ce.status = 'active'
    and s.enrollment_status = 'enrolled'
  order by s.last_name, s.first_name;
$$;
