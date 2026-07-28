-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00035: RLA Planning Center
-- Idempotent: drops and recreates all objects.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop tables in dependency order (cascade handles FKs)
drop table if exists calendar_preferences cascade;
drop table if exists planning_templates cascade;
drop table if exists planning_tasks cascade;
drop table if exists event_rsvps cascade;
drop table if exists event_reminders cascade;
drop table if exists calendar_events cascade;

-- Drop enum types
drop type if exists task_priority cascade;
drop type if exists task_status cascade;
drop type if exists rsvp_status cascade;
drop type if exists event_status cascade;
drop type if exists event_visibility cascade;
drop type if exists event_category cascade;

-- Drop RLS policies that reference dropped tables (handled by cascade above)

-- ── Enum types ────────────────────────────────────────────────────────────

create type event_category as enum (
  'school_day','holiday','no_school',
  'quarter_begins','quarter_ends','semester_begins','semester_ends',
  'testing','leadership','entrepreneurship','bible',
  'community_service','field_trip','parent_meeting','open_house',
  'discovery_day','guest_speaker','fundraiser','volunteer_event',
  'graduation','medical','sports','club','other'
);

create type event_visibility as enum (
  'school_wide','parents','staff_only','specific_grade',
  'specific_student','specific_family','leadership_students',
  'entrepreneurship_students','admin_private'
);

create type event_status as enum (
  'draft','published','cancelled','completed'
);

create type rsvp_status as enum (
  'pending','confirmed','declined','waitlisted'
);

create type task_status as enum (
  'not_started','in_progress','waiting','blocked','completed','cancelled'
);

create type task_priority as enum (
  'low','normal','high','urgent'
);

-- ── calendar_events ───────────────────────────────────────────────────────

create table calendar_events (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references organizations(id) on delete cascade,
  title                    text not null check (char_length(title) between 1 and 200),
  description              text,
  location                 text,
  start_at                 timestamptz not null,
  end_at                   timestamptz not null,
  is_all_day               boolean not null default false,
  category                 event_category not null default 'other',
  visibility               event_visibility not null default 'school_wide',
  status                   event_status not null default 'published',
  visibility_grade         text,
  student_id               uuid references students(id) on delete set null,
  family_id                uuid references families(id) on delete set null,
  assigned_staff_id        uuid references profiles(id) on delete set null,
  recurrence_rule          text,
  recurrence_end_at        date,
  recurrence_parent_id     uuid references calendar_events(id) on delete cascade,
  capacity                 int,
  requires_rsvp            boolean not null default false,
  requires_permission_slip boolean not null default false,
  requires_parent_confirm  boolean not null default false,
  requires_transportation  boolean not null default false,
  image_url                text,
  created_by               uuid not null references profiles(id),
  updated_by               uuid references profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  archived_at              timestamptz,
  constraint events_end_after_start check (end_at >= start_at)
);

create index idx_calendar_events_org_start
  on calendar_events (organization_id, start_at)
  where archived_at is null;

create index idx_calendar_events_org_cat
  on calendar_events (organization_id, category)
  where archived_at is null;

create index idx_calendar_events_student
  on calendar_events (student_id)
  where student_id is not null and archived_at is null;

create index idx_calendar_events_family
  on calendar_events (family_id)
  where family_id is not null and archived_at is null;

create index idx_calendar_events_status
  on calendar_events (organization_id, status, start_at)
  where archived_at is null;

create index idx_calendar_events_fts
  on calendar_events using gin(
    to_tsvector('english',
      coalesce(title,'') || ' ' ||
      coalesce(description,'') || ' ' ||
      coalesce(location,'')
    )
  );

-- ── event_reminders ───────────────────────────────────────────────────────

create table event_reminders (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references calendar_events(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  offset_seconds  int not null,
  target_audience text not null default 'parents',
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_event_reminders_event  on event_reminders(event_id);
create index idx_event_reminders_unsent on event_reminders(event_id, sent_at)
  where sent_at is null;

-- ── event_rsvps ───────────────────────────────────────────────────────────

create table event_rsvps (
  id                   uuid primary key default gen_random_uuid(),
  event_id             uuid not null references calendar_events(id) on delete cascade,
  organization_id      uuid not null references organizations(id) on delete cascade,
  profile_id           uuid not null references profiles(id) on delete cascade,
  student_id           uuid references students(id) on delete set null,
  status               rsvp_status not null default 'pending',
  permission_slip_url  text,
  notes                text,
  responded_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique(event_id, profile_id)
);

create index idx_event_rsvps_event   on event_rsvps(event_id);
create index idx_event_rsvps_profile on event_rsvps(profile_id);

-- ── planning_tasks ────────────────────────────────────────────────────────

create table planning_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 300),
  description     text,
  assigned_to     uuid references profiles(id) on delete set null,
  priority        task_priority not null default 'normal',
  due_at          timestamptz,
  status          task_status not null default 'not_started',
  event_id        uuid references calendar_events(id) on delete set null,
  student_id      uuid references students(id) on delete set null,
  family_id       uuid references families(id) on delete set null,
  checklist       jsonb not null default '[]'::jsonb,
  notes           text,
  completed_at    timestamptz,
  completed_by    uuid references profiles(id) on delete set null,
  cancelled_at    timestamptz,
  created_by      uuid not null references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);

create index idx_planning_tasks_org_status
  on planning_tasks (organization_id, status, due_at)
  where archived_at is null;

create index idx_planning_tasks_assigned
  on planning_tasks (assigned_to, status)
  where archived_at is null and assigned_to is not null;

create index idx_planning_tasks_event
  on planning_tasks (event_id)
  where event_id is not null and archived_at is null;

-- ── planning_templates ────────────────────────────────────────────────────

create table planning_templates (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  name               text not null,
  description        text,
  category           event_category not null default 'other',
  events_template    jsonb not null default '[]'::jsonb,
  tasks_template     jsonb not null default '[]'::jsonb,
  reminders_template jsonb not null default '[]'::jsonb,
  is_system          boolean not null default false,
  created_by         uuid not null references profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_planning_templates_org on planning_templates(organization_id);

-- ── calendar_preferences ──────────────────────────────────────────────────

create table calendar_preferences (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  default_view    text not null default 'agenda',
  hidden_categories text[] not null default '{}',
  show_staff_only boolean not null default false,
  timezone        text,
  updated_at      timestamptz not null default now(),
  unique(profile_id, organization_id)
);

-- ── Enable RLS ────────────────────────────────────────────────────────────

alter table calendar_events      enable row level security;
alter table event_reminders      enable row level security;
alter table event_rsvps          enable row level security;
alter table planning_tasks       enable row level security;
alter table planning_templates   enable row level security;
alter table calendar_preferences enable row level security;

-- ── calendar_events RLS ───────────────────────────────────────────────────

-- Staff: all non-archived events (all visibility levels except admin_private for non-admins)
create policy "staff_select_events" on calendar_events for select
  using (
    is_staff_or_above(calendar_events.organization_id)
    and calendar_events.archived_at is null
    and (
      calendar_events.visibility != 'admin_private'::event_visibility
      or is_org_admin(calendar_events.organization_id)
    )
  );

create policy "staff_insert_events" on calendar_events for insert
  with check (
    is_staff_or_above(calendar_events.organization_id)
    and calendar_events.created_by = auth.uid()
  );

create policy "staff_update_events" on calendar_events for update
  using (
    is_staff_or_above(calendar_events.organization_id)
    and (calendar_events.created_by = auth.uid() or is_org_admin(calendar_events.organization_id))
    and calendar_events.archived_at is null
  );

create policy "admin_delete_events" on calendar_events for delete
  using (is_org_admin(calendar_events.organization_id));

-- Parents: school_wide and parents-visibility published events
create policy "parent_select_school_events" on calendar_events for select
  using (
    is_org_member(calendar_events.organization_id)
    and calendar_events.archived_at is null
    and calendar_events.status = 'published'::event_status
    and calendar_events.visibility in (
      'school_wide'::event_visibility,
      'parents'::event_visibility
    )
  );

-- Parents: their specific student's events
create policy "parent_select_student_events" on calendar_events for select
  using (
    calendar_events.archived_at is null
    and calendar_events.status = 'published'::event_status
    and calendar_events.visibility = 'specific_student'::event_visibility
    and exists (
      select 1 from guardianships g
      where g.student_id  = calendar_events.student_id
        and g.profile_id  = auth.uid()
        and g.status      = 'active'
    )
  );

-- Parents: their specific family's events
create policy "parent_select_family_events" on calendar_events for select
  using (
    calendar_events.archived_at is null
    and calendar_events.status = 'published'::event_status
    and calendar_events.visibility = 'specific_family'::event_visibility
    and exists (
      select 1 from students s
      join guardianships g on g.student_id = s.id
      where s.family_id   = calendar_events.family_id
        and g.profile_id  = auth.uid()
        and g.status      = 'active'
    )
  );

-- ── event_reminders RLS ───────────────────────────────────────────────────

create policy "staff_all_reminders" on event_reminders for all
  using  (is_staff_or_above(event_reminders.organization_id))
  with check (is_staff_or_above(event_reminders.organization_id));

-- ── event_rsvps RLS ───────────────────────────────────────────────────────

create policy "staff_select_rsvps" on event_rsvps for select
  using (is_staff_or_above(event_rsvps.organization_id));

create policy "parent_select_own_rsvps" on event_rsvps for select
  using (event_rsvps.profile_id = auth.uid());

create policy "parent_insert_own_rsvp" on event_rsvps for insert
  with check (event_rsvps.profile_id = auth.uid() and is_org_member(event_rsvps.organization_id));

create policy "parent_update_own_rsvp" on event_rsvps for update
  using (event_rsvps.profile_id = auth.uid());

-- ── planning_tasks RLS ────────────────────────────────────────────────────

create policy "staff_select_tasks" on planning_tasks for select
  using (is_staff_or_above(planning_tasks.organization_id) and planning_tasks.archived_at is null);

create policy "staff_insert_tasks" on planning_tasks for insert
  with check (
    is_staff_or_above(planning_tasks.organization_id)
    and planning_tasks.created_by = auth.uid()
  );

create policy "staff_update_tasks" on planning_tasks for update
  using (
    is_staff_or_above(planning_tasks.organization_id)
    and (
      planning_tasks.assigned_to = auth.uid()
      or planning_tasks.created_by = auth.uid()
      or is_org_admin(planning_tasks.organization_id)
    )
    and planning_tasks.archived_at is null
  );

create policy "admin_delete_tasks" on planning_tasks for delete
  using (is_org_admin(planning_tasks.organization_id));

-- ── planning_templates RLS ────────────────────────────────────────────────

create policy "staff_select_templates" on planning_templates for select
  using (is_staff_or_above(planning_templates.organization_id));

create policy "admin_insert_templates" on planning_templates for insert
  with check (is_org_admin(planning_templates.organization_id));

create policy "admin_update_templates" on planning_templates for update
  using (is_org_admin(planning_templates.organization_id));

create policy "admin_delete_templates" on planning_templates for delete
  using (is_org_admin(planning_templates.organization_id));

-- ── calendar_preferences RLS ──────────────────────────────────────────────

create policy "own_preferences" on calendar_preferences for all
  using  (calendar_preferences.profile_id = auth.uid())
  with check (calendar_preferences.profile_id = auth.uid());
