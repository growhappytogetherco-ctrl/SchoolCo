-- ── Migration 00016 — Staff Profiles ──────────────────────────────────────
-- Adds per-org staff compliance and extended profile data.
-- organization_members already handles role + status + auth.
-- This table holds: display_title, staff_type, compliance fields, emergency contact.

-- ── staff_profiles table ──────────────────────────────────────────────────

create table staff_profiles (
  id                        uuid          primary key default gen_random_uuid(),
  organization_id           uuid          not null references organizations(id) on delete cascade,
  profile_id                uuid          not null references profiles(id)        on delete cascade,

  -- Display
  display_title             text,             -- e.g. "Founder / Principal" (separate from role)
  bio                       text,

  -- Classification
  staff_type                text          not null default 'staff',
  -- values: staff | volunteer | contractor
  additional_roles          text[]        not null default '{}',
  -- display-only extra roles beyond the primary in organization_members

  -- Dates
  start_date                date,

  -- Background screening
  background_check_status   text          not null default 'not_submitted',
  -- values: not_submitted | pending | cleared | expired | flagged
  background_check_date     date,
  background_check_expires  date,

  -- Training / compliance
  training_status           text          not null default 'not_started',
  -- values: not_started | in_progress | completed | expired
  training_completed_at     date,
  training_expires_at       date,

  -- CPR / First Aid
  cpr_status                text          not null default 'not_applicable',
  -- values: not_applicable | current | expired
  cpr_expires_at            date,

  -- Emergency contact (optional)
  emergency_contact_name    text,
  emergency_contact_phone   text,
  emergency_contact_rel     text,

  -- Admin-only notes (never visible to volunteers/parents)
  compliance_notes          text,

  created_at                timestamptz   not null default now(),
  updated_at                timestamptz   not null default now(),

  unique(organization_id, profile_id)
);

comment on table staff_profiles is
  'Extended compliance and classification data for staff/volunteers per org. '
  'Linked to organization_members for role/status. '
  'Compliance notes are admin-only — never exposed via parent or volunteer RLS.';

-- ── Updated_at trigger ────────────────────────────────────────────────────

create trigger trg_staff_profiles_updated_at
  before update on staff_profiles
  for each row execute function handle_updated_at();

-- ── Indexes ───────────────────────────────────────────────────────────────

create index idx_staff_profiles_org        on staff_profiles(organization_id);
create index idx_staff_profiles_profile    on staff_profiles(profile_id);
create index idx_staff_profiles_bg_status  on staff_profiles(organization_id, background_check_status);
create index idx_staff_profiles_type       on staff_profiles(organization_id, staff_type);

-- ── RLS ───────────────────────────────────────────────────────────────────

alter table staff_profiles enable row level security;

-- Staff/admin/teacher can read (non-compliance-notes columns handled in app layer)
create policy "staff_profiles_read"
  on staff_profiles for select
  using (
    organization_id in (
      select organization_id from organization_members
      where profile_id = auth.uid()
        and status = 'active'
        and role not in ('parent', 'student_future')
    )
  );

-- Only admin+ can insert/update
create policy "staff_profiles_write"
  on staff_profiles for insert
  with check (
    organization_id in (
      select organization_id from organization_members
      where profile_id = auth.uid()
        and status = 'active'
        and role in ('admin', 'full_admin', 'platform_admin')
    )
  );

create policy "staff_profiles_update"
  on staff_profiles for update
  using (
    organization_id in (
      select organization_id from organization_members
      where profile_id = auth.uid()
        and status = 'active'
        and role in ('admin', 'full_admin', 'platform_admin')
    )
  );
