-- ============================================================
-- 092 — the fields an event type actually needs
--
-- Every event type shared one field set, so the create form asked a
-- hackathon and a meetup exactly the same questions. Three of the
-- answers had nowhere to live:
--
--   registration_closes_at  when sign-ups shut, which is almost never
--                           the same moment the event starts
--   team_size_min/max       hackathons, demo days and challenges are
--                           entered by teams, not by people
--
-- Nullable and unconstrained by type on purpose: which types collect
-- which field is a product decision that belongs in
-- src/lib/event-blueprints.ts, not in a CHECK that needs a migration
-- every time the form changes.
--
-- 091 is used twice already (091_account_age, 091_venue_room_sections),
-- hence 092.
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS team_size_min INT,
  ADD COLUMN IF NOT EXISTS team_size_max INT;

-- Added separately from the columns so re-running the migration on a
-- database that already has them still installs the constraints.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_team_size_min_positive'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_team_size_min_positive
      CHECK (team_size_min IS NULL OR team_size_min > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_team_size_range'
  ) THEN
    -- A max on its own is fine ("up to 5"); a max below the min is not.
    ALTER TABLE events ADD CONSTRAINT events_team_size_range
      CHECK (
        team_size_max IS NULL
        OR (team_size_max > 0 AND (team_size_min IS NULL OR team_size_max >= team_size_min))
      );
  END IF;
END $$;

COMMENT ON COLUMN events.registration_closes_at IS
  'When RSVPs stop being accepted. NULL means open until the event starts. Enforced by check_event_capacity().';
COMMENT ON COLUMN events.team_size_min IS
  'Smallest team that may enter. NULL means the event is not team-based.';
COMMENT ON COLUMN events.team_size_max IS
  'Largest team that may enter. NULL means no upper bound.';

-- ------------------------------------------------------------
-- The deadline has to bite, or it is decoration
--
-- 002 already refuses an RSVP to a full event. Same trigger, one more
-- reason to say no. Kept in check_event_capacity() rather than a second
-- trigger so the two refusals cannot fire in an undefined order and
-- report the wrong cause.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_event_capacity()
RETURNS TRIGGER AS $$
DECLARE
  v_closes TIMESTAMPTZ;
BEGIN
  SELECT registration_closes_at INTO v_closes FROM events WHERE id = NEW.event_id;

  IF v_closes IS NOT NULL AND NOW() > v_closes THEN
    RAISE EXCEPTION 'Registration for this event has closed';
  END IF;

  IF is_event_full(NEW.event_id) THEN
    RAISE EXCEPTION 'Event is full';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger itself is unchanged from 002; re-declared so a database
-- that somehow lost it comes back consistent.
DROP TRIGGER IF EXISTS check_event_capacity_trigger ON event_rsvps;
CREATE TRIGGER check_event_capacity_trigger
  BEFORE INSERT ON event_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION check_event_capacity();
