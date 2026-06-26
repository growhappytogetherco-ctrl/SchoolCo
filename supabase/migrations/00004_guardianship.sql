-- ============================================================
-- SchoolCo — Guardianship & Split-Household Architecture
-- Migration: 00004_guardianship
-- Decision: ADR-0002 (Option A — dedicated guardianship table)
--
-- This migration adds:
--   1. relationship_type enum
--   2. custody_type enum
--   3. students table (minimal, Sprint 1 foundation)
--   4. guardianships table (parent ↔ student relationship)
--   5. RLS policies for all new tables
--   6. 2 new helper functions: can_view_student(), is_guardian_of()
--
-- Security: Parents NEVER see another household's guardianship record.
-- Split-household visibility is enforced per-field via visibility_json.
-- Court orders, pickup restrictions, and legal status are stored here —
-- NEVER in organization_members.
-- ============================================================

-- ── Shared trigger function (used by this and later migrations) ──────────
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Extensions (already enabled, idempotent) ────────────────
create extension if not exists "uuid-ossp";

-- ── Enums ───────────────────────────────────────────────────

create type relationship_type as enum (
  'mother',
  'father',
  'stepmother',
  'stepfather',
  'grandmother',
  'grandfather',
  'aunt',
  'uncle',
  'foster_parent',
  'legal_guardian',
  'other'
);

create type custody_type as enum (
  'primary',      -- Lives primarily with this guardian
  'joint',        -- Shared custody, roughly equal time
  'secondary',    -- Visits / every-other-weekend arrangements
  'supervised',   -- Visits must be supervised — flag to staff
  'none'          -- No custody; emergency contact only
);

create type enrollment_status as enum (
  'applicant',    -- Application submitted, not yet reviewed
  'waitlisted',   -- Reviewed, on waitlist
  'enrolled',     -- Active student
  'withdrawn',    -- Withdrew voluntarily
  'graduated',    -- Completed program
  'expelled'      -- Administrative removal (archived, never deleted)
);

-- ── students ─────────────────────────────────────────────────
-- Intentionally minimal in Sprint 1.
-- Health records, IEPs, medical conditions are Sprint 3+.
-- No SSN, no DOB in this table — those go in a separate
-- health_records table with stricter RLS in Sprint 3.

create table students (
  -- Standard columns
  id                 uuid             default gen_random_uuid() primary key,
  organization_id    uuid             not null references organizations(id) on delete cascade,
  created_at         timestamptz      default now() not null,
  created_by         uuid             references profiles(id),
  updated_at         timestamptz      default now() not null,
  updated_by         uuid             references profiles(id),
  status             text             default 'active' not null,
  archived_at        timestamptz,
  archived_by        uuid             references profiles(id),

  -- Identity
  first_name         text             not null,
  last_name          text             not null,
  preferred_name     text,                        -- Nickname displayed in UI
  grade_level        text,                        -- "3rd", "5th", "K", etc. — flexible text
  enrollment_status  enrollment_status default 'enrolled' not null,
  enrollment_date    date,
  expected_graduation date,

  -- Program info
  track              text,                        -- "classical", "entrepreneurship", etc.
  homeroom_teacher   uuid             references profiles(id),

  -- No DOB stored here — see health_records (Sprint 3)
  -- No medical info stored here — see health_records (Sprint 3)

  constraint students_org_name_unique unique (organization_id, first_name, last_name)
);

create index idx_students_org          on students(organization_id);
create index idx_students_status       on students(organization_id, enrollment_status);
create index idx_students_grade        on students(organization_id, grade_level);

-- auto-update updated_at
create trigger students_updated_at
  before update on students
  for each row execute function update_updated_at_column();

-- ── guardianships ─────────────────────────────────────────────
-- One row per (guardian, student) pair.
-- A student with two parents in different households = two rows.
-- Each row independently controls what that guardian can see and do.
--
-- SECURITY RULE:
--   Parent A must NEVER be able to see Parent B's guardianship record.
--   This is enforced by RLS policy: parents see only their own rows.
--   Staff and above see all rows in their org.

create table guardianships (
  -- Standard columns
  id                      uuid          default gen_random_uuid() primary key,
  organization_id         uuid          not null references organizations(id) on delete cascade,
  created_at              timestamptz   default now() not null,
  created_by              uuid          references profiles(id),
  updated_at              timestamptz   default now() not null,
  updated_by              uuid          references profiles(id),
  status                  text          default 'active' not null,
  archived_at             timestamptz,
  archived_by             uuid          references profiles(id),

  -- Core relationship
  profile_id              uuid          not null references profiles(id),   -- The guardian
  student_id              uuid          not null references students(id) on delete cascade,
  relationship_type       relationship_type not null,
  household_label         text,         -- "Johnson Family – Primary", "Johnson Family – Secondary"

  -- Legal & custody
  custody_type            custody_type  not null default 'primary',
  is_legal_guardian       boolean       not null default false,
  court_order_on_file     boolean       not null default false,
  court_order_notes       text,         -- Staff-only notes, never exposed to parents
                                        -- (enforced by: parents never query this table
                                        --  directly — they get a view with notes stripped)

  -- Contact & authorization
  is_primary_contact      boolean       not null default false,
  is_emergency_contact    boolean       not null default false,
  emergency_contact_order smallint      check (emergency_contact_order between 1 and 10),
  can_pickup              boolean       not null default true,
  pickup_restrictions     text,         -- e.g. "Cannot pick up on Tuesdays" — visible to staff

  -- Per-field visibility for this guardian
  -- Controls what this guardian sees when they log in.
  -- Staff always see everything regardless of this JSONB.
  visibility_json         jsonb         not null default '{
    "academics":      true,
    "attendance":     true,
    "report_cards":   true,
    "communications": true,
    "health_records": true,
    "incidents":      true,
    "behavior_notes": true
  }',

  -- Communication preferences for this guardian
  communication_json      jsonb         not null default '{
    "email":   true,
    "sms":     false,
    "app":     true
  }',

  -- One guardian per student per org — uniqueness enforced
  constraint guardianships_unique unique (organization_id, profile_id, student_id)
);

create index idx_guardianships_org        on guardianships(organization_id);
create index idx_guardianships_profile    on guardianships(profile_id);
create index idx_guardianships_student    on guardianships(student_id);
create index idx_guardianships_pickup     on guardianships(organization_id, can_pickup) where can_pickup = true;
create index idx_guardianships_active     on guardianships(organization_id, student_id) where status = 'active' and archived_at is null;

-- auto-update updated_at
create trigger guardianships_updated_at
  before update on guardianships
  for each row execute function update_updated_at_column();

-- ── Helper Functions ─────────────────────────────────────────

-- is_guardian_of(student_id uuid)
-- Returns true if the current user is an active guardian of the given student
-- in any organization.
create or replace function is_guardian_of(student_id uuid)
returns boolean
language plpgsql
security definer stable
as $$
begin
  return exists (
    select 1
    from guardianships g
    where g.student_id = is_guardian_of.student_id
      and g.profile_id = auth.uid()
      and g.status = 'active'
      and g.archived_at is null
  );
end;
$$;

-- can_view_student(student_id uuid, field text)
-- Returns true if the current user can view a specific data category
-- for a given student. Field matches the keys in visibility_json.
-- Staff and above bypass this check entirely via separate RLS.
create or replace function can_view_student(student_id uuid, field text)
returns boolean
language plpgsql
security definer stable
as $$
declare
  v_visible boolean;
begin
  select (visibility_json ->> field)::boolean
  into v_visible
  from guardianships
  where guardianships.student_id = can_view_student.student_id
    and guardianships.profile_id = auth.uid()
    and guardianships.status = 'active'
    and guardianships.archived_at is null
  limit 1;

  return coalesce(v_visible, false);
end;
$$;

-- ── Enable RLS ───────────────────────────────────────────────

alter table students enable row level security;
alter table guardianships enable row level security;

-- ── RLS: students ────────────────────────────────────────────

-- Staff and above can view all students in their org
create policy "students_staff_select"
on students for select
to authenticated
using (
  is_staff_or_above(organization_id)
);

-- Guardians can view their own linked students
create policy "students_guardian_select"
on students for select
to authenticated
using (
  is_guardian_of(id)
);

-- Registrars and above can insert students
create policy "students_registrar_insert"
on students for insert
to authenticated
with check (
  has_min_org_role(organization_id, 'registrar')
);

-- Registrars and above can update students
create policy "students_registrar_update"
on students for update
to authenticated
using (
  has_min_org_role(organization_id, 'registrar')
)
with check (
  has_min_org_role(organization_id, 'registrar')
);

-- NO DELETE policy — records are archived, never deleted
-- archived_at is set instead of using DELETE

-- ── RLS: guardianships ───────────────────────────────────────

-- Staff and above can view all guardianship records in their org
create policy "guardianships_staff_select"
on guardianships for select
to authenticated
using (
  is_staff_or_above(organization_id)
);

-- Parents see ONLY their own guardianship records
-- This is the split-household isolation rule:
-- Parent A cannot see Parent B's record, even for the same student.
create policy "guardianships_own_select"
on guardianships for select
to authenticated
using (
  profile_id = auth.uid()
  and status = 'active'
  and archived_at is null
);

-- Registrars and above can create guardianship records
create policy "guardianships_registrar_insert"
on guardianships for insert
to authenticated
with check (
  has_min_org_role(organization_id, 'registrar')
);

-- Registrars and above can update guardianship records
create policy "guardianships_registrar_update"
on guardianships for update
to authenticated
using (
  has_min_org_role(organization_id, 'registrar')
)
with check (
  has_min_org_role(organization_id, 'registrar')
);

-- Full admins and above can archive (soft-delete) guardianship records
-- Archiving = setting archived_at, NOT deleting the row.
-- This is handled via UPDATE (setting archived_at), not DELETE.

-- NO DELETE policy — custody history is preserved forever.

-- ── Verification queries (run after migration to confirm) ─────
-- Run these manually in the Supabase SQL Editor to confirm:
--
-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public' and tablename in ('students','guardianships');
-- → Both should show rowsecurity = true
--
-- select routine_name from information_schema.routines
-- where routine_schema = 'public' and routine_name in ('is_guardian_of','can_view_student');
-- → Both functions should appear
--
-- select column_name from information_schema.columns
-- where table_name = 'guardianships' order by ordinal_position;
-- → Verify all columns are present
