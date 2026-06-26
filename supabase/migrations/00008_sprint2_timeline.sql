-- ============================================================
-- Migration 00008 — Sprint 2: Timeline Engine Foundation
-- SchoolCo Platform
-- ============================================================
-- Adds:
--   • timeline_entry_type enum
--   • timeline_entries table
--   • RLS policies (role-aware, split-household-safe)
--   • can_view_timeline_entry() helper
--   • get_student_timeline() helper
-- ============================================================

-- ── Enum ──────────────────────────────────────────────────────────────────

create type timeline_entry_type as enum (
  'enrollment',
  'grade_transition',
  'track_change',
  'report_card_published',
  'badge_earned',
  'service_milestone',
  'business_milestone',
  'attendance_milestone',
  'character_recognition',
  'staff_note_shared',
  'announcement',
  'communication_sent',
  'incident_resolved',
  'guardian_linked',
  'ai_summary',
  'celebration',
  'custom'
);

-- ── Table ─────────────────────────────────────────────────────────────────

create table if not exists timeline_entries (
  id                    uuid              primary key default gen_random_uuid(),
  organization_id       uuid              not null references organizations(id) on delete restrict,

  -- Subject of this entry
  student_id            uuid              references students(id) on delete set null,
  family_id             uuid              references families(id) on delete set null,

  -- Content
  entry_type            timeline_entry_type not null,
  title                 text              not null,
  body                  text,
  icon                  text,             -- Lucide icon name, e.g. 'GraduationCap'
  color_key             text default 'teal', -- 'teal'|'navy'|'gold'|'green'|'rose'|'gray'

  -- Source traceability (what caused this entry)
  source_event_name     text,             -- e.g. 'student.enrolled'
  source_resource_type  text,             -- e.g. 'student'
  source_resource_id    uuid,

  -- Visibility & approval gates
  staff_only            boolean           not null default false,
  requires_approval     boolean           not null default false,
  approved_by           uuid              references profiles(id),
  approved_at           timestamptz,
  hidden_at             timestamptz,      -- Soft-hide; never delete
  hidden_by             uuid              references profiles(id),

  -- AI Summary fields
  ai_generated          boolean           not null default false,
  ai_reviewed           boolean           not null default false,
  ai_reviewed_by        uuid              references profiles(id),

  -- Celebration fields
  is_celebration        boolean           not null default false,
  org_wide_shared       boolean           not null default false,
  org_wide_shared_at    timestamptz,

  -- Rich metadata (entry-type-specific payload)
  metadata              jsonb,

  -- When the thing actually happened (may differ from created_at for retroactive entries)
  occurred_at           timestamptz       not null default now(),

  -- Standard columns
  created_at            timestamptz       not null default now(),
  created_by            uuid              references profiles(id),
  updated_at            timestamptz       not null default now(),
  updated_by            uuid              references profiles(id),

  -- Constraint: every entry must relate to a student or a family (or both)
  constraint chk_timeline_subject check (
    student_id is not null or family_id is not null
  )
);

-- Indexes for common query patterns
create index idx_timeline_student     on timeline_entries (organization_id, student_id, occurred_at desc)
  where student_id is not null;
create index idx_timeline_family      on timeline_entries (organization_id, family_id, occurred_at desc)
  where family_id is not null;
create index idx_timeline_type        on timeline_entries (organization_id, entry_type, occurred_at desc);
create index idx_timeline_celebration on timeline_entries (organization_id, occurred_at desc)
  where is_celebration = true and org_wide_shared = true;
create index idx_timeline_pending_approval on timeline_entries (organization_id, created_at desc)
  where requires_approval = true and approved_at is null;

-- updated_at trigger
create trigger trg_timeline_entries_updated_at
  before update on timeline_entries
  for each row
  execute function update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────────────────

alter table timeline_entries enable row level security;

-- ── Helper: can staff member view this entry? ─────────────────────────────

create or replace function is_staff_in_org(p_organization_id uuid)
returns boolean
language plpgsql
security definer
stable
as $$
begin
  return exists (
    select 1
    from organization_members
    where profile_id      = auth.uid()
      and organization_id = p_organization_id
      and status          = 'active'
      and role            in ('teacher','staff','registrar','admin','full_admin','platform_admin')
  );
end;
$$;

-- ── Staff SELECT: see all non-hidden entries in their org ─────────────────

create policy "staff_select_timeline_entries"
  on timeline_entries
  for select
  using (
    is_staff_in_org(organization_id)
    and hidden_at is null
  );

-- ── Parent/guardian SELECT ────────────────────────────────────────────────
-- Parents can see entries where ALL of the following are true:
--   1. They are a guardian of the student referenced
--   2. The entry is not staff_only
--   3. The entry is not pending approval
--   4. The entry is not hidden

create policy "parent_select_timeline_entries"
  on timeline_entries
  for select
  using (
    -- User is a guardian of this student (respects split-household isolation)
    (
      student_id is not null
      and is_guardian_of(student_id)
    )
    and staff_only = false
    and hidden_at is null
    and (requires_approval = false or approved_at is not null)
    and exists (
      select 1 from organization_members
      where profile_id      = auth.uid()
        and organization_id = timeline_entries.organization_id
        and role            = 'parent'
        and status          = 'active'
    )
  );

-- ── INSERT: staff+ only ────────────────────────────────────────────────────

create policy "staff_insert_timeline_entries"
  on timeline_entries
  for insert
  with check (
    is_staff_in_org(organization_id)
  );

-- ── UPDATE: staff+ only, no deleting hidden_at once set ───────────────────
-- Staff can update (edit body, approve, set org_wide_shared) but cannot un-hide.

create policy "staff_update_timeline_entries"
  on timeline_entries
  for update
  using (
    is_staff_in_org(organization_id)
  )
  with check (
    is_staff_in_org(organization_id)
    -- Cannot clear hidden_at once set (entries are soft-hidden only, irreversible via RLS)
    and (hidden_at = (select hidden_at from timeline_entries te2 where te2.id = timeline_entries.id)
         or hidden_at is null)
  );

-- NO DELETE policy — timeline entries are never deleted. hidden_at is the soft-hide mechanism.

-- ── Celebration Org-Feed SELECT (supplemental) ────────────────────────────
-- All active members of the org can see org-wide shared celebrations.

create policy "member_select_shared_celebrations"
  on timeline_entries
  for select
  using (
    is_celebration = true
    and org_wide_shared = true
    and hidden_at is null
    and exists (
      select 1 from organization_members
      where profile_id      = auth.uid()
        and organization_id = timeline_entries.organization_id
        and status          = 'active'
    )
  );

-- ── Helper: get student timeline (staff-facing) ────────────────────────────

create or replace function get_student_timeline(
  p_student_id     uuid,
  p_organization_id uuid,
  p_limit          int  default 50,
  p_offset         int  default 0
)
returns setof timeline_entries
language plpgsql
security definer
stable
as $$
begin
  return query
  select *
  from timeline_entries
  where student_id      = p_student_id
    and organization_id = p_organization_id
    and hidden_at is null
  order by occurred_at desc
  limit  p_limit
  offset p_offset;
end;
$$;

-- ── Helper: get student timeline (parent-facing) ───────────────────────────
-- Enforces visibility_json through is_guardian_of() RLS helper.

create or replace function get_student_timeline_for_parent(
  p_student_id      uuid,
  p_organization_id uuid,
  p_limit           int default 50,
  p_offset          int default 0
)
returns setof timeline_entries
language plpgsql
security definer
stable
as $$
begin
  -- Verify calling user is a guardian of this student
  if not is_guardian_of(p_student_id) then
    return;
  end if;

  return query
  select *
  from timeline_entries
  where student_id        = p_student_id
    and organization_id   = p_organization_id
    and staff_only        = false
    and hidden_at         is null
    and (requires_approval = false or approved_at is not null)
  order by occurred_at desc
  limit  p_limit
  offset p_offset;
end;
$$;

-- ── Grant execute permissions ─────────────────────────────────────────────

grant execute on function is_staff_in_org(uuid)              to authenticated;
grant execute on function get_student_timeline(uuid, uuid, int, int) to authenticated;
grant execute on function get_student_timeline_for_parent(uuid, uuid, int, int) to authenticated;
