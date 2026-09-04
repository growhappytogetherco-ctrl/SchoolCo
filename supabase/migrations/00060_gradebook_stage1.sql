-- Migration 00060: Gradebook Stage 1 — Foundation Tables
--
-- Canonical sources confirmed before writing this migration:
--   STUDENTS:          students table (00004_guardianship.sql)
--   STAFF/TEACHERS:    profiles + organization_members; teacher_id in curriculum_enrollments → profiles.id
--   COURSES:           curriculum_enrollments (00014_student_success.sql) — subject + curriculum_name per student
--   SCHOOL YEAR:       school_years (00059_student_finance.sql) — reused, not duplicated
--   GRADING PERIODS:   NEW — does not exist; calendar_events has date markers but no structured period rows
--   GRADE SCALES:      NEW — does not exist
--   COURSE SETTINGS:   NEW — grading method config per curriculum_enrollment
--
-- RLA org: 9fd43346-f43b-41d1-9b4c-fe8702471b07
-- RLA school year 2026-2027 dates from migration 00047:
--   Q1:  2026-08-10 → 2026-10-09   (Semester 1, quarter 1)
--   Q2:  2026-10-12 → 2026-12-18   (Semester 1, quarter 2)
--   S1:  2026-08-10 → 2026-12-18
--   Q3:  2027-01-04 → 2027-03-05   (Semester 2, quarter 3)
--   Q4:  2027-03-08 → 2027-05-25   (Semester 2, quarter 4)
--   S2:  2027-01-04 → 2027-05-25

-- ── 1. grading_periods ───────────────────────────────────────────────────────
-- One row per distinct grading window (quarter or semester) per school year per org.
-- period_type: 'quarter' | 'semester'
-- semester_number: 1 or 2 (which semester this period belongs to; null for semester-level rows)
-- sequence: display order within the school year (1=Q1, 2=Q2, 3=S1, 4=Q3, 5=Q4, 6=S2)

create table if not exists grading_periods (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references organizations(id) on delete cascade,
  school_year_id    uuid        not null references school_years(id) on delete cascade,
  name              text        not null,              -- 'Q1', 'Q2', 'Semester 1', etc.
  period_type       text        not null,              -- 'quarter' | 'semester'
  semester_number   int,                               -- 1 or 2; null for semester-level rows
  sequence          int         not null,              -- sort order within school year
  start_date        date        not null,
  end_date          date        not null,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint grading_periods_org_year_name_unique unique (organization_id, school_year_id, name),
  constraint grading_periods_type_check check (period_type in ('quarter', 'semester')),
  constraint grading_periods_semester_check check (semester_number in (1, 2) or semester_number is null),
  constraint grading_periods_date_order check (end_date >= start_date)
);

create index if not exists idx_grading_periods_org_year
  on grading_periods(organization_id, school_year_id);

create index if not exists idx_grading_periods_org_year_type
  on grading_periods(organization_id, school_year_id, period_type);

alter table grading_periods enable row level security;

drop policy if exists "staff_view_grading_periods"   on grading_periods;
drop policy if exists "admin_manage_grading_periods" on grading_periods;
drop policy if exists "admin_update_grading_periods" on grading_periods;
drop policy if exists "admin_delete_grading_periods" on grading_periods;

create policy "staff_view_grading_periods"
  on grading_periods for select
  using (is_org_member(organization_id));

create policy "admin_manage_grading_periods"
  on grading_periods for insert
  with check (is_org_admin(organization_id));

create policy "admin_update_grading_periods"
  on grading_periods for update
  using (is_org_admin(organization_id));

create policy "admin_delete_grading_periods"
  on grading_periods for delete
  using (is_org_admin(organization_id));

-- ── 2. grade_scales ──────────────────────────────────────────────────────────
-- Letter-grade thresholds per org. Stored as JSONB array for flexibility.
-- levels format: [{"letter":"A","min_pct":90,"max_pct":100,"gpa_points":4.0}, ...]

create table if not exists grade_scales (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references organizations(id) on delete cascade,
  name            text        not null,              -- e.g. 'Standard A–F'
  is_default      boolean     not null default false,
  levels          jsonb       not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint grade_scales_org_name_unique unique (organization_id, name)
);

create index if not exists idx_grade_scales_org on grade_scales(organization_id);

alter table grade_scales enable row level security;

drop policy if exists "staff_view_grade_scales"   on grade_scales;
drop policy if exists "admin_manage_grade_scales"  on grade_scales;
drop policy if exists "admin_update_grade_scales"  on grade_scales;
drop policy if exists "admin_delete_grade_scales"  on grade_scales;

create policy "staff_view_grade_scales"
  on grade_scales for select
  using (is_org_member(organization_id));

create policy "admin_manage_grade_scales"
  on grade_scales for insert
  with check (is_org_admin(organization_id));

create policy "admin_update_grade_scales"
  on grade_scales for update
  using (is_org_admin(organization_id));

create policy "admin_delete_grade_scales"
  on grade_scales for delete
  using (is_org_admin(organization_id));

-- ── 3. course_grade_settings ─────────────────────────────────────────────────
-- Per curriculum_enrollment grading configuration.
-- One row per (enrollment, school_year) — a student's subject can have different
-- settings in different years if they re-enroll.
-- grading_method: 'points' | 'weighted' | 'pass_fail' | 'rating'
-- weight_config: {"q1":25,"q2":25,"s1":50,"q3":25,"q4":25,"s2":50}  (pct weights)

create table if not exists course_grade_settings (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references organizations(id) on delete cascade,
  enrollment_id   uuid        not null references curriculum_enrollments(id) on delete cascade,
  school_year_id  uuid        not null references school_years(id) on delete cascade,
  grading_method  text        not null default 'points',
  grade_scale_id  uuid        references grade_scales(id) on delete set null,
  weight_config   jsonb       not null default '{"q1":25,"q2":25,"s1":50,"q3":25,"q4":25,"s2":50}',
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint course_grade_settings_unique unique (enrollment_id, school_year_id),
  constraint course_grade_settings_method_check
    check (grading_method in ('points', 'weighted', 'pass_fail', 'rating'))
);

create index if not exists idx_course_grade_settings_org_year
  on course_grade_settings(organization_id, school_year_id);

create index if not exists idx_course_grade_settings_enrollment
  on course_grade_settings(enrollment_id);

alter table course_grade_settings enable row level security;

drop policy if exists "staff_view_course_grade_settings"   on course_grade_settings;
drop policy if exists "staff_manage_course_grade_settings" on course_grade_settings;
drop policy if exists "staff_update_course_grade_settings" on course_grade_settings;
drop policy if exists "admin_delete_course_grade_settings" on course_grade_settings;

create policy "staff_view_course_grade_settings"
  on course_grade_settings for select
  using (is_org_member(organization_id));

create policy "staff_manage_course_grade_settings"
  on course_grade_settings for insert
  with check (is_staff_or_above(organization_id));

create policy "staff_update_course_grade_settings"
  on course_grade_settings for update
  using (is_staff_or_above(organization_id));

create policy "admin_delete_course_grade_settings"
  on course_grade_settings for delete
  using (is_org_admin(organization_id));

-- ── 4. Seed: RLA default grade scale ────────────────────────────────────────

DO $$
DECLARE
  rla_org_id uuid := '9fd43346-f43b-41d1-9b4c-fe8702471b07';
BEGIN
  insert into grade_scales (organization_id, name, is_default, levels)
  values (
    rla_org_id,
    'Standard A–F',
    true,
    '[
      {"letter":"A+","min_pct":97,"max_pct":100,"gpa_points":4.0},
      {"letter":"A", "min_pct":93,"max_pct":96.9,"gpa_points":4.0},
      {"letter":"A-","min_pct":90,"max_pct":92.9,"gpa_points":3.7},
      {"letter":"B+","min_pct":87,"max_pct":89.9,"gpa_points":3.3},
      {"letter":"B", "min_pct":83,"max_pct":86.9,"gpa_points":3.0},
      {"letter":"B-","min_pct":80,"max_pct":82.9,"gpa_points":2.7},
      {"letter":"C+","min_pct":77,"max_pct":79.9,"gpa_points":2.3},
      {"letter":"C", "min_pct":73,"max_pct":76.9,"gpa_points":2.0},
      {"letter":"C-","min_pct":70,"max_pct":72.9,"gpa_points":1.7},
      {"letter":"D+","min_pct":67,"max_pct":69.9,"gpa_points":1.3},
      {"letter":"D", "min_pct":63,"max_pct":66.9,"gpa_points":1.0},
      {"letter":"D-","min_pct":60,"max_pct":62.9,"gpa_points":0.7},
      {"letter":"F", "min_pct":0, "max_pct":59.9,"gpa_points":0.0}
    ]'
  )
  on conflict (organization_id, name) do nothing;

  RAISE NOTICE 'RLA default grade scale seeded.';
END $$;

-- ── 5. Seed: RLA 2026-2027 grading periods ───────────────────────────────────

DO $$
DECLARE
  rla_org_id   uuid := '9fd43346-f43b-41d1-9b4c-fe8702471b07';
  sy_id        uuid;
BEGIN
  -- Locate the 2026-2027 school year for RLA
  select id into sy_id
  from school_years
  where organization_id = rla_org_id
    and start_date = '2026-08-10'
  limit 1;

  if sy_id is null then
    RAISE NOTICE 'RLA 2026-2027 school year not found — skipping grading period seed.';
    return;
  end if;

  -- Quarters (semester_number indicates which semester they belong to)
  insert into grading_periods
    (organization_id, school_year_id, name, period_type, semester_number, sequence, start_date, end_date)
  values
    (rla_org_id, sy_id, 'Q1',         'quarter',  1, 1, '2026-08-10', '2026-10-09'),
    (rla_org_id, sy_id, 'Q2',         'quarter',  1, 2, '2026-10-12', '2026-12-18'),
    (rla_org_id, sy_id, 'Semester 1', 'semester', 1, 3, '2026-08-10', '2026-12-18'),
    (rla_org_id, sy_id, 'Q3',         'quarter',  2, 4, '2027-01-04', '2027-03-05'),
    (rla_org_id, sy_id, 'Q4',         'quarter',  2, 5, '2027-03-08', '2027-05-25'),
    (rla_org_id, sy_id, 'Semester 2', 'semester', 2, 6, '2027-01-04', '2027-05-25')
  on conflict (organization_id, school_year_id, name) do nothing;

  RAISE NOTICE 'RLA 2026-2027 grading periods seeded (Q1, Q2, S1, Q3, Q4, S2).';
END $$;
