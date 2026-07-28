-- ═══════════════════════════════════════════════════════════════════════════
-- RLS Policy Audit — Detects is_org_member() misuse on sensitive tables
--
-- Run this in the Supabase SQL editor or via:
--   npx supabase db query --linked < tests/security/rls-policy-audit.sql
--
-- Any rows returned indicate a policy that allows parents, volunteers, and
-- student_future accounts to access sensitive data. Investigate immediately.
--
-- SAFE tables where is_org_member() is intentional:
--   org_settings — org-level config, no student PII
-- ═══════════════════════════════════════════════════════════════════════════

select
  schemaname,
  tablename,
  policyname,
  cmd,
  case
    when qual       like '%is_org_member%' then 'USING clause'
    when with_check like '%is_org_member%' then 'WITH CHECK clause'
  end as found_in
from pg_policies
where (qual like '%is_org_member%' or with_check like '%is_org_member%')
  and tablename in (
    -- Student data
    'students', 'guardianships', 'student_medical', 'student_allergies',
    'student_conditions', 'student_documents', 'student_drive_folders',
    'student_goals', 'work_samples', 'academic_progress', 'assessments',
    'learning_profiles', 'growth_goals', 'support_strategies', 'ssp_timeline',
    'intervention_sessions', 'success_plan_family_vision',
    -- Attendance / incidents
    'attendance_records', 'incidents',
    -- Medical
    'medication_alerts',
    -- Staff-generated content
    'staff_notes', 'support_flags', 'curriculum_enrollments',
    'leadership_badges', 'entrepreneurship_projects', 'service_hours',
    'yearbook_portfolios',
    -- Family data
    'families', 'households',
    -- Staff / compliance
    'staff_compliance_records', 'staff_compliance_requirements',
    -- Audit
    'audit_logs',
    -- Import
    'import_jobs',
    -- Messaging
    'conversations', 'conversation_participants', 'messages', 'notifications'
  )
order by tablename, policyname;

-- ── Companion: verify required policies exist ─────────────────────────────
-- For every table that SHOULD have a parent SELECT policy, confirm it exists.

select
  t.tablename,
  case when p.policyname is not null then 'OK' else 'MISSING parent SELECT policy' end as parent_select_status
from (
  values
    ('attendance_records'),
    ('academic_progress'),
    ('student_goals'),
    ('student_allergies'),
    ('student_conditions'),
    ('yearbook_portfolios')
) as t(tablename)
left join pg_policies p
  on  p.tablename = t.tablename
  and p.cmd       = 'SELECT'
  and p.policyname like 'parent_%'
order by t.tablename;

-- ── Companion: confirm get_guardian_student_ids function exists ───────────

select
  proname as function_name,
  prosecdef as security_definer,
  provolatile as volatility  -- 's' = stable (correct)
from pg_proc
where proname = 'get_guardian_student_ids';

-- ── Messaging: verify parent_visible enforcement ──────────────────────────
-- Confirm parent_select_messages policy enforces parent_visible = true

select
  policyname,
  case when qual like '%parent_visible = true%' then 'OK — parent_visible enforced'
       else 'MISSING parent_visible check'
  end as status
from pg_policies
where tablename = 'messages' and policyname like 'parent_%';

-- ── Messaging: confirm SECURITY DEFINER helpers exist ─────────────────────

select proname, prosecdef, provolatile
from pg_proc
where proname in ('get_my_family_ids', 'is_conversation_participant', 'get_guardian_student_ids');
