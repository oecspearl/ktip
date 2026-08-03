-- ============================================================
-- 101: what a member may do in a room's call
-- ============================================================
--
-- The last missing piece of the venue's A/V model. 070 stored the policy
-- (`audio_mode`, `max_publishers`, `recording_enabled`), 089 added `allowed_roles`
-- and the door that enforces it, and both left comments pointing at a
-- `venue_room_grant()` that was never written. Its absence is why AvStage has
-- been drawing dashed placeholders: there was no way to answer "may this person
-- turn a camera on" anywhere except in the client, and a permission the client
-- chooses is not a permission.
--
-- This is the answer, and it lives here rather than in the token endpoint for
-- one reason: the media token is minted outside the database, so if the rules
-- were restated in TypeScript there would be two copies of them, and the copy
-- that drifts is always the one nobody is looking at. The endpoint calls this
-- and signs whatever it returns.
--
-- Same rules `enter_venue_room()` (089) enforces at the door, returned instead of
-- raised — the door decides whether you are IN the room, this decides what you
-- may do once you are.
--
-- Numbering: docs/VIDEO-SETUP.md says to use 099. That was written before
-- 099_active_role_permissions and 100_multilingual_content existed. The comments
-- in 070 and src/types/index.ts say "in 071", which was the original plan. 101 is
-- the real number; the doc has been corrected to match.
--
-- Idempotent — safe to re-run.

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

  -- Occupancy, NOT a count of live cameras.
  --
  -- Being honest about this because the distinction bites: nothing in Postgres
  -- knows who currently has a camera on — that state lives in the media server.
  -- So `max_publishers` is enforced here as "how many people are in the room",
  -- which is an over-estimate. In a 20-person room with the default cap of 12,
  -- the 13th arrival cannot switch a camera on even if everyone else is
  -- audio-only.
  --
  -- That is the safe direction to be wrong in — it protects the bandwidth bill,
  -- which is what the cap is for — but it is a soft cap either way: the decision
  -- is made once, when a token is issued, and a token lasts its full TTL. Making
  -- it exact means asking the media server at mint time, which is a network call
  -- inside a permission check, or having clients write publish state to
  -- event_venue_members.meta. Neither is worth it until somebody hits the limit
  -- in a real event.
  SELECT COUNT(*) INTO v_present FROM event_venue_members
  WHERE current_room_id = p_room_id
    AND user_id <> v_user
    AND last_seen_at > now() - INTERVAL '2 minutes';

  RETURN jsonb_build_object(
    'room', v_room.id,
    'identity', v_user,
    'can_subscribe', TRUE,
    -- `listen_only` means nobody but a host publishes. `moderated` is the same
    -- at the door: a host raises somebody into a speaking slot by re-issuing
    -- their token, which is exactly why this is a function and not a column.
    'can_publish', CASE
      WHEN v_host THEN TRUE
      WHEN v_room.audio_mode = 'listen_only' THEN FALSE
      WHEN v_room.audio_mode = 'moderated' THEN FALSE
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
  'counts room occupancy, not live cameras — see the comment in migration 101.';

REVOKE ALL ON FUNCTION venue_room_grant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION venue_room_grant(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
