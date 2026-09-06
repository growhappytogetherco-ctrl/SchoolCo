-- ============================================================
-- Migration 00068 — Academic Records: Legacy Document Metadata
-- SchoolCo Platform
-- ============================================================
-- Extends student_documents with academic record metadata so that
-- historical progress reports, report cards, transcripts, etc.
-- can be uploaded once through the Documents tab and automatically
-- appear in the Grades → Academic History view.
--
-- Design rules:
--   ONE Drive file → ONE student_documents row → appears in BOTH views
--   No duplication of files or records.
--   Parent visibility is explicit (visibility = 'parent_visible'),
--   never automatic.
-- ============================================================

-- ── 1. Add 'academic_record' to the document_type enum ────────────────────────

-- Drop the existing check constraint so we can replace it.
alter table student_documents
  drop constraint if exists student_documents_document_type_check;

alter table student_documents
  add constraint student_documents_document_type_check
    check (document_type in (
      'enrollment_form', 'transcript', 'iep', 'medical_form',
      'permission_slip', 'scholarship', 'legal', 'report_card',
      'photo_id', 'court_order', 'general', 'other',
      'academic_record'
    ));

-- ── 2. Add academic metadata columns ──────────────────────────────────────────

alter table student_documents
  add column if not exists academic_record_type       text
    check (academic_record_type in (
      'progress_report', 'report_card', 'transcript',
      'academic_summary', 'assessment_report', 'other_academic'
    )),
  add column if not exists academic_school_year       text,      -- e.g. "2024-2025" (free text, not FK)
  add column if not exists academic_reporting_period  text
    check (academic_reporting_period in (
      'q1', 'q2', 'q3', 'q4',
      'semester_1', 'semester_2',
      'full_year', 'mid_year', 'beginning_of_year', 'end_of_year',
      'other', null
    )),
  add column if not exists academic_record_date       date,      -- Date of the report/document
  add column if not exists academic_record_source     text       not null default 'legacy_upload'
    check (academic_record_source in (
      'legacy_upload', 'schoolco_generated', 'external_school'
    ));

-- Partial index for fast academic record lookups
create index if not exists idx_student_docs_academic
  on student_documents(student_id, academic_school_year, academic_reporting_period)
  where document_type = 'academic_record';

comment on column student_documents.academic_record_type      is 'Type of academic record (only set when document_type = academic_record)';
comment on column student_documents.academic_school_year      is 'School year label, e.g. "2024-2025". Free text to support external school records.';
comment on column student_documents.academic_reporting_period is 'Reporting period within the school year (q1..q4, semester_1/2, full_year, etc.)';
comment on column student_documents.academic_record_date      is 'Date on the report or document, if known.';
comment on column student_documents.academic_record_source    is 'Origin of this record: legacy_upload (historical PDF), schoolco_generated (Stage 5 report), external_school.';

-- ── 3. Parent RLS policy for academic records ─────────────────────────────────
-- Parents may read student_documents rows where:
--   a) document_type = 'academic_record'
--   b) visibility = 'parent_visible'
--   c) student_id is one of their guardian-linked children
--
-- Staff continue to have full access (existing policies in 00030 are unchanged).

drop policy if exists "parent_view_academic_docs" on student_documents;

create policy "parent_view_academic_docs"
  on student_documents for select
  using (
    document_type = 'academic_record'
    and visibility = 'parent_visible'
    and student_id in (select get_guardian_student_ids(organization_id))
  );
