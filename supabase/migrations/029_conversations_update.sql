-- ============================================================
-- Migration 029: Conversations UPDATE policy + SECURITY DEFINER trigger
-- 004_create_messages_table.sql enabled RLS on `conversations` with only
-- SELECT and INSERT policies. Its update_conversation_on_message() trigger
-- (fired AFTER INSERT ON messages) runs `UPDATE conversations SET
-- updated_at = NOW() WHERE id = NEW.conversation_id`. Trigger functions
-- default to SECURITY INVOKER, so that UPDATE is subject to RLS as the
-- sending user — and with no UPDATE policy on `conversations`, the update
-- matches zero rows. Conversation list ordering
-- (`useConversations()` -> `.order('updated_at', ...)`) then never
-- reflects the latest message. Fix both the missing policy and make the
-- trigger function SECURITY DEFINER so it isn't dependent on the policy
-- (belt-and-suspenders — either fix alone resolves the bug).
-- Idempotent — safe to re-run.
-- ============================================================

-- Explicit UPDATE policy: either participant may bump their own conversation.
DROP POLICY IF EXISTS "Participants can update own conversations" ON conversations;
CREATE POLICY "Participants can update own conversations"
  ON conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_participants.conversation_id = conversations.id
      AND conversation_participants.user_id = auth.uid()
    )
  );

-- Recreate the trigger function as SECURITY DEFINER so the updated_at
-- bump succeeds regardless of the invoking participant's row-level
-- visibility into `conversations` (matches the SECURITY DEFINER pattern
-- used by handle_new_user() in 000_create_profiles_table.sql).
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversation_on_message_trigger ON messages;
CREATE TRIGGER update_conversation_on_message_trigger
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();
