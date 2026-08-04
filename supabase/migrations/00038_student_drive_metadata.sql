-- ============================================================
-- Migration 00038 — Student Drive Folder Metadata
-- SchoolCo Platform
-- ============================================================
-- Adds tracking columns to students for Drive folder auditing:
--   drive_folder_name       — snapshot of folder name at creation
--   drive_provisioned_by    — profile_id of staff who triggered creation
--   drive_last_verified_at  — last time verifyDriveFolder confirmed access
--   drive_error_message     — last error from Drive provisioning or verify
-- Run AFTER: 00037
-- ============================================================

alter table students
  add column if not exists drive_folder_name       text,
  add column if not exists drive_provisioned_by    uuid references profiles(id),
  add column if not exists drive_last_verified_at  timestamptz,
  add column if not exists drive_error_message     text;

comment on column students.drive_folder_name      is 'Snapshot of the Google Drive folder name at time of creation (e.g. "RLA-S0001 — Jane Doe")';
comment on column students.drive_provisioned_by   is 'profile_id of the staff member who triggered Drive folder creation';
comment on column students.drive_last_verified_at is 'Last time verifyDriveFolder() confirmed the folder still exists and is accessible';
comment on column students.drive_error_message    is 'Last error message from Drive provisioning or verification, cleared on success';
