-- 202: video calls on LiveKit for /collaborate/video
--
-- The Collaborate video page embedded meet.jit.si, which now ends embedded
-- calls after five minutes. Calls move onto the same LiveKit project as the
-- venue: one provider, one free quota, one token route.
--
-- A call is a row with an unguessable id. Whoever starts it gets the link, and
-- any signed-in member holding the link may join. The creator can lock it
-- (nobody new gets in) or end it (api/call/end.ts also closes the LiveKit room,
-- so everyone is disconnected). A call lapses seven days after it was started,
-- so a link pasted somewhere public does not stay a door for ever.
--
-- Students are kept out. Safeguarding (064) says a one-to-one thread may never
-- contain a student, and a call opened by link can shrink to two people at any
-- moment. Students keep video in the venue, where rooms are hosted group
-- spaces and coffee tables never seat fewer than three (200).
--
-- Each call is its own LiveKit room, named by the call id. Tokens come from
-- video_call_grant() through api/venue/room-token, which already signs for
-- venue rooms and coffee tables. Usage lands in the 193 ledger with no event,
-- so the free-tier meters count it and no event's panel shows it.
--
-- Idempotent. Safe to re-run.

-- ============================================================
-- 1. Table
-- ============================================================

CREATE TABLE IF NOT EXISTS video_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 80),
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_calls_created_by ON video_calls(created_by, created_at DESC);

COMMENT ON TABLE video_calls IS
  'Calls started from /collaborate/video (202). The id is the LiveKit room name. Read through video_call_info(); written only by the functions below';

ALTER TABLE video_calls ENABLE ROW LEVEL SECURITY;

-- Creators may list their own calls. Everyone else reaches a call by its id,
-- through video_call_info(), so nobody can enumerate other people's calls.
DROP POLICY IF EXISTS "Creators can read their calls" ON video_calls;
CREATE POLICY "Creators can read their calls"
  ON video_calls FOR SELECT
  USING (created_by = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON video_calls FROM anon, authenticated;

-- ============================================================
-- 2. Rules
-- ============================================================

-- How long a link stays a door.
CREATE OR REPLACE FUNCTION video_call_is_over(p_call video_calls)
RETURNS BOOLEAN AS $$
  SELECT p_call.ended_at IS NOT NULL OR p_call.created_at < now() - INTERVAL '7 days';
$$ LANGUAGE sql STABLE SET search_path = public;

-- Who may use calls at all: signed in, not suspended, not a student (064).
-- Raises the reason, so the page can say it in words.
CREATE OR REPLACE FUNCTION video_call_check_caller(p_user UUID)
RETURNS VOID AS $$
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(p_user) THEN
    RAISE EXCEPTION 'your account is suspended';
  END IF;
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user AND 'student' = ANY(coalesce(roles, ARRAY[]::TEXT[]))
  ) THEN
    RAISE EXCEPTION 'video calls are not open to student accounts';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. Client functions
-- ============================================================

-- Start a call. Thirty a day per person is far more than anyone needs and
-- stops a script from filling the table.
CREATE OR REPLACE FUNCTION create_video_call(p_title TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  v_user UUID := auth.uid();
  v_title TEXT := nullif(btrim(coalesce(p_title, '')), '');
  v_id UUID;
BEGIN
  PERFORM video_call_check_caller(v_user);

  IF (
    SELECT count(*) FROM video_calls
    WHERE created_by = v_user AND created_at > now() - INTERVAL '1 day'
  ) >= 30 THEN
    RAISE EXCEPTION 'you have started too many calls today';
  END IF;

  INSERT INTO video_calls (created_by, title)
  VALUES (v_user, left(v_title, 80))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- What the link shows before joining. Anyone allowed to use calls may ask
-- about an id they hold; an id is 122 random bits, so holding it is the
-- invitation.
CREATE OR REPLACE FUNCTION video_call_info(p_call_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_call video_calls;
  v_host_name TEXT;
BEGIN
  PERFORM video_call_check_caller(v_user);

  SELECT * INTO v_call FROM video_calls WHERE id = p_call_id;
  IF v_call.id IS NULL THEN
    RAISE EXCEPTION 'call not found';
  END IF;

  SELECT display_name INTO v_host_name FROM profiles WHERE id = v_call.created_by;

  RETURN jsonb_build_object(
    'id', v_call.id,
    'title', v_call.title,
    'host_name', v_host_name,
    'is_host', v_call.created_by = v_user,
    'locked', v_call.locked,
    'ended', video_call_is_over(v_call),
    'created_at', v_call.created_at
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- The same shape as venue_room_grant(), for api/venue/room-token.
CREATE OR REPLACE FUNCTION video_call_grant(p_call_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_call video_calls;
  v_host BOOLEAN;
BEGIN
  PERFORM video_call_check_caller(v_user);

  SELECT * INTO v_call FROM video_calls WHERE id = p_call_id;
  IF v_call.id IS NULL THEN
    RAISE EXCEPTION 'call not found';
  END IF;
  IF video_call_is_over(v_call) THEN
    RAISE EXCEPTION 'this call has ended';
  END IF;

  v_host := v_call.created_by = v_user;
  IF v_call.locked AND NOT v_host THEN
    RAISE EXCEPTION 'this call is locked';
  END IF;

  RETURN jsonb_build_object(
    'room', v_call.id,
    'identity', v_user,
    'can_subscribe', TRUE,
    'can_publish', TRUE,
    'can_publish_data', TRUE,
    'is_host', v_host,
    'recording', FALSE,
    'audio_mode', 'open',
    'max_publishers', 25
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Lock, unlock or end. Creator only. Ending is final.
CREATE OR REPLACE FUNCTION set_video_call_state(
  p_call_id UUID,
  p_locked BOOLEAN DEFAULT NULL,
  p_end BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_owner UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT created_by INTO v_owner FROM video_calls WHERE id = p_call_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'call not found';
  END IF;
  IF v_owner <> v_user THEN
    RAISE EXCEPTION 'only the person who started this call can change it';
  END IF;

  UPDATE video_calls
  SET locked = coalesce(p_locked, locked),
      ended_at = CASE WHEN coalesce(p_end, FALSE) THEN coalesce(ended_at, now()) ELSE ended_at END
  WHERE id = p_call_id;

  RETURN video_call_info(p_call_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 4. Usage: call minutes count toward the free tier, under no event
-- ============================================================
--
-- The LiveKit webhook (193) hands every UUID room to these two writers. A
-- venue room or coffee table resolves to a room as before (200). A call id
-- now records too: sessions are keyed by the call id, so "people in calls
-- now" counts them, and ledger rows carry event_id NULL with the call id in
-- meta, so venue_usage_meters() sums them into the monthly totals while the
-- per-event RLS keeps them off every organiser's panel.

CREATE OR REPLACE FUNCTION record_venue_usage(
  p_room_id UUID,
  p_user_id UUID,
  p_kind TEXT,
  p_amount NUMERIC,
  p_meta JSONB DEFAULT '{}'::jsonb,
  p_source_id TEXT DEFAULT NULL,
  p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN AS $$
DECLARE
  v_event UUID;
  v_team UUID;
  v_team_name TEXT;
  v_room UUID;
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL OR coalesce(p_amount, 0) <= 0 THEN
    RETURN FALSE;
  END IF;

  -- 200: a coffee table's call bills to the lounge it was made in.
  v_room := venue_usage_room_of(p_room_id);

  -- 202: a call from /collaborate/video belongs to no event.
  IF v_room IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM video_calls WHERE id = p_room_id) THEN
      RETURN FALSE;
    END IF;
    INSERT INTO venue_usage (event_id, team_id, team_name, room_id, user_id, kind, amount, meta, source_id, at)
    VALUES (
      NULL, NULL, NULL, NULL, p_user_id, p_kind, p_amount,
      coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('call_id', p_room_id),
      p_source_id, coalesce(p_at, now())
    )
    ON CONFLICT (source_id) DO NOTHING;
    RETURN FOUND;
  END IF;

  SELECT event_id INTO v_event FROM venue_rooms WHERE id = v_room;
  IF v_event IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (is_venue_member(p_user_id, v_event) OR is_venue_host(p_user_id, v_event)) THEN
    RETURN FALSE;
  END IF;

  SELECT m.team_id, t.name INTO v_team, v_team_name
  FROM event_team_members m
  JOIN event_teams t ON t.id = m.team_id
  WHERE m.event_id = v_event AND m.user_id = p_user_id;

  INSERT INTO venue_usage (event_id, team_id, team_name, room_id, user_id, kind, amount, meta, source_id, at)
  VALUES (
    v_event, v_team, v_team_name, v_room, p_user_id, p_kind, p_amount,
    coalesce(p_meta, '{}'::jsonb), p_source_id, coalesce(p_at, now())
  )
  ON CONFLICT (source_id) DO NOTHING;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION open_venue_usage_session(
  p_room_id UUID,
  p_user_id UUID,
  p_kind TEXT,
  p_sid TEXT,
  p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID AS $$
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL OR coalesce(p_sid, '') = '' THEN
    RETURN;
  END IF;
  -- Only rooms this app knows about. LiveKit may host other rooms one day.
  -- 200: a coffee table counts as part of its lounge. 202: so does a call.
  IF venue_usage_room_of(p_room_id) IS NULL
     AND NOT EXISTS (SELECT 1 FROM video_calls WHERE id = p_room_id) THEN
    RETURN;
  END IF;

  INSERT INTO venue_usage_sessions (room_id, user_id, kind, sid, started_at)
  VALUES (p_room_id, p_user_id, p_kind, p_sid, coalesce(p_at, now()))
  ON CONFLICT DO NOTHING;

  -- A session whose "ended" webhook never arrived must not count as in a
  -- call for ever. A day is far longer than any real session.
  DELETE FROM venue_usage_sessions WHERE started_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 5. Grants
-- ============================================================

REVOKE ALL ON FUNCTION video_call_is_over(video_calls) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION video_call_check_caller(UUID) FROM PUBLIC, anon, authenticated;
-- The usage writers stay service-role only, as in 193.
REVOKE ALL ON FUNCTION record_venue_usage(UUID, UUID, TEXT, NUMERIC, JSONB, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION open_venue_usage_session(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_venue_usage(UUID, UUID, TEXT, NUMERIC, JSONB, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION open_venue_usage_session(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

REVOKE ALL ON FUNCTION create_video_call(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_video_call(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION video_call_info(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION video_call_info(UUID) TO authenticated;
REVOKE ALL ON FUNCTION video_call_grant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION video_call_grant(UUID) TO authenticated;
REVOKE ALL ON FUNCTION set_video_call_state(UUID, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_video_call_state(UUID, BOOLEAN, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
