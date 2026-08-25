-- Migration 00048: Fix "First Day of School" event title
-- Remove the " — Semester 1 Begins" suffix; semester context is already in the description.
UPDATE calendar_events
SET title = 'First Day of School'
WHERE organization_id = '9fd43346-f43b-41d1-9b4c-fe8702471b07'
  AND title = 'First Day of School — Semester 1 Begins';
