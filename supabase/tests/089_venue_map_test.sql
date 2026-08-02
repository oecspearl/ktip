-- ============================================================
-- Hand-run test for migration 089 (the drawn venue map).
--
-- Same workflow as 088's test: paste into the Supabase SQL editor
-- and run. It seeds fixtures, asserts, and ROLLBACKs — nothing is
-- left behind. A failing ASSERT aborts with the message shown;
-- silence at the end means every assertion held.
--
-- What is actually being defended here:
--   1. save_venue_map() matches rooms on `key`, so a room that is
--      dragged, renamed and re-coloured keeps its id — and therefore
--      keeps its chat history. This is the one bug in the whole
--      feature that destroys data rather than just looking wrong.
--   2. It deletes rooms the editor no longer knows about, EXCEPT
--      team rooms, which belong to 072 and were never on the host's
--      canvas to begin with.
--   3. allowed_roles is enforced at the door, not just in the UI.
--
-- Requires 070 and 089 to be applied first.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_host   UUID := '00000000-0000-4000-8000-000000000891';
  v_judge  UUID := '00000000-0000-4000-8000-000000000892';
  v_event  UUID := '00000000-0000-4000-8000-0000000008e1';
  v_hall   UUID;
  v_hall2  UUID;
  v_team   UUID;
  v_n      INT;
  v_cells  JSONB;
  v_failed BOOLEAN;
BEGIN
  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_host,  'Host 089',  ARRAY['oecs'],        'Saint Lucia'),
         (v_judge, 'Judge 089', ARRAY['mentor'],      'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  INSERT INTO events (id, title, description, event_type, status, start_date, organizer_id, has_venue)
  VALUES (v_event, 'Fixture 089', 'Venue map test', 'hackathon', 'published', now(), v_host, TRUE)
  ON CONFLICT (id) DO UPDATE SET organizer_id = EXCLUDED.organizer_id;

  -- ------------------------------------------------------------
  -- 1. venue_rect_cells produces the cell list the renderer wants
  -- ------------------------------------------------------------
  v_cells := venue_rect_cells(2, 2, 3, 3);
  ASSERT jsonb_array_length(v_cells) = 4,
    'venue_rect_cells: a 2x2 rect must be 4 cells, got ' || jsonb_array_length(v_cells);
  ASSERT v_cells @> '[[2,2]]'::jsonb, 'venue_rect_cells: missing the origin cell';

  -- Reversed bounds are the same rectangle. A host dragging up-left
  -- must not produce an empty room.
  ASSERT jsonb_array_length(venue_rect_cells(3, 3, 2, 2)) = 4,
    'venue_rect_cells: reversed bounds must still fill the rect';

  -- ------------------------------------------------------------
  -- 2. Seeding lays the starter rooms out on the grid
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_host)::text, TRUE);

  PERFORM seed_default_venue_rooms(v_event);

  SELECT COUNT(*) INTO v_n FROM venue_rooms
  WHERE event_id = v_event AND jsonb_array_length(cells) > 0;
  ASSERT v_n = 6, 'seed_default_venue_rooms: expected 6 placed rooms, got ' || v_n;

  SELECT venue_map IS NOT NULL INTO v_failed FROM events WHERE id = v_event;
  ASSERT v_failed, 'seed_default_venue_rooms: must give the event a venue_map';

  SELECT id INTO v_hall FROM venue_rooms WHERE event_id = v_event AND key = 'main-hall';

  -- A team room, which the editor never draws and must never delete.
  INSERT INTO venue_rooms (event_id, key, name, kind)
  VALUES (v_event, 'team-alpha', 'Team Alpha', 'team')
  RETURNING id INTO v_team;

  -- ------------------------------------------------------------
  -- 3. Saving keeps ids stable across a rename and a move
  -- ------------------------------------------------------------
  PERFORM save_venue_map(
    v_event,
    '{"v":1,"cols":28,"rows":18,"floors":[{"key":"ground","name":"Ground floor"},{"key":"floor-1","name":"Level 1"}]}'::jsonb,
    jsonb_build_array(
      jsonb_build_object(
        'key', 'main-hall', 'name', 'The Big Room', 'kind', 'main_hall',
        'floor', 1, 'cells', venue_rect_cells(5, 5, 8, 8),
        'color', '#7AB000', 'wall_height', 1.8, 'audio_mode', 'moderated',
        'is_open', true, 'sort_order', 10, 'allowed_roles', '[]'::jsonb
      ),
      jsonb_build_object(
        'key', 'judging', 'name', 'Judging Room', 'kind', 'judging',
        'floor', 0, 'cells', venue_rect_cells(1, 1, 3, 3),
        'audio_mode', 'moderated', 'is_open', true, 'sort_order', 20,
        'allowed_roles', '["judge","organizer"]'::jsonb
      )
    )
  );

  SELECT id INTO v_hall2 FROM venue_rooms WHERE event_id = v_event AND key = 'main-hall';
  ASSERT v_hall2 = v_hall,
    'save_venue_map: main-hall changed id on save — chat history would have been destroyed';

  SELECT floor INTO v_n FROM venue_rooms WHERE id = v_hall;
  ASSERT v_n = 1, 'save_venue_map: the room did not move to level 1';

  -- ------------------------------------------------------------
  -- 4. Rooms the editor dropped are deleted; team rooms are not
  -- ------------------------------------------------------------
  SELECT COUNT(*) INTO v_n FROM venue_rooms
  WHERE event_id = v_event AND key IN ('networking', 'workshop', 'help-desk', 'showcase', 'quiet-room');
  ASSERT v_n = 0, 'save_venue_map: rooms absent from the payload must be removed, ' || v_n || ' survived';

  SELECT COUNT(*) INTO v_n FROM venue_rooms WHERE id = v_team;
  ASSERT v_n = 1, 'save_venue_map: a team room must survive a map save';

  -- ------------------------------------------------------------
  -- 5. allowed_roles is enforced at the door
  -- ------------------------------------------------------------
  INSERT INTO event_venue_members (event_id, user_id, role)
  VALUES (v_event, v_judge, 'participant')
  ON CONFLICT (event_id, user_id) DO UPDATE SET role = 'participant';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_judge)::text, TRUE);

  v_failed := FALSE;
  BEGIN
    PERFORM enter_venue_room((SELECT id FROM venue_rooms WHERE event_id = v_event AND key = 'judging'));
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'enter_venue_room: a participant entered a judge-only room';

  -- Promoted as the host: guard_venue_member_role() silently reverts a role
  -- change made by anyone else, so doing this as the judge would be a no-op
  -- and the next assertion would fail for the wrong reason.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_host)::text, TRUE);
  UPDATE event_venue_members SET role = 'judge'
  WHERE event_id = v_event AND user_id = v_judge;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_judge)::text, TRUE);

  PERFORM enter_venue_room((SELECT id FROM venue_rooms WHERE event_id = v_event AND key = 'judging'));

  SELECT COUNT(*) INTO v_n FROM event_venue_members
  WHERE event_id = v_event AND user_id = v_judge AND current_room_id IS NOT NULL;
  ASSERT v_n = 1, 'enter_venue_room: a judge was refused a judge-only room';

  -- ------------------------------------------------------------
  -- 6. A non-host cannot save the map
  -- ------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    PERFORM save_venue_map(v_event, '{}'::jsonb, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'save_venue_map: a judge was allowed to redraw the venue';

  RAISE NOTICE 'Migration 089 assertions all held.';
END $$;

ROLLBACK;
