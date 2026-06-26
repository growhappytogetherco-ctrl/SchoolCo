-- ============================================================
-- Migration 00014 — Student Success & Growth System
-- SchoolCo Platform
-- ============================================================
-- Adds:
--   1. student_goals       — family goal / success plan entries
--   2. support_flags       — permanent staff-only support reminders
--   3. curriculum_enrollments — active curriculum per subject
--   4. academic_progress   — lesson/milestone history snapshots
--   5. assessments         — BOY/MOY/EOY + additional assessments
-- ============================================================

-- ── 1. student_goals ─────────────────────────────────────────────────────────

create table if not exists student_goals (
  id                  uuid          primary key default gen_random_uuid(),
  organization_id     uuid          not null references organizations(id) on delete cascade,
  student_id          uuid          not null references students(id) on delete cascade,
  created_by          uuid          references profiles(id),
  updated_by          uuid          references profiles(id),

  -- Goal content
  goal_text           text          not null,
  category            text          not null default 'other'
    check (category in (
      'confidence','perseverance','independence','critical_thinking',
      'math','reading','writing','leadership','organization',
      'social','behavioral','health','family','other'
    )),
  priority            text          not null default 'normal'
    check (priority in ('low','normal','high','urgent')),

  -- Timeline
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),
  target_review_date  date,
  last_reviewed_at    timestamptz,
  last_reviewed_by    uuid          references profiles(id),

  -- Progress
  status              text          not null default 'active'
    check (status in ('active','achieved','paused','dropped')),
  progress_pct        smallint      not null default 0 check (progress_pct between 0 and 100),

  -- Observations
  staff_observations  text,
  parent_comments     text,         -- reserved for future parent portal

  -- Visibility
  visibility          text          not null default 'parent_visible'
    check (visibility in ('internal','parent_visible','admin_only'))
);

create index if not exists idx_goals_student    on student_goals(student_id, status);
create index if not exists idx_goals_review     on student_goals(organization_id, target_review_date) where status = 'active';

create trigger student_goals_updated_at
  before update on student_goals
  for each row execute function update_updated_at_column();

alter table student_goals enable row level security;

create policy "staff_view_goals"   on student_goals for select using (is_org_member(organization_id));
create policy "staff_insert_goals" on student_goals for insert with check (is_org_member(organization_id));
create policy "staff_update_goals" on student_goals for update using (is_org_member(organization_id));
create policy "admin_delete_goals" on student_goals for delete using (is_org_admin(organization_id));

-- ── 2. support_flags ─────────────────────────────────────────────────────────
-- Standing support reminders — NEVER exposed to parents.
-- These are permanent instructions for any staff who opens the profile.
-- Distinct from staff_notes (event-based) — these are ongoing flags.

create table if not exists support_flags (
  id                  uuid          primary key default gen_random_uuid(),
  organization_id     uuid          not null references organizations(id) on delete cascade,
  student_id          uuid          not null references students(id) on delete cascade,
  created_by          uuid          references profiles(id),
  updated_by          uuid          references profiles(id),

  -- Content
  title               text          not null,
  description         text,
  category            text          not null default 'other'
    check (category in (
      'learning','behavioral','medical','environmental',
      'safety','social','family','communication','other'
    )),
  priority            text          not null default 'normal'
    check (priority in ('low','normal','high','critical')),
  color               text          not null default 'gray'
    check (color in ('gray','red','yellow','blue','green','purple','orange')),

  -- Display control
  is_pinned           boolean       not null default false,
  show_on_snapshot    boolean       not null default false,   -- appears in profile header area
  expires_at          date,                                   -- null = never expires

  -- Always staff only — no parent visibility column intentionally
  -- (removing the field removes any temptation to set it)

  -- Audit
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

create index if not exists idx_support_flags_student  on support_flags(student_id, is_pinned desc, priority desc);
create index if not exists idx_support_flags_snapshot on support_flags(student_id, show_on_snapshot) where show_on_snapshot = true;
create index if not exists idx_support_flags_expiry   on support_flags(organization_id, expires_at) where expires_at is not null;

create trigger support_flags_updated_at
  before update on support_flags
  for each row execute function update_updated_at_column();

alter table support_flags enable row level security;

-- Support flags are STAFF ONLY at the policy level — no parent select ever
create policy "staff_all_support_flags"
  on support_flags for all
  using (is_org_member(organization_id))
  with check (is_org_member(organization_id));

-- ── 3. curriculum_enrollments ─────────────────────────────────────────────────

create table if not exists curriculum_enrollments (
  id                  uuid          primary key default gen_random_uuid(),
  organization_id     uuid          not null references organizations(id) on delete cascade,
  student_id          uuid          not null references students(id) on delete cascade,
  created_by          uuid          references profiles(id),
  updated_by          uuid          references profiles(id),

  -- Subject / curriculum identity
  subject             text          not null
    check (subject in (
      'math','ela','science','history','bible','spanish',
      'elective','leadership','entrepreneurship','art','music','pe','other'
    )),
  curriculum_name     text          not null,
  publisher           text,

  -- Current position
  current_level       text,         -- e.g. "5/4", "Level 3", "Grade 2"
  current_unit        text,
  current_lesson      text,         -- e.g. "38", "Unit 2 Lesson 5"

  -- Teacher
  teacher_id          uuid          references profiles(id),
  teacher_name        text,         -- denormalized for display speed

  -- Timeline
  start_date          date,
  expected_completion date,
  completion_pct      smallint      default 0 check (completion_pct between 0 and 100),
  status              text          not null default 'active'
    check (status in ('active','completed','paused','dropped')),

  -- Visibility
  visibility          text          not null default 'parent_visible'
    check (visibility in ('internal','parent_visible','admin_only')),

  -- Audit
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

create index if not exists idx_curriculum_student on curriculum_enrollments(student_id, status);
create index if not exists idx_curriculum_org     on curriculum_enrollments(organization_id, subject);

create trigger curriculum_enrollments_updated_at
  before update on curriculum_enrollments
  for each row execute function update_updated_at_column();

alter table curriculum_enrollments enable row level security;

create policy "staff_view_curriculum"   on curriculum_enrollments for select using (is_org_member(organization_id));
create policy "staff_manage_curriculum" on curriculum_enrollments for insert with check (is_org_member(organization_id));
create policy "staff_update_curriculum" on curriculum_enrollments for update using (is_org_member(organization_id));

-- ── 4. academic_progress ─────────────────────────────────────────────────────
-- Immutable lesson/milestone snapshots.
-- A new row is added each time staff records a progress check-in.
-- Never updated — only inserted. Gives us the full history timeline.

create table if not exists academic_progress (
  id                        uuid          primary key default gen_random_uuid(),
  organization_id           uuid          not null references organizations(id) on delete cascade,
  student_id                uuid          not null references students(id) on delete cascade,
  curriculum_enrollment_id  uuid          references curriculum_enrollments(id) on delete set null,
  recorded_by               uuid          references profiles(id),

  -- Snapshot at time of recording
  subject                   text          not null,
  curriculum_name           text,
  level                     text,
  lesson                    text,
  mastery_pct               smallint      check (mastery_pct between 0 and 100),

  -- Context
  notes                     text,
  assessment_linked_id      uuid,         -- optional link to an assessment record

  -- When
  recorded_date             date          not null default current_date,
  created_at                timestamptz   not null default now()
  -- Intentionally no updated_at — this table is append-only
);

create index if not exists idx_acad_progress_student  on academic_progress(student_id, subject, recorded_date desc);
create index if not exists idx_acad_progress_org_date on academic_progress(organization_id, recorded_date desc);

alter table academic_progress enable row level security;

create policy "staff_view_progress"   on academic_progress for select using (is_org_member(organization_id));
create policy "staff_insert_progress" on academic_progress for insert with check (is_org_member(organization_id));
create policy "admin_delete_progress" on academic_progress for delete using (is_org_admin(organization_id));

-- ── 5. assessments ───────────────────────────────────────────────────────────

create table if not exists assessments (
  id                  uuid          primary key default gen_random_uuid(),
  organization_id     uuid          not null references organizations(id) on delete cascade,
  student_id          uuid          not null references students(id) on delete cascade,
  created_by          uuid          references profiles(id),
  updated_by          uuid          references profiles(id),

  -- Identity
  subject             text          not null,
  assessment_name     text          not null,
  assessment_period   text          not null default 'additional'
    check (assessment_period in ('boy','moy','eoy','additional')),
  assessment_date     date          not null,

  -- Scores
  score_raw           numeric(6,2),
  score_max           numeric(6,2),
  score_pct           numeric(5,2),       -- auto-computed or manual
  grade_equivalent    text,               -- "3.2", "K.8"
  performance_level   text
    check (performance_level in ('advanced','proficient','approaching','below','far_below')),
  stanine             smallint,
  percentile_rank     smallint,

  -- Content
  teacher_comments    text,
  google_drive_file_id   text,
  google_drive_file_url  text,

  -- Visibility
  visibility          text          not null default 'internal'
    check (visibility in ('internal','parent_visible','admin_only')),

  -- Audit
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

create index if not exists idx_assessments_student  on assessments(student_id, subject, assessment_date desc);
create index if not exists idx_assessments_org_date on assessments(organization_id, assessment_date desc);
create index if not exists idx_assessments_period   on assessments(student_id, assessment_period, assessment_date desc);

create trigger assessments_updated_at
  before update on assessments
  for each row execute function update_updated_at_column();

alter table assessments enable row level security;

create policy "staff_view_assessments"   on assessments for select using (is_org_member(organization_id));
create policy "staff_manage_assessments" on assessments for insert with check (is_org_member(organization_id));
create policy "staff_update_assessments" on assessments for update using (is_org_member(organization_id));
create policy "admin_delete_assessments" on assessments for delete using (is_org_admin(organization_id));

-- ── 6. Dashboard alert view ───────────────────────────────────────────────────
-- A SQL function that returns alerts for a given org.
-- Used by the dashboard alerts panel.

create or replace function get_student_alerts(p_org_id uuid)
returns table (
  alert_type    text,
  student_id    uuid,
  student_name  text,
  message       text,
  severity      text,
  action_url    text
)
language sql stable security definer as $$
  -- Goals overdue for review
  select
    'goal_overdue'::text,
    g.student_id,
    s.first_name || ' ' || s.last_name,
    'Goal "' || g.goal_text || '" is overdue for review',
    'high'::text,
    '/dashboard/students/' || g.student_id || '?tab=goals'
  from student_goals g
  join students s on s.id = g.student_id
  where g.organization_id = p_org_id
    and g.status = 'active'
    and g.target_review_date < current_date

  union all

  -- No assessment in last 60 days for enrolled students
  select
    'assessment_overdue'::text,
    s.id,
    s.first_name || ' ' || s.last_name,
    'No assessment recorded in 60+ days',
    'normal'::text,
    '/dashboard/students/' || s.id || '?tab=academics'
  from students s
  where s.organization_id = p_org_id
    and s.enrollment_status = 'enrolled'
    and not exists (
      select 1 from assessments a
      where a.student_id = s.id
        and a.assessment_date >= current_date - 60
    )

  union all

  -- Curriculum not updated in 30 days
  select
    'curriculum_stale'::text,
    ce.student_id,
    s.first_name || ' ' || s.last_name,
    'No progress recorded for ' || ce.subject || ' in 30+ days',
    'low'::text,
    '/dashboard/students/' || ce.student_id || '?tab=academics'
  from curriculum_enrollments ce
  join students s on s.id = ce.student_id
  where ce.organization_id = p_org_id
    and ce.status = 'active'
    and not exists (
      select 1 from academic_progress ap
      where ap.student_id = ce.student_id
        and ap.subject = ce.subject
        and ap.recorded_date >= current_date - 30
    )

  union all

  -- Support flags expiring within 7 days
  select
    'flag_expiring'::text,
    sf.student_id,
    s.first_name || ' ' || s.last_name,
    'Support flag "' || sf.title || '" expires in ' || (sf.expires_at - current_date) || ' days',
    'normal'::text,
    '/dashboard/students/' || sf.student_id || '?tab=support'
  from support_flags sf
  join students s on s.id = sf.student_id
  where sf.organization_id = p_org_id
    and sf.expires_at between current_date and current_date + 7

  order by 5 desc, 3  -- severity desc, student_name
  limit 50;
$$;
