-- Migration 188: Room furniture, room looks, and teams that own a Homebase
--
-- Three things, in the order the venue needs them:
--
--   1. venue_rooms.furniture  which furniture preset the 2.5D map draws in a
--                             room (stage and seats, chalkboard and desks...).
--                             NULL = the kind's default, chosen client-side in
--                             src/lib/venue-furniture.ts.
--   2. venue_rooms.decor      the room's own look: colour, which items stand in
--                             it, an uploaded logo and an uploaded mural. Set
--                             by the team that owns the room (or a host) through
--                             set_room_look(), never by the map editor.
--   3. event_teams            the smallest team model that can own a Homebase:
--                             a team, its members, and the team room it claimed.
--                             Applications, invites and openings are a later
--                             migration; this one only answers "who may
--                             decorate this room".
--
-- WHY DECOR IS NOT IN save_venue_map
-- ----------------------------------
-- The host saves the whole floorplan from the editor. If the team's colour
-- lived in venue_rooms.color, the host's next save would quietly paint every
-- Homebase back to whatever the editor loaded. decor is a column the editor
-- never sends, and save_venue_map never writes, so a team's look survives any
-- amount of floorplan editing.
--
-- WHY PATHS, NOT URLS
-- -------------------
-- decor stores storage object paths in the venue-room-art bucket, never a URL.
-- A URL field would let anyone hang a tracking pixel from any host on the wall
-- of a room every attendee walks past. A path is checked to sit under the
-- room's own folder, and the client builds the public URL itself.
--
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. Furniture preset + decor on rooms
-- ============================================================

ALTER TABLE venue_rooms ADD COLUMN IF NOT EXISTS furniture TEXT;
ALTER TABLE venue_rooms ADD COLUMN IF NOT EXISTS decor JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_rooms_furniture_check') THEN
    ALTER TABLE venue_rooms ADD CONSTRAINT venue_rooms_furniture_check
      CHECK (furniture IS NULL OR furniture IN (
        'theatre', 'stage', 'cafe', 'classroom', 'counter', 'booth', 'homebase',
        'panel', 'lounge', 'podium', 'ops', 'library', 'bench', 'none'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_rooms_decor_check') THEN
    ALTER TABLE venue_rooms ADD CONSTRAINT venue_rooms_decor_check
      CHECK (jsonb_typeof(decor) = 'object' AND length(decor::text) <= 4000);
  END IF;
END $$;

COMMENT ON COLUMN venue_rooms.furniture IS
  'Furniture preset for the 2.5D map (venue-furniture.ts). NULL = the room kind''s default';
COMMENT ON COLUMN venue_rooms.decor IS
  'Room look set by its team or a host via set_room_look(): {v, color, items{}, logo_path, mural_path}. Never written by save_venue_map';

-- ============================================================
-- 2. save_venue_map carries furniture (and still never touches decor)
-- ============================================================

-- Same body as 091 plus one column. furniture follows the sections rule: an
-- older client that does not send the key leaves the stored value alone.
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
    IF v_room ? 'sections' AND jsonb_typeof(v_room->'sections') <> 'array' THEN
      RAISE EXCEPTION 'sections must be an array';
    END IF;
    IF jsonb_array_length(coalesce(v_room->'sections', '[]'::jsonb)) > 40 THEN
      RAISE EXCEPTION 'a room may hold at most 40 panels';
    END IF;
    v_keys := array_append(v_keys, v_room->>'key');

    INSERT INTO venue_rooms (
      event_id, key, name, kind, description, capacity, audio_mode,
      recording_enabled, is_open, sort_order, floor, cells, color, wall_height,
      allowed_roles, sponsor_name, sponsor_url, sponsor_logo_url, sections, furniture
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
      nullif(btrim(coalesce(v_room->>'sponsor_url', '')), ''),
      nullif(btrim(coalesce(v_room->>'sponsor_logo_url', '')), ''),
      coalesce(v_room->'sections', '[]'::jsonb),
      nullif(btrim(coalesce(v_room->>'furniture', '')), '')
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
      sponsor_url       = EXCLUDED.sponsor_url,
      sponsor_logo_url  = CASE WHEN v_room ? 'sponsor_logo_url'
                               THEN EXCLUDED.sponsor_logo_url
                               ELSE venue_rooms.sponsor_logo_url END,
      sections          = CASE WHEN v_room ? 'sections'
                               THEN EXCLUDED.sections
                               ELSE venue_rooms.sections END,
      furniture         = CASE WHEN v_room ? 'furniture'
                               THEN EXCLUDED.furniture
                               ELSE venue_rooms.furniture END;
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

-- ============================================================
-- 3. Teams (the minimum that can own a Homebase)
-- ============================================================

CREATE TABLE IF NOT EXISTS event_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  tagline TEXT CHECK (tagline IS NULL OR char_length(tagline) <= 160),
  max_size INT NOT NULL DEFAULT 5 CHECK (max_size BETWEEN 1 AND 20),
  is_discoverable BOOLEAN NOT NULL DEFAULT TRUE,
  -- The team room this team claimed. Unique: one room, one team.
  homebase_room_id UUID UNIQUE REFERENCES venue_rooms(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, name)
);

CREATE TABLE IF NOT EXISTS event_team_members (
  team_id UUID NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  -- Denormalised so "one team per person per event" is a plain unique index.
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('captain', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_teams_event ON event_teams(event_id);
CREATE INDEX IF NOT EXISTS idx_event_team_members_user ON event_team_members(user_id);

ALTER TABLE event_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_team_members ENABLE ROW LEVEL SECURITY;

-- Everyone in the venue can see which teams exist and who is on them: that is
-- what a team finder is. Writes go through the functions below only.
DROP POLICY IF EXISTS "Venue members can see teams" ON event_teams;
CREATE POLICY "Venue members can see teams"
  ON event_teams FOR SELECT
  USING (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id));

DROP POLICY IF EXISTS "Venue members can see team members" ON event_team_members;
CREATE POLICY "Venue members can see team members"
  ON event_team_members FOR SELECT
  USING (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id));

COMMENT ON TABLE event_teams IS 'Hackathon teams. homebase_room_id is the team room (kind team) the team claimed';

-- ============================================================
-- 4. Who may decorate a room
-- ============================================================

CREATE OR REPLACE FUNCTION can_edit_room_look(p_user UUID, p_room_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL AND NOT is_suspended(p_user) AND EXISTS (
    SELECT 1 FROM venue_rooms r
    WHERE r.id = p_room_id
      AND (
        is_venue_host(p_user, r.event_id)
        OR (
          r.kind = 'team'
          AND EXISTS (
            SELECT 1
            FROM event_teams t
            JOIN event_team_members m ON m.team_id = t.id
            WHERE t.homebase_room_id = r.id AND m.user_id = p_user
          )
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION can_edit_room_look(UUID, UUID) IS
  'Hosts may decorate any room; a team member may decorate their own Homebase';

-- ============================================================
-- 5. set_room_look: validated write of venue_rooms.decor
-- ============================================================

CREATE OR REPLACE FUNCTION set_room_look(p_room_id UUID, p_decor JSONB)
RETURNS venue_rooms AS $$
DECLARE
  v_room venue_rooms;
  v_key TEXT;
  v_path TEXT;
  v_clean JSONB := jsonb_build_object('v', 1);
  v_items JSONB := '{}'::jsonb;
  v_allowed_items TEXT[] := ARRAY[
    'video', 'kanban', 'whiteboard', 'desks', 'sofa', 'plants',
    'beanbags', 'shelf', 'coffee', 'rug', 'banner', 'mural'
  ];
BEGIN
  IF NOT can_edit_room_look(auth.uid(), p_room_id) THEN
    RAISE EXCEPTION 'you cannot change how this room looks';
  END IF;
  IF p_decor IS NULL OR jsonb_typeof(p_decor) <> 'object' THEN
    RAISE EXCEPTION 'decor must be an object';
  END IF;

  -- Colour: a plain #rrggbb or nothing.
  IF p_decor ? 'color' AND jsonb_typeof(p_decor->'color') = 'string' THEN
    IF (p_decor->>'color') !~ '^#[0-9A-Fa-f]{6}$' THEN
      RAISE EXCEPTION 'colour must look like #1A2B3C';
    END IF;
    v_clean := v_clean || jsonb_build_object('color', upper(p_decor->>'color'));
  END IF;

  -- Items: known keys, boolean values. Unknown keys are dropped, not stored.
  IF p_decor ? 'items' THEN
    IF jsonb_typeof(p_decor->'items') <> 'object' THEN
      RAISE EXCEPTION 'items must be an object';
    END IF;
    FOR v_key IN SELECT jsonb_object_keys(p_decor->'items')
    LOOP
      IF v_key = ANY(v_allowed_items) AND jsonb_typeof(p_decor->'items'->v_key) = 'boolean' THEN
        v_items := v_items || jsonb_build_object(v_key, p_decor->'items'->v_key);
      END IF;
    END LOOP;
    v_clean := v_clean || jsonb_build_object('items', v_items);
  END IF;

  -- Images: storage paths under this room's own folder, nothing else.
  FOREACH v_key IN ARRAY ARRAY['logo_path', 'mural_path']
  LOOP
    IF p_decor ? v_key AND jsonb_typeof(p_decor->v_key) = 'string' THEN
      v_path := p_decor->>v_key;
      IF v_path !~ ('^' || p_room_id::text || '/[A-Za-z0-9._-]{1,120}$') THEN
        RAISE EXCEPTION '% must be a file uploaded to this room', v_key;
      END IF;
      v_clean := v_clean || jsonb_build_object(v_key, v_path);
    END IF;
  END LOOP;

  UPDATE venue_rooms SET decor = v_clean WHERE id = p_room_id
  RETURNING * INTO v_room;
  RETURN v_room;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 6. Forming a team claims a free Homebase
-- ============================================================

CREATE OR REPLACE FUNCTION create_event_team(p_event_id UUID, p_name TEXT, p_tagline TEXT DEFAULT NULL)
RETURNS event_teams AS $$
DECLARE
  v_user UUID := auth.uid();
  v_team event_teams;
  v_room UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;
  IF NOT is_venue_member(v_user, p_event_id) THEN
    RAISE EXCEPTION 'join the venue before forming a team';
  END IF;
  IF EXISTS (SELECT 1 FROM event_team_members WHERE event_id = p_event_id AND user_id = v_user) THEN
    RAISE EXCEPTION 'you are already on a team in this event';
  END IF;

  -- First free team room, lowest floor first. A team with no room still
  -- exists; it just has nowhere to decorate until the host draws one.
  SELECT r.id INTO v_room
  FROM venue_rooms r
  WHERE r.event_id = p_event_id
    AND r.kind = 'team'
    AND NOT EXISTS (SELECT 1 FROM event_teams t WHERE t.homebase_room_id = r.id)
  ORDER BY r.floor, r.sort_order
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  INSERT INTO event_teams (event_id, name, tagline, homebase_room_id, created_by)
  VALUES (p_event_id, btrim(p_name), nullif(btrim(coalesce(p_tagline, '')), ''), v_room, v_user)
  RETURNING * INTO v_team;

  INSERT INTO event_team_members (team_id, event_id, user_id, role)
  VALUES (v_team.id, p_event_id, v_user, 'captain');

  -- The room takes the team's name, so the map says whose Homebase it is.
  IF v_room IS NOT NULL THEN
    UPDATE venue_rooms SET name = v_team.name WHERE id = v_room;
  END IF;

  RETURN v_team;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION leave_event_team(p_team_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user UUID := auth.uid();
  v_was_captain BOOLEAN;
BEGIN
  DELETE FROM event_team_members
  WHERE team_id = p_team_id AND user_id = v_user
  RETURNING role = 'captain' INTO v_was_captain;

  IF v_was_captain IS NULL THEN
    RAISE EXCEPTION 'you are not on this team';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM event_team_members WHERE team_id = p_team_id) THEN
    -- Last one out: the team goes, and its room is free for the next team.
    DELETE FROM event_teams WHERE id = p_team_id;
  ELSIF v_was_captain THEN
    UPDATE event_team_members SET role = 'captain'
    WHERE (team_id, user_id) = (
      SELECT team_id, user_id FROM event_team_members
      WHERE team_id = p_team_id ORDER BY joined_at LIMIT 1
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 7. Room art bucket (logos and murals)
-- ============================================================

-- Public read: a logo on a wall is seen by everyone walking past, and the map
-- draws it with a plain <image>. Writes are limited to people who may
-- decorate the room named by the first folder. No SVG: an SVG is a document,
-- and a document can carry script.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'venue-room-art',
  'venue-room-art',
  TRUE,
  2097152, -- 2MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Room decorators can upload room art" ON storage.objects;
CREATE POLICY "Room decorators can upload room art"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'venue-room-art'
    AND can_edit_room_look(auth.uid(), safe_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS "Room decorators can replace room art" ON storage.objects;
CREATE POLICY "Room decorators can replace room art"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'venue-room-art'
    AND can_edit_room_look(auth.uid(), safe_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS "Room decorators can remove room art" ON storage.objects;
CREATE POLICY "Room decorators can remove room art"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'venue-room-art'
    AND can_edit_room_look(auth.uid(), safe_uuid((storage.foldername(name))[1]))
  );

-- ============================================================
-- 8. Grants
-- ============================================================

REVOKE ALL ON FUNCTION set_room_look(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_room_look(UUID, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION create_event_team(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_event_team(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION leave_event_team(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION leave_event_team(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_edit_room_look(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 9. Verification (read-only)
-- ============================================================
--
--   SELECT key, kind, furniture, decor FROM venue_rooms WHERE event_id = '<id>';
--   SELECT t.name, r.name AS room FROM event_teams t LEFT JOIN venue_rooms r ON r.id = t.homebase_room_id;
--   -- As a non-member: SELECT set_room_look('<team room id>', '{"color":"#000000"}');
--   -- must fail with "you cannot change how this room looks".
