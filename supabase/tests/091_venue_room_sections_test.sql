-- ============================================================
-- Hand-run test for migration 091 (what is inside a room).
--
-- Same workflow as the 089 test: paste into the Supabase SQL
-- editor and run. It seeds fixtures, asserts, and ROLLBACKs —
-- nothing is left behind. A failing ASSERT aborts with the
-- message shown; silence at the end means every assertion held.
--
-- What is actually being defended here:
--   1. save_venue_map() round-trips `sections`, so a host's panel
--      choices survive the next time anyone drags a wall.
--   2. It leaves `sections` and `sponsor_logo_url` ALONE when the
--      payload does not carry them. This is the data-loss case:
--      the map editor has no logo field, and before 091 every map
--      save silently erased one.
--   3. Panels are cosmetic and stay cosmetic — nothing in here
--      grants access. A judge-only room is still judge-only after
--      a participant is handed a room full of sections.
--   4. A non-host cannot write sections, by the RPC or directly.
--
-- Requires 070, 089 and 091 to be applied first.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_host    UUID := '00000000-0000-4000-8000-000000000911';
  v_player  UUID := '00000000-0000-4000-8000-000000000912';
  v_event   UUID := '00000000-0000-4000-8000-0000000009e1';
  v_booth   UUID;
  v_n       INT;
  v_json    JSONB;
  v_text    TEXT;
  v_failed  BOOLEAN;
BEGIN
  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_host,   'Host 091',   ARRAY['oecs'],    'Saint Lucia'),
         (v_player, 'Player 091', ARRAY['student'], 'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  INSERT INTO events (id, title, description, event_type, status, start_date, organizer_id, has_venue)
  VALUES (v_event, 'Fixture 091', 'Room sections test', 'hackathon', 'published', now(), v_host, TRUE)
  ON CONFLICT (id) DO UPDATE SET organizer_id = EXCLUDED.organizer_id;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_host)::text, TRUE);

  -- ------------------------------------------------------------
  -- 1. A room starts with no panels, which means "use the defaults"
  -- ------------------------------------------------------------
  INSERT INTO venue_rooms (event_id, key, name, kind, sponsor_name, sponsor_logo_url, sponsor_url)
  VALUES (v_event, 'sponsor-booth', 'Sponsor Booth', 'sponsor_booth',
          'Acme', 'https://cdn.test/acme.png', 'https://acme.test')
  RETURNING id INTO v_booth;

  SELECT sections INTO v_json FROM venue_rooms WHERE id = v_booth;
  ASSERT v_json = '[]'::jsonb, 'sections must default to an empty array, got ' || v_json::text;

  -- ------------------------------------------------------------
  -- 2. save_venue_map round-trips sections
  -- ------------------------------------------------------------
  PERFORM save_venue_map(
    v_event,
    '{"v":1,"cols":28,"rows":18,"floors":[{"key":"ground","name":"Ground floor"}]}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'key', 'sponsor-booth',
      'name', 'Sponsor Booth',
      'kind', 'sponsor_booth',
      'cells', venue_rect_cells(2, 2, 5, 5),
      'sections', jsonb_build_array(
        jsonb_build_object('id', 'sponsor_hero'),
        jsonb_build_object('id', 'chat'),
        jsonb_build_object('id', 'sponsor_links', 'config', jsonb_build_object(
          'links', jsonb_build_array(jsonb_build_object('label', 'Jobs', 'url', 'https://acme.test/jobs'))
        ))
      )
    ))
  );

  SELECT sections INTO v_json FROM venue_rooms WHERE id = v_booth;
  ASSERT jsonb_array_length(v_json) = 3,
    'save_venue_map: expected 3 panels back, got ' || jsonb_array_length(v_json);
  ASSERT v_json->2->'config'->'links'->0->>'url' = 'https://acme.test/jobs',
    'save_venue_map: a panel config did not survive the round trip';

  -- The room kept its id, so its chat history did too. Same guarantee 089
  -- makes, restated because 091 rewrote the function that provides it.
  SELECT COUNT(*) INTO v_n FROM venue_rooms WHERE id = v_booth;
  ASSERT v_n = 1, 'save_venue_map: the booth was recreated rather than updated';

  -- ------------------------------------------------------------
  -- 3. A payload with no `sections` key leaves the panels alone
  -- ------------------------------------------------------------
  -- This is what an older client sends. Before 091 the equivalent case for
  -- sponsor_logo_url wiped the logo on every save.
  PERFORM save_venue_map(
    v_event,
    '{"v":1,"cols":28,"rows":18,"floors":[{"key":"ground","name":"Ground floor"}]}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'key', 'sponsor-booth',
      'name', 'Sponsor Booth Renamed',
      'kind', 'sponsor_booth',
      'cells', venue_rect_cells(2, 2, 5, 5)
    ))
  );

  SELECT sections, sponsor_logo_url INTO v_json, v_text FROM venue_rooms WHERE id = v_booth;
  ASSERT jsonb_array_length(v_json) = 3,
    'save_venue_map: a payload without a sections key erased the panels';
  ASSERT v_text = 'https://cdn.test/acme.png',
    'save_venue_map: a payload without a sponsor_logo_url key erased the logo';

  SELECT name INTO v_text FROM venue_rooms WHERE id = v_booth;
  ASSERT v_text = 'Sponsor Booth Renamed',
    'save_venue_map: the fields the payload DID carry must still be written';

  -- ------------------------------------------------------------
  -- 4. An explicit empty list is a choice, not an omission
  -- ------------------------------------------------------------
  PERFORM save_venue_map(
    v_event,
    '{"v":1,"cols":28,"rows":18,"floors":[{"key":"ground","name":"Ground floor"}]}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'key', 'sponsor-booth', 'name', 'Sponsor Booth', 'kind', 'sponsor_booth',
      'cells', venue_rect_cells(2, 2, 5, 5), 'sections', '[]'::jsonb
    ))
  );

  SELECT sections INTO v_json FROM venue_rooms WHERE id = v_booth;
  ASSERT v_json = '[]'::jsonb,
    'save_venue_map: an explicit empty list must reset the room to its defaults';

  -- ------------------------------------------------------------
  -- 5. Junk is refused
  -- ------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    PERFORM save_venue_map(
      v_event,
      '{}'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'key', 'sponsor-booth', 'name', 'Booth', 'kind', 'sponsor_booth',
        'sections', '"chat"'::jsonb
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'save_venue_map: sections that are not an array must be refused';

  v_failed := FALSE;
  BEGIN
    UPDATE venue_rooms SET sections = '{"id":"chat"}'::jsonb WHERE id = v_booth;
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'venue_rooms_sections_check: a non-array must be refused by the constraint';

  -- ------------------------------------------------------------
  -- 6. Panels are cosmetic: they grant nothing
  -- ------------------------------------------------------------
  INSERT INTO venue_rooms (event_id, key, name, kind, allowed_roles, sections)
  VALUES (v_event, 'judging', 'Judging', 'judging', ARRAY['judge', 'organizer'],
          jsonb_build_array(jsonb_build_object('id', 'chat')));

  INSERT INTO event_venue_members (event_id, user_id, role)
  VALUES (v_event, v_player, 'participant')
  ON CONFLICT (event_id, user_id) DO UPDATE SET role = 'participant';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_player)::text, TRUE);

  v_failed := FALSE;
  BEGIN
    PERFORM enter_venue_room((SELECT id FROM venue_rooms WHERE event_id = v_event AND key = 'judging'));
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed,
    'enter_venue_room: a room having a chat panel must not let a participant past allowed_roles';

  -- ------------------------------------------------------------
  -- 7. A participant cannot rearrange the room
  -- ------------------------------------------------------------
  UPDATE venue_rooms SET sections = jsonb_build_array(jsonb_build_object('id', 'announcement_feed'))
  WHERE id = v_booth;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 0, 'venue_rooms RLS: a participant updated another room''s panels';

  v_failed := FALSE;
  BEGIN
    PERFORM save_venue_map(v_event, '{}'::jsonb, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'save_venue_map: a participant was allowed to redraw the venue';

  -- ------------------------------------------------------------
  -- 8. Only a host may post a system line
  -- ------------------------------------------------------------
  -- Still the participant here.
  v_failed := FALSE;
  BEGIN
    PERFORM venue_room_broadcast(v_booth, 'Free pizza in the judging room');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'venue_room_broadcast: a participant posted as the venue';

  -- And the direct route stays shut: the INSERT policy pins clients to
  -- kind=chat, which is the whole reason the RPC has to exist.
  v_failed := FALSE;
  BEGIN
    INSERT INTO venue_room_messages (room_id, author_id, body, kind)
    VALUES (v_booth, v_player, 'Forged', 'system');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'venue_room_messages RLS: a client inserted a kind=system message directly';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_host)::text, TRUE);
  PERFORM venue_room_broadcast(v_booth, 'Doors close at six.');

  SELECT COUNT(*) INTO v_n FROM venue_room_messages
  WHERE room_id = v_booth AND kind = 'system' AND body = 'Doors close at six.';
  ASSERT v_n = 1, 'venue_room_broadcast: the host announcement was not stored';

  v_failed := FALSE;
  BEGIN
    PERFORM venue_room_broadcast(v_booth, '   ');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'venue_room_broadcast: an empty announcement was accepted';

  -- ------------------------------------------------------------
  -- 9. Self check-in, and only from confirmed
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_player)::text, TRUE);

  -- No registration at all.
  v_failed := FALSE;
  BEGIN
    PERFORM venue_check_in(v_event);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'venue_check_in: an unregistered member was checked in';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_host)::text, TRUE);
  INSERT INTO event_rsvps (event_id, user_id, status)
  VALUES (v_event, v_player, 'waitlisted')
  ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'waitlisted';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_player)::text, TRUE);

  v_failed := FALSE;
  BEGIN
    PERFORM venue_check_in(v_event);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'venue_check_in: a waitlisted registration was checked in';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_host)::text, TRUE);
  UPDATE event_rsvps SET status = 'confirmed'
  WHERE event_id = v_event AND user_id = v_player;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_player)::text, TRUE);

  ASSERT venue_check_in(v_event) = 'checked_in', 'venue_check_in: a confirmed RSVP was refused';
  -- Idempotent: a double click is not an error.
  ASSERT venue_check_in(v_event) = 'checked_in', 'venue_check_in: checking in twice raised';

  SELECT COUNT(*) INTO v_n FROM event_rsvps
  WHERE event_id = v_event AND user_id = v_player AND status = 'checked_in';
  ASSERT v_n = 1, 'venue_check_in: the RSVP row was not updated';

  RAISE NOTICE 'Migration 091 assertions all held.';
END $$;

ROLLBACK;
