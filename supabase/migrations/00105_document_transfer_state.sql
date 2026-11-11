-- Migration 00105: Document transfer state tracking for idempotent retries
-- Adds transfer_state to student_documents so an interrupted upload can be
-- detected and reconciled without re-downloading or re-uploading.
-- Also adds jotform_identity_verified to student_import_sources so the
-- identity-verification step is tracked separately from the submission ID linkage.
--
-- Staging only — do not apply to production without explicit approval.

-- ── 1. Transfer state on student_documents ─────────────────────────────────────
-- Tracks where a document stands in the Jotform → Drive → DB pipeline.
-- 'uploading'  — Drive upload started (buffer downloaded, upload in flight)
-- 'uploaded'   — Drive upload complete, DB insert pending or failed
-- 'complete'   — Drive upload + DB insert both confirmed
-- 'failed'     — Terminal failure; requires admin retry

alter table student_documents
  add column if not exists transfer_state text
    check (transfer_state in ('uploading', 'uploaded', 'complete', 'failed'))
    default 'complete';

comment on column student_documents.transfer_state is
  'Pipeline state for documents imported from Jotform. complete = fully persisted.';

-- Index for orphan-recovery queries (find rows stuck in uploading/uploaded).
create index if not exists idx_student_docs_transfer_state
  on student_documents(transfer_state)
  where transfer_state in ('uploading', 'uploaded');

-- ── 2. Identity-verification columns on student_import_sources ─────────────────
-- Tracks whether the Jotform submission identity (name + DOB) was verified
-- against the SchoolCo student record before document transfer was authorized.

alter table student_import_sources
  add column if not exists jotform_identity_verified     boolean  default false,
  add column if not exists jotform_identity_mismatch     text,
  add column if not exists jotform_identity_checked_at   timestamptz;

comment on column student_import_sources.jotform_identity_verified is
  'True when the Jotform submission name+DOB was confirmed to match the SchoolCo student.';
comment on column student_import_sources.jotform_identity_mismatch is
  'Human-readable description of any name/DOB discrepancy found during identity verification.';
