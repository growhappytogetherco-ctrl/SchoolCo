-- Migration 00079: Stage E.4.1 — Enrollment-level HS credit overrides
--
-- Adds per-enrollment credit configuration to curriculum_enrollments.
-- All four columns are nullable. NULL means "not explicitly configured; resolve
-- from course_sections default." An explicit FALSE on
-- counts_toward_high_school_credit means this student is NOT taking this
-- enrollment for HS credit, even if the section default is TRUE.
--
-- Inheritance semantics (application layer enforces; order of precedence):
--   effective_hs_credit     = enrollment.counts_toward_high_school_credit
--                             ?? section.counts_toward_high_school_credit
--                             ?? false
--   effective_credits       = enrollment.credits_attempted
--                             ?? section.credits_attempted
--                             ?? null
--   effective_course_level  = enrollment.course_level
--                             ?? section.course_level
--                             ?? null
--   effective_term_label    = grading_periods.name when grading_period_id is set,
--                             else NOT SPECIFIED (never infer "Full Year" from null)
--
-- RLS: curriculum_enrollments UPDATE policy (00030) already requires
--   is_staff_or_above(organization_id). These columns are protected by that
--   existing policy. Parents have SELECT-only (00073 guardian_view policy);
--   they cannot write any curriculum_enrollments column.
--
-- DOES NOT MODIFY any existing enrollment rows.
-- All 164 active enrollments will have NULL in all four new columns after apply.
-- No student_course_records are created. No credits are configured.

alter table curriculum_enrollments
  add column if not exists counts_toward_high_school_credit boolean,
  add column if not exists credits_attempted                numeric(4,2)
    check (credits_attempted is null or credits_attempted >= 0),
  add column if not exists course_level                     text
    check (
      course_level is null
      or course_level in ('standard', 'honors', 'ap', 'dual_enrollment')
    ),
  add column if not exists grading_period_id                uuid
    references grading_periods(id) on delete set null;

comment on column curriculum_enrollments.counts_toward_high_school_credit is
  'Enrollment-level HS credit override. NULL = inherit from course_sections default.
   TRUE  = this student explicitly earns HS credit for this enrollment.
   FALSE = this student explicitly does NOT earn HS credit (overrides section TRUE).
   Do not conflate NULL (unset) with FALSE (explicit no).';

comment on column curriculum_enrollments.credits_attempted is
  'Enrollment-level credit amount override. NULL = inherit from course_sections.
   Use when a student takes a different credit load than the section default.
   Must be >= 0 when set.';

comment on column curriculum_enrollments.course_level is
  'Enrollment-level course-level override (standard/honors/ap/dual_enrollment).
   NULL = inherit from course_sections.course_level.';

comment on column curriculum_enrollments.grading_period_id is
  'FK to a semester-level grading_periods row (period_type = ''semester'').
   Identifies Semester 1 or Semester 2 credit for this enrollment.
   NULL = term not explicitly configured. NULL must never auto-display as
   "Full Year" or write "full_year" into student_course_records.
   Do not point to a quarter row (is_assignment_period = true).';

create index if not exists idx_curriculum_enrollments_grading_period
  on curriculum_enrollments(grading_period_id)
  where grading_period_id is not null;
