-- ── Migration 00022 — Assessment System v2 ─────────────────────────────────
-- Expands the existing assessments table with new fields required for Stage 3C.
-- Adds assessment_type, links to curriculum/goals, fluency/mastery fields,
-- staff tracking, attachment URL, and archived_at for soft-delete.
-- Updates performance_level and assessment_period check constraints.

-- ── 1. Drop old check constraints ────────────────────────────────────────────
alter table assessments drop constraint if exists assessments_performance_level_check;
alter table assessments drop constraint if exists assessments_assessment_period_check;
alter table assessments drop constraint if exists assessments_visibility_check;

-- ── 2. Add new columns ───────────────────────────────────────────────────────
alter table assessments
  -- Assessment classification
  add column if not exists assessment_type          text,
  -- Links
  add column if not exists curriculum_enrollment_id uuid references curriculum_enrollments(id) on delete set null,
  add column if not exists growth_goal_id           uuid references growth_goals(id) on delete set null,
  -- Staff
  add column if not exists staff_member_id          uuid references profiles(id) on delete set null,
  add column if not exists staff_name               text,
  -- Extended score fields
  add column if not exists placement_level          text,
  add column if not exists fluency_wpm              integer,
  add column if not exists accuracy_percent         numeric(5,2),
  add column if not exists mastery_percent          numeric(5,2),
  -- Narrative
  add column if not exists staff_interpretation     text,
  add column if not exists recommended_next_steps   text,
  -- Visibility / lifecycle
  add column if not exists parent_visible           boolean not null default false,
  add column if not exists attachment_url           text,
  add column if not exists archived_at              timestamptz;

-- ── 3. Re-add check constraints with expanded value sets ─────────────────────
alter table assessments
  add constraint assessments_period_check
    check (assessment_period in (
      'boy','moy','eoy','placement','progress_check','unit_assessment','additional'
    )),
  add constraint assessments_perf_level_check
    check (performance_level in (
      'not_yet_assessed','needs_intensive_support','needs_support',
      'developing','on_track','above_expectations','mastered'
    ) or performance_level is null),
  add constraint assessments_type_check
    check (assessment_type in (
      'placement_test','benchmark','curriculum_test','unit_test','quiz',
      'reading_fluency','math_facts','writing_sample','teacher_observation',
      'project_rubric','oral_presentation','custom'
    ) or assessment_type is null);

-- ── 4. Auto-compute score_pct via trigger ─────────────────────────────────────
create or replace function compute_assessment_score_pct()
returns trigger language plpgsql as $$
begin
  if new.score_raw is not null and new.score_max is not null and new.score_max > 0 then
    new.score_pct := round((new.score_raw / new.score_max * 100)::numeric, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assessment_score_pct on assessments;
create trigger trg_assessment_score_pct
  before insert or update on assessments
  for each row execute function compute_assessment_score_pct();

-- ── 5. Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_assessments_active
  on assessments(student_id, subject, assessment_date desc)
  where archived_at is null;

create index if not exists idx_assessments_period_active
  on assessments(student_id, assessment_period, assessment_date desc)
  where archived_at is null;

-- ── 6. RLS — restrict parents and volunteers ──────────────────────────────────
-- Drop the broad "is_org_member" policies and replace with staff-only
drop policy if exists "staff_view_assessments"   on assessments;
drop policy if exists "staff_manage_assessments" on assessments;
drop policy if exists "staff_update_assessments" on assessments;
drop policy if exists "admin_delete_assessments" on assessments;

create policy "assessments_staff_select" on assessments for select
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "assessments_staff_insert" on assessments for insert
  with check (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "assessments_staff_update" on assessments for update
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "assessments_admin_delete" on assessments for delete
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role in ('admin','full_admin','platform_admin')
  ));
