-- Migration 00078: Stage D — RLA Course Finalization Schema
--
-- Adds per-enrollment finalization lifecycle, grade override audit table,
-- course-level credit metadata, and provenance FKs for schoolco_native records.
--
-- NO existing records are modified. NO credits awarded. NO enrollments finalized.
-- Safe to apply to production before any finalization UI exists.
--
-- Affected tables:
--   course_sections           — HS-credit metadata (counts_toward_high_school_credit,
--                               credits_attempted, course_level)
--   curriculum_enrollments    — finalization lifecycle fields
--   student_course_records    — provenance FKs + idempotency unique constraint
--   course_finalization_overrides — NEW: pre-finalization grade override audit

-- ── A. course_sections — HS-credit metadata ──────────────────────────────────
-- Uses the SAME column names and check-constraint values as student_course_records
-- so the two tables can be joined and compared consistently.

alter table course_sections
  add column if not exists counts_toward_high_school_credit boolean not null default false,
  add column if not exists credits_attempted                numeric(4,2),
  add column if not exists course_level                     text
    check (course_level in ('standard', 'honors', 'ap', 'dual_enrollment'));

comment on column course_sections.counts_toward_high_school_credit is
  'Whether this course section counts toward HS graduation credit. '
  'Opt-in; false by default. A K–8 section may still be true for early HS credit.';

comment on column course_sections.credits_attempted is
  'High-school credit units attempted by students enrolled in this section. '
  'Null = no credit configured yet. Distinct from college/dual-enrollment hours.';

comment on column course_sections.course_level is
  'Instructional level: standard, honors, ap, dual_enrollment. '
  'Matches the course_level check constraint on student_course_records.';

-- ── B. curriculum_enrollments — finalization lifecycle ───────────────────────
-- Each enrollment has its own finalization state.
-- Multiple students in the same section finalize independently.

alter table curriculum_enrollments
  add column if not exists finalized_at        timestamptz,
  add column if not exists finalized_by        uuid references profiles(id) on delete set null,
  add column if not exists finalized_record_id uuid references student_course_records(id)
                             on delete set null;

comment on column curriculum_enrollments.finalized_at is
  'Timestamp when this specific enrollment was finalized into a permanent record. '
  'Null = not yet finalized. Used for idempotency guard (first line of defense).';

comment on column curriculum_enrollments.finalized_by is
  'Profile ID of the registrar/admin who performed the finalization.';

comment on column curriculum_enrollments.finalized_record_id is
  'FK to the student_course_records row produced by finalization. '
  'Allows one-hop lookup: enrollment → permanent record. '
  'on delete set null: deleting the SCR row (unusual) does not cascade-delete the enrollment.';

-- ── C. student_course_records — provenance FKs ───────────────────────────────
-- Allow a schoolco_native record to identify exactly which section + enrollment
-- produced it, answering "which SchoolCo enrollment produced this permanent record?"

alter table student_course_records
  add column if not exists course_section_id      uuid references course_sections(id)
                             on delete set null,
  add column if not exists curriculum_enrollment_id uuid references curriculum_enrollments(id)
                             on delete set null;

comment on column student_course_records.course_section_id is
  'FK to course_sections for schoolco_native records. '
  'Null for historical/imported records.';

comment on column student_course_records.curriculum_enrollment_id is
  'FK to the specific curriculum_enrollment that was finalized. '
  'With this + student_id, the exact enrollment that produced the record is unambiguous.';

-- Idempotency: exactly one active schoolco_native record per curriculum_enrollment.
-- Prevents duplicate permanent records from double-clicks / network retries.
-- Applies only to schoolco_native rows (partial unique index).
-- Does NOT apply to ai_proposed, manual_historical records.
create unique index if not exists uq_scr_native_per_enrollment
  on student_course_records(curriculum_enrollment_id)
  where source_type = 'schoolco_native'
    and curriculum_enrollment_id is not null;

comment on index uq_scr_native_per_enrollment is
  'One schoolco_native permanent record per curriculum_enrollment. '
  'Prevents duplicate finalization from concurrent or retried requests.';

-- Provenance index for lookup
create index if not exists idx_scr_enrollment
  on student_course_records(curriculum_enrollment_id)
  where curriculum_enrollment_id is not null;

create index if not exists idx_scr_course_section
  on student_course_records(course_section_id)
  where course_section_id is not null;

-- ── D. course_finalization_overrides — pre-finalization grade overrides ───────
-- Records when a registrar/admin intentionally sets an official percentage
-- that differs from the calculated gradebook percentage BEFORE or AT finalization.
--
-- This is a finalization-time decision (override), NOT a post-finalization correction.
-- Post-finalization corrections are tracked in audit_logs (existing infrastructure).
--
-- on delete restrict on the student_course_record FK: the override audit must
-- survive as long as the academic record exists (do not silently cascade-delete).

create table if not exists course_finalization_overrides (
  id                        uuid          primary key default gen_random_uuid(),
  organization_id           uuid          not null references organizations(id) on delete cascade,
  student_id                uuid          not null references students(id) on delete cascade,
  curriculum_enrollment_id  uuid          not null references curriculum_enrollments(id)
                              on delete restrict,
  course_section_id         uuid          references course_sections(id) on delete set null,

  -- The gradebook-calculated values at the moment of finalization decision
  calculated_percentage     numeric(5,2)  not null,
  calculated_letter_grade   text,

  -- The authorized official override values written to the permanent record
  override_percentage       numeric(5,2)  not null,
  override_letter_grade     text          not null,

  reason                    text          not null,
  overridden_by             uuid          not null references profiles(id) on delete restrict,
  overridden_at             timestamptz   not null default now(),

  -- FK to the resulting permanent record. Set at finalization commit time.
  -- Null briefly between override creation and commit (same transaction in practice).
  student_course_record_id  uuid          references student_course_records(id)
                              on delete restrict,

  created_at                timestamptz   not null default now()
);

comment on table course_finalization_overrides is
  'Audit trail for registrar/admin grade overrides applied at finalization time. '
  'Records the calculated vs. authorized official percentage and the reason. '
  'Staff-only: never shown in parent portal or clean Academic Achievement Record.';

comment on column course_finalization_overrides.calculated_percentage is
  'The gradebook-computed percentage at the moment the override decision was made.';

comment on column course_finalization_overrides.override_percentage is
  'The official percentage authorized by the registrar/admin to be recorded permanently.';

comment on column course_finalization_overrides.reason is
  'Required staff explanation for why the official grade differs from the calculation.';

create index if not exists idx_cfo_enrollment
  on course_finalization_overrides(curriculum_enrollment_id);

create index if not exists idx_cfo_student_org
  on course_finalization_overrides(organization_id, student_id);

create index if not exists idx_cfo_record
  on course_finalization_overrides(student_course_record_id)
  where student_course_record_id is not null;

alter table course_finalization_overrides enable row level security;

-- Only registrar and above can view override audit records
drop policy if exists "registrar_select_overrides" on course_finalization_overrides;
drop policy if exists "registrar_insert_overrides" on course_finalization_overrides;

create policy "registrar_select_overrides"
  on course_finalization_overrides for select
  using (has_min_org_role(organization_id, 'registrar'::user_role));

create policy "registrar_insert_overrides"
  on course_finalization_overrides for insert
  with check (has_min_org_role(organization_id, 'registrar'::user_role));

-- Overrides are immutable once written — no update/delete policies
-- (corrections go through audit_logs, not by mutating the override record)
