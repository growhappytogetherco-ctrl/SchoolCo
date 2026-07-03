-- ── Migration 00025 — Staff Notes v2 ─────────────────────────────────────────
-- Extends staff_notes with assignment, follow-up tracking, status,
-- tags, and archiving. Tightens RLS to block volunteers/parents.
-- Expands category set to 12 values.

-- ── 1. Drop old category constraint ──────────────────────────────────────────
alter table staff_notes
  drop constraint if exists staff_notes_category_check;

alter table staff_notes
  drop constraint if exists staff_notes_priority_check;

-- ── 2. Add new columns ────────────────────────────────────────────────────────
alter table staff_notes
  add column if not exists follow_up_required boolean not null default false,
  add column if not exists assigned_to        uuid references profiles(id) on delete set null,
  add column if not exists due_date           date,
  add column if not exists status             text not null default 'open',
  add column if not exists tags               text[],
  add column if not exists archived_at        timestamptz;

-- ── 3. Re-add constraints with extended value sets ────────────────────────────
alter table staff_notes
  add constraint staff_notes_category_check
    check (category in (
      -- new values
      'general','academic','behavior','family_communication',
      'parent_follow_up','teacher_follow_up','leadership','entrepreneurship',
      'attendance','medical','safety','administrative',
      -- keep legacy values so old records don't violate constraint
      'behavioral','health','family'
    ));

alter table staff_notes
  add constraint staff_notes_priority_check
    check (priority in ('low','normal','high','urgent'));

alter table staff_notes
  add constraint staff_notes_status_check
    check (status in ('open','in_progress','waiting','completed'));

-- ── 4. Tighten RLS — block volunteers and parents ─────────────────────────────
drop policy if exists "staff_notes_select" on staff_notes;
drop policy if exists "staff_notes_insert" on staff_notes;
drop policy if exists "staff_notes_update" on staff_notes;
drop policy if exists "staff_notes_delete" on staff_notes;

create policy "notes_staff_select" on staff_notes for select
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "notes_staff_insert" on staff_notes for insert
  with check (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

-- Author can edit own notes; admins can edit any
create policy "notes_author_update" on staff_notes for update
  using (
    author_id = auth.uid()
    or organization_id in (
      select organization_id from organization_members
      where profile_id = auth.uid() and status = 'active'
        and role in ('admin','full_admin','platform_admin','registrar')
    )
  );

-- Only admins can permanently delete; prefer archiving
create policy "notes_admin_delete" on staff_notes for delete
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role in ('admin','full_admin','platform_admin')
  ));

-- ── 5. Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_staff_notes_assigned
  on staff_notes(assigned_to, status)
  where archived_at is null;

create index if not exists idx_staff_notes_priority
  on staff_notes(organization_id, priority, status)
  where archived_at is null;

create index if not exists idx_staff_notes_due
  on staff_notes(assigned_to, due_date)
  where archived_at is null and status != 'completed';
