-- ============================================================
-- Migration 00013 — Google Drive Integration + Work Samples
-- SchoolCo Platform
-- ============================================================
-- Adds:
--   1. Drive folder columns on students (root folder per student)
--   2. student_drive_folders — tracks the 11 standard subfolders
--   3. work_samples — staff-uploaded student work with visibility/yearbook flags
--   4. Extends student_documents with yearbook and visibility fields
--
-- Design intent:
--   - Every student eventually has a Drive folder tree
--   - Work samples are the primary shareable artifacts
--   - Yearbook-ready fields allow end-of-year portfolio generation
--   - Medical + Incident subfolders are always internal-only
-- ============================================================

-- ── 1. Extend students with Drive folder metadata ─────────────────────────

alter table students
  add column if not exists google_drive_folder_id   text,
  add column if not exists google_drive_folder_url  text,
  add column if not exists drive_folder_created_at  timestamptz,
  add column if not exists drive_folder_status      text default 'none'
    check (drive_folder_status in ('none','creating','active','error','manually_linked'));

create index if not exists idx_students_drive_folder on students(google_drive_folder_id) where google_drive_folder_id is not null;

comment on column students.google_drive_folder_id  is 'Google Drive folder ID for this student''s root portfolio folder.';
comment on column students.google_drive_folder_url is 'Direct URL to the student''s root Drive folder (staff-only).';
comment on column students.drive_folder_status     is 'none=not created, creating=in progress, active=ready, error=creation failed, manually_linked=folder linked by ID.';

-- ── 2. student_drive_folders — subfolder registry ─────────────────────────

create table if not exists student_drive_folders (
  id                  uuid          primary key default gen_random_uuid(),
  organization_id     uuid          not null references organizations(id) on delete cascade,
  student_id          uuid          not null references students(id) on delete cascade,

  -- Which subfolder this row represents
  folder_key          text          not null,
  -- Canonical keys: enrollment, medical, incident_reports, assessments,
  --                 progress_reports, work_samples, leadership,
  --                 entrepreneurship, photos, parent_shared, yearbook_archive

  folder_name         text          not null,  -- Display name, e.g. "01 — Enrollment"
  sort_order          smallint      not null default 1,

  -- Drive metadata
  google_drive_folder_id  text,
  google_drive_folder_url text,

  -- Access control
  -- These three flags drive what staff can see vs. what gets shared
  is_internal_only    boolean       not null default true,
  parent_can_view     boolean       not null default false,
  yearbook_eligible   boolean       not null default false,

  created_at          timestamptz   not null default now(),
  synced_at           timestamptz,

  unique (student_id, folder_key)
);

create index if not exists idx_drive_folders_student on student_drive_folders(student_id);

alter table student_drive_folders enable row level security;

create policy "staff_view_drive_folders"
  on student_drive_folders for select
  using (is_org_member(organization_id));

create policy "admin_manage_drive_folders"
  on student_drive_folders for all
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

-- ── 3. work_samples — the core Phase 5B table ─────────────────────────────

create table if not exists work_samples (
  id                  uuid          primary key default gen_random_uuid(),
  organization_id     uuid          not null references organizations(id) on delete cascade,
  student_id          uuid          not null references students(id) on delete cascade,
  uploaded_by         uuid          references profiles(id),

  -- Content
  title               text          not null,
  subject             text,         -- 'Math', 'English', 'Science', 'Art', 'Leadership', etc.
  description         text,
  work_date           date,         -- Date the work was created/completed (not upload date)
  grade_level         text,         -- Grade when created (denormalized for yearbook)

  -- File / storage
  file_type           text          not null default 'other'
    check (file_type in ('pdf','image','video','audio','document','spreadsheet','presentation','link','other')),
  google_drive_file_id   text,
  google_drive_file_url  text,
  google_drive_folder_key text,     -- Which subfolder it lives in ('work_samples','assessments', etc.)
  storage_path           text,      -- Supabase Storage path (alternative to Drive)
  external_url           text,      -- External link (YouTube, website, etc.)
  thumbnail_url          text,      -- Preview image URL (Drive thumbnail or custom)
  file_size_bytes        bigint,
  mime_type              text,

  -- Visibility — these three flags control access
  -- 'internal'         → staff only
  -- 'parent_visible'   → shared with student's guardians
  -- 'yearbook_eligible' → can be included in end-of-year portfolio
  visibility              text not null default 'internal'
    check (visibility in ('internal','parent_visible','yearbook_eligible')),
  visible_to_parent       boolean not null default false,
  include_in_yearbook     boolean not null default false,

  -- Yearbook-specific metadata (populated during yearbook assembly)
  yearbook_caption        text,
  yearbook_section        text,     -- 'academic','leadership','arts','service','entrepreneurship'
  yearbook_highlight      boolean   not null default false,  -- Star/featured in yearbook

  -- Academic rating (optional)
  quality_rating          smallint  check (quality_rating between 1 and 5),
  teacher_comments        text,

  -- Audit
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_work_samples_student  on work_samples(student_id, work_date desc);
create index if not exists idx_work_samples_org      on work_samples(organization_id, created_at desc);
create index if not exists idx_work_samples_yearbook on work_samples(student_id, include_in_yearbook) where include_in_yearbook = true;
create index if not exists idx_work_samples_parent   on work_samples(student_id, visible_to_parent) where visible_to_parent = true;

create trigger work_samples_updated_at
  before update on work_samples
  for each row execute function update_updated_at_column();

alter table work_samples enable row level security;

create policy "staff_view_work_samples"
  on work_samples for select
  using (is_org_member(organization_id));

create policy "staff_insert_work_samples"
  on work_samples for insert
  with check (is_org_member(organization_id));

create policy "staff_update_work_samples"
  on work_samples for update
  using (is_org_member(organization_id));

create policy "staff_delete_work_samples"
  on work_samples for delete
  using (is_org_admin(organization_id));

-- ── 4. Extend student_documents with yearbook + visibility ───────────────────

alter table student_documents
  add column if not exists include_in_yearbook  boolean not null default false,
  add column if not exists yearbook_section     text,
  add column if not exists visibility           text not null default 'internal'
    check (visibility in ('internal','parent_visible','yearbook_eligible'));

-- Backfill visibility from existing staff_only / shared_with_family columns
update student_documents
  set visibility = case
    when shared_with_family = true then 'parent_visible'
    else 'internal'
  end
where visibility = 'internal';

-- ── 5. yearbook_portfolios — one row per student per school year ──────────────
-- Populated at end-of-year during portfolio generation (Phase 7+).
-- Schema is ready now so data can be pre-populated throughout the year.

create table if not exists yearbook_portfolios (
  id                  uuid          primary key default gen_random_uuid(),
  organization_id     uuid          not null references organizations(id) on delete cascade,
  student_id          uuid          not null references students(id) on delete cascade,
  school_year         text          not null,  -- e.g. "2025-2026"

  -- Status
  status              text          not null default 'in_progress'
    check (status in ('in_progress','ready_for_review','approved','published','archived')),

  -- Student snapshot (denormalized at time of generation)
  snapshot_first_name   text,
  snapshot_last_name    text,
  snapshot_grade        text,
  snapshot_photo_url    text,
  snapshot_badge_level  text,

  -- Curated content (arrays of IDs from other tables)
  selected_work_sample_ids   uuid[]  default '{}',
  selected_badge_ids         uuid[]  default '{}',
  selected_project_ids       uuid[]  default '{}',
  selected_service_hour_ids  uuid[]  default '{}',
  selected_document_ids      uuid[]  default '{}',

  -- Narrative content
  staff_message           text,   -- Personal message from teacher/staff
  student_reflection      text,   -- Student-written reflection (future parent portal)
  attendance_summary      jsonb,  -- { percentage, days_present, absences }
  service_hours_total     numeric(6,2),

  -- Output
  google_drive_export_id  text,   -- Generated PDF/doc in Drive
  google_drive_export_url text,
  generated_at            timestamptz,
  generated_by            uuid    references profiles(id),

  -- Audit
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (student_id, school_year)
);

create index if not exists idx_yearbook_org_year on yearbook_portfolios(organization_id, school_year);

create trigger yearbook_portfolios_updated_at
  before update on yearbook_portfolios
  for each row execute function update_updated_at_column();

alter table yearbook_portfolios enable row level security;

create policy "admin_manage_yearbook"
  on yearbook_portfolios for all
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

create policy "staff_view_yearbook"
  on yearbook_portfolios for select
  using (is_org_member(organization_id));
