-- ============================================================
-- Migration 00102 — student_import_sources source_system CHECK
-- SchoolCo Platform
-- ============================================================
-- Adds the source_system CHECK constraint to student_import_sources.
-- Separated from 00101 because staging had an existing row with
-- source_system = 'jotform_csv' that would have violated a stricter list.
--
-- Includes all values found in staging plus all canonical import sources.
-- Additive only — does not touch any existing rows.
-- ============================================================

alter table student_import_sources
  drop constraint if exists student_import_sources_source_system_check;

alter table student_import_sources
  add constraint student_import_sources_source_system_check
    check (source_system in (
      'airtable_csv',
      'airtable_api',
      'manual',
      'jotform_xlsx',
      'csv_upload',
      'jotform_webhook',
      'jotform_csv'
    ));
