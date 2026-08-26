-- Migration 00050: Backfill staff conversation participants
--
-- Parent conversations created between migration 00037 and 00049 may be missing
-- staff participant rows because createParentConversation used the parent session
-- to insert staff participants — which RLS blocked silently.
--
-- This uses the same idempotent pattern as 00037 to catch any conversations
-- where staff are not yet participants.

INSERT INTO conversation_participants (
  conversation_id,
  organization_id,
  profile_id,
  participant_type,
  last_read_at,
  created_at
)
SELECT
  c.id             AS conversation_id,
  c.organization_id,
  om.profile_id,
  'staff'          AS participant_type,
  NULL             AS last_read_at,
  NOW()            AS created_at
FROM conversations c
JOIN organization_members om
  ON om.organization_id = c.organization_id
  AND om.status = 'active'
  AND om.role IN ('teacher','staff','registrar','admin','full_admin','platform_admin')
WHERE NOT EXISTS (
    SELECT 1
    FROM conversation_participants cp
    WHERE cp.conversation_id = c.id
      AND cp.profile_id = om.profile_id
  )
ON CONFLICT DO NOTHING;
