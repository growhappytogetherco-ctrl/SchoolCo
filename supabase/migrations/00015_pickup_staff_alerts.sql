-- ============================================================
-- Migration 00015 — Authorized Pickup Persons & Staff Mgmt
-- SchoolCo Platform
-- ============================================================
-- Adds:
--   1. authorized_pickup_persons — non-guardian pickup contacts
--   2. attendance_records columns — checkout_released_to, checkout_notes
--   3. RLS for authorized_pickup_persons
-- ============================================================

-- ── 1. authorized_pickup_persons ─────────────────────────────────────────

create table if not exists authorized_pickup_persons (
  id                  uuid          primary key default gen_random_uuid(),
  organization_id     uuid          not null references organizations(id) on delete cascade,
  student_id          uuid          not null references students(id) on delete cascade,
  created_by          uuid          references profiles(id),
  updated_by          uuid          references profiles(id),

  -- Person details
  full_name           text          not null,
  relationship        text          not null default 'other',
  phone               text,
  email               text,
  photo_url           text,         -- Future: upload photo for visual ID

  -- Pickup authorization
  is_authorized       boolean       not null default true,
  is_emergency_only   boolean       not null default false,  -- only for emergencies
  requires_supervision boolean      not null default false,  -- supervised handoff

  -- Restrictions / notes
  restriction_notes   text,         -- Staff-visible: "Must show ID", "Restraining order on file"
  admin_only_notes    text,         -- Admin-only: custody details, legal context

  -- Audit
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

create index if not exists idx_pickup_org_student on authorized_pickup_persons(organization_id, student_id);

create trigger pickup_persons_updated_at
  before update on authorized_pickup_persons
  for each row execute function update_updated_at_column();

-- ── 2. Extend attendance_records with checkout tracking ───────────────────

alter table attendance_records
  add column if not exists checkout_released_to       text,     -- Name of person who took the student
  add column if not exists checkout_released_to_id    uuid references authorized_pickup_persons(id),
  add column if not exists checkout_notes             text;     -- Staff note at checkout time

-- ── 3. RLS — authorized_pickup_persons ───────────────────────────────────

alter table authorized_pickup_persons enable row level security;

-- Staff and above can read all pickup persons in their org
create policy "staff can view pickup persons"
  on authorized_pickup_persons for select
  using (
    is_org_member(organization_id)
    and exists (
      select 1 from organization_members om
      where om.organization_id = authorized_pickup_persons.organization_id
        and om.profile_id = auth.uid()
        and om.role in ('staff','teacher','registrar','admin','full_admin','platform_admin')
        and om.status = 'active'
    )
  );

-- Staff and above can insert
create policy "staff can create pickup persons"
  on authorized_pickup_persons for insert
  with check (
    exists (
      select 1 from organization_members om
      where om.organization_id = authorized_pickup_persons.organization_id
        and om.profile_id = auth.uid()
        and om.role in ('staff','teacher','registrar','admin','full_admin','platform_admin')
        and om.status = 'active'
    )
  );

-- Staff and above can update
create policy "staff can update pickup persons"
  on authorized_pickup_persons for update
  using (
    exists (
      select 1 from organization_members om
      where om.organization_id = authorized_pickup_persons.organization_id
        and om.profile_id = auth.uid()
        and om.role in ('staff','teacher','registrar','admin','full_admin','platform_admin')
        and om.status = 'active'
    )
  );

-- Admin only can delete
create policy "admin can delete pickup persons"
  on authorized_pickup_persons for delete
  using (
    exists (
      select 1 from organization_members om
      where om.organization_id = authorized_pickup_persons.organization_id
        and om.profile_id = auth.uid()
        and om.role in ('admin','full_admin','platform_admin')
        and om.status = 'active'
    )
  );

-- ── 4. Function: get_today_actions ────────────────────────────────────────
-- Returns aggregated action items for the dashboard "Today's Actions" card.

create or replace function get_today_actions(p_org_id uuid)
returns table (
  action_type     text,
  student_id      uuid,
  student_name    text,
  priority        text,
  detail          text,
  due_date        date,
  tab_hint        text   -- which profile tab to link to
) language sql stable security definer as $$

  -- Goals overdue for review (target_review_date <= today, status active)
  select
    'goal_review_due'       as action_type,
    sg.student_id,
    (s.preferred_name || ' ' || s.last_name)::text  as student_name,
    case sg.priority
      when 'urgent' then 'high'
      when 'high'   then 'high'
      else 'normal'
    end                     as priority,
    sg.goal_text            as detail,
    sg.target_review_date   as due_date,
    'goals'                 as tab_hint
  from student_goals sg
  join students s on s.id = sg.student_id
  where sg.organization_id = p_org_id
    and sg.status = 'active'
    and sg.target_review_date <= current_date
    and sg.progress_pct < 100

  union all

  -- Students checked in but not checked out (from yesterday — missing checkout)
  select
    'missing_checkout'      as action_type,
    ar.student_id,
    (s.preferred_name || ' ' || s.last_name)::text  as student_name,
    'high'                  as priority,
    'Student was checked in but never checked out'   as detail,
    ar.date                 as due_date,
    'attendance'            as tab_hint
  from attendance_records ar
  join students s on s.id = ar.student_id
  where ar.organization_id = p_org_id
    and ar.date = current_date - 1
    and ar.check_in_at is not null
    and ar.check_out_at is null

  union all

  -- Students with high/critical support flags expiring within 7 days
  select
    'flag_expiring'         as action_type,
    sf.student_id,
    (s.preferred_name || ' ' || s.last_name)::text  as student_name,
    case sf.priority
      when 'critical' then 'high'
      else 'normal'
    end                     as priority,
    sf.title                as detail,
    sf.expires_at::date     as due_date,
    'support'               as tab_hint
  from support_flags sf
  join students s on s.id = sf.student_id
  where sf.organization_id = p_org_id
    and sf.expires_at is not null
    and sf.expires_at::date between current_date and current_date + 7
    and sf.priority in ('high','critical')

  union all

  -- Students with no assessment in the last 90 days (active curriculum)
  select
    'assessment_needed'     as action_type,
    ce.student_id,
    (s.preferred_name || ' ' || s.last_name)::text  as student_name,
    'normal'                as priority,
    'No recent assessment for ' || ce.subject  as detail,
    current_date            as due_date,
    'academics'             as tab_hint
  from curriculum_enrollments ce
  join students s on s.id = ce.student_id
  where ce.organization_id = p_org_id
    and ce.status = 'active'
    and not exists (
      select 1 from assessments a
      where a.student_id = ce.student_id
        and a.organization_id = p_org_id
        and a.assessment_date >= current_date - 90
    )

  order by 3, 1   -- student name, then action type
$$;

grant execute on function get_today_actions(uuid) to authenticated;
