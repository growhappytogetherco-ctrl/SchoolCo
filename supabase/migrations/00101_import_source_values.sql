-- ============================================================
-- Migration 00101 — Import Source Values & History Tracking
-- SchoolCo Platform
-- ============================================================
-- Additive changes only:
--   1. Widen import_jobs.source CHECK to include jotform_xlsx,
--      csv_upload, and jotform_webhook (future)
--   2. Add source_system CHECK to student_import_sources
--   3. Add history-tracking columns to import_jobs for
--      the enhanced Import History interface
--
-- Does NOT touch students, families, households, guardianships,
-- profiles, finance, grades, attendance, or portal records.
-- Safe to apply to staging and production independently.
-- ============================================================

-- ── 1. Widen import_jobs.source CHECK ────────────────────────────────────────
--
-- PostgreSQL does not support ALTER CONSTRAINT; drop and recreate.
-- The existing valid values ('airtable_csv', 'airtable_api', 'manual')
-- are preserved.

alter table import_jobs
  drop constraint if exists import_jobs_source_check;

alter table import_jobs
  add constraint import_jobs_source_check
    check (source in (
      'airtable_csv',
      'airtable_api',
      'manual',
      'jotform_xlsx',
      'csv_upload',
      'jotform_webhook'
    ));

-- ── 2. Add source_system CHECK to student_import_sources ─────────────────────
--
-- This table had no explicit CHECK on source_system (only a default).
-- Add one now to enforce the same value set.

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

-- ── 3. Add enhanced history-tracking columns to import_jobs ──────────────────
--
-- All nullable with defaults so existing rows are unaffected.
-- Historical imports without these values display "Not tracked" in the UI.

alter table import_jobs
  add column if not exists selected_rows        int,
  add column if not exists failed_rows          int         default 0,
  add column if not exists drive_status         text
    check (drive_status in (
      'not_configured', 'pending', 'complete', 'partial', 'failed'
    )),
  add column if not exists document_status      text
    check (document_status in (
      'not_tracked', 'pending', 'complete', 'partial', 'failed'
    )),
  add column if not exists administrator_name   text;
