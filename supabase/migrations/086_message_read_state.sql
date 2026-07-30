-- ============================================================
-- Migration 086: Per-participant read state for messaging
--
-- The FAB is the only entry point to the messaging panel, so a member
-- who is not already looking at the panel has no way to learn that a
-- message arrived. This adds the state a notification dot needs:
--
-- 1. conversation_participants.last_read_at — when this member last
--    looked at this thread
-- 2. mark_conversation_read(uuid) — stamps it. An RPC rather than an
--    UPDATE policy because RLS cannot restrict which columns a write
--    touches: a permissive self-update policy on this table would also
--    let a member set their own role to 'admin' (034).
-- 3. unread_message_count() — how many messages across all of the
--    caller's threads arrived after their last read, excluding their
--    own sends. One round trip instead of fetching every thread.
--
-- Backfill: existing rows default to NOW(), i.e. everything already in
-- the history reads as seen. The alternative — NULL meaning "never
-- read" — would light the dot for every member on deploy over messages
-- they have in fact already read.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

COMMENT ON COLUMN conversation_participants.last_read_at IS
  'When this member last had the thread open. Written only by mark_conversation_read(); there is no UPDATE policy for members on this table.';

-- Covers the unread count's access pattern: my participant rows, with
-- the timestamp each conversation's messages get compared against.
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_read
  ON conversation_participants(user_id, conversation_id, last_read_at);

-- ------------------------------------------------------------
-- Stamp the caller's read state for one thread
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_conversation_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE conversation_participants
  SET last_read_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid();
$$;

COMMENT ON FUNCTION mark_conversation_read(UUID) IS
  'Marks a thread read for the calling member. Scoped to auth.uid(), so it cannot stamp anyone else''s row and cannot touch any other column.';

-- ------------------------------------------------------------
-- Unread messages across every thread the caller is in
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION unread_message_count()
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(m.id), 0)::INTEGER
  FROM conversation_participants cp
  JOIN messages m
    ON m.conversation_id = cp.conversation_id
   AND m.created_at > cp.last_read_at
   AND m.sender_id <> cp.user_id
  WHERE cp.user_id = auth.uid();
$$;

COMMENT ON FUNCTION unread_message_count() IS
  'Count of messages in the caller''s threads newer than their last_read_at, excluding their own sends. Returns 0 for an anonymous caller.';

GRANT EXECUTE ON FUNCTION mark_conversation_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unread_message_count() TO authenticated;
