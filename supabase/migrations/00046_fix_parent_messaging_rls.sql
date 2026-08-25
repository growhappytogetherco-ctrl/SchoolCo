-- Migration 00046: Fix parent messaging RLS for guardian stub accounts
--
-- Problem: parent_select_conversations and related policies use auth.uid() directly
-- as the guardian profile_id. Guardian stub accounts have profiles.id ≠ auth.uid()
-- (auth_user_id bridges them). This causes the family_id subquery to return nothing,
-- making the .select("id").single() after INSERT return null → "Failed to create conversation."
--
-- Fix: add get_canonical_profile_id() helper and update all parent-facing
-- messaging policies to use it instead of bare auth.uid().

-- ── Helper: resolve canonical profiles.id for the current auth session ────────
CREATE OR REPLACE FUNCTION get_canonical_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1),
    auth.uid()
  );
$$;

-- ── conversations: parent SELECT ──────────────────────────────────────────────
-- Was: g.profile_id = auth.uid() and cp.profile_id = auth.uid()
-- Now: uses get_canonical_profile_id() to handle stub accounts
DROP POLICY IF EXISTS parent_select_conversations ON conversations;
CREATE POLICY parent_select_conversations ON conversations
  FOR SELECT
  USING (
    is_org_member(organization_id)
    AND (
      family_id IN (
        SELECT DISTINCT s.family_id
        FROM guardianships g
        JOIN students s ON s.id = g.student_id
        WHERE g.profile_id = get_canonical_profile_id()
          AND g.status = 'active'
          AND s.organization_id = conversations.organization_id
          AND s.family_id IS NOT NULL
      )
    )
    AND (
      EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = conversations.id
          AND cp.profile_id = get_canonical_profile_id()
      )
    )
  );

-- ── conversation_participants: parent SELECT ──────────────────────────────────
-- Was: profile_id = auth.uid()
-- Now: profile_id = get_canonical_profile_id()
DROP POLICY IF EXISTS parent_select_conv_participants ON conversation_participants;
CREATE POLICY parent_select_conv_participants ON conversation_participants
  FOR SELECT
  USING (
    profile_id = get_canonical_profile_id()
    AND is_org_member(organization_id)
  );

-- ── conversation_participants: parent UPDATE ──────────────────────────────────
DROP POLICY IF EXISTS parent_update_conv_participants ON conversation_participants;
CREATE POLICY parent_update_conv_participants ON conversation_participants
  FOR UPDATE
  USING (
    profile_id = get_canonical_profile_id()
    AND is_org_member(organization_id)
  );

-- ── messages: parent SELECT ───────────────────────────────────────────────────
-- Was: cp.profile_id = auth.uid()
-- Now: cp.profile_id = get_canonical_profile_id()
DROP POLICY IF EXISTS parent_select_messages ON messages;
CREATE POLICY parent_select_messages ON messages
  FOR SELECT
  USING (
    parent_visible = true
    AND deleted_at IS NULL
    AND is_org_member(organization_id)
    AND (
      EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = messages.conversation_id
          AND cp.profile_id = get_canonical_profile_id()
      )
    )
  );
