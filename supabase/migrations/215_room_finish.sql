-- Migration 215: two last pieces of the room design
-- ============================================================================
--
--   1. sit_at_coffee_table()   "Sit here" on a coffee table that has room.
--                              Until now the only way to a table was the
--                              roulette queue (200).
--   2. venue_room_notes        One shared page of notes per room, for a small
--                              team room: what we are doing today, questions
--                              for the mentor. Whoever may use the room reads
--                              it; whoever may take part writes it.
--
-- Depends on 190 (can_use_room_channel) and 200 (coffee tables).
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. Sit at a table
-- ============================================================

-- Take a free seat at a live table. The rules of 200 hold: participants and
-- mentors only, four seats at most, one table at a time, and never one-to-one,
-- so a table with a single person left at it cannot be joined (the two of them
-- would be alone on a call). Returns FALSE when already seated there.
CREATE OR REPLACE FUNCTION sit_at_coffee_table(p_table_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user UUID := auth.uid();
  v_table venue_coffee_tables;
  v_mine UUID;
  v_seated INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  -- Locked, so two people pressing at once cannot both take the last seat.
  SELECT * INTO v_table FROM venue_coffee_tables WHERE id = p_table_id FOR UPDATE;
  IF v_table.id IS NULL OR v_table.ends_at <= now() THEN
    RAISE EXCEPTION 'that table has finished';
  END IF;
  IF NOT may_take_coffee(v_user, v_table.room_id) THEN
    RAISE EXCEPTION 'coffee tables are for participants and mentors in an open lounge' USING ERRCODE = '42501';
  END IF;

  v_mine := my_coffee_table(v_user, v_table.event_id);
  IF v_mine = p_table_id THEN
    RETURN FALSE;
  ELSIF v_mine IS NOT NULL THEN
    RAISE EXCEPTION 'get up from your table first';
  END IF;

  SELECT count(*) INTO v_seated FROM venue_coffee_seats
  WHERE table_id = p_table_id AND left_at IS NULL;
  IF v_seated >= 4 THEN
    RAISE EXCEPTION 'that table is full';
  ELSIF v_seated < 2 THEN
    RAISE EXCEPTION 'that table is winding down';
  END IF;

  DELETE FROM venue_coffee_queue WHERE event_id = v_table.event_id AND user_id = v_user;
  INSERT INTO venue_coffee_seats (table_id, event_id, user_id)
  VALUES (p_table_id, v_table.event_id, v_user)
  ON CONFLICT (table_id, user_id) DO UPDATE SET left_at = NULL;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION sit_at_coffee_table(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sit_at_coffee_table(UUID) TO authenticated;

-- ============================================================
-- 2. Shared notes
-- ============================================================

CREATE TABLE IF NOT EXISTS venue_room_notes (
  room_id UUID PRIMARY KEY REFERENCES venue_rooms(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 8000),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE venue_room_notes IS
  'One shared page of notes per venue room (215). Read by whoever may use the room; written through save_room_note()';

ALTER TABLE venue_room_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON venue_room_notes FROM anon, authenticated;
GRANT SELECT ON venue_room_notes TO authenticated;

-- The same door as the room's chat: open room, venue member, allowed in.
DROP POLICY IF EXISTS "Room members read its notes" ON venue_room_notes;
CREATE POLICY "Room members read its notes" ON venue_room_notes FOR SELECT
  USING (can_use_room_channel(auth.uid(), room_id));

-- Write the room's page. Last write wins: this is a scratch page for a few
-- people in one room, not a document with history.
CREATE OR REPLACE FUNCTION save_room_note(p_room_id UUID, p_body TEXT)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event UUID;
  v_at TIMESTAMPTZ := now();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT event_id INTO v_event FROM venue_rooms WHERE id = p_room_id;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;
  IF is_suspended(v_user)
     OR NOT can_use_room_channel(v_user, p_room_id)
     OR NOT EXISTS (
       SELECT 1 FROM event_venue_members m
       WHERE m.event_id = v_event AND m.user_id = v_user AND m.role <> 'spectator'
     ) THEN
    RAISE EXCEPTION 'you cannot write in this room' USING ERRCODE = '42501';
  END IF;
  IF char_length(coalesce(p_body, '')) > 8000 THEN
    RAISE EXCEPTION 'notes are limited to 8000 characters';
  END IF;

  INSERT INTO venue_room_notes (room_id, event_id, body, updated_by, updated_at)
  VALUES (p_room_id, v_event, coalesce(p_body, ''), v_user, v_at)
  ON CONFLICT (room_id) DO UPDATE
    SET body = EXCLUDED.body, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;
  RETURN v_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION save_room_note(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_room_note(UUID, TEXT) TO authenticated;

-- Live, so two people in the room see each other's edits.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'venue_room_notes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE venue_room_notes;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
