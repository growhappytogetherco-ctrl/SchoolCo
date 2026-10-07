-- Migration 00080: Add full_year support to grading_periods
-- Extends the period_type check constraint and inserts a canonical Full Year
-- grading period for the 2026-2027 school year.
--
-- SEMANTICS (unchanged from 00079):
--   NULL grading_period_id on curriculum_enrollments = "Term not specified"
--   NULL must never auto-display as "Full Year" or write "full_year" into SCRs.
--   Full Year is only assigned when grading_period_id explicitly references this row.

-- ── 1. Extend period_type check constraint ────────────────────────────────────

alter table grading_periods
  drop constraint if exists grading_periods_type_check;

alter table grading_periods
  add constraint grading_periods_type_check
  check (period_type in ('quarter', 'semester', 'full_year'));

-- ── 2. Insert canonical Full Year row (idempotent) ────────────────────────────
-- Derives start/end from the school year's own quarter/semester rows.
-- Exactly one Full Year row per school_year_id is guaranteed by the NOT EXISTS guard.

do $$
declare
  v_school_year_id  uuid;
  v_org_id          uuid;
  v_start_date      date;
  v_end_date        date;
  v_max_seq         int;
begin
  -- Find the school_year_id that has existing grading periods (current school year).
  -- Use the school_year_id that owns the most grading periods as the canonical one.
  select school_year_id, organization_id,
         min(start_date), max(end_date), max(sequence)
  into   v_school_year_id, v_org_id, v_start_date, v_end_date, v_max_seq
  from   grading_periods
  group  by school_year_id, organization_id
  order  by count(*) desc
  limit  1;

  if v_school_year_id is null then
    raise notice '00080: no grading periods found — skipping Full Year insert';
    return;
  end if;

  -- Guard: skip if a full_year row already exists for this school year.
  if exists (
    select 1 from grading_periods
    where  school_year_id = v_school_year_id
    and    period_type    = 'full_year'
  ) then
    raise notice '00080: Full Year row already exists for school_year_id %, skipping', v_school_year_id;
    return;
  end if;

  insert into grading_periods (
    organization_id, school_year_id,
    name, period_type,
    semester_number,          -- null: full year spans both semesters
    sequence,                 -- one beyond the last quarter/semester row
    start_date, end_date,
    is_active
  ) values (
    v_org_id, v_school_year_id,
    'Full Year', 'full_year',
    null,
    v_max_seq + 1,
    v_start_date, v_end_date,
    true
  );

  raise notice '00080: inserted Full Year grading period for school_year_id % (%→%)',
    v_school_year_id, v_start_date, v_end_date;
end $$;
