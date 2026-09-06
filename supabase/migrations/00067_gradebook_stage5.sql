-- Stage 5: Progress Reports + Report Cards
-- Adds student_reports and student_report_courses tables.
-- Snapshots preserve official record even if underlying data changes later.

-- ── student_reports ───────────────────────────────────────────────────────────

create table if not exists student_reports (
  id                          uuid         primary key default gen_random_uuid(),
  organization_id             uuid         not null references organizations(id) on delete cascade,
  student_id                  uuid         not null references students(id) on delete cascade,
  school_year_id              uuid         not null references school_years(id) on delete restrict,
  grading_period_id           uuid         references grading_periods(id) on delete restrict,
  report_type                 text         not null
                                check (report_type in ('progress', 'quarter', 'semester')),
  status                      text         not null default 'draft'
                                check (status in ('draft', 'issued', 'superseded')),
  issued_at                   timestamptz,
  issued_by_profile_id        uuid         references profiles(id),
  supersedes_report_id        uuid         references student_reports(id),
  -- Snapshotted at issue time (null until issued)
  student_name_snapshot       text,
  grade_level_snapshot        text,
  school_year_label_snapshot  text,
  period_name_snapshot        text,
  -- Attendance snapshot: { present, absent, tardy, excused, early_dismissal }
  attendance_snapshot         jsonb,
  general_comment             text,
  created_by_profile_id       uuid         references profiles(id),
  created_at                  timestamptz  not null default now(),
  updated_at                  timestamptz  not null default now()
);

create index if not exists idx_student_reports_student_org
  on student_reports(organization_id, student_id, status, created_at desc);
create index if not exists idx_student_reports_period
  on student_reports(grading_period_id);

-- ── student_report_courses ────────────────────────────────────────────────────

create table if not exists student_report_courses (
  id                      uuid         primary key default gen_random_uuid(),
  report_id               uuid         not null references student_reports(id) on delete cascade,
  course_section_id       uuid         references course_sections(id) on delete set null,
  -- Snapshotted values
  course_name_snapshot    text         not null,
  subject_snapshot        text,
  teacher_name_snapshot   text,
  grading_method_snapshot text         not null default 'points',
  percentage_snapshot     numeric(6,3),
  letter_grade_snapshot   text,
  grade_state_snapshot    text         not null default 'no_grade',
  missing_count_snapshot  integer      not null default 0,
  -- Optional quarter breakdown for semester reports (jsonb array of {name, state, pct, letter})
  quarter_grades_snapshot jsonb,
  teacher_comment         text,
  sort_order              integer      not null default 0,
  created_at              timestamptz  not null default now(),
  updated_at              timestamptz  not null default now()
);

create index if not exists idx_student_report_courses_report
  on student_report_courses(report_id, sort_order);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table student_reports enable row level security;
alter table student_report_courses enable row level security;

-- Staff: full CRUD within their org
drop policy if exists "staff_manage_reports" on student_reports;
create policy "staff_manage_reports"
  on student_reports for all
  using  (is_staff_or_above(organization_id))
  with check (is_staff_or_above(organization_id));

-- Parents: read ONLY issued reports for their guardian-linked students
drop policy if exists "parent_view_issued_reports" on student_reports;
create policy "parent_view_issued_reports"
  on student_reports for select
  using (
    status = 'issued'
    and student_id in (select get_guardian_student_ids(organization_id))
  );

-- student_report_courses follows the same access as its parent report
drop policy if exists "staff_manage_report_courses" on student_report_courses;
create policy "staff_manage_report_courses"
  on student_report_courses for all
  using (
    exists (
      select 1 from student_reports r
      where r.id = report_id
        and is_staff_or_above(r.organization_id)
    )
  )
  with check (
    exists (
      select 1 from student_reports r
      where r.id = report_id
        and is_staff_or_above(r.organization_id)
    )
  );

drop policy if exists "parent_view_issued_report_courses" on student_report_courses;
create policy "parent_view_issued_report_courses"
  on student_report_courses for select
  using (
    exists (
      select 1 from student_reports r
      where r.id = report_id
        and r.status = 'issued'
        and r.student_id in (select get_guardian_student_ids(r.organization_id))
    )
  );

-- ── Triggers ─────────────────────────────────────────────────────────────────

drop trigger if exists set_student_reports_updated_at on student_reports;
create trigger set_student_reports_updated_at
  before update on student_reports
  for each row execute function update_updated_at_column();

drop trigger if exists set_student_report_courses_updated_at on student_report_courses;
create trigger set_student_report_courses_updated_at
  before update on student_report_courses
  for each row execute function update_updated_at_column();
