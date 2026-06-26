-- ============================================================
-- SchoolCo — Sprint 1 RLS Policies
-- Migration: 00006_sprint1_rls
--
-- Adds RLS policies for:
--   1. display_id_counters  — server-function access only
--   2. families             — staff view all; parents view own family only
--   3. households           — staff view all; parents view own household only
--
-- Parent isolation rules (enforced at DB level, not app layer):
--   - A parent can only see the family record that contains their children
--   - A parent can only see the household(s) that their guardianship row
--     references — never the other household in a split-household family
--
-- Run AFTER: 00001, 00002, 00003, 00004, 00005
-- ============================================================

-- ── Helper Functions ─────────────────────────────────────────

-- get_family_id_for_guardian(student_id)
-- Returns the family_id for a student if the current user is an active guardian.
-- Used in parent-facing RLS policies on families.
create or replace function get_guardian_family_ids()
returns setof uuid
language plpgsql
security definer stable
as $$
begin
  return query
  select distinct s.family_id
  from   guardianships g
  join   students s on s.id = g.student_id
  where  g.profile_id = auth.uid()
    and  g.status = 'active'
    and  g.archived_at is null
    and  s.family_id is not null;
end;
$$;

comment on function get_guardian_family_ids() is
  'Returns all family_ids for families where the current user has an active guardianship. Used in parent-facing RLS on families table.';

-- get_guardian_household_ids()
-- Returns the household_ids this guardian is directly associated with.
-- A parent in household A of a split family CANNOT see household B.
create or replace function get_guardian_household_ids()
returns setof uuid
language plpgsql
security definer stable
as $$
begin
  return query
  select distinct g.household_id
  from   guardianships g
  where  g.profile_id = auth.uid()
    and  g.status = 'active'
    and  g.archived_at is null
    and  g.household_id is not null;
end;
$$;

comment on function get_guardian_household_ids() is
  'Returns household_ids this guardian is directly associated with. Enforces split-household isolation — a parent in household A cannot see household B.';

-- ── Enable RLS on new tables ─────────────────────────────────

alter table display_id_counters enable row level security;
alter table families             enable row level security;
alter table households           enable row level security;

-- ── display_id_counters policies ─────────────────────────────
-- The counter table is internal infrastructure.
-- It is only accessed by SECURITY DEFINER functions (next_org_display_id).
-- No direct SELECT/INSERT/UPDATE access for authenticated users.
-- platform_admin can view for debugging.

create policy "display_id_counters_platform_admin_select"
on display_id_counters for select
to authenticated
using ( is_platform_admin() );

-- No INSERT/UPDATE/DELETE policies — only the SECURITY DEFINER
-- function can write to this table, which bypasses RLS.

-- ── families policies ─────────────────────────────────────────

-- Staff and above can view all families in their org
create policy "families_staff_select"
on families for select
to authenticated
using (
  is_staff_or_above(organization_id)
  and archived_at is null
);

-- Parents can view only the family records that contain their children
-- They cannot see other families in the org, or the other household's
-- family record (though families are org-level, not household-level).
create policy "families_guardian_select"
on families for select
to authenticated
using (
  id in (select get_guardian_family_ids())
  and archived_at is null
);

-- Registrars and above can create families
create policy "families_registrar_insert"
on families for insert
to authenticated
with check (
  has_min_org_role(organization_id, 'registrar')
);

-- Registrars and above can update families
create policy "families_registrar_update"
on families for update
to authenticated
using  ( has_min_org_role(organization_id, 'registrar') )
with check ( has_min_org_role(organization_id, 'registrar') );

-- No DELETE policy — use archived_at for soft-delete

-- ── households policies ───────────────────────────────────────

-- Staff and above can view all households in their org
create policy "households_staff_select"
on households for select
to authenticated
using (
  is_staff_or_above(organization_id)
  and archived_at is null
);

-- SPLIT-HOUSEHOLD ISOLATION:
-- Parents can only see the household(s) they are directly associated with.
-- A parent in the primary household of a split family CANNOT see the
-- secondary household, even though they share the same family record.
-- This is enforced by checking guardianships.household_id.
create policy "households_guardian_select"
on households for select
to authenticated
using (
  id in (select get_guardian_household_ids())
  and archived_at is null
);

-- Registrars and above can create households
create policy "households_registrar_insert"
on households for insert
to authenticated
with check (
  has_min_org_role(organization_id, 'registrar')
);

-- Registrars and above can update households
create policy "households_registrar_update"
on households for update
to authenticated
using  ( has_min_org_role(organization_id, 'registrar') )
with check ( has_min_org_role(organization_id, 'registrar') );

-- No DELETE policy — use archived_at

-- ── Verification queries ──────────────────────────────────────
-- Run these in the SQL Editor after applying this migration:
--
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename IN ('display_id_counters','families','households');
-- → All 3 should show rowsecurity = true
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name IN ('get_guardian_family_ids','get_guardian_household_ids','member_id_prefix','next_org_display_id');
-- → All 4 should appear
--
-- SPLIT-HOUSEHOLD ISOLATION TEST (run as a parent user):
-- SELECT * FROM households;
-- → Should return only the household(s) the parent is directly linked to.
-- → Should NOT return the other household in a split family.
