-- Migration 062: Event challenge brief
--
-- Some events (hackathons, demo days, innovation challenges) are not just
-- "show up" — attendees are given a goal to accomplish. The brief is a set of
-- objectives, constraints, deliverables and judging criteria.
--
-- These live as typed ROWS, not as a JSONB blob in events.details, because a
-- later phase attaches submissions and judge scores to individual criteria
-- ("this entry met objective 2", "judge scored 8/10 on criterion 3"). Nothing
-- can reference an item inside a JSONB array.
--
-- One table for all four kinds: same shape, same editor, one enum column.

-- ============================================================
-- 1. Flag + deadline on events
-- ============================================================

-- No new event_type: a hackathon may or may not run a formal challenge, and a
-- workshop may. The flag is what turns the brief on, not the type.
ALTER TABLE events ADD COLUMN IF NOT EXISTS has_challenge BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS submission_deadline TIMESTAMPTZ;

COMMENT ON COLUMN events.has_challenge IS 'Event sets a goal attendees must accomplish; enables the challenge brief';
COMMENT ON COLUMN events.submission_deadline IS 'When entries close; independent of end_date (judging may run past it)';

-- ============================================================
-- 2. The brief
-- ============================================================

CREATE TABLE IF NOT EXISTS event_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('objective', 'constraint', 'deliverable', 'judging_criterion')),
  title TEXT NOT NULL,
  description TEXT,
  -- objective/constraint/deliverable: must an entry satisfy this to qualify?
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  -- judging_criterion only: relative share of the total score.
  weight NUMERIC(5,2) CHECK (weight IS NULL OR weight >= 0),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_criteria_event ON event_criteria(event_id, kind, sort_order);

COMMENT ON TABLE event_criteria IS 'Challenge brief for an event: objectives, constraints, deliverables and judging criteria';
COMMENT ON COLUMN event_criteria.is_required IS 'Hard rule vs guidance; ignored for judging_criterion';
COMMENT ON COLUMN event_criteria.weight IS 'Judging criteria only — relative weight, normalised at scoring time';

-- ============================================================
-- 3. RLS — same shape as event_page_sections / event_speakers
-- ============================================================

ALTER TABLE event_criteria ENABLE ROW LEVEL SECURITY;

-- Non-draft, not just published: the brief stays readable after an event
-- completes, so past winners' entries still make sense.
DROP POLICY IF EXISTS "Anyone can view criteria of non-draft events" ON event_criteria;
CREATE POLICY "Anyone can view criteria of non-draft events"
  ON event_criteria FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_criteria.event_id
        AND events.status <> 'draft'
    )
  );

DROP POLICY IF EXISTS "Organizers can manage their event criteria" ON event_criteria;
CREATE POLICY "Organizers can manage their event criteria"
  ON event_criteria FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_criteria.event_id
        AND events.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "OECS admins can manage all event criteria" ON event_criteria;
CREATE POLICY "OECS admins can manage all event criteria"
  ON event_criteria FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND 'oecs' = ANY(profiles.roles)
    )
  );

-- ============================================================
-- 4. updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION touch_event_criteria()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_event_criteria_trigger ON event_criteria;
CREATE TRIGGER touch_event_criteria_trigger
  BEFORE UPDATE ON event_criteria
  FOR EACH ROW
  EXECUTE FUNCTION touch_event_criteria();

NOTIFY pgrst, 'reload schema';
