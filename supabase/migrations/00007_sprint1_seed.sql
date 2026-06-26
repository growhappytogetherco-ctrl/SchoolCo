-- ============================================================
-- SchoolCo — Sprint 1 Seed Data
-- Migration: 00007_sprint1_seed
--
-- Realistic development seed data for Rising Leaders Academy.
-- Demonstrates:
--   - 2 families (one standard, one split-household)
--   - 3 households (primary + split secondary)
--   - 4 students with display IDs
--   - 5 guardian memberships with display IDs
--
-- IMPORTANT:
--   - All emails use .dev domains — will never route to real inboxes
--   - No real PII. All names are fictional.
--   - Uses fixed UUIDs so the seed is idempotent (safe to re-run).
--   - Requires the Rising Leaders Academy organization to exist.
--     Run SUPABASE_SETUP.md Step 8 first to create the org.
--
-- Run AFTER: 00001–00006 and after creating the org in Step 8.
-- ============================================================

do $$
declare
  v_org_id        uuid;
  v_family_1      uuid := 'f1000000-0000-0000-0000-000000000001';
  v_family_2      uuid := 'f2000000-0000-0000-0000-000000000002';
  v_household_1a  uuid := 'a1000000-0000-0000-0000-000000000001';  -- Family 1, primary
  v_household_2a  uuid := 'a2000000-0000-0000-0000-000000000002';  -- Family 2, primary
  v_household_2b  uuid := 'b2000000-0000-0000-0000-000000000003';  -- Family 2, secondary (split)
  v_student_1     uuid := '51000000-0000-0000-0000-000000000001';
  v_student_2     uuid := '52000000-0000-0000-0000-000000000002';
  v_student_3     uuid := '53000000-0000-0000-0000-000000000003';
  v_student_4     uuid := '54000000-0000-0000-0000-000000000004';
  -- Profile IDs — these match auth.users IDs that staff create via invite
  -- In dev, create these users first via Supabase Auth → Invite User
  -- then their profiles are auto-created by the handle_new_user() trigger.
  -- The seed references them by ID; insert will fail gracefully if they don't exist yet.
  v_guardian_1    uuid := 'e1000000-0000-0000-0000-000000000001';  -- Sandra Thompson
  v_guardian_2    uuid := 'e2000000-0000-0000-0000-000000000002';  -- Marcus Thompson
  v_guardian_3    uuid := 'e3000000-0000-0000-0000-000000000003';  -- Keisha Williams
  v_guardian_4    uuid := 'e4000000-0000-0000-0000-000000000004';  -- Darnell Williams (split)
  v_teacher_1     uuid := '71000000-0000-0000-0000-000000000001';  -- James Rivera
begin

  -- ── Get the Rising Leaders Academy org ID ────────────────
  select id into v_org_id
  from   organizations
  where  slug = 'rising-leaders-academy'
  limit  1;

  if v_org_id is null then
    raise notice 'Rising Leaders Academy not found. Run SUPABASE_SETUP.md Step 8 first.';
    return;
  end if;

  -- ── Family 1: Thompson Family (single household) ─────────
  -- A straightforward family — two parents, two kids, one home.

  insert into families (
    id, organization_id, family_name, is_split_household, status
  ) values (
    v_family_1, v_org_id, 'Thompson Family', false, 'active'
  ) on conflict (id) do nothing;

  insert into households (
    id, organization_id, family_id, household_label, sort_order,
    address_json, phone, status
  ) values (
    v_household_1a, v_org_id, v_family_1,
    'Thompson Family – Home', 1,
    '{"street1":"42 Covenant Lane","city":"Greenville","state":"SC","zip":"29601","country":"US"}',
    '(864) 555-0101', 'active'
  ) on conflict (id) do nothing;

  -- Thompson students
  insert into students (
    id, organization_id, family_id, first_name, last_name,
    preferred_name, grade_level, enrollment_status, enrollment_date, track, status
  ) values
  (
    v_student_1, v_org_id, v_family_1,
    'Amara', 'Thompson', 'Amara',
    '7th', 'enrolled', '2024-08-19', 'classical', 'active'
  ),
  (
    v_student_2, v_org_id, v_family_1,
    'Elijah', 'Thompson', 'Eli',
    '4th', 'enrolled', '2025-08-18', 'entrepreneurship', 'active'
  )
  on conflict (id) do nothing;

  -- ── Family 2: Williams Family (split household) ───────────
  -- Keisha and Darnell Williams are divorced. Their children split time
  -- between two homes. Keisha has primary custody; Darnell has supervised
  -- visitation only. Darnell cannot see health or incident records.

  insert into families (
    id, organization_id, family_name, is_split_household, status
  ) values (
    v_family_2, v_org_id, 'Williams Family', true, 'active'
  ) on conflict (id) do nothing;

  -- Primary household: Keisha Williams
  insert into households (
    id, organization_id, family_id, household_label, sort_order,
    address_json, phone, status
  ) values (
    v_household_2a, v_org_id, v_family_2,
    'Williams Family – Primary (Keisha)', 1,
    '{"street1":"18 Restoration Drive","city":"Greenville","state":"SC","zip":"29605","country":"US"}',
    '(864) 555-0201', 'active'
  ) on conflict (id) do nothing;

  -- Secondary household: Darnell Williams (supervised visitation only)
  insert into households (
    id, organization_id, family_id, household_label, sort_order,
    address_json, phone, status
  ) values (
    v_household_2b, v_org_id, v_family_2,
    'Williams Family – Secondary (Darnell)', 2,
    '{"street1":"305 Grace Avenue","city":"Simpsonville","state":"SC","zip":"29681","country":"US"}',
    '(864) 555-0202', 'active'
  ) on conflict (id) do nothing;

  -- Williams students
  insert into students (
    id, organization_id, family_id, first_name, last_name,
    preferred_name, grade_level, enrollment_status, enrollment_date, track, status
  ) values
  (
    v_student_3, v_org_id, v_family_2,
    'Zoe', 'Williams', 'Zoe',
    '5th', 'enrolled', '2024-08-19', 'entrepreneurship', 'active'
  ),
  (
    v_student_4, v_org_id, v_family_2,
    'Jordan', 'Williams', 'JJ',
    '2nd', 'enrolled', '2025-08-18', 'classical', 'active'
  )
  on conflict (id) do nothing;

  -- ── Guardianships: Thompson Family ────────────────────────
  -- Both parents have full access. No custody restrictions.
  -- Sandra is primary contact and emergency contact #1.
  -- Marcus is emergency contact #2.

  -- Note: guardianship inserts below reference profile IDs (v_guardian_1, etc.).
  -- In a real dev setup, these profiles must exist in auth.users first.
  -- If they don't exist, these inserts will fail with FK constraint errors.
  -- That is expected behavior — invite the users first, then run this seed.
  -- For local testing, comment out guardianship inserts until profiles exist.

  -- ── Architecture docs ─────────────────────────────────────
  -- Guardianship inserts require profiles to exist.
  -- Profiles are created by the handle_new_user() trigger on auth.users.
  -- To use this seed with real users:
  --   1. Invite each guardian via Supabase Auth → Users → Invite User
  --   2. The guardian accepts the invite (creating their profile)
  --   3. Update the profile IDs in this seed to match the real auth.users IDs
  --   4. Re-run the guardianship inserts
  --
  -- For demo purposes, guardianship inserts are wrapped in exception handlers.

  begin
    insert into guardianships (
      organization_id, profile_id, student_id, household_id,
      relationship_type, custody_type, is_legal_guardian,
      is_primary_contact, is_emergency_contact, emergency_contact_order,
      can_pickup, household_label,
      visibility_json, communication_json, status
    ) values
    -- Sandra Thompson → Amara
    (
      v_org_id, v_guardian_1, v_student_1, v_household_1a,
      'mother', 'joint', true, true, true, 1, true,
      'Thompson Family – Home',
      '{"academics":true,"attendance":true,"report_cards":true,"communications":true,"health_records":true,"incidents":true,"behavior_notes":true}',
      '{"email":true,"sms":true,"app":true}',
      'active'
    ),
    -- Marcus Thompson → Amara
    (
      v_org_id, v_guardian_2, v_student_1, v_household_1a,
      'father', 'joint', true, false, true, 2, true,
      'Thompson Family – Home',
      '{"academics":true,"attendance":true,"report_cards":true,"communications":true,"health_records":true,"incidents":true,"behavior_notes":true}',
      '{"email":true,"sms":false,"app":true}',
      'active'
    ),
    -- Sandra Thompson → Elijah
    (
      v_org_id, v_guardian_1, v_student_2, v_household_1a,
      'mother', 'joint', true, true, true, 1, true,
      'Thompson Family – Home',
      '{"academics":true,"attendance":true,"report_cards":true,"communications":true,"health_records":true,"incidents":true,"behavior_notes":true}',
      '{"email":true,"sms":true,"app":true}',
      'active'
    ),
    -- Marcus Thompson → Elijah
    (
      v_org_id, v_guardian_2, v_student_2, v_household_1a,
      'father', 'joint', true, false, true, 2, true,
      'Thompson Family – Home',
      '{"academics":true,"attendance":true,"report_cards":true,"communications":true,"health_records":true,"incidents":true,"behavior_notes":true}',
      '{"email":true,"sms":false,"app":true}',
      'active'
    ),
    -- Keisha Williams → Zoe (primary custody, full visibility)
    (
      v_org_id, v_guardian_3, v_student_3, v_household_2a,
      'mother', 'primary', true, true, true, 1, true,
      'Williams Family – Primary (Keisha)',
      '{"academics":true,"attendance":true,"report_cards":true,"communications":true,"health_records":true,"incidents":true,"behavior_notes":true}',
      '{"email":true,"sms":true,"app":true}',
      'active'
    ),
    -- Darnell Williams → Zoe (supervised only, restricted visibility)
    -- Court order on file. Cannot see health or incident records.
    -- CRITICAL: This guardian is linked to household_2b (secondary).
    -- RLS on households ensures Darnell cannot see household_2a (Keisha's home).
    (
      v_org_id, v_guardian_4, v_student_3, v_household_2b,
      'father', 'supervised', false, false, true, 2, false,
      'Williams Family – Secondary (Darnell)',
      '{"academics":true,"attendance":false,"report_cards":true,"communications":false,"health_records":false,"incidents":false,"behavior_notes":false}',
      '{"email":true,"sms":false,"app":false}',
      'active'
    ),
    -- Keisha Williams → Jordan
    (
      v_org_id, v_guardian_3, v_student_4, v_household_2a,
      'mother', 'primary', true, true, true, 1, true,
      'Williams Family – Primary (Keisha)',
      '{"academics":true,"attendance":true,"report_cards":true,"communications":true,"health_records":true,"incidents":true,"behavior_notes":true}',
      '{"email":true,"sms":true,"app":true}',
      'active'
    ),
    -- Darnell Williams → Jordan (same restrictions as for Zoe)
    (
      v_org_id, v_guardian_4, v_student_4, v_household_2b,
      'father', 'supervised', false, false, true, 2, false,
      'Williams Family – Secondary (Darnell)',
      '{"academics":true,"attendance":false,"report_cards":true,"communications":false,"health_records":false,"incidents":false,"behavior_notes":false}',
      '{"email":true,"sms":false,"app":false}',
      'active'
    )
    on conflict (organization_id, profile_id, student_id) do nothing;

  exception when foreign_key_violation then
    raise notice
      'Guardianship inserts skipped — guardian profiles do not exist yet. '
      'Invite guardians via Supabase Auth first, then re-run guardianship inserts with real profile IDs.';
  end;

  raise notice 'Sprint 1 seed data complete for org: %', v_org_id;
  raise notice '  Families created: 2 (Thompson, Williams)';
  raise notice '  Households created: 3 (1 single, 2 split)';
  raise notice '  Students seeded: 4 (Amara, Elijah, Zoe, Jordan)';
  raise notice '  Guardianships: attempted (require real profile IDs in auth.users)';

end;
$$;

-- ── Display ID verification ───────────────────────────────────
-- After running this seed, verify display IDs were generated:
--
-- SELECT family_name, family_display_id FROM families ORDER BY created_at;
-- → "Thompson Family" → "RLA-F0001"
-- → "Williams Family" → "RLA-F0002"
--
-- SELECT household_label, household_display_id FROM households ORDER BY created_at;
-- → Three rows: RLA-H0001, RLA-H0002, RLA-H0003
--
-- SELECT first_name, last_name, student_display_id FROM students ORDER BY created_at;
-- → Four rows: RLA-S0001 through RLA-S0004
