-- 200: coffee tables in the Networking Lounge
--
-- Press a button, wait a moment, and sit down at a table of three or four
-- people from other teams for ten minutes of video. It replaces the one-to-one
-- "coffee roulette" from the plan. Students cannot message people privately
-- (165), and a private call with one random adult would go further than a
-- message, so a table is never smaller than three, every table is listed for
-- everyone in the room, and organisers can drop in to any of them.
--
-- Each table is its own LiveKit room, named by the table id. Tokens come from
-- coffee_table_grant() through the same api/venue/room-token route as rooms.
-- Usage from a table call is billed to the lounge it was made in: the two
-- usage writers from 193 learn to map a table id to its room.

-- ============================================================
-- 1. Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS venue_coffee_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES venue_rooms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_venue_coffee_tables_room ON venue_coffee_tables(room_id, ends_at DESC);

CREATE TABLE IF NOT EXISTS venue_coffee_seats (
  table_id UUID NOT NULL REFERENCES venue_coffee_tables(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Set when the person leaves early. The seat stays so the table's history
  -- (who sat with whom) survives for organisers.
  left_at TIMESTAMPTZ,
  PRIMARY KEY (table_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_coffee_seats_user ON venue_coffee_seats(user_id, event_id);

-- Waiting for a table. One row per person per event.
CREATE TABLE IF NOT EXISTS venue_coffee_queue (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES venue_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_coffee_queue_room ON venue_coffee_queue(room_id, joined_at);

-- Everything goes through the functions below. No direct reads or writes.
ALTER TABLE venue_coffee_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_coffee_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_coffee_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON venue_coffee_tables, venue_coffee_seats, venue_coffee_queue FROM anon, authenticated;

COMMENT ON TABLE venue_coffee_tables IS
  'Ten-minute video tables of three or four people in a networking room (200). Never one-to-one';

-- ============================================================
-- 2. Who may sit down
-- ============================================================

-- Participants and mentors. Judges stay out (they score these people), and
-- spectators only watch. Organisers drop in through the grant instead.
CREATE OR REPLACE FUNCTION may_take_coffee(p_user UUID, p_room_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL
    AND NOT is_suspended(p_user)
    AND EXISTS (
      SELECT 1 FROM venue_rooms r
      JOIN event_venue_members m ON m.event_id = r.event_id AND m.user_id = p_user
      WHERE r.id = p_room_id
        AND r.kind = 'networking'
        AND r.is_open
        AND m.role IN ('participant', 'mentor')
        AND NOT is_event_judge(p_user, r.event_id)
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- The live table this person is sitting at in this event, if any.
CREATE OR REPLACE FUNCTION my_coffee_table(p_user UUID, p_event_id UUID)
RETURNS UUID AS $$
  SELECT t.id FROM venue_coffee_seats s
  JOIN venue_coffee_tables t ON t.id = s.table_id
  WHERE s.user_id = p_user AND s.event_id = p_event_id
    AND s.left_at IS NULL AND t.ends_at > now()
  ORDER BY t.created_at DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- 3. Matching
-- ============================================================

-- Seats up to four people waiting in this room at a new table. Four as soon
-- as four are waiting; three once the oldest has waited 40 seconds; never
-- fewer. People from a team already at the table are skipped while anybody
-- else is waiting, so a table mixes teams where it can. Returns the new table
-- id, or NULL when nobody was seated.
CREATE OR REPLACE FUNCTION coffee_try_match(p_room_id UUID)
RETURNS UUID AS $$
DECLARE
  v_event UUID;
  v_waiting INT;
  v_oldest TIMESTAMPTZ;
  v_target INT;
  v_pick UUID[] := '{}';
  v_teams UUID[] := '{}';
  v_row RECORD;
  v_table UUID;
BEGIN
  SELECT event_id INTO v_event FROM venue_rooms WHERE id = p_room_id;
  IF v_event IS NULL THEN
    RETURN NULL;
  END IF;

  -- One matcher per room at a time. A second caller simply finds nothing to do.
  IF NOT pg_try_advisory_xact_lock(hashtext('coffee:' || p_room_id::text)) THEN
    RETURN NULL;
  END IF;

  -- Somebody who wandered off (left the venue or the room closed) leaves the queue.
  DELETE FROM venue_coffee_queue q
  WHERE q.room_id = p_room_id AND NOT may_take_coffee(q.user_id, p_room_id);

  SELECT count(*), min(joined_at) INTO v_waiting, v_oldest
  FROM venue_coffee_queue WHERE room_id = p_room_id;

  IF v_waiting >= 4 THEN
    v_target := 4;
  ELSIF v_waiting = 3 AND v_oldest < now() - INTERVAL '40 seconds' THEN
    v_target := 3;
  ELSE
    RETURN NULL;
  END IF;

  -- First pass: one per team (no team counts as its own).
  FOR v_row IN
    SELECT user_id, team_id FROM venue_coffee_queue
    WHERE room_id = p_room_id ORDER BY joined_at
  LOOP
    EXIT WHEN array_length(v_pick, 1) >= v_target;
    IF v_row.team_id IS NULL OR NOT (v_row.team_id = ANY (v_teams)) THEN
      v_pick := v_pick || v_row.user_id;
      IF v_row.team_id IS NOT NULL THEN
        v_teams := v_teams || v_row.team_id;
      END IF;
    END IF;
  END LOOP;

  -- Second pass: fill the rest in queue order.
  IF coalesce(array_length(v_pick, 1), 0) < v_target THEN
    FOR v_row IN
      SELECT user_id FROM venue_coffee_queue
      WHERE room_id = p_room_id AND NOT (user_id = ANY (v_pick))
      ORDER BY joined_at
    LOOP
      EXIT WHEN array_length(v_pick, 1) >= v_target;
      v_pick := v_pick || v_row.user_id;
    END LOOP;
  END IF;

  IF coalesce(array_length(v_pick, 1), 0) < 3 THEN
    RETURN NULL;
  END IF;

  INSERT INTO venue_coffee_tables (event_id, room_id, ends_at)
  VALUES (v_event, p_room_id, now() + INTERVAL '10 minutes')
  RETURNING id INTO v_table;

  INSERT INTO venue_coffee_seats (table_id, event_id, user_id)
  SELECT v_table, v_event, u FROM unnest(v_pick) AS u;

  DELETE FROM venue_coffee_queue WHERE event_id = v_event AND user_id = ANY (v_pick);

  RETURN v_table;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 4. What the panel calls
-- ============================================================

-- The room's coffee state for the caller, after a matching attempt. The panel
-- polls this every few seconds, which is also what seats a table of three.
--   can_join   may this person sit down here
--   waiting    how many are in this room's queue
--   in_queue   is the caller one of them
--   my_table   { id, ends_at, people: [{user_id, name, avatar_url, team}] } or null
--   tables     every live table in the room: { id, ends_at, people }
--   is_host    may drop in to any table
CREATE OR REPLACE FUNCTION coffee_state(p_room_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event UUID;
  v_host BOOLEAN;
  v_mine UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT event_id INTO v_event FROM venue_rooms WHERE id = p_room_id;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;
  v_host := is_venue_host(v_user, v_event);
  IF NOT (v_host OR is_venue_member(v_user, v_event)) THEN
    RAISE EXCEPTION 'not a member of this venue';
  END IF;

  PERFORM coffee_try_match(p_room_id);
  v_mine := my_coffee_table(v_user, v_event);

  RETURN jsonb_build_object(
    'can_join', may_take_coffee(v_user, p_room_id),
    'is_host', v_host,
    'waiting', (SELECT count(*) FROM venue_coffee_queue WHERE room_id = p_room_id),
    'in_queue', EXISTS (SELECT 1 FROM venue_coffee_queue WHERE event_id = v_event AND user_id = v_user),
    'my_table', v_mine,
    'tables', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'ends_at', t.ends_at,
        'people', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'user_id', s.user_id,
            'name', coalesce(p.display_name, p.username),
            'avatar_url', p.avatar_url,
            'team', (
              SELECT et.name FROM event_team_members m JOIN event_teams et ON et.id = m.team_id
              WHERE m.user_id = s.user_id AND et.event_id = t.event_id
              LIMIT 1
            )
          ) ORDER BY p.display_name), '[]'::jsonb)
          FROM venue_coffee_seats s JOIN profiles p ON p.id = s.user_id
          WHERE s.table_id = t.id AND s.left_at IS NULL
        )
      ) ORDER BY t.created_at), '[]'::jsonb)
      FROM venue_coffee_tables t
      WHERE t.room_id = p_room_id AND t.ends_at > now()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Join the queue in this room. Somebody already at a live table stays there.
CREATE OR REPLACE FUNCTION join_coffee_queue(p_room_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event UUID;
  v_team UUID;
BEGIN
  IF NOT may_take_coffee(v_user, p_room_id) THEN
    RAISE EXCEPTION 'coffee tables are for participants and mentors in an open lounge';
  END IF;
  SELECT event_id INTO v_event FROM venue_rooms WHERE id = p_room_id;
  IF my_coffee_table(v_user, v_event) IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  SELECT m.team_id INTO v_team FROM event_team_members m
  JOIN event_teams t ON t.id = m.team_id
  WHERE t.event_id = v_event AND m.user_id = v_user
  LIMIT 1;

  INSERT INTO venue_coffee_queue (event_id, room_id, user_id, team_id)
  VALUES (v_event, p_room_id, v_user, v_team)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET room_id = EXCLUDED.room_id, team_id = EXCLUDED.team_id, joined_at = now();

  PERFORM coffee_try_match(p_room_id);
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Stop waiting, or get up from the table.
CREATE OR REPLACE FUNCTION leave_coffee(p_room_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT event_id INTO v_event FROM venue_rooms WHERE id = p_room_id;
  DELETE FROM venue_coffee_queue WHERE event_id = v_event AND user_id = v_user;
  UPDATE venue_coffee_seats SET left_at = now()
  WHERE event_id = v_event AND user_id = v_user AND left_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 5. The call
-- ============================================================

-- The same shape as venue_room_grant(), for api/venue/room-token. Seated
-- people and organisers get in while the table lasts; nobody else does.
CREATE OR REPLACE FUNCTION coffee_table_grant(p_table_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_table venue_coffee_tables;
  v_host BOOLEAN;
  v_seated BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT * INTO v_table FROM venue_coffee_tables WHERE id = p_table_id;
  IF v_table.id IS NULL OR v_table.ends_at <= now() THEN
    RAISE EXCEPTION 'this table has finished';
  END IF;

  v_host := is_venue_host(v_user, v_table.event_id);
  v_seated := EXISTS (
    SELECT 1 FROM venue_coffee_seats
    WHERE table_id = p_table_id AND user_id = v_user AND left_at IS NULL
  );
  IF NOT (v_seated OR v_host) THEN
    RAISE EXCEPTION 'you are not at this table';
  END IF;

  RETURN jsonb_build_object(
    'room', v_table.id,
    'identity', v_user,
    'can_subscribe', TRUE,
    'can_publish', TRUE,
    'can_publish_data', TRUE,
    'is_host', v_host,
    'recording', FALSE,
    'audio_mode', 'open',
    'max_publishers', 5
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- 6. Usage from a table call bills to its lounge
-- ============================================================

-- A venue room id stays as it is; a coffee table id becomes its room.
CREATE OR REPLACE FUNCTION venue_usage_room_of(p_id UUID)
RETURNS UUID AS $$
  SELECT coalesce(
    (SELECT id FROM venue_rooms WHERE id = p_id),
    (SELECT room_id FROM venue_coffee_tables WHERE id = p_id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

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
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL OR coalesce(p_amount, 0) <= 0 THEN
    RETURN FALSE;
  END IF;

  -- 200: a coffee table's call bills to the lounge it was made in.
  p_room_id := venue_usage_room_of(p_room_id);
  SELECT event_id INTO v_event FROM venue_rooms WHERE id = p_room_id;
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
    v_event, v_team, v_team_name, p_room_id, p_user_id, p_kind, p_amount,
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
  -- 200: a coffee table counts as part of its lounge.
  IF venue_usage_room_of(p_room_id) IS NULL THEN
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
-- 7. Grants
-- ============================================================

REVOKE ALL ON FUNCTION may_take_coffee(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION my_coffee_table(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION coffee_try_match(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION venue_usage_room_of(UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION coffee_state(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION coffee_state(UUID) TO authenticated;
REVOKE ALL ON FUNCTION join_coffee_queue(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION join_coffee_queue(UUID) TO authenticated;
REVOKE ALL ON FUNCTION leave_coffee(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION leave_coffee(UUID) TO authenticated;
REVOKE ALL ON FUNCTION coffee_table_grant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION coffee_table_grant(UUID) TO authenticated;
