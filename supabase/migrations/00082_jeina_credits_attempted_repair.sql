-- Migration 00082: Repair null credits_attempted on Jeina Inoue Payne's historical SCRs
--
-- Background
-- ----------
-- Jeina transferred to Rising Leaders Academy with 8 verified completed courses from
-- Florida Virtual School (FLVS) and Brevard Virtual School. These were imported from
-- official transcripts and individually reviewed/verified by staff.
--
-- Each SCR has credits_earned = 0.5, counts_toward_high_school_credit = true, and
-- completion_status = 'completed'. However, credits_attempted = null was not populated
-- by the importer. This null blocks calculateGpa() which requires credits_attempted > 0.
--
-- Evidence supporting credits_attempted = 0.5 for all 8 records
-- -------------------------------------------------------------
-- 1. credits_earned = 0.5 on every row, set by the AI importer from the actual transcript PDFs
-- 2. All courses are standard Florida DOE semester courses (each term = 0.5 credit):
--      1001310  ENG 1 (Term 1)              0.5 cr
--      1001310  ENG 1 (Term 2)              0.5 cr
--      1001340  ENG 2 (Term 1)              0.5 cr
--      1200310  Algebra 1                   0.5 cr
--      2000310  Biology 1 (Term 1)          0.5 cr
--      2000310  Biology 1 (Term 2)          0.5 cr
--      2102371  PERS FIN & MON MGMT (T1)    0.5 cr
--      2109310  World History               0.5 cr
-- 3. source_notes confirm "Enrollment Status: Complete" with specific completion dates
-- 4. For completed FL virtual school term courses, credits_attempted = credits_earned
--    (a student who completed the course attempted exactly the credits they earned)
-- 5. Import source status: reviewed (FLVS) and completed (Brevard VS)
--
-- Scope: exactly 8 rows identified by UUID. No other SCRs touched.
-- Authorization: Authorized by platform_admin; migration file in git is the audit record.
-- This migration is idempotent (SET ... WHERE id = ...).

update student_course_records
set credits_attempted = 0.5
where id in (
  '20a25916-d355-463c-8d13-44675d6921ee',  -- ENG 1 (Term 1),          A, 91%, FLVS
  '1ab92f77-95af-494a-b531-822222eb959e',  -- PERS FIN & MON MGMT T1,  C, 79%, Brevard VS
  '84382bcb-d29b-49ad-97a2-ed41faa2ab64',  -- ENG 1 (Term 2),          C, 79%, FLVS
  '8e6bba8e-559c-44d5-9677-fe7045f22a45',  -- ENG 2 (Term 1),          C, 70%, FLVS
  '6c2895f6-ec3d-4896-b300-2ea9f8da26fa',  -- World History,           B, 87%, Brevard VS
  'fbc77be3-200f-4424-9a1d-13c1ba09cad4',  -- Biology 1 (Term 1),      C, 78%, Brevard VS
  '8485a10b-d91d-42f3-bc0d-dd4f1f59fdfe',  -- Biology 1 (Term 2),      B, 85%, Brevard VS
  '9b5e2064-bbe9-4a5b-b7b6-7ded8e79c565'   -- Algebra 1,               D, 64%, FLVS
)
and credits_attempted is null
and credits_earned = 0.5
and counts_toward_high_school_credit = true;

-- Expected: 8 rows updated. If any row was already updated (re-run), the WHERE clause
-- safely skips it (credits_attempted is null check). The credits_earned guard ensures
-- we only touch the verified 0.5-credit rows.
