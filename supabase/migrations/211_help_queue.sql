-- Migration 211: the Help Desk queue
-- ============================================================================
--
-- Until now "I am stuck" was a status: set yourself to help-wanted and hope a
-- mentor notices. The room design makes it a line. You say what you need, you
-- see your place and who is ahead, and a mentor picks you up.
--
--   venue_help_requests   one request, from one person, at one help desk
--
-- A person has at most one open request per event (waiting or being helped).
-- Everyone in the venue can read the line: it is a queue at a desk, and seeing
-- that three people are ahead is the point. Every write goes through a
-- function below. No suspended, closed or unverified account asks (205, 206);
-- spectators read only; only mentors and organisers pick a request up.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS venue_help_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES venue_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 3 AND 300),
  tags TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 4),
  -- The language it was written in, so a mentor reads it in their own (100).
  lang TEXT,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'helping', 'done', 'withdrawn')),
  mentor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  picked_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_help_requests_room
  ON venue_help_requests(room_id, created_at);

-- One open request per person per event.
CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_help_requests_open
  ON venue_help_requests(event_id, user_id)
  WHERE status IN ('waiting', 'helping');

COMMENT ON TABLE venue_help_requests IS 'The Help Desk line. Written through ask_for_help(), pick_help_request(), close_help_request()';

ALTER TABLE venue_help_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue sees the help line" ON venue_help_requests;
CREATE POLICY "Venue sees the help line"
  ON venue_help_requests FOR SELECT
  USING (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id));

GRANT SELECT ON venue_help_requests TO authenticated;

-- A mentor or an organiser of this event.
CREATE OR REPLACE FUNCTION can_help_at_event(p_user UUID, p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT is_venue_host(p_user, p_event_id) OR EXISTS (
    SELECT 1 FROM event_venue_members m
    WHERE m.event_id = p_event_id AND m.user_id = p_user AND m.role IN ('mentor', 'organizer')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- Join the line
-- ============================================================

CREATE OR REPLACE FUNCTION ask_for_help(
  p_room_id UUID,
  p_body TEXT,
  p_tags TEXT[] DEFAULT '{}',
  p_lang TEXT DEFAULT NULL
) RETURNS venue_help_requests AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room venue_rooms;
  v_tags TEXT[];
  v_row venue_help_requests;
BEGIN
  IF v_user IS NULL OR is_suspended(v_user) OR NOT is_account_active(v_user) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT is_verified_member(v_user) THEN
    RAISE EXCEPTION 'verify your account to ask for help' USING ERRCODE = '42501';
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
    RAISE EXCEPTION 'spectators cannot join the help line' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM venue_help_requests
    WHERE event_id = v_room.event_id AND user_id = v_user AND status IN ('waiting', 'helping')
  ) THEN
    RAISE EXCEPTION 'you are already in the help line';
  END IF;

  -- Short, trimmed, no blanks, four at most.
  SELECT coalesce(array_agg(tag), '{}') INTO v_tags FROM (
    SELECT DISTINCT left(btrim(t), 24) AS tag
    FROM unnest(coalesce(p_tags, '{}')) AS t
    WHERE btrim(t) <> ''
    LIMIT 4
  ) s;

  INSERT INTO venue_help_requests (event_id, room_id, user_id, body, tags, lang)
  VALUES (
    v_room.event_id, p_room_id, v_user, btrim(p_body), v_tags,
    CASE WHEN p_lang IN ('en', 'fr', 'es') THEN p_lang ELSE NULL END
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Leave the line
-- ============================================================

CREATE OR REPLACE FUNCTION withdraw_help_request(p_request_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE venue_help_requests
  SET status = 'withdrawn', closed_at = now()
  WHERE id = p_request_id AND user_id = auth.uid() AND status IN ('waiting', 'helping');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- A mentor picks a request up, and closes it when done
-- ============================================================

CREATE OR REPLACE FUNCTION pick_help_request(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user UUID := auth.uid();
  v_req venue_help_requests;
BEGIN
  SELECT * INTO v_req FROM venue_help_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'request not found';
  END IF;
  IF v_user IS NULL OR is_suspended(v_user) OR NOT can_help_at_event(v_user, v_req.event_id) THEN
    RAISE EXCEPTION 'only mentors and organisers pick up help requests' USING ERRCODE = '42501';
  END IF;
  IF v_req.user_id = v_user THEN
    RAISE EXCEPTION 'you cannot pick up your own request';
  END IF;
  -- The status test is in the WHERE, so two mentors clicking at once cannot both win.
  UPDATE venue_help_requests
  SET status = 'helping', mentor_id = v_user, picked_at = now()
  WHERE id = p_request_id AND status = 'waiting';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'someone else already picked this up';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION close_help_request(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user UUID := auth.uid();
  v_req venue_help_requests;
BEGIN
  SELECT * INTO v_req FROM venue_help_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'request not found';
  END IF;
  -- The mentor helping, the person helped, or an organiser.
  IF v_user IS NULL OR NOT (
    v_req.mentor_id = v_user OR v_req.user_id = v_user OR is_venue_host(v_user, v_req.event_id)
  ) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE venue_help_requests
  SET status = 'done', closed_at = now()
  WHERE id = p_request_id AND status IN ('waiting', 'helping');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION can_help_at_event(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION ask_for_help(UUID, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION withdraw_help_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION pick_help_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION close_help_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_help_at_event(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION ask_for_help(UUID, TEXT, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION withdraw_help_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION pick_help_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION close_help_request(UUID) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'venue_help_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE venue_help_requests;
  END IF;
END $$;
