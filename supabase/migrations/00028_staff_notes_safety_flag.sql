-- Add explicit safety classification to staff_notes
alter table staff_notes
  add column if not exists is_safety_alert boolean not null default false,
  add column if not exists safety_severity text check (safety_severity in ('critical', 'high')) default null,
  add column if not exists safety_instruction text default null,
  add column if not exists safety_expires_at timestamptz default null,
  add column if not exists safety_roles text[] default null; -- null = all staff

-- Index for the safety alert engine
create index if not exists idx_staff_notes_safety
  on staff_notes (student_id, organization_id, is_safety_alert)
  where is_safety_alert = true and archived_at is null;
