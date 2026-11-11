-- Migration 213: the stage's running order
-- ============================================================================
--
-- The Showcase Stage runs demos one after another. The room design shows the
-- running order with a mark on who is on now, and the Green Room tells the
-- next speaker how long they have and sends them to the stage.
--
--   venue_stage_lineup   one slot on one stage: who, what, when, and whether
--                        it is still to come, on now, or done
--
-- Everyone in the venue reads it. Organisers write it; set_lineup_live() moves
-- the stage on, so "on now" is one row and everything before it is done.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS venue_stage_lineup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES venue_rooms(id) ON DELETE CASCADE,
  position INT NOT NULL CHECK (position BETWEEN 1 AND 500),
  -- What is shown: a team and its project, or a talk.
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  detail TEXT CHECK (detail IS NULL OR char_length(detail) <= 120),
  team_id UUID REFERENCES event_teams(id) ON DELETE SET NULL,
  -- Who goes on, for a talk with no team.
  speaker_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  minutes INT NOT NULL DEFAULT 5 CHECK (minutes BETWEEN 1 AND 180),
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, position)
);

CREATE INDEX IF NOT EXISTS idx_venue_stage_lineup_event ON venue_stage_lineup(event_id, starts_at);

-- One slot on at a time, per stage.
CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_stage_lineup_live
  ON venue_stage_lineup(room_id) WHERE status = 'live';

ALTER TABLE venue_stage_lineup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue sees the lineup" ON venue_stage_lineup;
CREATE POLICY "Venue sees the lineup" ON venue_stage_lineup FOR SELECT
  USING (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id));

GRANT SELECT ON venue_stage_lineup TO authenticated;

CREATE OR REPLACE FUNCTION save_lineup_item(
  p_room_id UUID,
  p_id UUID,
  p_title TEXT,
  p_detail TEXT,
  p_team_id UUID,
  p_speaker_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_minutes INT
) RETURNS venue_stage_lineup AS $$
DECLARE
  v_room venue_rooms;
  v_row venue_stage_lineup;
BEGIN
  SELECT * INTO v_room FROM venue_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL OR NOT is_venue_host(auth.uid(), v_room.event_id) THEN
    RAISE EXCEPTION 'only organisers can set the running order' USING ERRCODE = '42501';
  END IF;
  IF p_team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM event_teams WHERE id = p_team_id AND event_id = v_room.event_id
  ) THEN
    RAISE EXCEPTION 'that team is not at this event';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO venue_stage_lineup (event_id, room_id, position, title, detail, team_id, speaker_id, starts_at, minutes)
    VALUES (
      v_room.event_id, p_room_id,
      coalesce((SELECT max(position) + 1 FROM venue_stage_lineup WHERE room_id = p_room_id), 1),
      btrim(p_title), nullif(btrim(coalesce(p_detail, '')), ''), p_team_id, p_speaker_id,
      p_starts_at, coalesce(p_minutes, 5)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE venue_stage_lineup
    SET title = btrim(p_title),
        detail = nullif(btrim(coalesce(p_detail, '')), ''),
        team_id = p_team_id,
        speaker_id = p_speaker_id,
        starts_at = p_starts_at,
        minutes = coalesce(p_minutes, minutes)
    WHERE id = p_id AND room_id = p_room_id
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'slot not found';
    END IF;
  END IF;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION remove_lineup_item(p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_item venue_stage_lineup;
BEGIN
  SELECT * INTO v_item FROM venue_stage_lineup WHERE id = p_id;
  IF v_item.id IS NULL OR NOT is_venue_host(auth.uid(), v_item.event_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM venue_stage_lineup WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Put one slot on. Every slot before it is done, every slot after it is still
-- to come. NULL takes the stage off air: nothing is live, nothing is undone.
CREATE OR REPLACE FUNCTION set_lineup_live(p_room_id UUID, p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_room venue_rooms;
  v_pos INT;
BEGIN
  SELECT * INTO v_room FROM venue_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL OR NOT is_venue_host(auth.uid(), v_room.event_id) THEN
    RAISE EXCEPTION 'only organisers can run the stage' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    UPDATE venue_stage_lineup SET status = 'done' WHERE room_id = p_room_id AND status = 'live';
    RETURN;
  END IF;
  SELECT position INTO v_pos FROM venue_stage_lineup WHERE id = p_id AND room_id = p_room_id;
  IF v_pos IS NULL THEN
    RAISE EXCEPTION 'slot not found';
  END IF;
  -- Clear the live one first, or the unique index refuses the new one.
  UPDATE venue_stage_lineup SET status = 'done' WHERE room_id = p_room_id AND status = 'live';
  UPDATE venue_stage_lineup
  SET status = CASE WHEN position < v_pos THEN 'done' WHEN position = v_pos THEN 'live' ELSE 'upcoming' END
  WHERE room_id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION save_lineup_item(UUID, UUID, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION remove_lineup_item(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION set_lineup_live(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_lineup_item(UUID, UUID, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_lineup_item(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_lineup_live(UUID, UUID) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'venue_stage_lineup') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE venue_stage_lineup;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
