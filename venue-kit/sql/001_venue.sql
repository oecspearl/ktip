-- ============================================================
-- venue-kit: schema, RLS, and server functions
--
-- Run once against your Supabase project. Idempotent — safe to re-run.
--
-- ADAPT BEFORE RUNNING: venue_kit_role_for() near the top is the single
-- place a user's role (and right to enter at all) is decided. Point it at
-- YOUR registration/attendee data. Everything else can ship as-is.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Role resolution — THE function you must adapt.
--    Return one of: 'organizer' | 'speaker' | 'mentor' | 'judge'
--    | 'participant' | 'spectator'. Return NULL to refuse entry.
--    The client NEVER sends a role; this function is the only authority.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION venue_kit_role_for(p_user UUID, p_event UUID)
RETURNS TEXT AS $$
BEGIN
  -- EXAMPLE ONLY. Replace with your own rules, e.g.:
  --   IF EXISTS (SELECT 1 FROM events WHERE id = p_event AND created_by = p_user)
  --     THEN RETURN 'organizer'; END IF;
  --   IF EXISTS (SELECT 1 FROM event_registrations
  --              WHERE event_id = p_event AND user_id = p_user)
  --     THEN RETURN 'participant'; END IF;
  --   RETURN NULL;  -- not registered: refused, with a readable error upstream
  RETURN 'participant';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 1. Rooms
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venue_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  -- Stable slug. Deep links address rooms by this, never by uuid.
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'breakout' CHECK (kind IN (
    'stage', 'workshop', 'networking', 'help_desk',
    'sponsor_booth', 'team', 'judging', 'breakout'
  )),
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  capacity INT,                          -- advisory; see enter_venue_room()
  audio_mode TEXT NOT NULL DEFAULT 'open'
    CHECK (audio_mode IN ('open', 'moderated', 'listen_only')),
  camera_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (camera_mode IN ('spotlight', 'grid', 'huddle', 'off')),
  max_publishers INT NOT NULL DEFAULT 12,
  recording_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, key)
);

-- ------------------------------------------------------------
-- 2. Members — one row per (event, user). The COLD MIRROR of presence:
--    written by venue_heartbeat() at most every ~45s from the client.
--    Live presence always wins over this row; it exists for first paint,
--    for viewers not on the realtime channel, and for after-the-fact views.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venue_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN (
    'organizer', 'speaker', 'mentor', 'judge', 'participant', 'spectator'
  )),
  availability TEXT NOT NULL DEFAULT 'working' CHECK (availability IN (
    'working', 'away', 'busy', 'help_wanted'
  )),
  status_note TEXT,
  current_room_id UUID REFERENCES venue_rooms(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB,                            -- reserved (e.g. map position)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS venue_members_event_seen
  ON venue_members (event_id, last_seen_at DESC);

-- Nobody promotes themselves: any role change not made by an organizer of
-- the same venue is silently reverted. Hiding the UI button is a suggestion;
-- this is the rule.
CREATE OR REPLACE FUNCTION venue_kit_guard_role() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT EXISTS (
    SELECT 1 FROM venue_members
    WHERE event_id = OLD.event_id AND user_id = auth.uid() AND role = 'organizer'
  ) THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS venue_members_guard_role ON venue_members;
CREATE TRIGGER venue_members_guard_role
  BEFORE UPDATE ON venue_members
  FOR EACH ROW EXECUTE FUNCTION venue_kit_guard_role();

-- ------------------------------------------------------------
-- 3. Room chat
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venue_room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES venue_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  -- The sender's language SETTING, never auto-detected — two words of chat
  -- are ambiguous, a setting is not. Nullable; null reads as your default.
  lang TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS venue_room_messages_room_time
  ON venue_room_messages (room_id, created_at DESC);

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
ALTER TABLE venue_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_room_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION venue_kit_is_member(p_event UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM venue_members
    WHERE event_id = p_event AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS venue_rooms_read ON venue_rooms;
CREATE POLICY venue_rooms_read ON venue_rooms
  FOR SELECT TO authenticated
  USING (venue_kit_is_member(event_id));

DROP POLICY IF EXISTS venue_members_read ON venue_members;
CREATE POLICY venue_members_read ON venue_members
  FOR SELECT TO authenticated
  USING (venue_kit_is_member(event_id));

-- Self-service fields only; the trigger above still guards role.
DROP POLICY IF EXISTS venue_members_update_self ON venue_members;
CREATE POLICY venue_members_update_self ON venue_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS venue_room_messages_read ON venue_room_messages;
CREATE POLICY venue_room_messages_read ON venue_room_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM venue_rooms r
    WHERE r.id = room_id AND venue_kit_is_member(r.event_id)
  ));

-- Spectators listen; everyone else may speak in chat.
DROP POLICY IF EXISTS venue_room_messages_insert ON venue_room_messages;
CREATE POLICY venue_room_messages_insert ON venue_room_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM venue_rooms r
      JOIN venue_members m ON m.event_id = r.event_id AND m.user_id = auth.uid()
      WHERE r.id = room_id AND r.is_open AND m.role <> 'spectator'
    )
  );

-- ------------------------------------------------------------
-- 5. Server functions the client calls
-- ------------------------------------------------------------

-- Enter the venue; idempotent by design. Returns the membership row and
-- touches last_seen_at when you are already a member, inserts on a genuine
-- first entry. Raises when venue_kit_role_for() refuses — "register for this
-- event" is an answer for the UI, not a failure.
CREATE OR REPLACE FUNCTION join_venue(p_event_id UUID)
RETURNS venue_members AS $$
DECLARE
  v_user UUID := auth.uid();
  v_role TEXT;
  v_row venue_members;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  v_role := venue_kit_role_for(v_user, p_event_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'register for this event to enter the venue';
  END IF;

  INSERT INTO venue_members (event_id, user_id, role)
  VALUES (p_event_id, v_user, v_role)
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET last_seen_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The cold-mirror write. COALESCE keeps whatever a throttled keep-alive call
-- does not carry — a heartbeat with no availability must not erase one.
CREATE OR REPLACE FUNCTION venue_heartbeat(
  p_event_id UUID,
  p_room_id UUID DEFAULT NULL,
  p_availability TEXT DEFAULT NULL,
  p_status_note TEXT DEFAULT NULL,
  p_meta JSONB DEFAULT NULL
)
RETURNS venue_members AS $$
DECLARE
  v_user UUID := auth.uid();
  v_row venue_members;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  UPDATE venue_members SET
    last_seen_at    = now(),
    current_room_id = p_room_id,
    availability    = COALESCE(p_availability, availability),
    status_note     = COALESCE(p_status_note, status_note),
    meta            = COALESCE(p_meta, meta)
  WHERE event_id = p_event_id AND user_id = v_user
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'not a member of this venue'; END IF;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Entering a room. Capacity is checked against the cold mirror, so it is
-- advisory on purpose: bouncing someone out over a stale count is worse than
-- letting one extra person in. Hard caps belong where they cost money
-- (max_publishers, enforced by your A/V token endpoint).
CREATE OR REPLACE FUNCTION enter_venue_room(p_room_id UUID)
RETURNS venue_rooms AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room venue_rooms;
  v_count INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_room FROM venue_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL THEN RAISE EXCEPTION 'room not found'; END IF;
  IF NOT venue_kit_is_member(v_room.event_id) THEN
    RAISE EXCEPTION 'not a member of this venue';
  END IF;
  IF NOT v_room.is_open AND NOT EXISTS (
    SELECT 1 FROM venue_members
    WHERE event_id = v_room.event_id AND user_id = v_user AND role = 'organizer'
  ) THEN
    RAISE EXCEPTION 'this room is closed';
  END IF;

  IF v_room.capacity IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM venue_members
    WHERE current_room_id = p_room_id
      AND last_seen_at > now() - interval '2 minutes';
    IF v_count >= v_room.capacity THEN
      RAISE EXCEPTION 'this room is full';
    END IF;
  END IF;

  UPDATE venue_members
  SET current_room_id = p_room_id, last_seen_at = now()
  WHERE event_id = v_room.event_id AND user_id = v_user;

  RETURN v_room;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION join_venue(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION venue_heartbeat(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION enter_venue_room(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6. Private realtime channels
--    The kit subscribes to `venue:{eventId}` with { private: true }, which
--    routes every join through RLS on realtime.messages. Without this an
--    anonymous key plus a guessed event UUID is enough to watch a venue.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION venue_kit_can_use_channel(p_user UUID, p_topic TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_kind TEXT;
  v_id UUID;
BEGIN
  v_kind := split_part(p_topic, ':', 1);
  BEGIN
    v_id := split_part(p_topic, ':', 2)::uuid;
  EXCEPTION WHEN others THEN
    RETURN FALSE;              -- malformed topic: deny
  END;

  IF v_kind = 'venue' THEN
    RETURN EXISTS (
      SELECT 1 FROM venue_members WHERE event_id = v_id AND user_id = p_user
    );
  ELSIF v_kind = 'room' THEN
    RETURN EXISTS (
      SELECT 1 FROM venue_rooms r
      JOIN venue_members m ON m.event_id = r.event_id
      WHERE r.id = v_id AND r.is_open AND m.user_id = p_user
    );
  END IF;
  RETURN FALSE;                -- unknown topic kind: deny
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS venue_kit_channel_read ON realtime.messages;
CREATE POLICY venue_kit_channel_read ON realtime.messages
  FOR SELECT TO authenticated
  USING (venue_kit_can_use_channel(auth.uid(), realtime.topic()));

DROP POLICY IF EXISTS venue_kit_channel_write ON realtime.messages;
CREATE POLICY venue_kit_channel_write ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (venue_kit_can_use_channel(auth.uid(), realtime.topic()));

NOTIFY pgrst, 'reload schema';
