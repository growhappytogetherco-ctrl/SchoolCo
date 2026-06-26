-- ============================================================
-- Migration 00010 — QR Attendance Tokens & Method Tracking
-- SchoolCo Platform
-- ============================================================
-- Adds:
--   • students.attendance_qr_token — unique ATT-{hex} for check-in/out
--   • students.profile_qr_token    — unique PRF-{hex} for staff profile access
--   • attendance_records.check_in_method  — qr | manual | kiosk
--   • attendance_records.check_out_method — qr | manual | kiosk
--   • org_settings table — configurable arrival cutoff time
--   • Auto-generates QR tokens for all existing students
--   • Trigger: auto-generates tokens for new students on INSERT
-- ============================================================

-- ── 1. QR token columns on students ──────────────────────────────────────

alter table students
  add column if not exists attendance_qr_token  text unique,
  add column if not exists profile_qr_token     text unique;

create index if not exists idx_students_att_qr     on students(attendance_qr_token);
create index if not exists idx_students_profile_qr on students(profile_qr_token);

-- ── 2. Method columns on attendance_records ───────────────────────────────

alter table attendance_records
  add column if not exists check_in_method   text default 'manual'
    check (check_in_method  in ('qr','manual','kiosk','parent_qr')),
  add column if not exists check_out_method  text default 'manual'
    check (check_out_method in ('qr','manual','kiosk','parent_qr'));

-- ── 3. org_settings — configurable per-org settings ──────────────────────
-- Stores arrival cutoff time (after which a check-in is flagged as late),
-- dismissal time, and future config keys.

create table if not exists org_settings (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null unique references organizations(id) on delete cascade,

  -- Attendance timing (stored as TIME, e.g. '08:30:00')
  arrival_cutoff    time          not null default '08:30:00',  -- late if after this
  dismissal_time    time          not null default '15:00:00',  -- early pickup if before this

  -- Badge / QR settings
  badge_background_color  text   default '#046264',   -- sc-teal
  badge_text_color        text   default '#ffffff',

  -- Timezone for the org (e.g. 'America/New_York')
  timezone          text          not null default 'America/New_York',

  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create trigger org_settings_updated_at
  before update on org_settings
  for each row execute function update_updated_at_column();

alter table org_settings enable row level security;

create policy "members_view_org_settings"
  on org_settings for select
  using (is_org_member(organization_id));

create policy "admins_update_org_settings"
  on org_settings for insert
  with check (is_org_admin(organization_id));

create policy "admins_update_org_settings_upd"
  on org_settings for update
  using (is_org_admin(organization_id));

-- Seed default settings for all existing orgs
insert into org_settings (organization_id)
select id from organizations
on conflict (organization_id) do nothing;

-- ── 4. Token generation function ─────────────────────────────────────────
-- Generates a unique prefixed token like ATT-a1b2c3d4e5f6g7h8
-- Uses 12 random bytes (24 hex chars) for collision-safety.

create or replace function generate_qr_token(prefix text)
returns text
language sql
security definer
as $$
  select prefix || encode(extensions.gen_random_bytes(12), 'hex');
$$;

-- ── 5. Auto-generate tokens for existing students ─────────────────────────

update students
set
  attendance_qr_token = generate_qr_token('ATT-'),
  profile_qr_token    = generate_qr_token('PRF-')
where
  attendance_qr_token is null
  or profile_qr_token is null;

-- ── 6. Trigger: auto-generate tokens for new students on INSERT ───────────

create or replace function assign_student_qr_tokens()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.attendance_qr_token is null then
    new.attendance_qr_token := generate_qr_token('ATT-');
  end if;
  if new.profile_qr_token is null then
    new.profile_qr_token := generate_qr_token('PRF-');
  end if;
  return new;
end;
$$;

drop trigger if exists students_assign_qr_tokens on students;
create trigger students_assign_qr_tokens
  before insert on students
  for each row execute function assign_student_qr_tokens();
