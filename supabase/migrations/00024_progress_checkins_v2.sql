-- ── Migration 00024 — Teacher Progress Check-ins ─────────────────────────────
-- Extends academic_progress with fields specific to teacher observation logs:
-- check-in type, lesson/topic, narrative fields, parent follow-up, status.
-- Removes the mastery-centric constraint on confidence_level and replaces it
-- with a teacher-log-appropriate scale.

-- ── 1. Drop old confidence_level constraint (values no longer match) ──────────
alter table academic_progress
  drop constraint if exists acad_progress_confidence_check;

-- ── 2. Add new teacher check-in columns ──────────────────────────────────────
alter table academic_progress
  add column if not exists check_in_type            text,
  add column if not exists lesson_topic             text,
  add column if not exists what_was_worked_on       text,
  add column if not exists student_response         text,
  add column if not exists progress_observed        text,
  add column if not exists parent_follow_up_required boolean not null default false,
  add column if not exists parent_follow_up_notes   text,
  add column if not exists assigned_staff_id        uuid references profiles(id) on delete set null,
  add column if not exists due_date                 date,
  add column if not exists status                   text not null default 'open';

-- ── 3. Add check constraints for new enum-like columns ───────────────────────
alter table academic_progress
  add constraint acad_progress_checkin_type_check
    check (check_in_type in (
      'teacher_observation','one_on_one_session','intervention',
      'parent_follow_up','behavior_academic','skill_practice','general'
    ) or check_in_type is null);

alter table academic_progress
  add constraint acad_progress_status_check
    check (status in ('open','in_progress','completed'));

-- Updated confidence_level scale for teacher observations
alter table academic_progress
  add constraint acad_progress_confidence_check
    check (confidence_level in (
      'very_low','low','moderate','high','very_high',
      -- keep legacy values so old records don't break
      'not_confident','developing','confident','very_confident'
    ) or confidence_level is null);

-- ── 4. Index for fast timeline queries ───────────────────────────────────────
create index if not exists idx_acad_progress_timeline
  on academic_progress(student_id, recorded_date desc, created_at desc)
  where archived_at is null;

create index if not exists idx_acad_progress_followup
  on academic_progress(student_id, parent_follow_up_required, status)
  where archived_at is null and parent_follow_up_required = true;
