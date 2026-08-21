-- Migration: Remove seed/test student data
-- Run AFTER the Drive cleanup admin page has trashed the Drive folders.
-- Deletes 5 fake students and their exclusively-fake family/household records.
-- Resets display ID counters so real students begin at RLA-S0001.
--
-- Pre-flight verification (production state confirmed 2026-08-21):
--   Students:  5 fake (RLA-S0001–S0004 + TEST-STU-001) — no real students exist
--   Families:  3 fake (Thompson, Williams, Johnson Test Family)
--   Households: 5 fake (3 seed + 2 Mia test, all cascade from family delete)
--   Counters:  S=4, F=2, H=5, A=1 (A left alone — unknown, unrelated)
--   Guardian profiles e1–e4: do NOT exist in profiles table — no action needed
--   Guardianship on Mia (profile 7ba9a63f): cascades on student delete

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

  -- Fake family UUIDs (includes Mia's test family created during import testing)
  v_family_thompson uuid := 'f1000000-0000-0000-0000-000000000001';
  v_family_williams uuid := 'f2000000-0000-0000-0000-000000000002';
  v_family_johnson  uuid := '52b53a3e-20c7-4b4a-ac18-a7003e88b591';  -- "Johnson Test Family"

  -- Seed household UUIDs (Mia's 2 extra households cascade via family_id FK)
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
    where organization_id = v_org_id and id_prefix = 'S';
  select last_value into v_f_counter
    from display_id_counters
    where organization_id = v_org_id and id_prefix = 'F';
  select last_value into v_h_counter
    from display_id_counters
    where organization_id = v_org_id and id_prefix = 'H';

  raise notice 'Current counters — S: %, F: %, H: %', v_s_counter, v_f_counter, v_h_counter;

  -- ── Delete fake students (cascades child tables) ─────────────────────────────
  -- Cascades: guardianships, student_drive_folders, attendance_records,
  --           assessments, work_samples, student_notes, incident_reports,
  --           pickup_authorizations, all student_success tables
  -- Sets null: conversations.student_id, calendar_events.student_id
  delete from students
    where id in (v_mia, v_amara, v_elijah, v_zoe, v_jordan)
      and organization_id = v_org_id;

  get diagnostics v_student_count = row_count;
  raise notice 'Deleted % student rows', v_student_count;

  -- ── Delete fake households (seed ones; Mia's cascade from family delete below) ─
  delete from households
    where id in (v_household_1a, v_household_2a, v_household_2b)
      and organization_id = v_org_id;

  -- ── Delete fake families (cascades remaining households via family_id FK) ─────
  delete from families
    where id in (v_family_thompson, v_family_williams, v_family_johnson)
      and organization_id = v_org_id;

  get diagnostics v_family_count = row_count;
  raise notice 'Deleted % family rows (households cascade)', v_family_count;

  -- ── Reset display ID counters ─────────────────────────────────────────────────
  -- S: all RLA-S IDs (0001–0004) were exclusively fake → reset to 0
  update display_id_counters
    set last_value = 0
    where organization_id = v_org_id and id_prefix = 'S';
  raise notice 'Reset S counter to 0 (was %)', v_s_counter;

  -- F: both RLA-F IDs (Thompson=1, Williams=2) were exclusively fake
  --    Mia's TEST-FAM-001 did not increment this counter → reset to 0
  update display_id_counters
    set last_value = 0
    where organization_id = v_org_id and id_prefix = 'F';
  raise notice 'Reset F counter to 0 (was %)', v_f_counter;

  -- H: all 5 household IDs (H0001–H0005) were exclusively fake → reset to 0
  update display_id_counters
    set last_value = 0
    where organization_id = v_org_id and id_prefix = 'H';
  raise notice 'Reset H counter to 0 (was %)', v_h_counter;

  -- A counter (last_value=1) is left unchanged — purpose unrelated to fake data

  raise notice '=== Fake data removal complete ===';
end $$;
