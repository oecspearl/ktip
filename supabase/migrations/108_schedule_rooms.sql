-- ============================================================
-- 108: a session happens in a room, not in a string
-- ============================================================
--
-- event_schedule.location has been free text since 010 ("Main Hall", "Room A").
-- For an in-person event that is right — the location is a place in a building
-- nothing here knows about. For an event with a drawn venue (089) it is a
-- second, unchecked spelling of a room that already exists as a row: type
-- "Main Hall" with a lowercase h and the programme and the map quietly stop
-- agreeing, and nothing can link a session to the room its audience should
-- walk into.
--
-- So: an optional FK alongside the text, not instead of it.
--
--   - room_id NULL and location set   → an in-person event, unchanged.
--   - room_id set                     → a venued event; the room's own name is
--                                       the truth and the UI reads it from the
--                                       join rather than from location.
--
-- ON DELETE SET NULL rather than CASCADE: deleting a room must not delete the
-- session that was going to happen in it. The host is left with a session whose
-- room has gone, which is a thing to fix, not a thing to lose silently.
--
-- No RLS changes. event_schedule's policies from 010 are organizer-scoped for
-- writes and published-event-scoped for reads; adding a column does not change
-- who may touch a row. Reading the joined room is covered by venue_rooms' own
-- "Anyone can view rooms of non-draft events" from 070.
--
-- Idempotent — safe to re-run.

-- ------------------------------------------------------------
-- 1. The column
-- ------------------------------------------------------------

ALTER TABLE event_schedule
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES venue_rooms(id) ON DELETE SET NULL;

COMMENT ON COLUMN event_schedule.room_id IS
  'The venue room this session runs in (089). Null for an event with no drawn venue, which uses the free-text location instead';

-- The programme of one event, in order, is the only way this is ever read;
-- the index on (event_id, start_time) from 010 already serves that. This one
-- exists for the other direction: "what is on in this room", which the room
-- page will ask, and for the ON DELETE SET NULL scan when a room is removed.
CREATE INDEX IF NOT EXISTS idx_event_schedule_room
  ON event_schedule(room_id) WHERE room_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. A session's room must belong to the same event
-- ------------------------------------------------------------
--
-- Nothing in the FK stops a host pointing a session at a room in somebody
-- else's venue: venue_rooms.id is a uuid like any other, and the organizer
-- policy on event_schedule only checks the row's own event_id. The rooms of a
-- published event are world-readable, so the id is not even hard to come by.
--
-- A trigger rather than a CHECK because the rule spans two tables.

CREATE OR REPLACE FUNCTION guard_schedule_room_event()
RETURNS TRIGGER AS $$
DECLARE
  v_room_event UUID;
BEGIN
  IF NEW.room_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT event_id INTO v_room_event FROM venue_rooms WHERE id = NEW.room_id;

  IF v_room_event IS NULL OR v_room_event <> NEW.event_id THEN
    RAISE EXCEPTION 'that room belongs to a different event';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS guard_schedule_room_event_trigger ON event_schedule;
CREATE TRIGGER guard_schedule_room_event_trigger
  BEFORE INSERT OR UPDATE OF room_id, event_id ON event_schedule
  FOR EACH ROW
  EXECUTE FUNCTION guard_schedule_room_event();

COMMENT ON FUNCTION guard_schedule_room_event() IS
  'A schedule item may only point at a room of its own event. The FK alone cannot say this';
