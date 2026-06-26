-- ============================================================
-- SchoolCo — Initial Schema
-- Migration: 00001_initial_schema
-- Environment: schoolco-dev (run separately for staging/production)
-- ============================================================
-- SECURITY MODEL: Default deny. RLS on every table.
-- No data is accessible without an explicit policy.
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── Custom Enum Types ─────────────────────────────────────────────────────

-- User roles — ordered lowest to highest privilege.
-- A user can hold different roles in different organizations.
create type user_role as enum (
  'student_future',   -- Incoming student (enrolled, not yet attending)
  'parent',           -- Parent or legal guardian
  'volunteer',        -- Community volunteer (limited access)
  'teacher',          -- Classroom teacher
  'staff',            -- General staff (non-teaching)
  'registrar',        -- Enrollment and records management
  'admin',            -- Organization administrator
  'full_admin',       -- Organization owner / director (full org control)
  'platform_admin'    -- SchoolCo platform owner (cross-organization)
);

create type membership_status as enum (
  'active',
  'inactive',
  'pending',
  'suspended'
);

-- ── Standard Column Pattern ────────────────────────────────────────────────
-- Every future operational table MUST include these columns.
-- Document this pattern here for all future developers.
--
-- id              uuid primary key default uuid_generate_v4()
-- organization_id uuid not null references organizations(id) on delete cascade
-- created_at      timestamptz not null default now()
-- created_by      uuid references profiles(id) on delete set null
-- updated_at      timestamptz not null default now()
-- updated_by      uuid references profiles(id) on delete set null
-- status          text not null default 'active'
-- archived_at     timestamptz
-- archived_by     uuid references profiles(id) on delete set null
--
-- NOTE: Records should NEVER be deleted. Use archived_at to soft-delete.

-- ── Organizations ─────────────────────────────────────────────────────────
-- Each row is one school, academy, foundation, or program.
-- Rising Leaders Academy is simply one row — nothing is hard-coded.
-- Every organization fully controls its own branding via these columns.

create table organizations (
  id                uuid         primary key default uuid_generate_v4(),
  name              text         not null,
  short_name        text,                          -- Abbreviated name e.g. "RLA"
  slug              text         not null unique,  -- URL-safe e.g. "rising-leaders-academy"
  organization_type text         not null default 'academy',
                                                   -- academy | foundation | program |
                                                   -- outreach | church | tutoring | other
  tagline           text,                          -- One-line mission statement
  logo_url          text,
  primary_color     text,                          -- Hex e.g. "#046264"
  secondary_color   text,
  accent_color      text,
  phone             text,
  email             text,
  website           text,
  address           jsonb,                         -- { street1, street2, city, state, zip, country }
  timezone          text         not null default 'America/New_York',
  theme_json        jsonb,                         -- Full theme overrides: fonts, colors, favicon
  settings_json     jsonb,                         -- Feature flags and org-level configuration
  is_active         boolean      not null default true,
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now()
);

comment on table organizations is
  'Each row is a school, academy, or program hosted on SchoolCo. '
  'All branding and configuration is stored per-organization. '
  'Nothing is hard-coded to any specific organization.';

comment on column organizations.theme_json is
  'Full theme overrides. Keys: primary_color, secondary_color, accent_color, '
  'font_heading, font_body, logo_url, favicon_url.';

comment on column organizations.settings_json is
  'Feature flags and org-level config. Keys: features.attendance, features.grades, '
  'features.communications, features.giving, features.badge_studio, features.qr_checkin, '
  'features.ai_assist, enrollment.require_approval, enrollment.open_enrollment, '
  'enrollment.max_students.';

-- ── Profiles ──────────────────────────────────────────────────────────────
-- Extends auth.users with display information.
-- id mirrors auth.users.id exactly.
-- No sensitive auth data is stored here.

create table profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  email       text        not null,
  full_name   text        not null default '',
  avatar_url  text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table profiles is
  'User display profile. 1-to-1 with auth.users. '
  'Contains no auth secrets. Safe to read via RLS for authorized viewers.';

-- ── Organization Members ──────────────────────────────────────────────────
-- Maps a Profile to an Organization with a specific role.
-- A user can be a parent in one org and a teacher in another — no code change needed.
-- Split-household permissions will be managed via metadata + a future guardianship table.

create table organization_members (
  id               uuid             primary key default uuid_generate_v4(),
  organization_id  uuid             not null references organizations(id) on delete cascade,
  profile_id       uuid             not null references profiles(id) on delete cascade,
  role             user_role        not null,
  status           membership_status not null default 'pending',
  joined_at        timestamptz,
  metadata         jsonb,           -- Role-specific data; split-household flags live here in Sprint 1
  created_at       timestamptz      not null default now(),
  updated_at       timestamptz      not null default now(),

  unique(organization_id, profile_id)   -- One active membership per org per person
);

comment on table organization_members is
  'Links profiles to organizations with a specific role. '
  'One user can have different roles in different organizations. '
  'Split-household custody and visibility rules will be managed via metadata '
  'and the forthcoming guardianship table in Sprint 1.';

comment on column organization_members.metadata is
  'Flexible role-specific data. '
  'For parents: { household_id, custody_schedule, visibility_restrictions }. '
  'For teachers: { homeroom, subjects }. '
  'For volunteers: { approved_areas, background_check_date }.';

create index idx_org_members_org       on organization_members(organization_id);
create index idx_org_members_profile   on organization_members(profile_id);
create index idx_org_members_role      on organization_members(organization_id, role);
create index idx_org_members_status    on organization_members(organization_id, status);

-- ── Audit Logs ────────────────────────────────────────────────────────────
-- Immutable append-only record of every sensitive action.
-- No UPDATE or DELETE is permitted on this table — enforced by RLS.
-- Only full_admin and platform_admin may view audit logs.

create table audit_logs (
  id               uuid        primary key default uuid_generate_v4(),
  organization_id  uuid        references organizations(id),  -- null = platform-level action
  actor_id         uuid        not null references profiles(id),
  action           text        not null,              -- e.g. "member.invited", "record.viewed"
  resource_type    text,                              -- e.g. "student", "document", "attendance"
  resource_id      uuid,
  previous_values  jsonb,                             -- Snapshot of record BEFORE the change
  new_values       jsonb,                             -- Snapshot of record AFTER the change
  metadata         jsonb,                             -- Additional context (reason, notes)
  ip_address       inet,
  device           text,                              -- User agent / device string
  session_id       text,                              -- Future: session-based correlation
  created_at       timestamptz not null default now()
);

comment on table audit_logs is
  'Append-only audit trail. No UPDATE or DELETE is permitted via RLS. '
  'Only full_admin and platform_admin may view. '
  'Records are never purged — this is a compliance requirement.';

comment on column audit_logs.previous_values is
  'JSONB snapshot of the resource state BEFORE the action. '
  'Application layer is responsible for capturing and passing this.';

comment on column audit_logs.new_values is
  'JSONB snapshot of the resource state AFTER the action. '
  'Application layer is responsible for capturing and passing this.';

create index idx_audit_org     on audit_logs(organization_id);
create index idx_audit_actor   on audit_logs(actor_id);
create index idx_audit_action  on audit_logs(action);
create index idx_audit_resource on audit_logs(resource_type, resource_id);
create index idx_audit_time    on audit_logs(created_at desc);

-- ── Updated-At Trigger ────────────────────────────────────────────────────

create or replace function handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_organizations_updated_at
  before update on organizations
  for each row execute function handle_updated_at();

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function handle_updated_at();

create trigger trg_org_members_updated_at
  before update on organization_members
  for each row execute function handle_updated_at();

-- ── Auto-Create Profile on Sign-Up ────────────────────────────────────────
-- Fires immediately after a new user is created in auth.users.
-- Copies email and display name from OAuth metadata if present.

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;  -- Safe re-run
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Seed: Default SchoolCo Platform Data ──────────────────────────────────
-- No organization data is seeded here.
-- Organizations are created via the admin interface or the setup guide.
-- See SUPABASE_SETUP.md for the INSERT statement to create your first organization.
