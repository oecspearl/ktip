-- Migration 089: Venue map — a drawn floorplan instead of an uploaded SVG
--
-- 070 stored the map as a host-authored SVG plus a text `svg_zone_id` per room.
-- That works, but it puts a drawing tool between a host and their venue, and it
-- cannot express a building: one SVG is one floor.
--
-- This migration gives the venue its own geometry, authored in the browser:
--
--   events.venue_map   grid size + the list of floors (names only)
--   venue_rooms.floor  which floor the room sits on
--   venue_rooms.cells  the cells it occupies, as [[x,y], ...]
--
-- WHY CELLS AND NOT A RECT
-- ------------------------
-- An L-shaped hall is the normal shape for a main hall with a stage alcove. A
-- rect column would force the host to fake it with two rooms. The renderer
-- traces the outline of a cell set (marching edges), so a cell list costs
-- nothing extra to draw and buys every non-rectangular room for free.
--
-- WHY THE SVG PATH STAYS
-- ----------------------
-- `svg_zone_id` and `venue_floorplan_url` are untouched. An event that already
-- has an uploaded map keeps rendering from it; the drawn map takes over only
-- once rooms actually have cells. Neither column is a migration of the other.
--
-- WHY allowed_roles IS HERE AND NOT IN A "rules" JSONB
-- ----------------------------------------------------
-- Every other per-room rule (audio_mode, capacity, is_open, recording_enabled)
-- is already a column that enter_venue_room() and venue_room_grant() enforce.
-- A rule that only the client reads is not a rule. allowed_roles joins them as
-- a column so the same function can deny at the door.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. The building
-- ============================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_map JSONB;

COMMENT ON COLUMN events.venue_map IS
  'Drawn floorplan config: {v, cols, rows, floors:[{key,name}]}. NULL means this event has no drawn map (it may still have an uploaded SVG)';

-- ============================================================
-- 2. Room geometry
-- ============================================================

ALTER TABLE venue_rooms ADD COLUMN IF NOT EXISTS floor INT NOT NULL DEFAULT 0;
ALTER TABLE venue_rooms ADD COLUMN IF NOT EXISTS cells JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE venue_rooms ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE venue_rooms ADD COLUMN IF NOT EXISTS wall_height NUMERIC NOT NULL DEFAULT 1.0;
ALTER TABLE venue_rooms ADD COLUMN IF NOT EXISTS allowed_roles TEXT[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_rooms_wall_height_check') THEN
    ALTER TABLE venue_rooms ADD CONSTRAINT venue_rooms_wall_height_check
      CHECK (wall_height >= 0.3 AND wall_height <= 3.0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_rooms_floor_check') THEN
    ALTER TABLE venue_rooms ADD CONSTRAINT venue_rooms_floor_check
      CHECK (floor >= 0 AND floor < 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_rooms_cells_check') THEN
    ALTER TABLE venue_rooms ADD CONSTRAINT venue_rooms_cells_check
      CHECK (jsonb_typeof(cells) = 'array' AND jsonb_array_length(cells) <= 512);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_venue_rooms_floor ON venue_rooms(event_id, floor);

COMMENT ON COLUMN venue_rooms.cells IS 'Grid cells this room covers, [[x,y], ...]. Empty means the room is not on the drawn map';
COMMENT ON COLUMN venue_rooms.allowed_roles IS 'Venue roles that may enter. Empty array = everyone. Enforced by enter_venue_room()';
COMMENT ON COLUMN venue_rooms.color IS 'Hex from the venue palette. NULL falls back to a colour derived from kind';

-- ============================================================
-- 3. The door checks allowed_roles
-- ============================================================

CREATE OR REPLACE FUNCTION enter_venue_room(p_room_id UUID)
RETURNS venue_rooms AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room venue_rooms;
  v_role TEXT;
  v_here INT;
  v_host BOOLEAN;
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

  -- Empty means unrestricted. Hosts are never locked out of their own venue.
  IF array_length(v_room.allowed_roles, 1) IS NOT NULL
     AND NOT (v_role = ANY(v_room.allowed_roles))
     AND NOT v_host THEN
    RAISE EXCEPTION 'this room is not open to %', v_role;
  END IF;

  IF v_room.capacity IS NOT NULL THEN
    SELECT COUNT(*) INTO v_here FROM event_venue_members
    WHERE current_room_id = p_room_id
      AND user_id <> v_user
      AND last_seen_at > now() - INTERVAL '2 minutes';
    IF v_here >= v_room.capacity AND NOT v_host THEN
      RAISE EXCEPTION 'this room is full';
    END IF;
  END IF;

  UPDATE event_venue_members
  SET current_room_id = p_room_id, last_seen_at = now()
  WHERE event_id = v_room.event_id AND user_id = v_user;

  RETURN v_room;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 4. Saving a drawn map
-- ============================================================

-- The editor is a canvas, not a form: one save writes the whole floorplan.
-- Room identity travels on `key`, never on the array position, so a room that
-- keeps its key keeps its id — and therefore its chat history — through any
-- amount of dragging, renaming and re-colouring.
--
-- Rooms of kind 'team' are never touched. They are created by hackathon_teams
-- (072) and a host who has not drawn them must not delete them by saving.
CREATE OR REPLACE FUNCTION save_venue_map(
  p_event_id UUID,
  p_map JSONB,
  p_rooms JSONB
)
RETURNS SETOF venue_rooms AS $$
DECLARE
  v_room JSONB;
  v_keys TEXT[] := '{}';
BEGIN
  IF NOT is_venue_host(auth.uid(), p_event_id) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;
  IF jsonb_typeof(p_rooms) <> 'array' THEN
    RAISE EXCEPTION 'rooms must be an array';
  END IF;
  IF jsonb_array_length(p_rooms) > 200 THEN
    RAISE EXCEPTION 'a venue may hold at most 200 rooms';
  END IF;

  UPDATE events SET venue_map = p_map WHERE id = p_event_id;

  FOR v_room IN SELECT * FROM jsonb_array_elements(p_rooms)
  LOOP
    IF coalesce(btrim(v_room->>'key'), '') = '' OR coalesce(btrim(v_room->>'name'), '') = '' THEN
      RAISE EXCEPTION 'every room needs a key and a name';
    END IF;
    v_keys := array_append(v_keys, v_room->>'key');

    INSERT INTO venue_rooms (
      event_id, key, name, kind, description, capacity, audio_mode,
      recording_enabled, is_open, sort_order, floor, cells, color, wall_height,
      allowed_roles, sponsor_name, sponsor_url
    )
    VALUES (
      p_event_id,
      v_room->>'key',
      v_room->>'name',
      coalesce(v_room->>'kind', 'breakout'),
      nullif(btrim(coalesce(v_room->>'description', '')), ''),
      nullif(v_room->>'capacity', '')::INT,
      coalesce(v_room->>'audio_mode', 'open'),
      coalesce((v_room->>'recording_enabled')::BOOLEAN, FALSE),
      coalesce((v_room->>'is_open')::BOOLEAN, TRUE),
      coalesce((v_room->>'sort_order')::INT, 0),
      coalesce((v_room->>'floor')::INT, 0),
      coalesce(v_room->'cells', '[]'::jsonb),
      nullif(btrim(coalesce(v_room->>'color', '')), ''),
      coalesce((v_room->>'wall_height')::NUMERIC, 1.0),
      coalesce(
        ARRAY(SELECT jsonb_array_elements_text(coalesce(v_room->'allowed_roles', '[]'::jsonb))),
        '{}'
      ),
      nullif(btrim(coalesce(v_room->>'sponsor_name', '')), ''),
      nullif(btrim(coalesce(v_room->>'sponsor_url', '')), '')
    )
    ON CONFLICT (event_id, key) DO UPDATE SET
      name              = EXCLUDED.name,
      kind              = EXCLUDED.kind,
      description       = EXCLUDED.description,
      capacity          = EXCLUDED.capacity,
      audio_mode        = EXCLUDED.audio_mode,
      recording_enabled = EXCLUDED.recording_enabled,
      is_open           = EXCLUDED.is_open,
      sort_order        = EXCLUDED.sort_order,
      floor             = EXCLUDED.floor,
      cells             = EXCLUDED.cells,
      color             = EXCLUDED.color,
      wall_height       = EXCLUDED.wall_height,
      allowed_roles     = EXCLUDED.allowed_roles,
      sponsor_name      = EXCLUDED.sponsor_name,
      sponsor_url       = EXCLUDED.sponsor_url;
  END LOOP;

  DELETE FROM venue_rooms
  WHERE event_id = p_event_id
    AND kind <> 'team'
    AND NOT (key = ANY(v_keys));

  RETURN QUERY
    SELECT * FROM venue_rooms
    WHERE event_id = p_event_id
    ORDER BY floor, sort_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION save_venue_map(UUID, JSONB, JSONB) IS
  'Whole-floorplan save from the visual editor. Rooms are matched on key so ids (and chat) survive edits; team rooms are never deleted';

-- ============================================================
-- 5. Starter rooms, now with a layout
-- ============================================================

-- Helper: a rectangle as the cell list the renderer wants. Inclusive bounds.
CREATE OR REPLACE FUNCTION venue_rect_cells(x0 INT, y0 INT, x1 INT, y1 INT)
RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_array(x, y)), '[]'::jsonb)
  FROM generate_series(LEAST(x0, x1), GREATEST(x0, x1)) AS x,
       generate_series(LEAST(y0, y1), GREATEST(y0, y1)) AS y;
$$ LANGUAGE sql IMMUTABLE;

-- Same six rooms as 070, plus where they sit. A host who clicks this once has a
-- drawable building rather than a list they still have to arrange.
CREATE OR REPLACE FUNCTION seed_default_venue_rooms(p_event_id UUID)
RETURNS SETOF venue_rooms AS $$
BEGIN
  IF NOT is_venue_host(auth.uid(), p_event_id) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  UPDATE events
  SET venue_map = COALESCE(venue_map, jsonb_build_object(
    'v', 1, 'cols', 28, 'rows', 18,
    'floors', jsonb_build_array(
      jsonb_build_object('key', 'ground', 'name', 'Ground floor')
    )
  ))
  WHERE id = p_event_id;

  INSERT INTO venue_rooms (
    event_id, key, name, kind, description, audio_mode, svg_zone_id, sort_order,
    floor, cells, color, wall_height
  )
  VALUES
    (p_event_id, 'main-hall',  'Main Hall',       'main_hall',  'Opening remarks, announcements and the closing ceremony.', 'moderated',   'zone-main-hall',  10, 0, venue_rect_cells(2, 2, 9, 7),    '#2A5788', 1.4),
    (p_event_id, 'networking', 'Networking Area', 'networking', 'Open mics. See everyone here and talk freely.',            'open',        'zone-networking', 20, 0, venue_rect_cells(12, 2, 19, 7),  '#7AB000', 1.0),
    (p_event_id, 'workshop',   'Workshop Room',   'workshop',   'Scheduled sessions from mentors and sponsors.',            'moderated',   'zone-workshop',   30, 0, venue_rect_cells(21, 2, 26, 6),  '#E6AC09', 1.0),
    (p_event_id, 'help-desk',  'Help Desk',       'help_desk',  'Stuck? A mentor is here.',                                 'open',        'zone-help-desk',  40, 0, venue_rect_cells(2, 10, 7, 14),  '#7E9EC7', 1.0),
    (p_event_id, 'showcase',   'Showcase Stage',  'stage',      'Demos and pitches.',                                       'listen_only', 'zone-showcase',   50, 0, venue_rect_cells(9, 10, 18, 15), '#041E42', 1.6),
    (p_event_id, 'quiet-room', 'Quiet Room',      'breakout',   'Heads-down focus. No audio.',                              'listen_only', 'zone-quiet',      60, 0, venue_rect_cells(20, 10, 26, 14), '#78716c', 0.8)
  ON CONFLICT (event_id, key) DO NOTHING;

  RETURN QUERY SELECT * FROM venue_rooms WHERE event_id = p_event_id ORDER BY floor, sort_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 6. Grants
-- ============================================================

REVOKE ALL ON FUNCTION save_venue_map(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_venue_map(UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION venue_rect_cells(INT, INT, INT, INT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 7. Verification (read-only)
-- ============================================================
--
--   SELECT key, floor, jsonb_array_length(cells) AS cell_count, color
--   FROM venue_rooms WHERE event_id = '<id>' ORDER BY floor, sort_order;
--
--   -- A room with an empty cells array renders in the "Not on the map" list,
--   -- exactly like an unmatched svg_zone_id did.
