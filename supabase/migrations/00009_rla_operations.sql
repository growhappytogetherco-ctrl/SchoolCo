-- ============================================================
-- Migration 00009 — RLA Operations Foundation
-- SchoolCo Platform
-- ============================================================
-- Adds tables required for the Daily Operations Dashboard and
-- Rising Leaders Academy-specific workflows:
--
--   1. attendance_records   — daily check-in / check-out per student
--   2. incidents            — incident reports with severity + resolution
--   3. medication_alerts    — active medication needs for students
--   4. student_documents    — file references (Google Drive IDs or Supabase Storage)
--   5. leadership_badges    — earned leadership recognitions
--   6. entrepreneurship_projects — student business / project tracking
--
-- Also ALTERs students to add:
--   • qr_code               — unique QR identifier for badge scanning
--   • date_of_birth         — needed for age-gating and health records
--   • medical_notes         — free-text medical notes (allergies, conditions)
--   • scholarship_info      — JSONB: { type, amount, donor, notes }
--   • authorized_pickup_notes — free-text override notes (supplements guardianships)
--
-- Run AFTER: 00001 – 00008
-- ============================================================

-- ── 1. Extend students ────────────────────────────────────────────────────

alter table students
  add column if not exists qr_code               text unique,
  add column if not exists date_of_birth         date,
  add column if not exists medical_notes         text,
  add column if not exists allergies             text[],
  add column if not exists scholarship_info      jsonb,
  add column if not exists authorized_pickup_notes text;

create index if not exists idx_students_qr on students(qr_code);

-- ── 2. attendance_records ─────────────────────────────────────────────────
-- One row per (student, date). Supports check-in/out timestamps,
-- late arrivals, early pickups, and absence tracking.

create table if not exists attendance_records (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null references organizations(id) on delete cascade,
  student_id        uuid          not null references students(id) on delete cascade,
  date              date          not null,

  -- Status reflects the final state of the day
  status            text          not null default 'present'
                      check (status in ('present','absent','tardy','excused','checked_in','early_dismissal')),

  -- Check-in / check-out timestamps
  check_in_at       timestamptz,
  check_in_by       uuid          references profiles(id),
  check_out_at      timestamptz,
  check_out_by      uuid          references profiles(id),

  -- Flags
  is_late           boolean       not null default false,
  is_early_pickup   boolean       not null default false,
  absence_reason    text,
  notes             text,

  -- Audit
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),

  unique (organization_id, student_id, date)
);

create index if not exists idx_attendance_org_date     on attendance_records(organization_id, date);
create index if not exists idx_attendance_student_date on attendance_records(student_id, date);
create index if not exists idx_attendance_status       on attendance_records(organization_id, date, status);

create trigger attendance_updated_at
  before update on attendance_records
  for each row execute function update_updated_at_column();

alter table attendance_records enable row level security;

-- Staff and above can view all attendance in their org
create policy "staff_view_attendance"
  on attendance_records for select
  using (is_org_member(organization_id));

-- Staff and above can record attendance
create policy "staff_insert_attendance"
  on attendance_records for insert
  with check (is_org_member(organization_id));

create policy "staff_update_attendance"
  on attendance_records for update
  using (is_org_member(organization_id));

-- ── 3. incidents ──────────────────────────────────────────────────────────
-- Incident reports: behavioral, medical, safety, etc.
-- Staff write; admins review and close.

create table if not exists incidents (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null references organizations(id) on delete cascade,

  -- Subject(s)
  student_id        uuid          references students(id) on delete set null,

  -- Content
  title             text          not null,
  description       text,
  incident_type     text          not null default 'behavioral'
                      check (incident_type in ('behavioral','medical','safety','property','other')),
  severity          text          check (severity in ('low','medium','high','critical')),

  -- When it happened
  occurred_at       timestamptz   not null default now(),
  location          text,

  -- Workflow
  status            text          not null default 'open'
                      check (status in ('open','under_review','resolved','closed')),
  reported_by       uuid          references profiles(id),
  reviewed_by       uuid          references profiles(id),
  resolved_at       timestamptz,
  resolution_notes  text,

  -- Parent notification
  parent_notified   boolean       not null default false,
  parent_notified_at timestamptz,

  -- Audit
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create index if not exists idx_incidents_org_date  on incidents(organization_id, occurred_at);
create index if not exists idx_incidents_student   on incidents(student_id);
create index if not exists idx_incidents_status    on incidents(organization_id, status);

create trigger incidents_updated_at
  before update on incidents
  for each row execute function update_updated_at_column();

alter table incidents enable row level security;

create policy "staff_view_incidents"
  on incidents for select
  using (is_org_member(organization_id));

create policy "staff_insert_incidents"
  on incidents for insert
  with check (is_org_member(organization_id));

create policy "staff_update_incidents"
  on incidents for update
  using (is_org_member(organization_id));

-- ── 4. medication_alerts ──────────────────────────────────────────────────
-- Active medication needs for students (e.g. EpiPen, inhaler, daily meds).
-- Surfaced on the dashboard for morning staff awareness.

create table if not exists medication_alerts (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null references organizations(id) on delete cascade,
  student_id        uuid          not null references students(id) on delete cascade,

  medication_name   text          not null,
  dosage            text,
  frequency         text,
  instructions      text,
  storage_location  text,

  -- Alert flags
  is_active         boolean       not null default true,
  requires_daily_log boolean      not null default false,
  is_emergency      boolean       not null default false,  -- e.g. EpiPen

  -- Metadata
  prescribed_by     text,
  authorization_on_file boolean   not null default false,
  notes             text,

  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create index if not exists idx_med_alerts_org_active  on medication_alerts(organization_id, is_active);
create index if not exists idx_med_alerts_student     on medication_alerts(student_id);

create trigger medication_alerts_updated_at
  before update on medication_alerts
  for each row execute function update_updated_at_column();

alter table medication_alerts enable row level security;

create policy "staff_view_medication_alerts"
  on medication_alerts for select
  using (is_org_member(organization_id));

create policy "staff_manage_medication_alerts"
  on medication_alerts for insert
  with check (is_org_member(organization_id));

create policy "staff_update_medication_alerts"
  on medication_alerts for update
  using (is_org_member(organization_id));

-- ── 5. student_documents ──────────────────────────────────────────────────
-- File references for student documents.
-- Supports Supabase Storage paths AND Google Drive document IDs.

create table if not exists student_documents (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null references organizations(id) on delete cascade,
  student_id        uuid          not null references students(id) on delete cascade,

  -- Document metadata
  title             text          not null,
  document_type     text          not null default 'general'
                      check (document_type in (
                        'enrollment_form','transcript','iep','medical_form',
                        'permission_slip','scholarship','legal','report_card',
                        'photo_id','court_order','general','other'
                      )),

  -- Storage — exactly one of these should be set
  storage_path      text,         -- Supabase Storage object path
  google_drive_id   text,         -- Google Drive file ID
  google_drive_url  text,         -- Full shareable link for direct open
  external_url      text,         -- Any other hosted URL

  -- Visibility
  staff_only        boolean       not null default true,
  shared_with_family boolean      not null default false,

  -- Version / expiry
  version           text,
  expires_at        date,

  -- Audit
  uploaded_by       uuid          references profiles(id),
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create index if not exists idx_student_docs_student on student_documents(student_id);
create index if not exists idx_student_docs_org     on student_documents(organization_id, document_type);

create trigger student_docs_updated_at
  before update on student_documents
  for each row execute function update_updated_at_column();

alter table student_documents enable row level security;

create policy "staff_view_student_docs"
  on student_documents for select
  using (is_org_member(organization_id));

create policy "staff_manage_student_docs"
  on student_documents for insert
  with check (is_org_member(organization_id));

create policy "staff_update_student_docs"
  on student_documents for update
  using (is_org_member(organization_id));

-- ── 6. leadership_badges ──────────────────────────────────────────────────
-- RLA-specific leadership recognition system.
-- Each badge is earned by a student for a specific achievement.

create table if not exists leadership_badges (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null references organizations(id) on delete cascade,
  student_id        uuid          not null references students(id) on delete cascade,

  -- Badge definition
  badge_name        text          not null,
  badge_category    text          not null default 'character'
                      check (badge_category in (
                        'character','academic','leadership','service',
                        'entrepreneurship','attendance','special'
                      )),
  badge_level       text          default 'bronze'
                      check (badge_level in ('bronze','silver','gold','platinum')),
  description       text,
  icon              text,         -- Lucide icon name

  -- Earned
  earned_at         timestamptz   not null default now(),
  awarded_by        uuid          references profiles(id),
  notes             text,

  -- Visibility
  shared_with_family boolean      not null default true,
  featured          boolean       not null default false,

  created_at        timestamptz   not null default now()
);

create index if not exists idx_leadership_badges_student on leadership_badges(student_id);
create index if not exists idx_leadership_badges_org     on leadership_badges(organization_id, badge_category);

alter table leadership_badges enable row level security;

create policy "staff_view_leadership_badges"
  on leadership_badges for select
  using (is_org_member(organization_id));

create policy "staff_award_leadership_badges"
  on leadership_badges for insert
  with check (is_org_member(organization_id));

create policy "staff_update_leadership_badges"
  on leadership_badges for update
  using (is_org_member(organization_id));

-- ── 7. entrepreneurship_projects ─────────────────────────────────────────
-- RLA entrepreneurship program project tracking.

create table if not exists entrepreneurship_projects (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null references organizations(id) on delete cascade,
  student_id        uuid          not null references students(id) on delete cascade,

  -- Project details
  project_name      text          not null,
  tagline           text,
  description       text,
  business_type     text,         -- e.g. "product", "service", "non-profit"
  status            text          not null default 'planning'
                      check (status in ('planning','active','pitching','completed','paused')),

  -- Key dates
  started_at        date,
  pitch_date        date,
  completed_at      date,

  -- Outcomes
  revenue_earned    numeric(10,2),
  pitch_score       integer,
  mentor_name       text,
  mentor_notes      text,

  -- Documentation
  google_drive_folder_id text,
  pitch_deck_url    text,
  demo_url          text,

  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create index if not exists idx_entrepreneur_student on entrepreneurship_projects(student_id);
create index if not exists idx_entrepreneur_org     on entrepreneurship_projects(organization_id, status);

create trigger entrepreneurship_updated_at
  before update on entrepreneurship_projects
  for each row execute function update_updated_at_column();

alter table entrepreneurship_projects enable row level security;

create policy "staff_view_entrepreneur_projects"
  on entrepreneurship_projects for select
  using (is_org_member(organization_id));

create policy "staff_manage_entrepreneur_projects"
  on entrepreneurship_projects for insert
  with check (is_org_member(organization_id));

create policy "staff_update_entrepreneur_projects"
  on entrepreneurship_projects for update
  using (is_org_member(organization_id));
