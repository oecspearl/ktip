-- ============================================================
-- Migration 034: Group Messaging + Messaging RLS hardening
-- 1. Adds conversation name / is_group / created_by and a
--    participant role (admin | member).
-- 2. Fixes security holes from 004:
--    - participants INSERT allowed ANY authenticated user to add
--      anyone to any conversation -> now restricted to self,
--      the conversation creator, or a group admin.
--    - adds the missing participants DELETE policy (leave /
--      admin-remove).
--    - replaces the self-referencing participants SELECT policy
--      with a SECURITY DEFINER helper (recursion guard).
--    - find_conversation_between matched group conversations
--      containing both users -> now restricted to 1-to-1.
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member'));

-- ============================================================
-- SECURITY DEFINER helpers (bypass RLS -> no policy recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION is_conversation_participant(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION is_conversation_admin(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_conversation_creator(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations
    WHERE id = p_conversation_id AND created_by = p_user_id
  );
$$;

-- ============================================================
-- conversations policies
-- ============================================================

-- Include creator so the creator can operate on the conversation
-- between creating it and inserting their own participant row.
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (
    is_conversation_participant(id, auth.uid())
    OR created_by = auth.uid()
  );

-- Creator must stamp themselves on new conversations
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

-- Rename etc.: group admins (or creator); 1-to-1 participants keep
-- the updated_at bump path via the SECURITY DEFINER trigger from 029.
DROP POLICY IF EXISTS "Participants can update own conversations" ON conversations;
CREATE POLICY "Participants can update own conversations"
  ON conversations FOR UPDATE
  USING (
    is_conversation_admin(id, auth.uid())
    OR created_by = auth.uid()
    OR (is_group = FALSE AND is_conversation_participant(id, auth.uid()))
  );

-- ============================================================
-- conversation_participants policies
-- ============================================================

DROP POLICY IF EXISTS "Users can view participants of own conversations" ON conversation_participants;
CREATE POLICY "Users can view participants of own conversations"
  ON conversation_participants FOR SELECT
  USING (is_conversation_participant(conversation_id, auth.uid()));

-- FIX: was WITH CHECK (auth.uid() IS NOT NULL) — anyone could add
-- anyone to any conversation. Now: add yourself, or the creator /
-- a group admin adds others.
DROP POLICY IF EXISTS "Authenticated users can add participants" ON conversation_participants;
CREATE POLICY "Authenticated users can add participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR is_conversation_creator(conversation_id, auth.uid())
    OR is_conversation_admin(conversation_id, auth.uid())
  );

-- Role changes (promote/demote): admins and creator only
DROP POLICY IF EXISTS "Admins can update participants" ON conversation_participants;
CREATE POLICY "Admins can update participants"
  ON conversation_participants FOR UPDATE
  USING (
    is_conversation_admin(conversation_id, auth.uid())
    OR is_conversation_creator(conversation_id, auth.uid())
  );

-- FIX: no DELETE policy existed. Members can leave; admins/creator can remove.
DROP POLICY IF EXISTS "Members can leave and admins can remove" ON conversation_participants;
CREATE POLICY "Members can leave and admins can remove"
  ON conversation_participants FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_conversation_admin(conversation_id, auth.uid())
    OR is_conversation_creator(conversation_id, auth.uid())
  );

-- ============================================================
-- FIX: find_conversation_between matched any conversation that
-- happened to contain both users (including groups). Restrict to
-- non-group conversations with exactly two participants.
-- ============================================================
CREATE OR REPLACE FUNCTION find_conversation_between(user1 UUID, user2 UUID)
RETURNS UUID AS $$
  SELECT cp1.conversation_id
  FROM conversation_participants cp1
  JOIN conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  JOIN conversations c
    ON c.id = cp1.conversation_id
  WHERE cp1.user_id = user1
    AND cp2.user_id = user2
    AND c.is_group = FALSE
    AND (
      SELECT COUNT(*) FROM conversation_participants cp3
      WHERE cp3.conversation_id = cp1.conversation_id
    ) = 2
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;
