-- ============================================================================
-- 165_start_direct_conversation.sql — opening a DM is one request, and atomic
-- ============================================================================
-- useCreateConversation made up to five serial round trips to open a thread:
-- find_conversation_between, a profiles read for the student and privacy
-- checks, a connections read when the recipient is private, the conversations
-- INSERT, then the conversation_participants INSERT. Sharing a project with
-- three people paid that three times over, one after another.
--
-- The two INSERTs were also separate requests. If the second failed (a policy
-- refusal, a dropped connection), the first had already committed a
-- conversation with no participants that nobody could see or delete.
--
-- This does the same steps in one transaction. SECURITY INVOKER: every read
-- and write goes through the same RLS the client path did (064 for students,
-- 083 for private profiles, the participants policy for who may add whom), so
-- it decides nothing the database did not already decide. The early checks
-- only exist to return a reason the client can put into words, where RLS
-- would return an opaque 42501.
--
-- Returns { ok, conversation_id } or { ok: false, reason } with reason one of
-- 'unauthenticated', 'student', 'private'. Anything else raises, as the
-- client path did.
-- ============================================================================

CREATE OR REPLACE FUNCTION start_direct_conversation(p_other UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_existing UUID;
  v_conv     UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;

  v_existing := find_conversation_between(v_me, p_other);
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'conversation_id', v_existing);
  END IF;

  -- Safeguarding (064): a 1-to-1 thread may never contain a student.
  IF EXISTS (
    SELECT 1 FROM profiles
     WHERE id IN (v_me, p_other)
       AND 'student' = ANY(coalesce(roles, ARRAY[]::TEXT[]))
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'student');
  END IF;

  -- Privacy (083): a private member takes messages from connections only.
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_other AND profile_visibility = 'private')
     AND NOT EXISTS (
       SELECT 1 FROM connections
        WHERE status = 'accepted'
          AND ((requester_id = v_me AND addressee_id = p_other)
            OR (requester_id = p_other AND addressee_id = v_me))
     ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'private');
  END IF;

  v_conv := gen_random_uuid();
  INSERT INTO conversations (id, created_by) VALUES (v_conv, v_me);
  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES (v_conv, v_me), (v_conv, p_other);

  RETURN jsonb_build_object('ok', TRUE, 'conversation_id', v_conv);
END;
$$;

REVOKE ALL ON FUNCTION start_direct_conversation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION start_direct_conversation(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
