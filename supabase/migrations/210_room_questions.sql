-- Migration 210: questions for the speaker, with upvotes (the Q&A tab)
-- ============================================================================
--
-- In a hall or on a stage, questions typed into chat scroll away before the
-- speaker reaches them. The room design gives them their own tab: anyone in
-- the room asks, everyone upvotes the ones they want answered, and a host
-- marks a question answered.
--
--   venue_room_questions        one question, in one room
--   venue_room_question_votes   one row per person per question
--
-- Reads follow room chat (190): venue members and hosts, in rooms they may
-- enter. Every write goes through a function below, so the rules live in one
-- place: no suspended, closed or unverified account asks or votes (205, 206),
-- spectators read only, and nobody votes twice.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS venue_room_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES venue_rooms(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 3 AND 300),
  -- The language it was written in, so readers get it in their own (100).
  lang TEXT,
  answered_at TIMESTAMPTZ,
  answered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_removed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_room_questions_room
  ON venue_room_questions(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS venue_room_question_votes (
  question_id UUID NOT NULL REFERENCES venue_room_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, user_id)
);

COMMENT ON TABLE venue_room_questions IS 'Questions for the speaker in a venue room. Written through ask_room_question()';
COMMENT ON TABLE venue_room_question_votes IS 'Upvotes on room questions, one per person. Written through vote_room_question()';

-- ============================================================
-- RLS: read like room chat, write through the functions only
-- ============================================================

ALTER TABLE venue_room_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_room_question_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue members can read room questions" ON venue_room_questions;
CREATE POLICY "Venue members can read room questions"
  ON venue_room_questions FOR SELECT
  USING (
    NOT is_removed
    AND (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id))
    AND can_access_venue_room(auth.uid(), room_id)
  );

-- A vote is visible to whoever can see its question; the subquery runs under
-- the reader's own policies, so it needs no second copy of the rule.
DROP POLICY IF EXISTS "Votes follow their question" ON venue_room_question_votes;
CREATE POLICY "Votes follow their question"
  ON venue_room_question_votes FOR SELECT
  USING (EXISTS (SELECT 1 FROM venue_room_questions q WHERE q.id = question_id));

GRANT SELECT ON venue_room_questions, venue_room_question_votes TO authenticated;

-- ============================================================
-- Ask
-- ============================================================

CREATE OR REPLACE FUNCTION ask_room_question(p_room_id UUID, p_body TEXT, p_lang TEXT DEFAULT NULL)
RETURNS venue_room_questions AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room venue_rooms;
  v_row venue_room_questions;
BEGIN
  IF v_user IS NULL OR is_suspended(v_user) OR NOT is_account_active(v_user) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT is_verified_member(v_user) THEN
    RAISE EXCEPTION 'verify your account to ask a question' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_room FROM venue_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL OR NOT v_room.is_open THEN
    RAISE EXCEPTION 'this room is closed';
  END IF;
  IF NOT can_access_venue_room(v_user, p_room_id) THEN
    RAISE EXCEPTION 'you cannot enter this room' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM event_venue_members m
    WHERE m.event_id = v_room.event_id AND m.user_id = v_user AND m.role <> 'spectator'
  ) THEN
    RAISE EXCEPTION 'spectators can read questions but not ask them' USING ERRCODE = '42501';
  END IF;

  -- Five waiting at a time per person: a queue one person can fill is not a queue.
  IF (
    SELECT count(*) FROM venue_room_questions
    WHERE room_id = p_room_id AND author_id = v_user AND NOT is_removed AND answered_at IS NULL
  ) >= 5 THEN
    RAISE EXCEPTION 'you already have five questions waiting in this room';
  END IF;

  INSERT INTO venue_room_questions (room_id, event_id, author_id, body, lang)
  VALUES (
    p_room_id, v_room.event_id, v_user, btrim(p_body),
    CASE WHEN p_lang IN ('en', 'fr', 'es') THEN p_lang ELSE NULL END
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Upvote, or take the upvote back
-- ============================================================

CREATE OR REPLACE FUNCTION vote_room_question(p_question_id UUID, p_on BOOLEAN DEFAULT TRUE)
RETURNS VOID AS $$
DECLARE
  v_user UUID := auth.uid();
  v_q venue_room_questions;
BEGIN
  IF v_user IS NULL OR is_suspended(v_user) OR NOT is_account_active(v_user) OR NOT is_verified_member(v_user) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_q FROM venue_room_questions WHERE id = p_question_id AND NOT is_removed;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'question not found';
  END IF;
  IF NOT can_access_venue_room(v_user, v_q.room_id)
     OR NOT (is_venue_member(v_user, v_q.event_id) OR is_venue_host(v_user, v_q.event_id)) THEN
    RAISE EXCEPTION 'you cannot enter this room' USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_on, TRUE) THEN
    INSERT INTO venue_room_question_votes (question_id, user_id)
    VALUES (p_question_id, v_user)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM venue_room_question_votes WHERE question_id = p_question_id AND user_id = v_user;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Hosts mark answered; the author or a host removes
-- ============================================================

CREATE OR REPLACE FUNCTION set_room_question_answered(p_question_id UUID, p_answered BOOLEAN DEFAULT TRUE)
RETURNS VOID AS $$
DECLARE
  v_q venue_room_questions;
BEGIN
  SELECT * INTO v_q FROM venue_room_questions WHERE id = p_question_id;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'question not found';
  END IF;
  IF NOT is_venue_host(auth.uid(), v_q.event_id) THEN
    RAISE EXCEPTION 'only organisers can mark a question answered' USING ERRCODE = '42501';
  END IF;
  UPDATE venue_room_questions
  SET answered_at = CASE WHEN coalesce(p_answered, TRUE) THEN now() ELSE NULL END,
      answered_by = CASE WHEN coalesce(p_answered, TRUE) THEN auth.uid() ELSE NULL END
  WHERE id = p_question_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION remove_room_question(p_question_id UUID)
RETURNS VOID AS $$
DECLARE
  v_q venue_room_questions;
BEGIN
  SELECT * INTO v_q FROM venue_room_questions WHERE id = p_question_id;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'question not found';
  END IF;
  IF v_q.author_id IS DISTINCT FROM auth.uid() AND NOT is_venue_host(auth.uid(), v_q.event_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE venue_room_questions SET is_removed = TRUE WHERE id = p_question_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION ask_room_question(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION vote_room_question(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION set_room_question_answered(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION remove_room_question(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ask_room_question(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION vote_room_question(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION set_room_question_answered(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_room_question(UUID) TO authenticated;

-- ============================================================
-- Realtime, so a new question or vote shows without a refresh
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'venue_room_questions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE venue_room_questions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'venue_room_question_votes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE venue_room_question_votes;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
