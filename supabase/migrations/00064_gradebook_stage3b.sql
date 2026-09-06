-- Migration 00064: Gradebook Stage 3B — Teacher Identity Fix + Gradebook Support
--
-- CRITICAL FIX:
--   course_sections.teacher_id → profiles(id) is the AUTHENTICATED GRADEBOOK MANAGER.
--   The Stage 3A UI incorrectly passed staff_roster.id (not profiles.id) into this FK.
--   This migration adds staff_roster_id for the INSTRUCTIONAL teacher display,
--   keeping teacher_id as the auth user reference for RLS.
--
-- Identity model after this migration:
--   course_sections.staff_roster_id → staff_roster(id)   [instructional teacher — display]
--   course_sections.teacher_id      → profiles(id)       [authenticated gradebook manager — RLS]
--   course_sections.teacher_name    → text               [denormalized display name]
--
-- When a teacher has a portal account:
--   staff_roster_id = their staff_roster row
--   teacher_id      = their profiles.id (= auth.users.id for native users)
--   teacher_name    = denormalized name
--
-- When a teacher has NO portal account (e.g. Jerradyn Farr):
--   staff_roster_id = their staff_roster row
--   teacher_id      = NULL  → only admins can edit the gradebook via RLS
--   teacher_name    = their name (still displays correctly)
--
-- When Jerradyn receives a portal account:
--   Admin runs: UPDATE course_sections SET teacher_id = <profiles.id> WHERE id = <section>;
--   Or: the invite acceptance can auto-link if staff_roster_id matches.
--
-- Also fixes the RLS on assignments to use a proper profiles join rather than
-- relying on auth.uid() = profiles.id (true for native users but fragile).

-- ── 1. Add staff_roster_id to course_sections ────────────────────────────────

alter table course_sections
  add column if not exists staff_roster_id uuid references staff_roster(id) on delete set null;

create index if not exists idx_course_sections_staff_roster
  on course_sections(staff_roster_id) where staff_roster_id is not null;

-- ── 2. Backfill: if teacher_id currently holds a valid profiles.id, no change.
--    If teacher_id holds a staff_roster.id (the Stage 3A bug), null it out safely.
--    We detect this by checking if the value exists in profiles — if not, it's bad data.
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, teacher_id FROM course_sections
    WHERE teacher_id IS NOT NULL
  LOOP
    -- Check if teacher_id is a valid profile ID
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = rec.teacher_id) THEN
      -- It's orphaned data (likely a staff_roster.id was stored here by mistake)
      -- Try to find the staff_roster row and set staff_roster_id instead
      IF EXISTS (SELECT 1 FROM staff_roster WHERE id = rec.teacher_id) THEN
        UPDATE course_sections
           SET staff_roster_id = rec.teacher_id,
               teacher_id      = (SELECT profile_id FROM staff_roster WHERE id = rec.teacher_id),
               teacher_name    = COALESCE(teacher_name,
                                          (SELECT full_name FROM staff_roster WHERE id = rec.teacher_id))
         WHERE id = rec.id;
        RAISE NOTICE 'Fixed course_section %: moved staff_roster_id, resolved profile_id for teacher_id', rec.id;
      ELSE
        -- No matching staff_roster row either — just null teacher_id
        UPDATE course_sections SET teacher_id = NULL WHERE id = rec.id;
        RAISE NOTICE 'Nulled invalid teacher_id on course_section %', rec.id;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── 3. Fix RLS on assignments — teacher check should compare via profiles join ─

drop policy if exists "teacher_manage_assignments" on assignments;
drop policy if exists "teacher_update_assignments" on assignments;

-- Staff-or-above can insert assignments; teacher_id must match their profile
create policy "teacher_manage_assignments"
  on assignments for insert
  with check (
    is_staff_or_above(organization_id)
    and (
      is_org_admin(organization_id)
      or exists (
        select 1 from course_sections cs
        join profiles p on p.id = cs.teacher_id
        where cs.id = course_section_id
          and p.auth_user_id = auth.uid()
      )
      or exists (
        select 1 from course_sections cs
        where cs.id = course_section_id
          and cs.teacher_id = auth.uid()   -- native user: profiles.id = auth.uid()
      )
    )
  );

create policy "teacher_update_assignments"
  on assignments for update
  using (
    is_staff_or_above(organization_id)
    and (
      is_org_admin(organization_id)
      or exists (
        select 1 from course_sections cs
        join profiles p on p.id = cs.teacher_id
        where cs.id = course_section_id
          and p.auth_user_id = auth.uid()
      )
      or exists (
        select 1 from course_sections cs
        where cs.id = course_section_id
          and cs.teacher_id = auth.uid()
      )
    )
  );

-- ── 4. Fix RLS on student_assignment_grades similarly ───────────────────────

drop policy if exists "teacher_manage_grades"  on student_assignment_grades;
drop policy if exists "teacher_update_grades"  on student_assignment_grades;
drop policy if exists "admin_delete_grades"    on student_assignment_grades;

create policy "teacher_manage_grades"
  on student_assignment_grades for insert
  with check (
    is_staff_or_above(organization_id)
    and (
      is_org_admin(organization_id)
      or exists (
        select 1 from assignments a
        join course_sections cs on cs.id = a.course_section_id
        where a.id = assignment_id
          and (cs.teacher_id = auth.uid()
            or exists (select 1 from profiles p where p.id = cs.teacher_id and p.auth_user_id = auth.uid()))
      )
    )
  );

create policy "teacher_update_grades"
  on student_assignment_grades for update
  using (
    is_staff_or_above(organization_id)
    and (
      is_org_admin(organization_id)
      or exists (
        select 1 from assignments a
        join course_sections cs on cs.id = a.course_section_id
        where a.id = assignment_id
          and (cs.teacher_id = auth.uid()
            or exists (select 1 from profiles p where p.id = cs.teacher_id and p.auth_user_id = auth.uid()))
      )
    )
  );

create policy "admin_delete_grades"
  on student_assignment_grades for delete
  using (is_org_admin(organization_id));

-- Verify student_assignment_grades has staff-or-above select policy
drop policy if exists "staff_view_grades" on student_assignment_grades;
create policy "staff_view_grades"
  on student_assignment_grades for select
  using (is_org_member(organization_id));
