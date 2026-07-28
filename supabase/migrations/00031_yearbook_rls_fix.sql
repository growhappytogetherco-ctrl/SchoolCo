-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00031: Fix yearbook_portfolios RLS
--
-- PROBLEM: staff_view_yearbook uses is_org_member(), which includes parents,
-- volunteers, and student_future accounts. Parents could enumerate every
-- student's portfolio in the org.
--
-- FIX:
--   - staff_select_yearbook  → is_staff_or_above() (teachers, staff, registrar, admin+)
--   - parent_select_yearbook → own children only, portfolio must be 'published'
--   - volunteers and students have no access (yearbook assembly is staff-only)
--   - admin_manage_yearbook (ALL via is_org_admin) is already correct — leave it
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "staff_view_yearbook" on yearbook_portfolios;

create policy "staff_select_yearbook"
  on yearbook_portfolios for select
  using (is_staff_or_above(organization_id));

create policy "parent_select_yearbook"
  on yearbook_portfolios for select
  using (
    status    = 'published'
    and student_id in (select get_guardian_student_ids(organization_id))
  );
