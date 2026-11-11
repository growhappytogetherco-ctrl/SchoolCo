-- ============================================================
-- Migration 00108 — Graduation Planner: slot_label column
-- SchoolCo Platform
-- ============================================================
-- ADDITIVE ONLY: adds slot_label to graduation_plan_entries.
-- slot_label = the standard course slot name (e.g. "English 1")
-- display_name = the actual course the student is taking
--   (may differ, e.g. "AP English Literature and Composition")
-- Storing these separately ensures changing the actual course
-- does not rename the underlying graduation slot definition.
-- ============================================================

alter table graduation_plan_entries
  add column if not exists slot_label text;

comment on column graduation_plan_entries.slot_label is
  'Standard graduation course slot label (e.g. "English 1", "Algebra 1"). '
  'Separate from display_name (the actual course taken). '
  'Set at plan initialization; changing display_name does not change this.';

-- Verify
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduation_plan_entries'
      and column_name = 'slot_label'
  ) then
    raise exception 'slot_label column not found on graduation_plan_entries after migration';
  end if;
  raise notice 'Migration 00108: slot_label column present on graduation_plan_entries — OK';
end;
$$;
