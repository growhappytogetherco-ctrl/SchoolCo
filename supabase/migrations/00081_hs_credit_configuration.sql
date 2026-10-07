-- Migration 00081: Configure HS credit overrides for active HS students
-- Sets enrollment-level credit overrides on curriculum_enrollments.
--
-- Scope:
--   - Four active HS students ONLY (enrolled, not withdrawn)
--   - Khloe McBride (withdrawn) is explicitly excluded
--   - Section defaults remain false; these are enrollment-level overrides
--   - K–8 students not touched (null enrollment + false section = safe)
--   - Briyanna Sears (8th, HS Sea Perch ROV) gets explicit false override
--
-- Students configured:
--   Jeina Inoue Payne   (10th, enrolled) — 9 courses
--   Jezziyn Farr-Saint Fleur (11th, enrolled) — 7 courses
--   Lily Hasibar        (10th, enrolled) — 9 courses
--   Stevie Beckham      (10th, enrolled) — 9 courses
--
-- This migration does NOT:
--   - Create student_course_records
--   - Finalize any course
--   - Change GPA or earned credits
--   - Touch section-level defaults

do $$
declare
  v_s1_id      uuid;   -- Semester 1 grading period id
  v_fy_id      uuid;   -- Full Year grading period id
begin

  -- Resolve Semester 1 grading period
  select id into v_s1_id
  from   grading_periods
  where  period_type = 'semester'
  and    semester_number = 1
  limit  1;

  if v_s1_id is null then
    raise exception '00081: Semester 1 grading period not found — aborting';
  end if;

  -- Resolve Full Year grading period (inserted by 00080)
  select id into v_fy_id
  from   grading_periods
  where  period_type = 'full_year'
  limit  1;

  if v_fy_id is null then
    raise exception '00081: Full Year grading period not found — ensure 00080 ran first';
  end if;

  raise notice '00081: Semester 1 id=%, Full Year id=%', v_s1_id, v_fy_id;

  -- ── Jeina Inoue Payne (10th, enrolled) ──────────────────────────────────────
  -- Geography
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '14e5c51d-7622-406a-a37a-64146091aab7';
  -- KingDurance PE
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '2da7280d-8d80-44d9-822b-dac39268a4b2';
  -- RLA Bible
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = 'f0628b76-af14-478e-b406-529a848e817b';
  -- Algebra 1
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '264de52b-af80-4ecc-9cc8-567299db03ca';
  -- English 2
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '7b8ed7c6-161b-4847-ae41-ec4bfceb6e3c';
  -- RLA Public Speaking
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '2a088a0b-92f9-4a1d-812a-551016a10e7c';
  -- RLA Science
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '53b4425a-cf6b-44af-8434-34c4adc97a72';
  -- Entrepreneurship 101
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '303f141a-4ede-4ed2-ac96-cbdd247fc7c3';
  -- HS Sea Perch ROV (Full Year, 1.0 credit)
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 1.0,
    course_level                     = 'standard',
    grading_period_id                = v_fy_id
  where id = '4418d43a-151f-4ad3-9f6f-d5df0e331703';

  -- ── Jezziyn Farr-Saint Fleur (11th, enrolled) ────────────────────────────────
  -- Geography
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '96343d5a-0e22-49da-a5b8-5291ba5bfbfd';
  -- KingDurance PE
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '52ad97cf-83d4-4bc6-a2cf-80b2e552c9e7';
  -- RLA Bible
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '35dca149-36e6-4f36-b47c-78e62d511cbd';
  -- RLA Public Speaking
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '264c96af-b825-436c-b58b-534f18040213';
  -- RLA Science
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = 'cd6fc573-6a38-416c-9d5e-52edf8e6f9b1';
  -- Entrepreneurship 101
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '89e01625-1b1f-44db-885d-f0895936ded5';
  -- HS Sea Perch ROV (Full Year, 1.0 credit)
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 1.0,
    course_level                     = 'standard',
    grading_period_id                = v_fy_id
  where id = 'e01270bb-967f-403a-affe-3cdeb66e3a9f';

  -- ── Lily Hasibar (10th, enrolled) ────────────────────────────────────────────
  -- Geography
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '10e3c00f-7b4b-4c2f-aa2c-dd7001e22a05';
  -- KingDurance PE
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '2f91eed0-8b0e-4cd5-a872-7b2af09055fd';
  -- RLA Bible
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '66a064ee-3ed8-4cf0-ac4e-c920091e01ad';
  -- Algebra 1
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = 'ac799d96-6915-4b09-ab57-f3ec10001d84';
  -- English 1
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = 'd8386db0-2ccd-4542-8e2d-819acd0c2391';
  -- RLA Public Speaking
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '605d3f4e-befc-40fc-92d6-40b469d85032';
  -- RLA Science
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = 'adecb7ea-3a1c-40c6-85aa-c239cd314ce3';
  -- Entrepreneurship 101
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = 'da6e18e4-60b4-45d6-a442-c17995903e49';
  -- HS Sea Perch ROV (Full Year, 1.0 credit)
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 1.0,
    course_level                     = 'standard',
    grading_period_id                = v_fy_id
  where id = '8e1a6a8d-14e5-4f96-bf0b-edbf52b6e902';

  -- ── Stevie Beckham (10th, enrolled) ──────────────────────────────────────────
  -- KingDurance PE
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = 'ae2e44b6-9b65-4707-ad53-fb2adf83b77e';
  -- RLA Bible
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '3775b96f-ba03-4145-a6f3-f9748e2216b5';
  -- Algebra 1
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '376397c9-25d6-410e-9b47-ca72db64f665';
  -- English 1
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '8b969fd2-d85d-4efe-a0eb-1923f85b9e24';
  -- RLA Public Speaking
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '9634ee8a-c8e3-40fd-8538-e28fdeddd184';
  -- RLA Science
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = 'd5128edd-42ca-494d-8d3f-afc719d0869b';
  -- Entrepreneurship 101
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = 'f00fe171-e9eb-43ac-a769-bd45ce1b2295';
  -- Geography
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 0.5,
    course_level                     = 'standard',
    grading_period_id                = v_s1_id
  where id = '2034f3d7-bddc-406d-9430-cba5d1009832';
  -- HS Sea Perch ROV (Full Year, 1.0 credit)
  update curriculum_enrollments set
    counts_toward_high_school_credit = true,
    credits_attempted                = 1.0,
    course_level                     = 'standard',
    grading_period_id                = v_fy_id
  where id = '25b57649-4271-45f5-a195-66c9355294d6';

  -- ── Briyanna Sears (8th, HS Sea Perch ROV) — explicit NO credit ──────────────
  -- Explicit false protects this 8th-grade student in the mixed HS section.
  -- credits/level/gp left null (no credit, no amount, no term).
  update curriculum_enrollments set
    counts_toward_high_school_credit = false,
    credits_attempted                = null,
    course_level                     = null,
    grading_period_id                = null
  where id = 'cf7f7dd8-5951-4761-8dfa-9b2f60f97b0f';

  raise notice '00081: HS credit configuration complete';
end $$;
