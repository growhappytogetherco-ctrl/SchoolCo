-- Migration 00049: Fix parent messaging INSERT RLS for guardian stub accounts
--
-- Problem: Migration 00046 updated SELECT/UPDATE policies to use
-- get_canonical_profile_id() but left the three INSERT policies using bare
-- auth.uid(). For stub guardian accounts (Kenny), canonical profiles.id ≠
-- auth.uid(), so every parent INSERT is rejected by RLS even though the
-- server action correctly uses the canonical profile ID.
--
-- Failing policies:
--   parent_insert_conversations  — auth.uid() = created_by fails (canonical mismatch)
--   parent_insert_conv_participants — profile_id = auth.uid() fails
--   parent_insert_messages       — sender_id = auth.uid() + cp.profile_id check fail
--
-- Fix: replace all auth.uid() with get_canonical_profile_id() in INSERT policies.
-- get_canonical_profile_id() was created in migration 00046.

-- ── conversations: parent INSERT ──────────────────────────────────────────────
DROP POLICY IF EXISTS parent_insert_conversations ON conversations;
CREATE POLICY parent_insert_conversations ON conversations
  FOR INSERT
  WITH CHECK (
    is_org_member(conversations.organization_id)
    AND get_canonical_profile_id() = conversations.created_by
    AND conversations.family_id IN (
      SELECT DISTINCT s.family_id
      FROM   guardianships g
      JOIN   students s ON s.id = g.student_id
      WHERE  g.profile_id      = get_canonical_profile_id()
        AND  g.status          = 'active'
        AND  s.organization_id = conversations.organization_id
        AND  s.family_id       IS NOT NULL
    )
  );

-- ── conversation_participants: parent INSERT ──────────────────────────────────
DROP POLICY IF EXISTS parent_insert_conv_participants ON conversation_participants;
CREATE POLICY parent_insert_conv_participants ON conversation_participants
  FOR INSERT
  WITH CHECK (
    profile_id        = get_canonical_profile_id()
    AND participant_type = 'parent'
    AND is_org_member(organization_id)
  );

-- ── messages: parent INSERT ───────────────────────────────────────────────────
DROP POLICY IF EXISTS parent_insert_messages ON messages;
CREATE POLICY parent_insert_messages ON messages
  FOR INSERT
  WITH CHECK (
    parent_visible = true
    AND sender_id  = get_canonical_profile_id()
    AND is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE  cp.conversation_id = messages.conversation_id
        AND  cp.profile_id      = get_canonical_profile_id()
    )
  );
