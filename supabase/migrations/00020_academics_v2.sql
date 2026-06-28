-- ── Migration 00020 — Academics v2 ────────────────────────────────────────
-- Extends curriculum_enrollments with 1:1 support fields, richer status,
-- new subjects (reading, writing), notes, linked goal, and history support.
-- Adds intervention_sessions table for 1:1 session logging.

-- ── 1. Extend curriculum_enrollments ──────────────────────────────────────

-- Drop the existing CHECK constraints so we can replace them
alter table curriculum_enrollments drop constraint if exists curriculum_enrollments_subject_check;
alter table curriculum_enrollments drop constraint if exists curriculum_enrollments_status_check;

-- Add new constraint for subjects (adds reading, writing; keeps existing)
alter table curriculum_enrollments add constraint curriculum_enrollments_subject_check
  check (subject in (
    'math','reading','writing','ela','science','history',
    'bible','spanish','leadership','entrepreneurship',
    'elective','art','music','pe','other'
  ));

-- Add new constraint for status (adds not_started, changed_curriculum)
alter table curriculum_enrollments add constraint curriculum_enrollments_status_check
  check (status in ('not_started','active','paused','completed','changed_curriculum','dropped'));

-- New columns
alter table curriculum_enrollments
  add column if not exists notes                        text,
  add column if not exists linked_goal_id               uuid references growth_goals(id) on delete set null,
  add column if not exists archived_at                  timestamptz,
  add column if not exists last_updated_by              uuid references profiles(id) on delete set null,

  -- 1:1 Support fields
  add column if not exists one_on_one_needed            boolean not null default false,
  add column if not exists one_on_one_requested_by      text,       -- parent|teacher|assessment|student_success_plan|other
  add column if not exists one_on_one_reason            text,
  add column if not exists one_on_one_priority          text not null default 'medium', -- low|medium|high
  add column if not exists one_on_one_date_identified   date,
  add column if not exists intervention_status          text;       -- monitoring|active|completed|discontinued

-- Add CHECK constraints for new fields
alter table curriculum_enrollments
  add constraint cur_enroll_oo1_priority_check
    check (one_on_one_priority in ('low','medium','high')),
  add constraint cur_enroll_intervention_status_check
    check (intervention_status in ('monitoring','active','completed','discontinued') or intervention_status is null);

-- Index to find active 1:1 subjects quickly
create index if not exists idx_cur_enroll_oo1
  on curriculum_enrollments(organization_id, student_id, one_on_one_needed, intervention_status)
  where one_on_one_needed = true;

-- Index for active curriculum per student
create index if not exists idx_cur_enroll_active
  on curriculum_enrollments(organization_id, student_id, status)
  where archived_at is null;

-- ── 2. intervention_sessions ──────────────────────────────────────────────

create table intervention_sessions (
  id                       uuid          primary key default gen_random_uuid(),
  organization_id          uuid          not null references organizations(id) on delete cascade,
  student_id               uuid          not null references students(id) on delete cascade,
  curriculum_enrollment_id uuid          not null references curriculum_enrollments(id) on delete cascade,

  session_date             date          not null,
  subject                  text          not null,   -- denormalized for fast display
  staff_id                 uuid          references profiles(id) on delete set null,
  duration_minutes         integer,

  focus_skill              text,
  lesson_unit_covered      text,
  student_response         text,
  progress_observed        text,
  next_steps               text,
  parent_followup_needed   boolean       not null default false,

  created_at               timestamptz   not null default now(),
  updated_at               timestamptz   not null default now(),
  created_by               uuid          references profiles(id) on delete set null
);

create trigger trg_intervention_sessions_updated_at
  before update on intervention_sessions
  for each row execute function handle_updated_at();

create index idx_intervention_enrollment
  on intervention_sessions(curriculum_enrollment_id, session_date desc);
create index idx_intervention_student
  on intervention_sessions(organization_id, student_id, session_date desc);

alter table intervention_sessions enable row level security;

-- Staff/teacher: read + write (not volunteers/parents)
create policy "intervention_staff_read" on intervention_sessions for select
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "intervention_staff_insert" on intervention_sessions for insert
  with check (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "intervention_staff_update" on intervention_sessions for update
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

-- Only admins delete intervention sessions
create policy "intervention_admin_delete" on intervention_sessions for delete
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role in ('admin','full_admin','platform_admin')
  ));
