-- Backfill conversation_participants rows for staff members on existing parent conversations.
-- Before this migration, createParentConversation didn't insert staff participants, so
-- the unread widget queries returned empty for conversations created before the fix.
--
-- This inserts a participant row (last_read_at = null, meaning "unread from the start")
-- for every active staff/teacher/admin member who isn't already a participant in a given
-- parent-initiated conversation.

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
