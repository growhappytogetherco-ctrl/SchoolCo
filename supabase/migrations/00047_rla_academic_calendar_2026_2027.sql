-- Migration 00047: RLA 2026-2027 Academic Calendar
--
-- Source: Rising Leaders Academy established 2026-2027 Academic Calendar
-- Entered verbatim from the provided calendar.
-- No dates invented. No BCS calendar used.
-- Holiday labels removed; neutral operational wording used.
-- Easter/Easter Break references: NONE.
--
-- All events:
--   status = published
--   visibility = school_wide
--   is_all_day = true
--   organization_id = RLA org
--   created_by = Elisa Johnson (full_admin)

DO $$
DECLARE
  org_id  uuid := '9fd43346-f43b-41d1-9b4c-fe8702471b07';
  creator uuid := '7ba9a63f-c33d-4a25-b716-125e27bdf1b5'; -- Elisa Johnson
BEGIN

  -- ── SEMESTER 1 ─────────────────────────────────────────────────────────

  -- August 10, 2026 — First Day of School / Semester 1 Begins
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'First Day of School — Semester 1 Begins',
    'Welcome back! First day of the 2026–2027 school year. Quarter 1 begins.',
    '2026-08-10 00:00:00+00', '2026-08-10 23:59:59+00', true,
    'semester_begins', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- September 7, 2026 — No School
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'No School',
    'School closed. No school for students.',
    '2026-09-07 00:00:00+00', '2026-09-07 23:59:59+00', true,
    'no_school', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- October 9, 2026 — End of Quarter 1
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'End of Quarter 1',
    'Last day of Quarter 1.',
    '2026-10-09 00:00:00+00', '2026-10-09 23:59:59+00', true,
    'quarter_ends', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- October 12, 2026 — Quarter 2 Begins
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'Quarter 2 Begins',
    'First day of Quarter 2.',
    '2026-10-12 00:00:00+00', '2026-10-12 23:59:59+00', true,
    'quarter_begins', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- November 11, 2026 — No School
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'No School',
    'School closed. No school for students.',
    '2026-11-11 00:00:00+00', '2026-11-11 23:59:59+00', true,
    'no_school', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- November 23–27, 2026 — Fall Break
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'Fall Break — No School',
    'Fall Break. School closed November 23–27. Students return November 30.',
    '2026-11-23 00:00:00+00', '2026-11-27 23:59:59+00', true,
    'no_school', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- December 18, 2026 — End of Quarter 2 / End of Semester 1
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'Last Day of Semester 1 — End of Quarter 2',
    'Last day of the first semester. End of Quarter 2.',
    '2026-12-18 00:00:00+00', '2026-12-18 23:59:59+00', true,
    'semester_ends', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- December 21, 2026 – January 3, 2027 — Winter Break
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'Winter Break — No School',
    'Winter Break. School closed December 21 – January 3. Students return January 4.',
    '2026-12-21 00:00:00+00', '2027-01-03 23:59:59+00', true,
    'no_school', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- ── SEMESTER 2 ─────────────────────────────────────────────────────────

  -- January 4, 2027 — Students Return / Semester 2 Begins / Quarter 3 Begins
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'Semester 2 Begins — Quarter 3 Begins',
    'Students return from Winter Break. Second semester begins. Quarter 3 begins.',
    '2027-01-04 00:00:00+00', '2027-01-04 23:59:59+00', true,
    'semester_begins', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- January 18, 2027 — No School
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'No School',
    'School closed. No school for students.',
    '2027-01-18 00:00:00+00', '2027-01-18 23:59:59+00', true,
    'no_school', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- February 15, 2027 — No School
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'No School',
    'School closed. No school for students.',
    '2027-02-15 00:00:00+00', '2027-02-15 23:59:59+00', true,
    'no_school', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- March 5, 2027 — End of Quarter 3
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'End of Quarter 3',
    'Last day of Quarter 3.',
    '2027-03-05 00:00:00+00', '2027-03-05 23:59:59+00', true,
    'quarter_ends', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- March 8, 2027 — Quarter 4 Begins
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'Quarter 4 Begins',
    'First day of Quarter 4.',
    '2027-03-08 00:00:00+00', '2027-03-08 23:59:59+00', true,
    'quarter_begins', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- March 15–19, 2027 — Spring Break
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'Spring Break — No School',
    'Spring Break. School closed March 15–19. Students return March 22.',
    '2027-03-15 00:00:00+00', '2027-03-19 23:59:59+00', true,
    'no_school', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- March 26–29, 2027 — Scheduled Break (no holiday label)
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'Scheduled Break — No School',
    'School closed March 26–29. Students return March 30.',
    '2027-03-26 00:00:00+00', '2027-03-29 23:59:59+00', true,
    'no_school', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- May 25, 2027 — Last Day of School / End of Quarter 4 / End of Semester 2
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'Last Day of School — End of Semester 2',
    'Last day of the 2026–2027 school year. End of Quarter 4 and Semester 2.',
    '2027-05-25 00:00:00+00', '2027-05-25 23:59:59+00', true,
    'semester_ends', 'school_wide', 'published',
    false, false, false, false, creator
  );

  -- May 31, 2027 — No School
  INSERT INTO calendar_events (
    id, organization_id, title, description,
    start_at, end_at, is_all_day,
    category, visibility, status,
    requires_rsvp, requires_permission_slip, requires_parent_confirm, requires_transportation,
    created_by
  ) VALUES (
    gen_random_uuid(), org_id,
    'No School',
    'School closed. No school for students.',
    '2027-05-31 00:00:00+00', '2027-05-31 23:59:59+00', true,
    'no_school', 'school_wide', 'published',
    false, false, false, false, creator
  );

  RAISE NOTICE 'RLA 2026-2027 academic calendar inserted: 17 events';
END $$;
