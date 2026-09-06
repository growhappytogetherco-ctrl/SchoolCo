-- ============================================================
-- Migration 00069 — Add academic_achievement_record type
-- SchoolCo Platform
-- ============================================================
-- Extends the academic_record_type check constraint to include
-- 'academic_achievement_record' — a cumulative historical record
-- that will later support AI-assisted grade/credit extraction.
-- ============================================================

-- Drop and recreate the check constraint to add the new value.
-- The column was added in 00068 without a named constraint, so we
-- drop by the auto-generated name pattern and add it back.

alter table student_documents
  drop constraint if exists student_documents_academic_record_type_check;

alter table student_documents
  add constraint student_documents_academic_record_type_check
    check (academic_record_type in (
      'progress_report',
      'report_card',
      'transcript',
      'academic_achievement_record',
      'academic_summary',
      'assessment_report',
      'other_academic'
    ));

comment on column student_documents.academic_record_type is
  'Type of academic record. academic_achievement_record = cumulative historical record for AI-assisted import.';
