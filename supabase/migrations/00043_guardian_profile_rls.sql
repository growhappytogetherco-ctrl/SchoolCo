-- ── Migration 00043 — Guardian profile RLS ──────────────────────────────
-- Allows staff (teacher+) to read guardian profile stubs that are linked to
-- students in their org via guardianships, even when those profiles have no
-- organization_members entry (i.e. uninvited guardian stubs).
--
-- Without this policy, the join in getFamily() returns null for guardian profiles
-- that are not org members, causing them to render as "Unknown" in the UI.

create policy "staff_can_view_guardian_profiles"
  on profiles for select
  using (
    exists (
      select 1
      from   guardianships  g
      join   students       s   on s.id  = g.student_id
      join   organization_members om
                                on om.organization_id = s.organization_id
      where  g.profile_id   = profiles.id
        and  om.profile_id  = auth.uid()
        and  om.status      = 'active'
        and  is_staff_or_above(s.organization_id)
    )
  );
