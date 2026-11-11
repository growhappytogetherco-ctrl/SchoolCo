-- Migration 00104: Jotform submission linkage + document deduplication
-- Adds jotform_submission_id to student_import_sources for verified submission linking.
-- Adds jotform_field_id + source_file_hash to student_documents for durable deduplication.
-- Staging only — do not apply to production without explicit approval.

-- ── 1. Verified Jotform submission ID on per-student import record ─────────────

alter table student_import_sources
  add column if not exists jotform_submission_id text,
  add column if not exists jotform_verified_at   timestamptz,
  add column if not exists jotform_linked_by     uuid references profiles(id) on delete set null;

comment on column student_import_sources.jotform_submission_id is
  'Verified Jotform submission ID for this student. Set by admin after manual or automated linkage verification. Never inferred from name alone.';
comment on column student_import_sources.jotform_verified_at is
  'When the Jotform submission ID was verified and stored.';

-- Prevent two students in the same org sharing the same submission ID.
create unique index if not exists idx_sis_jotform_submission_org
  on student_import_sources(organization_id, jotform_submission_id)
  where jotform_submission_id is not null;

-- ── 2. Durable deduplication columns on student_documents ─────────────────────

alter table student_documents
  add column if not exists jotform_field_id  text,
  add column if not exists source_file_hash  text,
  add column if not exists source_file_id    text;

comment on column student_documents.jotform_field_id is
  'Jotform field ID from which this attachment was downloaded (prevents re-download of same field).';
comment on column student_documents.source_file_hash is
  'SHA-256 hex digest of the file content at transfer time (prevents duplicate uploads of the same content).';
comment on column student_documents.source_file_id is
  'Source-system identifier for the file (e.g. Google Drive file ID of the destination, or Jotform URL fingerprint).';

-- Unique index on (student_id, import_job_id, jotform_field_id) — prevents re-uploading
-- the same Jotform field attachment across retries.
create unique index if not exists idx_student_docs_jotform_field
  on student_documents(student_id, import_job_id, jotform_field_id)
  where jotform_field_id is not null and import_job_id is not null;

-- Unique index on (student_id, source_file_hash) — prevents duplicate files
-- across different import jobs (content-addressed deduplication).
create unique index if not exists idx_student_docs_content_hash
  on student_documents(student_id, source_file_hash)
  where source_file_hash is not null;
