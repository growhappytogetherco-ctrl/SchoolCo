-- Migration 00058: Set arrival_cutoff to 09:00:00 for all orgs
--
-- The org_settings table was created (migration 00010) with a default of
-- '08:30:00'. RLA's correct threshold is 9:00 AM Eastern — check-in at or
-- before 09:00:00 is on time; strictly after is late.
--
-- This migration sets the correct value for all existing orgs that still
-- have the old default, and also updates any org already seeded with 08:30.

UPDATE org_settings
SET    arrival_cutoff = '09:00:00'
WHERE  arrival_cutoff = '08:30:00'::time
   OR  arrival_cutoff IS NULL;

-- Ensure timezone is set (should already be 'America/New_York' by default)
UPDATE org_settings
SET    timezone = 'America/New_York'
WHERE  timezone IS NULL OR timezone = '';
