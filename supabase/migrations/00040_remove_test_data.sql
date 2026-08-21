-- Migration: Remove seed/test student data
-- Run AFTER the Drive cleanup admin page has trashed the Drive folders.
-- Deletes 5 fake students and their exclusively-fake family records.
-- Resets display ID counters so real students begin at RLA-S0001.

do $$
declare
  v_org_id         uuid;
  v_student_count  int;
  v_family_count   int;
  v_s_counter      int;
  v_f_counter      int;
  v_h_counter      int;

  -- Fake student UUIDs
  v_mia       uuid := '7c7ce9fa-7dbc-46f8-954b-cd1419485d40';
  v_amara     uuid := '51000000-0000-0000-0000-000000000001';
  v_elijah    uuid := '52000000-0000-0000-0000-000000000002';
  v_zoe       uuid := '53000000-0000-0000-0000-000000000003';
  v_jordan    uuid := '54000000-0000-0000-0000-000000000004';

  -- Fake family UUIDs
  v_family_1  uuid := 'f1000000-0000-0000-0000-000000000001';
  v_family_2  uuid := 'f2000000-0000-0000-0000-000000000002';

  -- Fake household UUIDs
  v_household_1a uuid := 'a1000000-0000-0000-0000-000000000001';
  v_household_2a uuid := 'a2000000-0000-0000-0000-000000000002';
  v_household_2b uuid := 'b2000000-0000-0000-0000-000000000003';
begin
  -- Resolve org
  select id into v_org_id from organizations where short_name = 'RLA';
  if v_org_id is null then
    raise exception 'RLA organization not found — aborting';
  end if;

  raise notice 'Removing fake/test student data for org: %', v_org_id;

  -- Snapshot current counter values before we change them
  select last_value into v_s_counter
    from display_id_counters
    where organization_id = v_org_id and prefix = 'S';
  select last_value into v_f_counter
    from display_id_counters
    where organization_id = v_org_id and prefix = 'F';
  select last_value into v_h_counter
    from display_id_counters
    where organization_id = v_org_id and prefix = 'H';

  raise notice 'Current counters — S: %, F: %, H: %', v_s_counter, v_f_counter, v_h_counter;

  -- ── Delete fake students (cascades child tables) ─────────────────────────────
  -- Cascades: student_drive_folders, student_guardians, attendance_records,
  --           assessments, work_samples, student_notes, incident_reports,
  --           pickup_authorizations, all student_success tables
  -- Sets null: conversations.student_id, calendar_events.student_id
  delete from students
    where id in (v_mia, v_amara, v_elijah, v_zoe, v_jordan)
      and organization_id = v_org_id;

  get diagnostics v_student_count = row_count;
  raise notice 'Deleted % student rows', v_student_count;

  -- ── Delete fake families (cascades households) ────────────────────────────────
  -- households has ON DELETE CASCADE from families, OR delete households first
  delete from households
    where id in (v_household_1a, v_household_2a, v_household_2b)
      and organization_id = v_org_id;

  delete from families
    where id in (v_family_1, v_family_2)
      and organization_id = v_org_id;

  get diagnostics v_family_count = row_count;
  raise notice 'Deleted % family rows', v_family_count;

  -- ── Reset display ID counters ─────────────────────────────────────────────────
  -- Reset S to 0 — all S-prefix IDs (RLA-S0001..RLA-S0004) were exclusively fake
  update display_id_counters
    set last_value = 0
    where organization_id = v_org_id and prefix = 'S';
  raise notice 'Reset S counter to 0 (was %)', v_s_counter;

  -- Reset F to 0 — both family IDs were exclusively fake
  update display_id_counters
    set last_value = 0
    where organization_id = v_org_id and prefix = 'F';
  raise notice 'Reset F counter to 0 (was %)', v_f_counter;

  -- Reset H to 0 — all 3 household IDs were exclusively fake
  update display_id_counters
    set last_value = 0
    where organization_id = v_org_id and prefix = 'H';
  raise notice 'Reset H counter to 0 (was %)', v_h_counter;

  raise notice '=== Fake data removal complete ===';
end $$;
