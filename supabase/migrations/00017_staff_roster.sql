-- ── Migration 00017 — Staff Roster ────────────────────────────────────────
-- Admin-managed staff directory. Does NOT require a Supabase auth account.
-- Staff are added manually by an admin. profile_id is optional and links to
-- an auth user only if/when that person logs into the system.

create table staff_roster (
  id                        uuid          primary key default gen_random_uuid(),
  organization_id           uuid          not null references organizations(id) on delete cascade,

  -- Basic info
  first_name                text          not null,
  last_name                 text          not null,
  email                     text,
  phone                     text,
  display_title             text,
  bio                       text,
  avatar_url                text,

  -- Classification
  staff_type                text          not null default 'staff',
  -- values: staff | volunteer | contractor
  primary_role              text          not null default 'staff',
  -- values: volunteer | teacher | staff | registrar | admin | full_admin
  additional_roles          text[]        not null default '{}',
  status                    text          not null default 'active',
  -- values: active | inactive | suspended

  -- Dates
  start_date                date,
  end_date                  date,

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

  -- Emergency contact
  emergency_contact_name    text,
  emergency_contact_phone   text,
  emergency_contact_rel     text,

  -- Admin-only notes
  compliance_notes          text,

  -- Optional link to a Supabase auth user (set only if they log in)
  profile_id                uuid          references profiles(id) on delete set null,

  created_at                timestamptz   not null default now(),
  updated_at                timestamptz   not null default now(),
  archived_at               timestamptz
);

comment on table staff_roster is
  'Admin-managed staff directory. No Supabase auth account required. '
  'profile_id is optional and links to an auth user only if the person logs in.';

create trigger trg_staff_roster_updated_at
  before update on staff_roster
  for each row execute function handle_updated_at();

create index idx_staff_roster_org     on staff_roster(organization_id);
create index idx_staff_roster_status  on staff_roster(organization_id, status);
create index idx_staff_roster_type    on staff_roster(organization_id, staff_type);
create index idx_staff_roster_profile on staff_roster(profile_id) where profile_id is not null;

alter table staff_roster enable row level security;

-- Staff+ can read the roster
create policy "staff_roster_read"
  on staff_roster for select
  using (
    organization_id in (
      select organization_id from organization_members
      where profile_id = auth.uid() and status = 'active'
        and role not in ('parent', 'student_future')
    )
  );

-- Admin+ can insert/update (never hard delete — use archived_at)
create policy "staff_roster_insert"
  on staff_roster for insert
  with check (
    organization_id in (
      select organization_id from organization_members
      where profile_id = auth.uid() and status = 'active'
        and role in ('admin', 'full_admin', 'platform_admin')
    )
  );

create policy "staff_roster_update"
  on staff_roster for update
  using (
    organization_id in (
      select organization_id from organization_members
      where profile_id = auth.uid() and status = 'active'
        and role in ('admin', 'full_admin', 'platform_admin')
    )
  );
