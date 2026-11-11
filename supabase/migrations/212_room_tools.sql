-- Migration 212: four room tools from the room design
-- ============================================================================
--
--   1. Kit            venue_kit_items, venue_kit_reservations
--                     The Hardware Bench: what there is, how many are left,
--                     and one button to reserve one.
--   2. Booking slots  venue_booking_slots
--                     "Book 15 minutes" with a sponsor or a mentor.
--   3. Library        venue_library_items
--                     Datasets, APIs, starter kits and guides for this event,
--                     each with the languages it comes in.
--   4. Announce       venue_broadcast_all()
--                     One message from an organiser to every open room.
--
-- Everyone in the venue reads; every write goes through a function. Hosts
-- (organisers) stock the bench, fill the library and announce. A slot's own
-- host or an organiser offers slots. No suspended, closed or unverified
-- account reserves or books (205, 206); spectators read only.
--
-- Idempotent: safe to re-run.

-- ============================================================
-- Shared test: may this account take part (reserve, book)?
-- ============================================================

CREATE OR REPLACE FUNCTION can_take_part_in_venue(p_user UUID, p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL
    AND NOT is_suspended(p_user)
    AND is_account_active(p_user)
    AND is_verified_member(p_user)
    AND EXISTS (
      SELECT 1 FROM event_venue_members m
      WHERE m.event_id = p_event_id AND m.user_id = p_user AND m.role <> 'spectator'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION can_take_part_in_venue(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_take_part_in_venue(UUID, UUID) TO authenticated;

-- ============================================================
-- 1. Kit
-- ============================================================

CREATE TABLE IF NOT EXISTS venue_kit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES venue_rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  total INT NOT NULL CHECK (total BETWEEN 0 AND 999),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS venue_kit_reservations (
  item_id UUID NOT NULL REFERENCES venue_kit_items(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);

ALTER TABLE venue_kit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_kit_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue sees the kit" ON venue_kit_items;
CREATE POLICY "Venue sees the kit" ON venue_kit_items FOR SELECT
  USING (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id));

DROP POLICY IF EXISTS "Venue sees kit reservations" ON venue_kit_reservations;
CREATE POLICY "Venue sees kit reservations" ON venue_kit_reservations FOR SELECT
  USING (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id));

GRANT SELECT ON venue_kit_items, venue_kit_reservations TO authenticated;

CREATE OR REPLACE FUNCTION save_kit_item(p_room_id UUID, p_id UUID, p_name TEXT, p_total INT)
RETURNS venue_kit_items AS $$
DECLARE
  v_room venue_rooms;
  v_row venue_kit_items;
BEGIN
  SELECT * INTO v_room FROM venue_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL OR NOT is_venue_host(auth.uid(), v_room.event_id) THEN
    RAISE EXCEPTION 'only organisers can stock the bench' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO venue_kit_items (event_id, room_id, name, total, sort_order)
    VALUES (
      v_room.event_id, p_room_id, btrim(p_name), p_total,
      coalesce((SELECT max(sort_order) + 10 FROM venue_kit_items WHERE room_id = p_room_id), 10)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE venue_kit_items SET name = btrim(p_name), total = p_total
    WHERE id = p_id AND room_id = p_room_id
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'item not found';
    END IF;
  END IF;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION remove_kit_item(p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_item venue_kit_items;
BEGIN
  SELECT * INTO v_item FROM venue_kit_items WHERE id = p_id;
  IF v_item.id IS NULL OR NOT is_venue_host(auth.uid(), v_item.event_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM venue_kit_items WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Reserve one, or give it back. One of each item per person.
CREATE OR REPLACE FUNCTION reserve_kit_item(p_item_id UUID, p_on BOOLEAN DEFAULT TRUE)
RETURNS VOID AS $$
DECLARE
  v_user UUID := auth.uid();
  v_item venue_kit_items;
BEGIN
  -- Locked, so two people cannot both take the last one.
  SELECT * INTO v_item FROM venue_kit_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'item not found';
  END IF;
  IF NOT coalesce(p_on, TRUE) THEN
    DELETE FROM venue_kit_reservations WHERE item_id = p_item_id AND user_id = v_user;
    RETURN;
  END IF;
  IF NOT can_take_part_in_venue(v_user, v_item.event_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM venue_kit_reservations WHERE item_id = p_item_id) >= v_item.total THEN
    RAISE EXCEPTION 'none left';
  END IF;
  INSERT INTO venue_kit_reservations (item_id, event_id, user_id)
  VALUES (p_item_id, v_item.event_id, v_user)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. Booking slots
-- ============================================================

CREATE TABLE IF NOT EXISTS venue_booking_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES venue_rooms(id) ON DELETE CASCADE,
  -- Who you would be talking to.
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  minutes INT NOT NULL DEFAULT 15 CHECK (minutes IN (10, 15, 20, 30)),
  booked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  booked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, host_id, starts_at)
);

ALTER TABLE venue_booking_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue sees booking slots" ON venue_booking_slots;
CREATE POLICY "Venue sees booking slots" ON venue_booking_slots FOR SELECT
  USING (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id));

GRANT SELECT ON venue_booking_slots TO authenticated;

-- Offer a slot: yourself as host if you are a mentor or organiser here, or an
-- organiser offering one for somebody else (a sponsor's rep).
CREATE OR REPLACE FUNCTION offer_booking_slot(p_room_id UUID, p_host_id UUID, p_starts_at TIMESTAMPTZ, p_minutes INT DEFAULT 15)
RETURNS venue_booking_slots AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room venue_rooms;
  v_row venue_booking_slots;
BEGIN
  SELECT * INTO v_room FROM venue_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;
  IF NOT (
    is_venue_host(v_user, v_room.event_id)
    OR (p_host_id = v_user AND EXISTS (
      SELECT 1 FROM event_venue_members m
      WHERE m.event_id = v_room.event_id AND m.user_id = v_user AND m.role IN ('mentor', 'organizer')
    ))
  ) THEN
    RAISE EXCEPTION 'only mentors and organisers offer slots' USING ERRCODE = '42501';
  END IF;
  INSERT INTO venue_booking_slots (event_id, room_id, host_id, starts_at, minutes)
  VALUES (v_room.event_id, p_room_id, p_host_id, p_starts_at, coalesce(p_minutes, 15))
  ON CONFLICT (room_id, host_id, starts_at) DO UPDATE SET minutes = EXCLUDED.minutes
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION remove_booking_slot(p_slot_id UUID)
RETURNS VOID AS $$
DECLARE
  v_slot venue_booking_slots;
BEGIN
  SELECT * INTO v_slot FROM venue_booking_slots WHERE id = p_slot_id;
  IF v_slot.id IS NULL OR NOT (v_slot.host_id = auth.uid() OR is_venue_host(auth.uid(), v_slot.event_id)) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM venue_booking_slots WHERE id = p_slot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Book a free slot, or give your own booking back.
CREATE OR REPLACE FUNCTION book_slot(p_slot_id UUID, p_on BOOLEAN DEFAULT TRUE)
RETURNS VOID AS $$
DECLARE
  v_user UUID := auth.uid();
  v_slot venue_booking_slots;
BEGIN
  SELECT * INTO v_slot FROM venue_booking_slots WHERE id = p_slot_id;
  IF v_slot.id IS NULL THEN
    RAISE EXCEPTION 'slot not found';
  END IF;
  IF NOT coalesce(p_on, TRUE) THEN
    UPDATE venue_booking_slots SET booked_by = NULL, booked_at = NULL
    WHERE id = p_slot_id AND booked_by = v_user;
    RETURN;
  END IF;
  IF NOT can_take_part_in_venue(v_user, v_slot.event_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF v_slot.host_id = v_user THEN
    RAISE EXCEPTION 'this is your own slot';
  END IF;
  -- The free test is in the WHERE, so two people clicking at once cannot both win.
  UPDATE venue_booking_slots SET booked_by = v_user, booked_at = now()
  WHERE id = p_slot_id AND booked_by IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'someone else just took this slot';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. Library
-- ============================================================

CREATE TABLE IF NOT EXISTS venue_library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  detail TEXT CHECK (detail IS NULL OR char_length(detail) <= 200),
  kind TEXT NOT NULL CHECK (kind IN ('dataset', 'api', 'starter', 'guide')),
  -- CSV, API, ZIP, PDF: the short badge on the row.
  format TEXT CHECK (format IS NULL OR char_length(format) <= 6),
  languages TEXT[] NOT NULL DEFAULT '{}' CHECK (languages <@ ARRAY['en', 'fr', 'es']),
  url TEXT CHECK (url IS NULL OR url ~ '^https?://'),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE venue_library_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue sees the library" ON venue_library_items;
CREATE POLICY "Venue sees the library" ON venue_library_items FOR SELECT
  USING (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id));

GRANT SELECT ON venue_library_items TO authenticated;

CREATE OR REPLACE FUNCTION save_library_item(
  p_event_id UUID,
  p_id UUID,
  p_title TEXT,
  p_detail TEXT,
  p_kind TEXT,
  p_format TEXT,
  p_languages TEXT[],
  p_url TEXT
) RETURNS venue_library_items AS $$
DECLARE
  v_row venue_library_items;
BEGIN
  IF NOT is_venue_host(auth.uid(), p_event_id) THEN
    RAISE EXCEPTION 'only organisers can fill the library' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO venue_library_items (event_id, title, detail, kind, format, languages, url, sort_order)
    VALUES (
      p_event_id, btrim(p_title), nullif(btrim(coalesce(p_detail, '')), ''), p_kind,
      nullif(upper(btrim(coalesce(p_format, ''))), ''), coalesce(p_languages, '{}'),
      nullif(btrim(coalesce(p_url, '')), ''),
      coalesce((SELECT max(sort_order) + 10 FROM venue_library_items WHERE event_id = p_event_id), 10)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE venue_library_items
    SET title = btrim(p_title),
        detail = nullif(btrim(coalesce(p_detail, '')), ''),
        kind = p_kind,
        format = nullif(upper(btrim(coalesce(p_format, ''))), ''),
        languages = coalesce(p_languages, '{}'),
        url = nullif(btrim(coalesce(p_url, '')), '')
    WHERE id = p_id AND event_id = p_event_id
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'item not found';
    END IF;
  END IF;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION remove_library_item(p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_item venue_library_items;
BEGIN
  SELECT * INTO v_item FROM venue_library_items WHERE id = p_id;
  IF v_item.id IS NULL OR NOT is_venue_host(auth.uid(), v_item.event_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM venue_library_items WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 4. One announcement to every open room
-- ============================================================
-- The same system line venue_room_broadcast() (091) writes, once per open
-- room, so it shows in each room's chat and translates like any other line.

CREATE OR REPLACE FUNCTION venue_broadcast_all(p_event_id UUID, p_body TEXT)
RETURNS INT AS $$
DECLARE
  v_user UUID := auth.uid();
  v_count INT;
BEGIN
  IF v_user IS NULL OR NOT is_venue_host(v_user, p_event_id) THEN
    RAISE EXCEPTION 'only organisers can announce to every room' USING ERRCODE = '42501';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;
  IF coalesce(btrim(p_body), '') = '' OR length(btrim(p_body)) > 1000 THEN
    RAISE EXCEPTION 'an announcement needs between 1 and 1000 characters';
  END IF;

  INSERT INTO venue_room_messages (room_id, author_id, body, kind)
  SELECT r.id, v_user, btrim(p_body), 'system'
  FROM venue_rooms r
  WHERE r.event_id = p_event_id AND r.is_open;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Grants, realtime, schema reload
-- ============================================================

REVOKE ALL ON FUNCTION save_kit_item(UUID, UUID, TEXT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION remove_kit_item(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION reserve_kit_item(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION offer_booking_slot(UUID, UUID, TIMESTAMPTZ, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION remove_booking_slot(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION book_slot(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION save_library_item(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION remove_library_item(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION venue_broadcast_all(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_kit_item(UUID, UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_kit_item(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reserve_kit_item(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION offer_booking_slot(UUID, UUID, TIMESTAMPTZ, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_booking_slot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION book_slot(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION save_library_item(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_library_item(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION venue_broadcast_all(UUID, TEXT) TO authenticated;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['venue_kit_items', 'venue_kit_reservations', 'venue_booking_slots'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND tablename = v_table) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', v_table);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
