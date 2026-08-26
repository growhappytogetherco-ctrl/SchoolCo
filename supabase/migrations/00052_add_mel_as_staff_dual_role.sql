-- Migration 00052: Add Mel St Gerard (msmel86@gmail.com) as staff with dual parent role
--
-- Mel has an existing Auth user and canonical profile. There is one row per user per org
-- (UNIQUE on organization_id, profile_id), so we update in place rather than inserting.
--
-- Change: role → "staff", roles → ["staff","parent"]
-- This enables the View Switcher the same way Kenny's account works.
-- Her guardianships are stored in the guardianships table and are unaffected.

UPDATE organization_members
SET
  role  = 'staff',
  roles = ARRAY['staff','parent']
WHERE profile_id    = 'dac173ef-9a7e-4a80-aaf3-68c71a16fb55'  -- Mel St Gerard canonical profile
  AND organization_id = '9fd43346-f43b-41d1-9b4c-fe8702471b07' -- RLA
  AND role = 'parent';
