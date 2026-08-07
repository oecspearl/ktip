-- ============================================================
-- Hand-run test for migration 106 (the speaker role).
--
-- Same workflow as the 089/091 tests: paste into the Supabase SQL
-- editor and run. It seeds fixtures, asserts, and ROLLBACKs —
-- nothing is left behind. A failing ASSERT aborts with the
-- message shown; silence at the end means every assertion held.
--
-- What is actually being defended here:
--   1. 'speaker' is a legal member role; a made-up role still is not.
--   2. venue_room_grant(): a speaker may publish in a listen_only
--      room, a participant may not, and in an open room a speaker is
--      still subject to max_publishers like everyone else.
--   3. A non-host cannot promote themselves to speaker — the 070
--      guard trigger reverts it.
--
-- Requires 070, 089, 096, 101 and 106 to be applied first.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_host    UUID := '00000000-0000-4000-8000-000000000961';
  v_speaker UUID := '00000000-0000-4000-8000-000000000962';
  v_player  UUID := '00000000-0000-4000-8000-000000000963';
  v_event   UUID := '00000000-0000-4000-8000-0000000009e6';
  v_stage   UUID;
  v_open    UUID;
  v_json    JSONB;
  v_role    TEXT;
  v_failed  BOOLEAN;
BEGIN
  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_host,    'Host 106',    ARRAY['oecs'],    'Saint Lucia'),
         (v_speaker, 'Speaker 106', ARRAY['student'], 'Saint Lucia'),
         (v_player,  'Player 106',  ARRAY['student'], 'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  INSERT INTO events (id, title, description, event_type, status, start_date, organizer_id, has_venue)
  VALUES (v_event, 'Fixture 106', 'Speaker role test', 'conference', 'published', now(), v_host, TRUE)
  ON CONFLICT (id) DO UPDATE SET organizer_id = EXCLUDED.organizer_id;

  INSERT INTO venue_rooms (event_id, key, name, kind, audio_mode)
  VALUES (v_event, 'main-stage', 'Main Stage', 'stage', 'listen_only')
  RETURNING id INTO v_stage;

  -- max_publishers 1: with one other warm body in the room, the cap is hit.
  INSERT INTO venue_rooms (event_id, key, name, kind, audio_mode, max_publishers)
  VALUES (v_event, 'open-floor', 'Open Floor', 'networking', 'open', 1)
  RETURNING id INTO v_open;

  -- ------------------------------------------------------------
  -- 1. The CHECK admits 'speaker' and still refuses an invented role
  -- ------------------------------------------------------------
  INSERT INTO event_venue_members (event_id, user_id, role)
  VALUES (v_event, v_speaker, 'speaker'),
         (v_event, v_player,  'participant');

  BEGIN
    INSERT INTO event_venue_members (event_id, user_id, role)
    VALUES (v_event, v_host, 'dj');
    v_failed := FALSE;
  EXCEPTION WHEN check_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'an invented role must still fail the CHECK';

  INSERT INTO event_venue_members (event_id, user_id, role)
  VALUES (v_event, v_host, 'organizer');

  -- ------------------------------------------------------------
  -- 2. The grant: speaker publishes through listen_only, participant does not
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_speaker)::text, TRUE);
  SELECT venue_room_grant(v_stage) INTO v_json;
  ASSERT (v_json->>'can_publish')::boolean IS TRUE,
    'a speaker must be able to publish in a listen_only room, got ' || v_json::text;
  ASSERT (v_json->>'is_host')::boolean IS FALSE,
    'a speaker is not a host';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_player)::text, TRUE);
  SELECT venue_room_grant(v_stage) INTO v_json;
  ASSERT (v_json->>'can_publish')::boolean IS FALSE,
    'a participant must not publish in a listen_only room, got ' || v_json::text;

  -- ------------------------------------------------------------
  -- 3. In an open room the cap still applies to a speaker
  -- ------------------------------------------------------------
  -- The player is present in the open room, freshly seen; cap is 1.
  UPDATE event_venue_members
  SET current_room_id = v_open, last_seen_at = now()
  WHERE event_id = v_event AND user_id = v_player;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_speaker)::text, TRUE);
  SELECT venue_room_grant(v_open) INTO v_json;
  ASSERT (v_json->>'can_publish')::boolean IS FALSE,
    'a speaker at the publisher cap of an open room must wait like anyone, got ' || v_json::text;

  -- ------------------------------------------------------------
  -- 4. Nobody promotes themselves — the 070 guard reverts it
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_player)::text, TRUE);
  UPDATE event_venue_members
  SET role = 'speaker'
  WHERE event_id = v_event AND user_id = v_player;

  SELECT role INTO v_role FROM event_venue_members
  WHERE event_id = v_event AND user_id = v_player;
  ASSERT v_role = 'participant',
    'a non-host promoting themselves must be reverted, got ' || v_role;

  RAISE NOTICE '106 test: every assertion held.';
END $$;

ROLLBACK;
