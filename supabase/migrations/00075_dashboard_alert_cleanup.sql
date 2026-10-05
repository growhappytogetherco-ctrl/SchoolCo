-- Migration: dashboard alert cleanup
-- Removes noise-generating alert types from daily dashboard RPCs:
--   1. get_student_alerts: remove progress_stale (per-subject, 30-day), remove goal_overdue (duplicated in get_today_actions)
--   2. get_today_actions: remove assessment_needed (per-enrollment, 90-day) — assessment_overdue in get_student_alerts covers it per-student

-- ── 1. get_student_alerts — remove progress_stale and goal_overdue ───────────────────────────

create or replace function get_student_alerts(p_org_id uuid)
returns table (
  alert_type   text,
  student_id   uuid,
  student_name text,
  message      text,
  severity     text,
  action_url   text
) language sql stable security definer as $$

  -- Assessment overdue (per student — no assessment in 60 days)
  select
    'assessment_overdue'::text,
    s.id,
    (s.preferred_name || ' ' || s.last_name)::text,
    'No assessment recorded in the last 60 days'::text,
    'normal'::text,
    ('/dashboard/students/' || s.id || '?tab=academics')::text
  from students s
  where s.organization_id = p_org_id
    and s.enrollment_status = 'enrolled'
    and not exists (
      select 1 from assessments a
      where a.student_id = s.id
        and a.organization_id = p_org_id
        and a.assessment_date >= current_date - 60
        and a.archived_at is null
    )

  union all

  -- Active 1:1 intervention with no session in 14 days
  select
    'intervention_no_session'::text,
    ce.student_id,
    (s.preferred_name || ' ' || s.last_name)::text,
    ('No 1:1 session recorded in 14 days (' || ce.subject || ')')::text,
    'high'::text,
    ('/dashboard/students/' || ce.student_id || '?tab=academics')::text
  from curriculum_enrollments ce
  join students s on s.id = ce.student_id
  where ce.organization_id = p_org_id
    and ce.status = 'active'
    and ce.archived_at is null
    and ce.one_on_one_needed = true
    and (ce.intervention_status = 'active' or ce.intervention_status is null)
    and not exists (
      select 1 from intervention_sessions ins
      where ins.curriculum_enrollment_id = ce.id
        and ins.session_date >= current_date - 14
    )

  union all

  -- Support flag expiring within 7 days
  select
    'flag_expiring'::text,
    sf.student_id,
    (s.preferred_name || ' ' || s.last_name)::text,
    ('Support flag expiring: ' || sf.title)::text,
    case sf.priority when 'critical' then 'high' else 'normal' end,
    ('/dashboard/students/' || sf.student_id || '?tab=support')::text
  from support_flags sf
  join students s on s.id = sf.student_id
  where sf.organization_id = p_org_id
    and sf.expires_at is not null
    and sf.expires_at::date between current_date and current_date + 7

  order by 6, 1   -- student_name, alert_type

  limit 200
$$;

grant execute on function get_student_alerts(uuid) to authenticated;


-- ── 2. get_today_actions — remove assessment_needed (per-enrollment 90-day duplicate) ────────

create or replace function get_today_actions(p_org_id uuid)
returns table (
  action_type     text,
  student_id      uuid,
  student_name    text,
  priority        text,
  detail          text,
  due_date        date,
  tab_hint        text
) language sql stable security definer as $$

  -- Goals overdue for review
  select
    'goal_review_due'::text,
    sg.student_id,
    (s.preferred_name || ' ' || s.last_name)::text,
    case sg.priority
      when 'urgent' then 'high'
      when 'high'   then 'high'
      else 'normal'
    end,
    sg.goal_text,
    sg.target_review_date,
    'goals'::text
  from student_goals sg
  join students s on s.id = sg.student_id
  where sg.organization_id = p_org_id
    and sg.status = 'active'
    and sg.target_review_date <= current_date
    and sg.progress_pct < 100

  union all

  -- Students checked in but not checked out (from yesterday)
  select
    'missing_checkout'::text,
    ar.student_id,
    (s.preferred_name || ' ' || s.last_name)::text,
    'high'::text,
    'Student was checked in but never checked out'::text,
    ar.date,
    'attendance'::text
  from attendance_records ar
  join students s on s.id = ar.student_id
  where ar.organization_id = p_org_id
    and ar.date = current_date - 1
    and ar.check_in_at is not null
    and ar.check_out_at is null

  union all

  -- Students with high/critical support flags expiring within 7 days
  select
    'flag_expiring'::text,
    sf.student_id,
    (s.preferred_name || ' ' || s.last_name)::text,
    case sf.priority
      when 'critical' then 'high'
      else 'normal'
    end,
    sf.title,
    sf.expires_at::date,
    'support'::text
  from support_flags sf
  join students s on s.id = sf.student_id
  where sf.organization_id = p_org_id
    and sf.expires_at is not null
    and sf.expires_at::date between current_date and current_date + 7
    and sf.priority in ('high','critical')

  order by 3, 1   -- student_name, action_type
$$;

grant execute on function get_today_actions(uuid) to authenticated;
