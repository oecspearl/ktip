-- ============================================================
-- 106: the speaker role
-- ============================================================
--
-- Virtual conferences run on the venue engine (070/089/091/101), and a
-- conference has a person a hackathon does not: the speaker — somebody who may
-- publish on a stage whose audio_mode locks everyone else to listening, but who
-- is not a host and must not inherit a host's other powers (closing rooms,
-- broadcasting, editing the map).
--
-- Two changes, nothing else:
--
--   1. event_venue_members.role admits 'speaker'. Speakers are promoted by a
--      host from the roster — join_venue() (096) still never self-assigns the
--      role, and the guard trigger from 070 still reverts a non-host trying to
--      promote themselves.
--
--   2. venue_room_grant() (101) lets a speaker publish in moderated and
--      listen_only rooms. Everything else in the grant is restated verbatim —
--      see 101 for the reasoning behind each clause; this migration only adds
--      the speaker case to can_publish.
--
-- Deliberately NOT touched: enter_venue_room() and the channel policies compare
-- against allowed_roles, which is an unchecked TEXT[] — 'speaker' works in it
-- today. save_venue_map() casts allowed_roles straight through. The token
-- endpoint signs whatever this grant returns and never enumerates roles.
--
-- Idempotent — safe to re-run.

-- ------------------------------------------------------------
-- 1. Widen the role CHECK
-- ------------------------------------------------------------
-- The constraint was declared inline in 070, so its name is the auto-generated
-- one. Dropped and recreated rather than altered; CHECKs cannot be altered.

ALTER TABLE event_venue_members
  DROP CONSTRAINT IF EXISTS event_venue_members_role_check;

ALTER TABLE event_venue_members
  ADD CONSTRAINT event_venue_members_role_check CHECK (role IN (
    'participant', 'mentor', 'judge', 'organizer', 'spectator', 'speaker'));

-- ------------------------------------------------------------
-- 2. venue_room_grant() learns what a speaker is
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION venue_room_grant(p_room_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room venue_rooms;
  v_role TEXT;
  v_host BOOLEAN;
  v_present INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_room FROM venue_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;

  SELECT role INTO v_role FROM event_venue_members
  WHERE event_id = v_room.event_id AND user_id = v_user;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not a member of this venue';
  END IF;

  v_host := is_venue_host(v_user, v_room.event_id);

  IF NOT v_room.is_open AND NOT v_host THEN
    RAISE EXCEPTION 'this room is closed';
  END IF;

  -- Empty array means unrestricted. Hosts are never locked out of their own
  -- venue — same carve-out enter_venue_room() makes, deliberately duplicated
  -- rather than factored out, because the two functions answer different
  -- questions and coupling them would make a change to one silently change the
  -- other.
  IF array_length(v_room.allowed_roles, 1) IS NOT NULL
     AND NOT (v_role = ANY(v_room.allowed_roles))
     AND NOT v_host THEN
    RAISE EXCEPTION 'this room is not open to %', v_role;
  END IF;

  -- Occupancy, NOT a count of live cameras — see migration 101 for why the
  -- over-estimate is the safe direction to be wrong in.
  SELECT COUNT(*) INTO v_present FROM event_venue_members
  WHERE current_room_id = p_room_id
    AND user_id <> v_user
    AND last_seen_at > now() - INTERVAL '2 minutes';

  RETURN jsonb_build_object(
    'room', v_room.id,
    'identity', v_user,
    'can_subscribe', TRUE,
    -- `listen_only` and `moderated` gate publishing on WHO you are, and a
    -- speaker is the person those modes exist to hand the mic to: they bypass
    -- the mode gate like a host does. In an open room a speaker is subject to
    -- max_publishers like everyone else — the cap protects the bandwidth
    -- bill, and a speaker's camera costs the same as anyone's.
    'can_publish', CASE
      WHEN v_host THEN TRUE
      WHEN v_room.audio_mode IN ('listen_only', 'moderated') THEN v_role = 'speaker'
      WHEN v_present >= v_room.max_publishers THEN FALSE
      ELSE TRUE
    END,
    -- Data messages are always allowed. They carry reactions, raised hands and
    -- captions — none of which cost bandwidth worth capping, and all of which a
    -- listen-only participant still needs.
    'can_publish_data', TRUE,
    'is_host', v_host,
    'recording', v_room.recording_enabled,
    'audio_mode', v_room.audio_mode,
    'max_publishers', v_room.max_publishers
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION venue_room_grant(UUID) IS
  'What the caller may do in this room''s call. Consumed by /api/venue/room-token when '
  'signing a LiveKit access token. Raises for anything enter_venue_room() would also '
  'refuse, so a refused grant and a refused door give the same message. can_publish '
  'counts room occupancy, not live cameras — see the comment in migration 101. '
  'Speakers (106) publish through listen_only and moderated modes.';

-- CREATE OR REPLACE keeps the ACL, but restated anyway — belt and braces, same
-- as 091.
REVOKE ALL ON FUNCTION venue_room_grant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION venue_room_grant(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
