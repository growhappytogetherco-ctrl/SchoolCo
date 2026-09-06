-- Migration 00065: Remove rigid subject CHECK constraints from course_sections
--                  and curriculum_enrollments.
--
-- ROOT CAUSE:
--   Both course_sections and curriculum_enrollments had an inline CHECK constraint
--   limiting subject to a narrow hard-coded enum:
--     ('math','ela','science','history','bible','spanish',
--      'elective','leadership','entrepreneurship','art','music','pe','other')
--
--   The course creation UI legitimately offered 'geography' (and potentially others)
--   as selectable subjects. Submitting a geography course hit the constraint and
--   returned a raw Supabase error to the admin.
--
-- WHY REMOVING THE CONSTRAINT IS CORRECT:
--   SchoolCo serves a homeschool co-op that adds new subjects regularly.
--   Requiring a Supabase migration every time a legitimate subject is added is
--   operationally brittle and unnecessary. Subject validation belongs at the
--   application layer (the SUBJECTS constant in CreateCourseForm) where it can
--   be maintained without a database migration.
--
--   The DB still enforces: NOT NULL, org scoping, FK integrity, RLS, and the
--   unique constraint on (org, school_year, subject, course_name). Only the
--   rigid enum is removed.
--
-- SCOPE:
--   Both tables are fixed together because addStudentToCourse() creates
--   curriculum_enrollment rows using the same subject value as the course section.
--   If course_sections allows a subject, curriculum_enrollments must too.
--
-- PRESERVED:
--   - All NOT NULL constraints
--   - All FK constraints
--   - All RLS policies
--   - All other check constraints (status checks, etc.)
--   - Unique constraint on (org, school_year, subject, course_name)
--   - All indexes

-- ── 1. Drop course_sections_subject_check ────────────────────────────────────

ALTER TABLE course_sections
  DROP CONSTRAINT IF EXISTS course_sections_subject_check;

-- ── 2. Drop curriculum_enrollments_subject_check ─────────────────────────────
-- (The inline check constraint PostgreSQL auto-names as curriculum_enrollments_subject_check)

ALTER TABLE curriculum_enrollments
  DROP CONSTRAINT IF EXISTS curriculum_enrollments_subject_check;

-- ── 3. Drop academic_progress and assessments subject constraints if they exist
-- These tables also used the same subject list; drop for consistency so subject
-- values stay in sync across all tables without future constraint conflicts.

ALTER TABLE academic_progress
  DROP CONSTRAINT IF EXISTS academic_progress_subject_check;

ALTER TABLE assessments
  DROP CONSTRAINT IF EXISTS assessments_subject_check;
