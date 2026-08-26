-- Migration 00051: Fix profiles RLS for stub guardian accounts
--
-- Problem: staff_can_view_org_member_profiles and staff_can_view_guardian_profiles
-- use bare auth.uid() to look up the viewer's organization_members row.
-- For stub accounts (profiles.id ≠ auth.uid()), no org member row matches auth.uid(),
-- so the policy returns false and the staff member cannot see other profiles.
--
-- Consequence: the profiles!inner join in getMyConversationThread silently drops
-- any message whose sender_id is not the stub user themselves. Kenny can see his own
-- message (users_view_own_profile passes via auth_user_id = auth.uid()) but cannot
-- see Elisa's reply (Elisa's profile is invisible → inner join filters it out).
--
-- Fix: replace auth.uid() with auth_uid_to_profile_id() (already defined, resolves
-- auth.uid() → canonical profiles.id) in both affected policies.

-- ── staff_can_view_org_member_profiles ────────────────────────────────────────
DROP POLICY IF EXISTS staff_can_view_org_member_profiles ON profiles;
CREATE POLICY staff_can_view_org_member_profiles ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   organization_members viewer_mem
      JOIN   organization_members target_mem
             ON target_mem.organization_id = viewer_mem.organization_id
      WHERE  viewer_mem.profile_id = auth_uid_to_profile_id()
        AND  viewer_mem.status     = 'active'
        AND  is_staff_or_above(viewer_mem.organization_id)
        AND  target_mem.profile_id = profiles.id
        AND  target_mem.status     = 'active'
    )
  );

-- ── staff_can_view_guardian_profiles ─────────────────────────────────────────
DROP POLICY IF EXISTS staff_can_view_guardian_profiles ON profiles;
CREATE POLICY staff_can_view_guardian_profiles ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   guardianships g
      JOIN   students s  ON s.id  = g.student_id
      JOIN   organization_members om ON om.organization_id = s.organization_id
      WHERE  g.profile_id  = profiles.id
        AND  om.profile_id = auth_uid_to_profile_id()
        AND  om.status     = 'active'
        AND  is_staff_or_above(s.organization_id)
    )
  );
