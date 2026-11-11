-- Migration 00103: Enrollment document types + import job linkage
-- Adds birth_certificate and immunization to student_documents.document_type,
-- adds import_job_id column for tracing documents back to their import,
-- and adds document_status enum values for per-student tracking.

-- ── 1. Extend document_type CHECK ────────────────────────────────────────────

alter table student_documents
  drop constraint if exists student_documents_document_type_check;

alter table student_documents
  add constraint student_documents_document_type_check
    check (document_type in (
      'enrollment_form', 'transcript', 'iep', 'medical_form',
      'permission_slip', 'scholarship', 'legal', 'report_card',
      'photo_id', 'court_order', 'general', 'other',
      'academic_record',
      'birth_certificate', 'immunization'
    ));

-- ── 2. Link documents back to the import job that created them ────────────────

alter table student_documents
  add column if not exists import_job_id uuid references import_jobs(id) on delete set null;

create index if not exists idx_student_docs_import_job
  on student_documents(import_job_id)
  where import_job_id is not null;

-- ── 3. Per-student Drive + document status on student_import_sources ─────────
-- Track setup status per student (not only per job) so individual retries are
-- possible without touching other students.

alter table student_import_sources
  add column if not exists drive_status text
    check (drive_status in (
      'pending', 'in_progress', 'complete', 'failed', 'not_configured', 'not_applicable'
    )),
  add column if not exists drive_error    text,
  add column if not exists doc_status     text
    check (doc_status in (
      'pending', 'in_progress', 'complete', 'failed', 'not_applicable', 'no_attachments'
    )),
  add column if not exists doc_error      text,
  add column if not exists last_retry_at  timestamptz;

comment on column student_import_sources.drive_status  is 'Drive folder provisioning status for this student from this import.';
comment on column student_import_sources.doc_status    is 'Enrollment document transfer status for this student from this import.';
comment on column student_import_sources.last_retry_at is 'Timestamp of the most recent retry attempt.';
