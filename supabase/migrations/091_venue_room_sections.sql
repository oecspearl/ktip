-- Migration 091: What is *in* a room
--
-- 070 gave a room a purpose (`kind`) and 089 gave it a place on the map. What
-- neither gave it is content: every room — sponsor booth, judging room, quiet
-- room — renders the same audio placeholder, the same chat and the same
-- occupant list. The kind picks an icon and nothing else.
--
-- This adds one column, `venue_rooms.sections`, holding the ordered list of
-- panels the room page renders.
--
-- WHY A LIST AND NOT A COLUMN PER PANEL
-- -------------------------------------
-- The panel set is editorial, not structural: it grows every time somebody
-- thinks of a good thing to put in a room, and shrinks when one turns out to be
-- noise. A column per panel would make that a migration each time. The same
-- argument already settled event_page_sections (009), and this is the same
-- shape for the same reason.
--
-- The counter-argument from 089 — "a rule only the client reads is not a rule"
-- — does not apply here. allowed_roles decides who may *enter*, which the door
-- has to enforce; sections decide what is *drawn*, which nothing server-side
-- has an opinion about. Anything in here that needs enforcing (who may post,
-- who may enter) is already its own column and stays that way.
--
-- WHY EMPTY MEANS "USE THE DEFAULTS"
-- ----------------------------------
-- Every room that exists today has no sections, and all of them must keep
-- working. An empty array resolves to the per-kind default list in
-- src/lib/venue-room-sections.ts, so there is no backfill, and a host who never
-- opens the panel picker gets a sponsor booth that looks like a sponsor booth.
--
-- ALSO FIXED HERE: save_venue_map() has never round-tripped sponsor_logo_url.
-- A host who set a logo in the admin tab lost it the next time anyone saved the
-- map. Both new fields and that one are written only when the payload actually
-- carries the key, so a caller that omits a field leaves it alone rather than
-- nulling it.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. The column
-- ============================================================

ALTER TABLE venue_rooms ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_rooms_sections_check') THEN
    ALTER TABLE venue_rooms ADD CONSTRAINT venue_rooms_sections_check
      CHECK (jsonb_typeof(sections) = 'array' AND jsonb_array_length(sections) <= 40);
  END IF;
END $$;

COMMENT ON COLUMN venue_rooms.sections IS
  'Ordered panels the room page renders: [{id, enabled, order, config}]. Empty = the per-kind default set in src/lib/venue-room-sections.ts. Ids are validated client-side; unknown ids are ignored, never rendered';

-- ============================================================
-- 2. The whole-floorplan save learns two more fields
-- ============================================================

-- Unchanged from 089 except for the three CASE-guarded columns. Identity still
-- travels on `key`, team rooms are still never deleted, and a room that keeps
-- its key still keeps its id and its chat history.
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
      allowed_roles, sponsor_name, sponsor_url, sponsor_logo_url, sections
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
      coalesce(v_room->'sections', '[]'::jsonb)
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
      -- The map editor has no field for these two. Writing EXCLUDED
      -- unconditionally would erase a logo set in the admin tab, and would
      -- erase every panel choice the moment an older client saved the map.
      sponsor_logo_url  = CASE WHEN v_room ? 'sponsor_logo_url'
                               THEN EXCLUDED.sponsor_logo_url
                               ELSE venue_rooms.sponsor_logo_url END,
      sections          = CASE WHEN v_room ? 'sections'
                               THEN EXCLUDED.sections
                               ELSE venue_rooms.sections END;
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
  'Whole-floorplan save from the visual editor. Rooms are matched on key so ids (and chat) survive edits; team rooms are never deleted; sponsor_logo_url and sections are left alone unless the payload carries them';

-- ============================================================
-- 3. Two things a panel needs that a policy will not give it
-- ============================================================

-- A host announcement inside a room.
--
-- venue_room_messages already carries kind='system' and RoomChatPanel already
-- renders it as a centred italic line — but the INSERT policy pins kind to
-- 'chat', deliberately, so that no client can forge a message that looks like
-- it came from the venue itself. That leaves the host with no way to post one.
-- This is the exception, and it is narrow: hosts only, one room, the room's own
-- event, and the body is length-checked exactly as the column requires.
CREATE OR REPLACE FUNCTION venue_room_broadcast(p_room_id UUID, p_body TEXT)
RETURNS venue_room_messages AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room venue_rooms;
  v_msg  venue_room_messages;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_room FROM venue_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;

  IF NOT is_venue_host(v_user, v_room.event_id) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  IF coalesce(btrim(p_body), '') = '' OR length(btrim(p_body)) > 4000 THEN
    RAISE EXCEPTION 'a broadcast needs between 1 and 4000 characters';
  END IF;

  INSERT INTO venue_room_messages (room_id, author_id, body, kind)
  VALUES (p_room_id, v_user, btrim(p_body), 'system')
  RETURNING * INTO v_msg;

  RETURN v_msg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION venue_room_broadcast(UUID, TEXT) IS
  'Post a kind=system message to a room as the host. The only way one can be created: the INSERT policy pins clients to kind=chat so a system line cannot be forged';

-- Checking in from the venue.
--
-- event_rsvps has no self-update policy — only organizers and admins may write
-- one (090) — which is right for status generally and wrong for the one
-- transition the attendee themselves performs. Confirmed → checked_in, nothing
-- else: a cancelled or waitlisted RSVP is not a door this opens.
CREATE OR REPLACE FUNCTION venue_check_in(p_event_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_user   UUID := auth.uid();
  v_status TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT is_venue_member(v_user, p_event_id) THEN
    RAISE EXCEPTION 'not a member of this venue';
  END IF;

  SELECT status INTO v_status FROM event_rsvps
  WHERE event_id = p_event_id AND user_id = v_user;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'you are not registered for this event';
  END IF;
  IF v_status = 'checked_in' THEN
    RETURN v_status;
  END IF;
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'a % registration cannot be checked in', v_status;
  END IF;

  UPDATE event_rsvps SET status = 'checked_in'
  WHERE event_id = p_event_id AND user_id = v_user;

  RETURN 'checked_in';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION venue_check_in(UUID) IS
  'Self check-in from the venue: confirmed → checked_in for the caller only. Any other status raises';

-- ============================================================
-- 4. Grants
-- ============================================================

-- save_venue_map is restated because CREATE OR REPLACE keeps the ACL but a
-- fresh database applying 091 alone would not have one.
REVOKE ALL ON FUNCTION save_venue_map(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_venue_map(UUID, JSONB, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION venue_room_broadcast(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION venue_room_broadcast(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION venue_check_in(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION venue_check_in(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 5. Verification (read-only)
-- ============================================================
--
--   SELECT key, kind, jsonb_array_length(sections) AS panels
--   FROM venue_rooms WHERE event_id = '<id>' ORDER BY floor, sort_order;
--
--   -- 0 panels is the normal state: the room renders its kind's defaults.
