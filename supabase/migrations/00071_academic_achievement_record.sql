-- ============================================================
-- Migration 00071 — Academic Achievement Record: Stage A
-- SchoolCo Platform
-- ============================================================
-- Creates two tables:
--
--   academic_record_imports   — Skeleton provenance table for future AI
--                               extraction runs. Empty in Stage A; AI fields
--                               added in Stage C. Created now so that
--                               student_course_records.import_id can reference
--                               it via FK without a later ALTER.
--
--   student_course_records    — Normalized, verified historical and current
--                               academic course records. Distinct from
--                               student_documents (source files) and from
--                               student_reports (snapshots). This is the
--                               canonical structured academic record.
--
-- Design rules enforced here:
--   • school_year is free text — historical records predate RLA's school_years table
--   • subject_area has NO DB check constraint (per migration 00065 rationale)
--   • No UNIQUE constraint on course identity — duplicate detection is a
--     review workflow (Stage B), not a destructive DB rule
--   • credits_attempted/credits_earned = HIGH-SCHOOL credit units only
--   • source_credits_* = institution-reported credit (e.g. college semester hours)
--   • in-progress SchoolCo courses are NOT stored here; they are read live from
--     curriculum_enrollments + course_sections and displayed separately
--   • AI must never create verified rows or calculate HS credit equivalency
-- ============================================================

-- ── 1. academic_record_imports (skeleton) ─────────────────────────────────────
-- Tracks future AI extraction runs. Stage A: manual only.
-- Stage C adds: provider, model, prompt_version, raw_response_ref columns.

create table if not exists academic_record_imports (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references organizations(id) on delete cascade,
  student_id          uuid        not null references students(id) on delete cascade,
  source_document_id  uuid        references student_documents(id) on delete set null,
  requested_by        uuid        references profiles(id) on delete set null,

  status              text        not null default 'pending'
    check (status in (
      'pending',      -- created, not yet processed
      'processing',   -- AI call in flight
      'completed',    -- AI proposed courses written to student_course_records
      'failed',       -- extraction failed; see error_message
      'reviewed'      -- all proposed courses reviewed by staff
    )),

  error_message       text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now()
  -- Stage C adds: provider text, model text, prompt_version text
);

create index if not exists idx_academic_imports_student
  on academic_record_imports(organization_id, student_id, created_at desc);

create index if not exists idx_academic_imports_doc
  on academic_record_imports(source_document_id)
  where source_document_id is not null;

alter table academic_record_imports enable row level security;

drop policy if exists "staff_view_academic_imports"   on academic_record_imports;
drop policy if exists "staff_manage_academic_imports" on academic_record_imports;
drop policy if exists "admin_delete_academic_imports" on academic_record_imports;

create policy "staff_view_academic_imports"
  on academic_record_imports for select
  using (is_staff_or_above(organization_id));

create policy "staff_manage_academic_imports"
  on academic_record_imports for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_academic_imports"
  on academic_record_imports for update
  using (is_staff_or_above(organization_id));

create policy "admin_delete_academic_imports"
  on academic_record_imports for delete
  using (is_org_admin(organization_id));


-- ── 2. student_course_records ─────────────────────────────────────────────────

create table if not exists student_course_records (
  id                              uuid        primary key default gen_random_uuid(),
  organization_id                 uuid        not null references organizations(id) on delete cascade,
  student_id                      uuid        not null references students(id) on delete cascade,

  -- ── Academic placement ──────────────────────────────────────────────────────
  school_year                     text        not null,
  -- Free text: "2023–2024", "Summer 2022", "2019–2020"
  -- NOT a FK to school_years — historical records predate RLA's table.

  grade_level                     text,
  -- Free text: "K", "1"–"12", "Dual Enrollment". Null = not specified by source.

  term                            text        check (term in (
                                    'full_year',
                                    'semester_1', 'semester_2',
                                    'quarter_1', 'quarter_2', 'quarter_3', 'quarter_4',
                                    'summer',
                                    'other'
                                  )),
  -- Null = source did not specify a term.
  -- Critical for duplicate detection: ENC1101 semester_1 ≠ ENC1102 semester_2.

  -- ── Institution ─────────────────────────────────────────────────────────────
  institution_name                text,
  -- Null = RLA (SchoolCo-native, Stage D). Non-null for prior/external institutions.

  institution_type                text        check (institution_type in (
                                    'public', 'private', 'homeschool', 'umbrella',
                                    'virtual', 'college', 'rla', 'other'
                                  )),
  -- Optional. Staff can set; AI may suggest.

  -- ── Course identity ─────────────────────────────────────────────────────────
  course_name                     text        not null,
  -- Required. Must match source verbatim; AI must not invent or paraphrase.

  course_code                     text,
  -- Optional. e.g. "ENC1101", "ALG1". From source only.

  subject_area                    text,
  -- No DB CHECK constraint (see migration 00065 rationale — app-layer validated).
  -- e.g. "mathematics", "english_ela", "science", "social_studies",
  --      "world_language", "fine_arts", "pe_health", "career_technical",
  --      "leadership", "entrepreneurship", "elective", "other"

  course_level                    text        check (course_level in (
                                    'standard', 'honors', 'ap', 'dual_enrollment'
                                  )),
  -- Null = not specified. Staff verifies honors/AP/DE — AI may suggest only.

  -- ── Grades ──────────────────────────────────────────────────────────────────
  -- All nullable. AI must NEVER infer or synthesize a grade not present in source.
  semester_1_grade                text,       -- Verbatim from source: "A", "B+", "87", "P"
  semester_2_grade                text,
  final_grade                     text,       -- Letter grade: "A", "B+", "F", "P", "W"
  percentage                      numeric(5,2),
  -- Numeric percentage if source reports one. Null if not explicitly stated.

  -- ── High-school credit (transcript/graduation units) ────────────────────────
  -- These fields represent HIGH-SCHOOL credit only.
  -- Use source_credits_* for institution-reported units (e.g. college semester hours).
  credits_attempted               numeric(4,2),
  -- HS credits the student attempted. Null = not applicable or unknown.

  credits_earned                  numeric(4,2),
  -- HS credits actually earned. Null = not yet determined, unknown, or not applicable.
  -- NEVER populated by AI. Staff must verify and enter.
  -- A failed course may have credits_earned = 0.0 (not null — explicitly zero).

  counts_toward_high_school_credit boolean     not null default false,
  -- Explicit opt-in for HS graduation tracking.
  -- True for Grade 8 Algebra I taken as HS credit, dual enrollment, etc.
  -- Independent of grade_level — a K-8 student may have this = true.

  -- ── Source / institution credit (informational) ──────────────────────────────
  -- The credit units as reported by the external institution.
  -- Do NOT use these in SchoolCo HS credit totals.
  -- Example: EFSC reports 3 semester credit hours → source_credits_earned = 3.0,
  --          source_credit_unit = 'college_semester_hours'.
  --          Staff separately determines and enters HS equivalent in credits_earned.
  source_credits_attempted        numeric(6,2),
  source_credits_earned           numeric(6,2),
  source_credit_unit              text        check (source_credit_unit in (
                                    'high_school_credit',
                                    'college_semester_hours',
                                    'college_quarter_hours',
                                    'other'
                                  )),

  -- ── Academic completion status ───────────────────────────────────────────────
  -- Distinct from verification_status. Describes the academic outcome.
  completion_status               text        not null default 'unknown'
    check (completion_status in (
      'in_progress',  -- Reserved for Stage D SchoolCo-native current courses only
      'completed',    -- Course finished; see credits_earned for whether credit was earned
      'withdrawn',    -- Student withdrew before completion
      'failed',       -- Course finished; student did not pass (credits_earned = 0 or null)
      'incomplete',   -- Work unfinished; pending resolution
      'unknown'       -- Historical source does not specify outcome
    )),
  -- Stage A: in_progress value NOT used — current courses displayed live from
  -- curriculum_enrollments, never stored here until explicit finalization (Stage D).

  -- ── Provenance ──────────────────────────────────────────────────────────────
  source_type                     text        not null
    check (source_type in (
      'manual_historical',   -- Staff manually entered from physical/digital record
      'ai_proposed',         -- AI extracted; requires staff review before verified
      'schoolco_native'      -- Derived from RLA gradebook after finalization (Stage D)
    )),

  source_document_id              uuid        references student_documents(id)
                                                on delete set null,
  -- FK to the uploaded transcript/record PDF this course was extracted from.
  -- Null for manual entries with no uploaded source, or schoolco_native.
  -- on delete set null: deleting the source doc preserves the course record.

  import_id                       uuid        references academic_record_imports(id)
                                                on delete set null,
  -- FK to the AI extraction run that proposed this record.
  -- Null for manual_historical and schoolco_native.
  -- on delete set null: removing an import run preserves approved course records.

  source_notes                    text,
  -- Free-text provenance notes for manual entries.

  -- ── Verification workflow ────────────────────────────────────────────────────
  verification_status             text        not null default 'needs_review'
    check (verification_status in (
      'proposed',       -- AI-proposed; not yet surfaced to staff review queue
      'needs_review',   -- Default for manual entries and surfaced AI proposals
      'verified',       -- Staff reviewed and approved this record
      'rejected'        -- Staff rejected; kept for audit trail; excluded from summaries
    )),
  -- Note: manual_historical entries start as needs_review (not proposed).
  -- proposed is reserved for ai_proposed source_type.

  verification_notes              text,
  -- Staff notes explaining verification decision, corrections, conflicts, etc.

  verified_by                     uuid        references profiles(id) on delete set null,
  verified_at                     timestamptz,

  -- ── Audit ────────────────────────────────────────────────────────────────────
  created_by                      uuid        references profiles(id) on delete set null,
  created_at                      timestamptz not null default now(),
  updated_by                      uuid        references profiles(id) on delete set null,
  updated_at                      timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary lookup: all course records for a student, ordered by school year
create index if not exists idx_scr_student_org
  on student_course_records(organization_id, student_id, school_year, created_at);

-- Credit summary: verified HS-credit-bearing completed records
create index if not exists idx_scr_hs_credit_summary
  on student_course_records(student_id, verification_status, completion_status)
  where counts_toward_high_school_credit = true
    and verification_status = 'verified'
    and completion_status = 'completed';

-- Source document linkage (for "View Original" and import duplicate checking)
create index if not exists idx_scr_source_doc
  on student_course_records(source_document_id)
  where source_document_id is not null;

-- Import batch linkage
create index if not exists idx_scr_import
  on student_course_records(import_id)
  where import_id is not null;

-- Verification queue: staff review pending records
create index if not exists idx_scr_review_queue
  on student_course_records(organization_id, verification_status, created_at)
  where verification_status in ('proposed', 'needs_review');

-- ── Updated-at trigger ────────────────────────────────────────────────────────

drop trigger if exists scr_updated_at on student_course_records;
create trigger scr_updated_at
  before update on student_course_records
  for each row execute function handle_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table student_course_records enable row level security;

-- Staff: full CRUD within their org
drop policy if exists "staff_select_course_records"  on student_course_records;
drop policy if exists "staff_insert_course_records"  on student_course_records;
drop policy if exists "staff_update_course_records"  on student_course_records;
drop policy if exists "staff_delete_course_records"  on student_course_records;

create policy "staff_select_course_records"
  on student_course_records for select
  using (is_staff_or_above(organization_id));

create policy "staff_insert_course_records"
  on student_course_records for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_course_records"
  on student_course_records for update
  using (is_staff_or_above(organization_id));

create policy "staff_delete_course_records"
  on student_course_records for delete
  using (is_staff_or_above(organization_id));

-- Parents: read-only, verified records only, for their guardian-linked children.
-- Includes verified failed/withdrawn courses — credit summaries filter separately.
-- No access to proposed/needs_review/rejected rows.
drop policy if exists "parent_view_course_records" on student_course_records;

create policy "parent_view_course_records"
  on student_course_records for select
  using (
    verification_status = 'verified'
    and student_id in (select get_guardian_student_ids(organization_id))
  );

-- ── Comments ──────────────────────────────────────────────────────────────────

comment on table student_course_records is
  'Normalized, verified historical and current academic course records per student. '
  'Distinct from student_documents (source files) and student_reports (snapshots). '
  'credits_attempted/credits_earned are HIGH-SCHOOL units. source_credits_* are '
  'institution-reported units (e.g. college semester hours). '
  'In-progress SchoolCo courses are NOT stored here until explicit finalization (Stage D).';

comment on column student_course_records.school_year is
  'Free text label: "2023–2024". NOT a FK to school_years — historical records predate RLA table.';
comment on column student_course_records.credits_earned is
  'HIGH-SCHOOL credits earned. Never populated by AI. Null = unknown/N/A. '
  'A failed course should have 0.0, not null, when the credit attempt is known.';
comment on column student_course_records.counts_toward_high_school_credit is
  'Explicit HS graduation tracking opt-in. Independent of grade_level. '
  'Grade 8 Algebra I may be true here.';
comment on column student_course_records.source_credits_earned is
  'Institution-reported credit (e.g. 3.0 college semester hours). '
  'Do NOT use in SchoolCo HS credit totals.';
comment on column student_course_records.completion_status is
  'Academic outcome. Distinct from verification_status. '
  'in_progress reserved for Stage D finalization workflow only.';
