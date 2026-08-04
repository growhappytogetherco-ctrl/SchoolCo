-- ============================================================
-- Migration 00039 — Org-Level Drive Folder Structure
-- SchoolCo Platform
-- ============================================================
-- Tracks each top-level and sub-level Google Drive folder
-- for the organisation's shared folder hierarchy under the
-- root "Rising Leaders Academy — SchoolCo Records" folder.
--
-- Every folder is stored once per org; subsequent calls to
-- ensureOrgDriveStructure() upsert rows idempotently.
--
-- Run AFTER: 00038
-- ============================================================

create table if not exists org_drive_folders (
  id                      uuid         primary key default gen_random_uuid(),
  organization_id         uuid         not null references organizations(id) on delete cascade,
  folder_key              text         not null,           -- e.g. "students", "curriculum_math"
  folder_name             text         not null,           -- e.g. "Students", "Math"
  google_drive_folder_id  text         not null,
  google_drive_folder_url text         not null,
  provisioned_at          timestamptz  not null default now(),
  provisioned_by          uuid         references profiles(id),
  constraint uq_org_drive_folders unique (organization_id, folder_key)
);

create index if not exists idx_org_drive_folders_org on org_drive_folders(organization_id);

alter table org_drive_folders enable row level security;

-- Admins can fully manage org Drive folder records
create policy "admin_manage_org_drive_folders"
  on org_drive_folders for all
  using  (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

-- All staff can read (needed to look up student parent folder during provisioning)
create policy "staff_read_org_drive_folders"
  on org_drive_folders for select
  using (is_staff_or_above(organization_id));
