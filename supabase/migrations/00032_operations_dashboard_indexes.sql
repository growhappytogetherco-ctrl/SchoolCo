-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00032: Indexes for Daily Operations Dashboard
--
-- The operations dashboard runs several org-scoped queries in parallel.
-- These indexes ensure they remain fast at 100+ students and a full year
-- of history.
-- ═══════════════════════════════════════════════════════════════════════════

-- Safety alerts: the dashboard fetches active alerts per org for all students
-- 00028 added: idx_safety_alerts_org (student_id, organization_id, is_safety_alert) partial
-- Add an org-level covering index for the dashboard query pattern

create index if not exists idx_staff_notes_org_safety
  on staff_notes (organization_id, is_safety_alert)
  where is_safety_alert = true and archived_at is null;

-- Medication alerts: active emergencies per org
create index if not exists idx_medication_alerts_org_emergency
  on medication_alerts (organization_id, is_emergency, is_active)
  where is_emergency = true and is_active = true;

-- Student allergies: life-threatening per org
create index if not exists idx_student_allergies_org_severe
  on student_allergies (organization_id, severity, is_active)
  where severity = 'life_threatening' and is_active = true and archived_at is null;

-- Guardianships: active guardians per student (pickup restriction lookups)
create index if not exists idx_guardianships_student_active
  on guardianships (student_id, status)
  where status = 'active' and archived_at is null;

-- Students: enrolled+active per org (primary dashboard query)
-- Migration 00001 likely already has (organization_id, enrollment_status)
-- Add a covering index with the extra columns the operations page needs
create index if not exists idx_students_ops_dashboard
  on students (organization_id, enrollment_status, last_name)
  where enrollment_status = 'enrolled' and archived_at is null;
