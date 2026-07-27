-- ============================================================
-- Fix: conversation_participants self-referencing RLS policy
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- 1. Drop the broken self-referencing policy
DROP POLICY IF EXISTS "Users can view participants of own conversations" ON conversation_participants;

-- 2. Create a SECURITY DEFINER helper function to check membership
-- This bypasses RLS to avoid the circular reference
CREATE OR REPLACE FUNCTION is_conversation_member(conv_id UUID, uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conv_id AND user_id = uid
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 3. Recreate the policy using the helper function (no self-reference)
CREATE POLICY "Users can view participants of own conversations"
  ON conversation_participants FOR SELECT
  USING (is_conversation_member(conversation_id, auth.uid()));

-- 4. Also fix the messages SELECT policy which has the same pattern
DROP POLICY IF EXISTS "Users can view messages in own conversations" ON messages;

CREATE POLICY "Users can view messages in own conversations"
  ON messages FOR SELECT
  USING (is_conversation_member(conversation_id, auth.uid()));

-- 5. Fix the messages INSERT policy too
DROP POLICY IF EXISTS "Users can send messages to own conversations" ON messages;

CREATE POLICY "Users can send messages to own conversations"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND is_conversation_member(conversation_id, auth.uid()));

-- 6. Fix conversations SELECT policy (also references conversation_participants)
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;

CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (is_conversation_member(id, auth.uid()));

-- Done! The circular RLS reference is resolved.
