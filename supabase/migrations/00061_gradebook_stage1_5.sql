-- Migration 00061: Gradebook Stage 1.5 — Architecture hardening
--
-- Fixes two architectural concerns from Stage 1 review:
--
-- CONCERN 1: course_grade_settings was tied to individual curriculum_enrollments
--   (one row per student) instead of at the course/class level. Fixes this by
--   introducing course_sections (a shared class/offering entity) and rewiring
--   course_grade_settings to reference it. curriculum_enrollments is preserved
--   intact; it gets an optional course_section_id FK for gradebook linking.
--
-- CONCERN 2: grading_periods had no hierarchy. Quarters and semesters were flat,
--   creating date-range ambiguity for assignment period lookup. Fixes this by
--   adding parent_period_id (semester→quarter hierarchy), is_assignment_period
--   (true for quarters — where grades are entered), and is_reporting_period
--   (true for semesters — calculated from child quarters). Updates RLA seed data.
--
-- Production data confirms need for course_sections:
--   Geography:       4 students, teacher Jerradyn Farr  → shared class
--   KingDurance PE:  5 students, teacher Kenny Johnson  → shared class
--   Entrepreneurship: 4 students, teacher Kenny Johnson → shared class
--   ELA (TGATB):     6 students, teacher Elisa Johnson  → shared class
--   Math:            individual per student              → each gets own section
--
-- course_grade_settings has 0 rows in production — safe to restructure columns.

-- ── PART A: course_sections ──────────────────────────────────────────────────
-- Represents one class/course offering per school year per org.
-- Example: "Geography — 2026-2027 — Jerradyn Farr"
-- Multiple students link to the same section via curriculum_enrollments.course_section_id.
-- Grading configuration is set once here, not per student.

create table if not exists course_sections (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references organizations(id) on delete cascade,
  school_year_id  uuid        not null references school_years(id) on delete cascade,

  -- Identity
  subject         text        not null
    check (subject in (
      'math','ela','science','history','bible','spanish',
      'elective','leadership','entrepreneurship','art','music','pe','other'
    )),
  course_name     text        not null,   -- e.g. "Geography", "Math U See Delta", "KingDurance PE"
  teacher_id      uuid        references profiles(id) on delete set null,
  teacher_name    text,                   -- denormalized for display speed (matches curriculum_enrollments pattern)

  -- Status
  status          text        not null default 'active'
    check (status in ('active','inactive','archived')),

  -- Audit
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint course_sections_org_year_name_unique
    unique (organization_id, school_year_id, subject, course_name)
);

create index if not exists idx_course_sections_org_year
  on course_sections(organization_id, school_year_id);

create index if not exists idx_course_sections_org_subject
  on course_sections(organization_id, subject);

create index if not exists idx_course_sections_teacher
  on course_sections(teacher_id) where teacher_id is not null;

create trigger course_sections_updated_at
  before update on course_sections
  for each row execute function update_updated_at_column();

alter table course_sections enable row level security;

drop policy if exists "staff_view_course_sections"   on course_sections;
drop policy if exists "staff_manage_course_sections" on course_sections;
drop policy if exists "staff_update_course_sections" on course_sections;
drop policy if exists "admin_delete_course_sections" on course_sections;

create policy "staff_view_course_sections"
  on course_sections for select
  using (is_org_member(organization_id));

create policy "staff_manage_course_sections"
  on course_sections for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_course_sections"
  on course_sections for update
  using (is_staff_or_above(organization_id));

create policy "admin_delete_course_sections"
  on course_sections for delete
  using (is_org_admin(organization_id));

-- ── PART B: Rewire course_grade_settings to course_sections ─────────────────
-- course_grade_settings has 0 rows — safe to restructure.
-- Drops enrollment_id (per-student FK) and school_year_id (now derived from
-- course_section). Adds course_section_id (shared class-level FK).
-- organization_id is retained for RLS helper compatibility.

alter table course_grade_settings
  drop column if exists enrollment_id,
  drop column if exists school_year_id;

alter table course_grade_settings
  add column if not exists course_section_id uuid
    not null references course_sections(id) on delete cascade;

-- Replace the old unique constraint (was on enrollment_id + school_year_id)
alter table course_grade_settings
  drop constraint if exists course_grade_settings_unique;

alter table course_grade_settings
  add constraint course_grade_settings_section_unique
    unique (course_section_id);

create index if not exists idx_course_grade_settings_section
  on course_grade_settings(course_section_id);

-- ── PART C: Add course_section_id to curriculum_enrollments ─────────────────
-- Nullable: preserves all existing data. Teachers link a student's curriculum
-- enrollment to a class section when setting up gradebook. Students without a
-- section link remain valid curriculum records (used by Student Success Plans).

alter table curriculum_enrollments
  add column if not exists course_section_id uuid
    references course_sections(id) on delete set null;

create index if not exists idx_curriculum_section
  on curriculum_enrollments(course_section_id) where course_section_id is not null;

-- ── PART D: Grading period hierarchy ────────────────────────────────────────
-- Fixes the quarter/semester date-range ambiguity.
--
-- parent_period_id: semester rows have null; quarter rows point to their parent semester.
--   Q1 → Semester 1, Q2 → Semester 1, Q3 → Semester 2, Q4 → Semester 2
--
-- is_assignment_period: true for quarters — this is where teachers enter assignment grades.
--   Semester rows are false: no assignments are directly assigned to a semester.
--
-- is_reporting_period: true for all rows — every period appears on reports.
--   (Semester reports aggregate from child quarters.)
--
-- Assignment date lookup rule (enforced by application layer):
--   Find the quarter whose [start_date, end_date] contains the assignment date.
--   Never match a semester row directly for assignment entry.

alter table grading_periods
  add column if not exists parent_period_id uuid
    references grading_periods(id) on delete set null,
  add column if not exists is_assignment_period boolean not null default true,
  add column if not exists is_reporting_period  boolean not null default true;

-- Update RLA 2026-2027 periods with correct hierarchy and flags
DO $$
DECLARE
  rla_org_id uuid := '9fd43346-f43b-41d1-9b4c-fe8702471b07';
  s1_id      uuid;
  s2_id      uuid;
BEGIN
  -- Locate the semester rows
  select id into s1_id
  from grading_periods
  where organization_id = rla_org_id and name = 'Semester 1';

  select id into s2_id
  from grading_periods
  where organization_id = rla_org_id and name = 'Semester 2';

  if s1_id is null or s2_id is null then
    RAISE NOTICE 'RLA semester rows not found — skipping hierarchy update.';
    return;
  end if;

  -- Semesters: not assignment-entry periods; are reporting periods; no parent
  update grading_periods
  set is_assignment_period = false,
      is_reporting_period  = true,
      parent_period_id     = null
  where organization_id = rla_org_id
    and period_type = 'semester';

  -- Quarters: assignment-entry periods; are reporting periods; parent = their semester
  update grading_periods
  set is_assignment_period = true,
      is_reporting_period  = true,
      parent_period_id     = s1_id
  where organization_id = rla_org_id
    and name in ('Q1', 'Q2');

  update grading_periods
  set is_assignment_period = true,
      is_reporting_period  = true,
      parent_period_id     = s2_id
  where organization_id = rla_org_id
    and name in ('Q3', 'Q4');

  RAISE NOTICE 'RLA grading period hierarchy updated: Q1/Q2→S1, Q3/Q4→S2.';
END $$;

-- Index for efficient quarter lookup by date range (used for assignment period resolution)
create index if not exists idx_grading_periods_assignment_lookup
  on grading_periods(organization_id, school_year_id, start_date, end_date)
  where is_assignment_period = true;
