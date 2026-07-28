-- ============================================================
-- Migration 00036 — Launch Readiness Center
-- SchoolCo Platform
-- ============================================================
-- Adds tables to support the pre-launch command center:
--   • launch_checklist_items — per-org checklist tracking
--   • launch_pilot_families  — pilot family invitations
--   • launch_pilot_events    — pilot engagement events
--
-- NOTE: import_jobs already exists from 00012. We add entity_type
--       as an optional text column to support the launch import UI.
-- ============================================================

-- ── Types ─────────────────────────────────────────────────────────────────

drop type if exists checklist_status cascade;
drop type if exists pilot_event_type cascade;

create type checklist_status as enum ('pending', 'in_progress', 'completed', 'skipped', 'blocked');
create type pilot_event_type as enum ('invited', 'accepted', 'portal_login', 'first_message', 'first_rsvp', 'first_attendance_view', 'issue_reported');

-- ── Add entity_type to existing import_jobs ───────────────────────────────

alter table import_jobs
  add column if not exists entity_type text
    check (entity_type in (
      'staff','families','students','emergency_contacts','medical',
      'authorized_pickup','leadership_groups','entrepreneurship_groups',
      'community_service','attendance_history'
    ));

-- ── launch_checklist_items ─────────────────────────────────────────────────

drop table if exists launch_checklist_items cascade;

create table launch_checklist_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  item_key         text not null,
  status           checklist_status not null default 'pending',
  owner_name       text,
  completed_at     timestamptz,
  completed_by     uuid references profiles(id),
  notes            text,
  updated_at       timestamptz not null default now(),
  unique(organization_id, item_key)
);

create index idx_launch_checklist_org on launch_checklist_items(organization_id);

alter table launch_checklist_items enable row level security;

create policy "admin_launch_checklist" on launch_checklist_items for all
  using (is_org_admin(launch_checklist_items.organization_id))
  with check (is_org_admin(launch_checklist_items.organization_id));

-- ── launch_pilot_families ─────────────────────────────────────────────────

drop table if exists launch_pilot_events cascade;
drop table if exists launch_pilot_families cascade;

create table launch_pilot_families (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  family_id        uuid references families(id) on delete cascade,
  family_name      text not null,
  invited_at       timestamptz not null default now(),
  invited_by       uuid references profiles(id),
  notes            text
);

create index idx_pilot_families_org on launch_pilot_families(organization_id);

alter table launch_pilot_families enable row level security;

create policy "admin_pilot_families" on launch_pilot_families for all
  using (is_org_admin(launch_pilot_families.organization_id))
  with check (is_org_admin(launch_pilot_families.organization_id));

-- ── launch_pilot_events ───────────────────────────────────────────────────

create table launch_pilot_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  pilot_family_id  uuid not null references launch_pilot_families(id) on delete cascade,
  event_type       pilot_event_type not null,
  occurred_at      timestamptz not null default now(),
  notes            text
);

create index idx_pilot_events_family on launch_pilot_events(pilot_family_id);

alter table launch_pilot_events enable row level security;

create policy "admin_pilot_events" on launch_pilot_events for all
  using (is_org_admin(launch_pilot_events.organization_id))
  with check (is_org_admin(launch_pilot_events.organization_id));
