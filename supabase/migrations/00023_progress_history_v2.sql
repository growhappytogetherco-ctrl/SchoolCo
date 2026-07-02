-- ── Migration 00023 — Progress History v2 ──────────────────────────────────
-- Extends academic_progress with fields required for Stage 3D:
-- rich check-in data, edit/archive capability, confidence level,
-- links to assessments and goals, staff tracking, next steps.
-- Updates get_student_alerts to use progress_records for staleness alerts.

-- ── 1. Extend academic_progress ───────────────────────────────────────────────
alter table academic_progress
  -- New link columns
  add column if not exists assessment_id    uuid references assessments(id) on delete set null,
  add column if not exists growth_goal_id   uuid references growth_goals(id) on delete set null,
  add column if not exists staff_member_id  uuid references profiles(id) on delete set null,

  -- Richer snapshot fields
  add column if not exists current_unit     text,
  add column if not exists skill_or_topic   text,
  add column if not exists confidence_level text,
  add column if not exists next_steps       text,
  add column if not exists parent_visible   boolean not null default false,

  -- Audit / lifecycle (was append-only; now supports edit & soft-delete)
  add column if not exists updated_by       uuid references profiles(id) on delete set null,
  add column if not exists updated_at       timestamptz not null default now(),
  add column if not exists archived_at      timestamptz;

-- Rename existing columns to match spec naming (add aliases via views if needed)
-- lesson → current_lesson, level → current_level
-- We keep old names to avoid breaking existing queries; add new alias columns:
alter table academic_progress
  add column if not exists current_level    text,
  add column if not exists current_lesson   text;

-- Backfill aliases from existing data
update academic_progress
  set current_level  = level,
      current_lesson = lesson
  where current_level is null and level is not null;

-- Check constraint for confidence_level
alter table academic_progress
  add constraint acad_progress_confidence_check
    check (confidence_level in ('not_confident','developing','confident','very_confident')
           or confidence_level is null);

-- Indexes for active records
create index if not exists idx_acad_progress_active
  on academic_progress(student_id, subject, recorded_date desc)
  where archived_at is null;

-- ── 2. Update RLS — block volunteers and parents ──────────────────────────────
drop policy if exists "staff_view_progress"   on academic_progress;
drop policy if exists "staff_insert_progress" on academic_progress;
drop policy if exists "admin_delete_progress" on academic_progress;

create policy "progress_staff_select" on academic_progress for select
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "progress_staff_insert" on academic_progress for insert
  with check (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "progress_staff_update" on academic_progress for update
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "progress_admin_delete" on academic_progress for delete
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role in ('admin','full_admin','platform_admin')
  ));

-- ── 3. Update get_student_alerts — add progress staleness alert ────────────────
-- Replace the existing function to use academic_progress (active records)
-- for the curriculum_stale alert, and add an intervention-no-session alert.
create or replace function get_student_alerts(p_org_id uuid)
returns table (
  alert_type    text,
  student_id    uuid,
  student_name  text,
  message       text,
  severity      text,
  action_url    text
)
language sql stable
as $$
  -- Goal review overdue
  select
    'goal_overdue'::text,
    g.student_id,
    s.first_name || ' ' || s.last_name,
    'Goal "' || left(g.goal_text, 60) || '" review is overdue',
    'normal'::text,
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
    '/dashboard/students/' || s.id || '?tab=assessments'
  from students s
  where s.organization_id = p_org_id
    and s.enrollment_status = 'enrolled'
    and not exists (
      select 1 from assessments a
      where a.student_id = s.id
        and a.archived_at is null
        and a.assessment_date >= current_date - 60
    )

  union all

  -- No progress update in last 30 days for active curriculum subject
  select
    'progress_stale'::text,
    ce.student_id,
    s.first_name || ' ' || s.last_name,
    'No progress update for ' || ce.subject || ' in 30+ days',
    'low'::text,
    '/dashboard/students/' || ce.student_id || '?tab=progress'
  from curriculum_enrollments ce
  join students s on s.id = ce.student_id
  where ce.organization_id = p_org_id
    and ce.status = 'active'
    and ce.archived_at is null
    and not exists (
      select 1 from academic_progress ap
      where ap.student_id = ce.student_id
        and ap.subject = ce.subject
        and ap.archived_at is null
        and ap.recorded_date >= current_date - 30
    )

  union all

  -- Active 1:1 intervention with no session logged in 14 days
  select
    'intervention_no_session'::text,
    ce.student_id,
    s.first_name || ' ' || s.last_name,
    'Active 1:1 for ' || ce.subject || ' — no session in 14+ days',
    'normal'::text,
    '/dashboard/students/' || ce.student_id || '?tab=academics'
  from curriculum_enrollments ce
  join students s on s.id = ce.student_id
  where ce.organization_id = p_org_id
    and ce.one_on_one_needed = true
    and ce.intervention_status = 'active'
    and ce.archived_at is null
    and not exists (
      select 1 from intervention_sessions iss
      where iss.curriculum_enrollment_id = ce.id
        and iss.session_date >= current_date - 14
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

  order by 5 desc, 3
  limit 50;
$$;
