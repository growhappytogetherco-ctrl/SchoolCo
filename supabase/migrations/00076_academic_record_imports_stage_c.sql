-- Migration 00076 — Academic Record Imports: Stage C AI fields
-- Extends the skeleton academic_record_imports table created in 00071
-- with columns needed for AI extraction tracking, raw output, and review.
-- All new columns use ADD COLUMN IF NOT EXISTS and are nullable.

alter table academic_record_imports
  add column if not exists provider           text,           -- 'anthropic' | 'openai' | 'google'
  add column if not exists model              text,           -- e.g. 'claude-opus-4'
  add column if not exists prompt_version     text,           -- semver string for the extraction prompt
  add column if not exists extraction_version int,            -- integer bump when extraction schema changes
  add column if not exists raw_extraction     jsonb,          -- full structured AI response (never trust unchecked)
  add column if not exists course_count       int,            -- number of proposed course records created
  add column if not exists reviewed_by        uuid references profiles(id) on delete set null,
  add column if not exists reviewed_at        timestamptz;

comment on column academic_record_imports.provider           is 'AI provider used for extraction (anthropic, openai, google). NULL for manual imports.';
comment on column academic_record_imports.model              is 'Exact model ID used (e.g. claude-opus-4). NULL for manual imports.';
comment on column academic_record_imports.prompt_version     is 'Semver of the extraction prompt template. Used to identify re-extraction needs.';
comment on column academic_record_imports.extraction_version is 'Schema version of the raw_extraction JSON. Increment when output structure changes.';
comment on column academic_record_imports.raw_extraction     is 'Raw structured extraction output from AI. Never auto-applied to verified records. Provider-agnostic JSONB.';
comment on column academic_record_imports.course_count       is 'Number of student_course_records rows created from this import (source_type=ai_proposed).';
comment on column academic_record_imports.reviewed_by        is 'Staff member who marked the import as fully reviewed.';
comment on column academic_record_imports.reviewed_at        is 'When the import was marked fully reviewed.';
