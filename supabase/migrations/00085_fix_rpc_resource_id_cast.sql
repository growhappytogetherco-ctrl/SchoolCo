-- Migration 00085: Fix insert_quarter_snapshots_and_finalize — resource_id type error
--
-- Root cause: the audit_logs INSERT in the finalization RPC passed
--   p_workflow_id::text
-- but audit_logs.resource_id is type uuid. PostgreSQL rejects a text
-- expression where uuid is expected.
--
-- Fix: remove the ::text cast. p_workflow_id is already uuid; use it directly.
--
-- No schema changes. No data changes. Function replacement only.
-- Idempotent: CREATE OR REPLACE.

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
  -- Validate inputs
  if p_workflow_id is null then
    raise exception 'insert_quarter_snapshots_and_finalize: p_workflow_id is required';
  end if;
  if p_finalized_by is null then
    raise exception 'insert_quarter_snapshots_and_finalize: p_finalized_by is required';
  end if;
  if jsonb_typeof(p_snapshots) <> 'array' then
    raise exception 'insert_quarter_snapshots_and_finalize: p_snapshots must be a JSON array, got %',
      jsonb_typeof(p_snapshots);
  end if;
  if jsonb_array_length(p_snapshots) = 0 then
    raise exception 'insert_quarter_snapshots_and_finalize: p_snapshots array is empty';
  end if;

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
  -- FIX (00085): use p_workflow_id directly (uuid), not p_workflow_id::text
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
    p_workflow_id,           -- uuid, not ::text
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
  'SECURITY DEFINER: bypasses RLS. Caller must validate authorization first. '
  'Fixed in 00085: resource_id cast removed (p_workflow_id is already uuid).';
