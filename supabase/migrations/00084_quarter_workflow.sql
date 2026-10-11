-- Migration 00084: Quarter Workflow — Grade Finalization per Quarter
--
-- Adds per-quarter, per-course-section workflow lifecycle tracking,
-- immutable grade snapshots, and an append-only event log.
--
-- NO modifications to existing tables.
-- Q1 initialized as REVIEW for all RLA courses that have Q1 assignments.
--
-- New tables:
--   grading_period_workflow       — OPEN/REVIEW/FINALIZED lifecycle per course+quarter
--   quarter_grade_snapshots       — Immutable frozen grades at finalization time
--   grading_period_workflow_events — Append-only transition event log
--
-- New functions:
--   prevent_snapshot_updates()              — Immutability trigger
--   insert_quarter_snapshots_and_finalize() — Atomic finalization RPC


-- ── 1. grading_period_workflow ────────────────────────────────────────────────
-- One row per (org, grading_period, course_section).
-- Tracks workflow state from OPEN → REVIEW → FINALIZED.
-- Reopening increments reopen_count and returns to REVIEW.

create table if not exists grading_period_workflow (
  id                   uuid          primary key default gen_random_uuid(),
  organization_id      uuid          not null references organizations(id) on delete cascade,
  grading_period_id    uuid          not null references grading_periods(id) on delete restrict,
  course_section_id    uuid          not null references course_sections(id) on delete cascade,

  -- Workflow state
  status               text          not null default 'open'
                         check (status in ('open', 'review', 'finalized')),

  -- Open lifecycle (may be null when initialized directly as review/finalized)
  opened_at            timestamptz,
  opened_by            uuid          references profiles(id) on delete set null,

  -- Review lifecycle
  review_started_at    timestamptz,
  review_started_by    uuid          references profiles(id) on delete set null,

  -- Finalization lifecycle
  finalized_at         timestamptz,
  finalized_by         uuid          references profiles(id) on delete set null,

  -- Reopen history
  reopen_count         integer       not null default 0,
  last_reopened_at     timestamptz,
  last_reopened_by     uuid          references profiles(id) on delete set null,
  last_reopen_reason   text,

  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now(),

  -- One row per (org, period, section)
  constraint uq_workflow_org_period_section
    unique (organization_id, grading_period_id, course_section_id)
);

comment on table grading_period_workflow is
  'Per-course, per-quarter workflow lifecycle. '
  'Tracks transitions OPEN→REVIEW→FINALIZED and reopen history. '
  'Never org-wide lock — each course section manages its own finalization.';

create index if not exists idx_gpw_org_period
  on grading_period_workflow(organization_id, grading_period_id);

create index if not exists idx_gpw_course_section
  on grading_period_workflow(course_section_id);

create index if not exists idx_gpw_status
  on grading_period_workflow(organization_id, status);

alter table grading_period_workflow enable row level security;

-- Staff can read workflow state
drop policy if exists "staff_select_workflow" on grading_period_workflow;
create policy "staff_select_workflow"
  on grading_period_workflow for select
  using (is_staff_or_above(organization_id));

-- Registrar+ can insert new workflow rows
drop policy if exists "registrar_insert_workflow" on grading_period_workflow;
create policy "registrar_insert_workflow"
  on grading_period_workflow for insert
  with check (has_min_org_role(organization_id, 'registrar'::user_role));

-- Registrar+ can update workflow state (transitions)
drop policy if exists "registrar_update_workflow" on grading_period_workflow;
create policy "registrar_update_workflow"
  on grading_period_workflow for update
  using (has_min_org_role(organization_id, 'registrar'::user_role));

-- Admin+ can delete workflow rows (edge case cleanup)
drop policy if exists "admin_delete_workflow" on grading_period_workflow;
create policy "admin_delete_workflow"
  on grading_period_workflow for delete
  using (is_org_admin(organization_id));


-- ── 2. quarter_grade_snapshots ────────────────────────────────────────────────
-- Immutable frozen grades at the moment of quarter finalization.
-- One row per (enrollment, grading_period). Append-only via trigger.
-- Corrections require reopening: delete snapshot → re-finalize.

create table if not exists quarter_grade_snapshots (
  id                   uuid          primary key default gen_random_uuid(),
  organization_id      uuid          not null references organizations(id) on delete cascade,
  grading_period_id    uuid          not null references grading_periods(id) on delete restrict,
  course_section_id    uuid          not null references course_sections(id) on delete cascade,
  enrollment_id        uuid          not null references curriculum_enrollments(id) on delete restrict,
  student_id           uuid          not null references students(id) on delete cascade,

  -- Grade data (frozen at finalization time)
  percentage           numeric(6,3),
  letter_grade         text,
  grade_state          text          not null
                         check (grade_state in (
                           'graded', 'incomplete', 'missing_work', 'no_grade', 'withdrawn'
                         )),
  missing_count        integer       not null default 0,
  assignment_count     integer       not null default 0,

  -- Config snapshot (preserved so historical reports are stable)
  grading_method       text          not null default 'points',
  category_weights     jsonb,

  -- Provenance
  finalized_at         timestamptz   not null default now(),
  finalized_by         uuid          not null references profiles(id) on delete restrict,
  workflow_id          uuid          not null references grading_period_workflow(id) on delete restrict,

  created_at           timestamptz   not null default now(),

  -- One snapshot per enrollment per quarter
  constraint uq_snapshot_enrollment_period
    unique (enrollment_id, grading_period_id)
);

comment on table quarter_grade_snapshots is
  'Immutable frozen grades per enrollment per quarter. '
  'Written atomically by insert_quarter_snapshots_and_finalize(). '
  'Updates are blocked by trigger — corrections require reopen+refinalize.';

comment on column quarter_grade_snapshots.grade_state is
  'Snapshot of the grade state at finalization: '
  'graded=has percentage, no_grade=nothing graded, '
  'missing_work=has missing assignments, incomplete=weighted not configured, '
  'withdrawn=enrollment was withdrawn.';

create index if not exists idx_qgs_org_period
  on quarter_grade_snapshots(organization_id, grading_period_id);

create index if not exists idx_qgs_enrollment
  on quarter_grade_snapshots(enrollment_id);

create index if not exists idx_qgs_student_org
  on quarter_grade_snapshots(organization_id, student_id);

create index if not exists idx_qgs_workflow
  on quarter_grade_snapshots(workflow_id);

alter table quarter_grade_snapshots enable row level security;

-- Staff can read snapshots (for dashboard, report cards)
drop policy if exists "staff_select_snapshots" on quarter_grade_snapshots;
create policy "staff_select_snapshots"
  on quarter_grade_snapshots for select
  using (is_staff_or_above(organization_id));

-- Registrar+ can delete snapshots (for reopening a finalized quarter)
drop policy if exists "registrar_delete_snapshots" on quarter_grade_snapshots;
create policy "registrar_delete_snapshots"
  on quarter_grade_snapshots for delete
  using (has_min_org_role(organization_id, 'registrar'::user_role));

-- No direct INSERT or UPDATE via RLS — only the SECURITY DEFINER function may insert.
-- No UPDATE policy at all — immutability trigger blocks updates regardless.


-- ── 3. grading_period_workflow_events ────────────────────────────────────────
-- Append-only audit log of every workflow transition.
-- event_type: 'opened' | 'review_started' | 'finalized' | 'reopened'
-- reason is required for 'reopened'; optional otherwise.

create table if not exists grading_period_workflow_events (
  id               uuid          primary key default gen_random_uuid(),
  workflow_id      uuid          not null references grading_period_workflow(id) on delete cascade,
  organization_id  uuid          not null references organizations(id) on delete cascade,
  event_type       text          not null
                     check (event_type in ('opened', 'review_started', 'finalized', 'reopened')),
  actor_id         uuid          not null references profiles(id) on delete restrict,
  reason           text,         -- required for 'reopened'
  metadata         jsonb,
  created_at       timestamptz   not null default now()
);

comment on table grading_period_workflow_events is
  'Append-only event log for all grading_period_workflow transitions. '
  'Immutable once written (no update/delete RLS policies). '
  'reason is required for reopened events.';

create index if not exists idx_gpwe_workflow
  on grading_period_workflow_events(workflow_id, created_at desc);

create index if not exists idx_gpwe_org_type
  on grading_period_workflow_events(organization_id, event_type, created_at desc);

alter table grading_period_workflow_events enable row level security;

-- Staff can read event log
drop policy if exists "staff_select_workflow_events" on grading_period_workflow_events;
create policy "staff_select_workflow_events"
  on grading_period_workflow_events for select
  using (is_staff_or_above(organization_id));

-- Registrar+ can insert events
drop policy if exists "registrar_insert_workflow_events" on grading_period_workflow_events;
create policy "registrar_insert_workflow_events"
  on grading_period_workflow_events for insert
  with check (has_min_org_role(organization_id, 'registrar'::user_role));

-- No update or delete policies — events are immutable once written


-- ── 4. Immutability trigger for quarter_grade_snapshots ───────────────────────

create or replace function prevent_snapshot_updates()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'quarter_grade_snapshots is append-only. '
    'To correct a finalized grade, reopen the quarter course (which deletes the snapshot) '
    'and re-finalize. Snapshot id: %', OLD.id;
end;
$$;

comment on function prevent_snapshot_updates is
  'Trigger function that blocks all UPDATE operations on quarter_grade_snapshots. '
  'Enforces immutability at the database level.';

drop trigger if exists trg_prevent_snapshot_updates on quarter_grade_snapshots;
create trigger trg_prevent_snapshot_updates
  before update on quarter_grade_snapshots
  for each row execute function prevent_snapshot_updates();


-- ── 5. Atomic finalization RPC ────────────────────────────────────────────────
-- Called from the JS server action after computing grades.
-- Inserts all snapshots, updates workflow, logs event and audit — atomically.
-- SECURITY DEFINER: bypasses RLS, runs as function owner (postgres).
-- Caller must validate authorization before calling this function.
--
-- p_snapshots is a jsonb array, each element with these keys:
--   enrollment_id, student_id, course_section_id,
--   percentage (nullable), letter_grade (nullable), grade_state,
--   missing_count, assignment_count, grading_method, category_weights (nullable)

create or replace function insert_quarter_snapshots_and_finalize(
  p_workflow_id    uuid,
  p_org_id         uuid,
  p_period_id      uuid,
  p_snapshots      jsonb,
  p_finalized_by   uuid,
  p_event_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snap jsonb;
begin
  -- Insert all grade snapshots atomically
  for v_snap in select * from jsonb_array_elements(p_snapshots) loop
    insert into quarter_grade_snapshots (
      organization_id,
      grading_period_id,
      course_section_id,
      enrollment_id,
      student_id,
      percentage,
      letter_grade,
      grade_state,
      missing_count,
      assignment_count,
      grading_method,
      category_weights,
      finalized_at,
      finalized_by,
      workflow_id
    ) values (
      p_org_id,
      p_period_id,
      (v_snap->>'course_section_id')::uuid,
      (v_snap->>'enrollment_id')::uuid,
      (v_snap->>'student_id')::uuid,
      case when v_snap->>'percentage' is null then null
           else (v_snap->>'percentage')::numeric end,
      nullif(v_snap->>'letter_grade', ''),
      v_snap->>'grade_state',
      coalesce((v_snap->>'missing_count')::int, 0),
      coalesce((v_snap->>'assignment_count')::int, 0),
      coalesce(v_snap->>'grading_method', 'points'),
      case when v_snap->'category_weights' is null
                or v_snap->'category_weights' = 'null'::jsonb
           then null
           else v_snap->'category_weights' end,
      now(),
      p_finalized_by,
      p_workflow_id
    );
  end loop;

  -- Update workflow status to finalized
  update grading_period_workflow
  set
    status        = 'finalized',
    finalized_at  = now(),
    finalized_by  = p_finalized_by,
    updated_at    = now()
  where id = p_workflow_id;

  -- Insert finalized event
  insert into grading_period_workflow_events (
    workflow_id,
    organization_id,
    event_type,
    actor_id,
    metadata
  ) values (
    p_workflow_id,
    p_org_id,
    'finalized',
    p_finalized_by,
    p_event_metadata
  );

  -- Insert audit log entry atomically
  insert into audit_logs (
    organization_id,
    actor_id,
    action,
    resource_type,
    resource_id,
    new_values
  ) values (
    p_org_id,
    p_finalized_by,
    'quarter_course_finalized',
    'grading_period_workflow',
    p_workflow_id::text,
    jsonb_build_object(
      'workflow_id',     p_workflow_id,
      'period_id',       p_period_id,
      'snapshot_count',  jsonb_array_length(p_snapshots),
      'finalized_by',    p_finalized_by
    )
  );
end;
$$;

comment on function insert_quarter_snapshots_and_finalize is
  'Atomic quarter finalization: inserts grade snapshots, updates workflow to FINALIZED, '
  'logs finalized event, and writes audit log — all in a single transaction. '
  'SECURITY DEFINER: bypasses RLS. Caller must validate authorization first.';


-- ── 6. Initialize Q1 as REVIEW for RLA courses ────────────────────────────────
-- Runs idempotently: ON CONFLICT DO NOTHING on workflow inserts.
-- Only inserts events for newly-created workflow rows (not pre-existing ones).

do $$
declare
  v_org_id       uuid := '9fd43346-f43b-41d1-9b4c-fe8702471b07';
  v_admin_id     uuid := '7ba9a63f-c33d-4a25-b716-125e27bdf1b5';
  v_q1_period_id uuid;
  v_section      record;
  v_workflow_id  uuid;
begin
  -- Find Q1 period (first quarter by sequence for RLA school year 2026-2027)
  select id into v_q1_period_id
  from grading_periods
  where organization_id  = v_org_id
    and period_type       = 'quarter'
    and is_assignment_period = true
  order by sequence
  limit 1;

  if v_q1_period_id is null then
    raise notice '00084: No Q1 period found for org %, skipping init', v_org_id;
    return;
  end if;

  raise notice '00084: Initializing Q1 (%) as REVIEW for RLA courses with assignments', v_q1_period_id;

  -- For each active course section that has any active Q1 assignments
  for v_section in
    select distinct cs.id
    from course_sections cs
    join assignments a on a.course_section_id = cs.id
    where cs.organization_id = v_org_id
      and cs.status           = 'active'
      and a.grading_period_id = v_q1_period_id
      and a.status            = 'active'
  loop
    v_workflow_id := null;

    insert into grading_period_workflow (
      organization_id,
      grading_period_id,
      course_section_id,
      status,
      review_started_at,
      review_started_by
    ) values (
      v_org_id,
      v_q1_period_id,
      v_section.id,
      'review',
      now(),
      v_admin_id
    )
    on conflict (organization_id, grading_period_id, course_section_id) do nothing
    returning id into v_workflow_id;

    -- Only insert event if we created a new workflow row (not a conflict)
    if v_workflow_id is not null then
      insert into grading_period_workflow_events (
        workflow_id,
        organization_id,
        event_type,
        actor_id,
        reason,
        metadata
      ) values (
        v_workflow_id,
        v_org_id,
        'review_started',
        v_admin_id,
        null,
        jsonb_build_object(
          'migration',   '00084_quarter_workflow',
          'note',        'Q1 2026-2027 initialized as REVIEW after Q1 ended 2026-10-09',
          'auto_init',   true
        )
      );
    end if;
  end loop;

  raise notice '00084: Q1 REVIEW initialization complete';
end;
$$;
