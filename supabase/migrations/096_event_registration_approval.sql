-- ============================================================
-- Migration 096: registering for an event is a request, not an entitlement
--
-- Until now a registration was self-granting. event_rsvps.status defaulted to
-- 'confirmed' (007), the INSERT policy from 002 let anyone write their own row,
-- and nothing told the organizer it had happened. Someone could register for
-- your hackathon and be inside the venue before you knew they existed.
--
-- Three changes, all on the same row:
--
--   1. status defaults to 'pending' and the INSERT policy pins it there, so a
--      client cannot post 'confirmed' straight from the console. Deciding goes
--      through decide_event_registration(), which is the only path that can
--      turn a pending row into a seat.
--   2. attendance_type says whether the registrant is competing or watching.
--      join_venue() used to derive this ("the caller never says what role it
--      wants; this decides"); now it reads it. A viewer becomes a spectator.
--   3. the two new notification types are filed under the events preference
--      category, so muting event notifications actually mutes these.
--
-- Existing rows keep the status they already have — the default only affects
-- new inserts, so every past registration stays confirmed.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. Columns
-- ============================================================

ALTER TABLE event_rsvps ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE event_rsvps DROP CONSTRAINT IF EXISTS event_rsvps_status_check;
ALTER TABLE event_rsvps ADD CONSTRAINT event_rsvps_status_check
  CHECK (status IN ('pending', 'confirmed', 'waitlisted', 'cancelled', 'checked_in', 'declined'));

ALTER TABLE event_rsvps
  ADD COLUMN IF NOT EXISTS attendance_type TEXT NOT NULL DEFAULT 'participant';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_rsvps_attendance_type_check') THEN
    ALTER TABLE event_rsvps ADD CONSTRAINT event_rsvps_attendance_type_check
      CHECK (attendance_type IN ('participant', 'viewer'));
  END IF;
END $$;

-- Who decided, and when. Same audit pair as project_join_requests (079).
ALTER TABLE event_rsvps
  ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE event_rsvps
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

COMMENT ON COLUMN event_rsvps.status IS 'pending until the organizer decides. declined is terminal; the registrant may delete the row and ask again';
COMMENT ON COLUMN event_rsvps.attendance_type IS 'participant competes and takes a capacity seat; viewer watches and becomes a venue spectator';

-- The inbox query is "every pending registration on an event I organize", so
-- the useful index is by status and recency.
CREATE INDEX IF NOT EXISTS idx_event_rsvps_pending
  ON event_rsvps(event_id, created_at DESC) WHERE status = 'pending';

-- ============================================================
-- 2. INSERT policy — the gate the whole feature rests on
--
-- WITH CHECK is the only thing standing between a hand-written supabase-js
-- call and a self-granted seat. It has to pin both status and attendance_type;
-- checking status alone would let someone register as a viewer and then be
-- read back as a participant.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can RSVP to events" ON event_rsvps;
DROP POLICY IF EXISTS "Authenticated users can request registration" ON event_rsvps;
CREATE POLICY "Authenticated users can request registration"
  ON event_rsvps FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND attendance_type IN ('participant', 'viewer')
    -- Unchanged from 002: the organizer does not register for their own event.
    AND NOT EXISTS (
      SELECT 1 FROM events
      WHERE id = event_id
      AND organizer_id = auth.uid()
    )
    -- New: a draft is not open yet and a cancelled event is not open any more.
    AND EXISTS (
      SELECT 1 FROM events
      WHERE id = event_id
      AND status = 'published'
    )
  );

-- ============================================================
-- 3. Capacity counts participants, not viewers
--
-- capacityLabel for a hackathon is "Participant cap" (event-blueprints.ts), so
-- a room full of spectators must not lock out the people building. Both of
-- these were last written in 007; the only change is the attendance_type line.
-- ============================================================

CREATE OR REPLACE FUNCTION is_event_full(event_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  event_capacity INTEGER;
  rsvp_count INTEGER;
BEGIN
  SELECT capacity INTO event_capacity FROM events WHERE id = event_uuid;

  IF event_capacity IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*) INTO rsvp_count
  FROM event_rsvps
  WHERE event_id = event_uuid
  AND status IN ('confirmed', 'checked_in')
  AND attendance_type = 'participant';

  RETURN rsvp_count >= event_capacity;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_event_rsvp_count(event_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM event_rsvps
  WHERE event_id = event_uuid
  AND status IN ('confirmed', 'checked_in')
  AND attendance_type = 'participant';
$$ LANGUAGE SQL STABLE;

-- The BEFORE INSERT capacity trigger from 002 now guards nothing useful: a
-- pending row takes no seat, so an insert can never fill an event. The seat is
-- taken at approval, and that check lives in decide_event_registration below.
-- Left in place — it is harmless, and it still catches a service-role insert
-- that writes 'confirmed' directly.

-- ============================================================
-- 4. Deciding
--
-- SECURITY DEFINER for the same reason as decide_project_join_request (079):
-- the status change and the capacity re-check have to happen together, and the
-- caller must not be able to do one without the other. The organizer/admin
-- UPDATE policy from 007 stays, so a host can still force a status by hand.
-- ============================================================

CREATE OR REPLACE FUNCTION decide_event_registration(
  p_rsvp_id UUID,
  p_approve BOOLEAN
)
RETURNS event_rsvps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rsvp event_rsvps;
BEGIN
  SELECT * INTO v_rsvp FROM event_rsvps WHERE id = p_rsvp_id;

  IF v_rsvp.id IS NULL THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  -- is_venue_host (070) is organizer-or-platform-admin, which is exactly the
  -- set of people the Registrations tab is already open to.
  IF NOT is_venue_host(auth.uid(), v_rsvp.event_id) THEN
    RAISE EXCEPTION 'Only the organizer can decide registrations';
  END IF;

  IF v_rsvp.status <> 'pending' THEN
    RAISE EXCEPTION 'This registration has already been decided';
  END IF;

  -- Approval is where the seat is actually taken, so this is where the cap is
  -- enforced. Viewers never consume one.
  IF p_approve
     AND v_rsvp.attendance_type = 'participant'
     AND is_event_full(v_rsvp.event_id) THEN
    RAISE EXCEPTION 'The participant cap is full — raise the capacity first';
  END IF;

  UPDATE event_rsvps
  SET status = CASE WHEN p_approve THEN 'confirmed' ELSE 'declined' END,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = p_rsvp_id
  RETURNING * INTO v_rsvp;

  RETURN v_rsvp;
END;
$$;

REVOKE ALL ON FUNCTION decide_event_registration(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decide_event_registration(UUID, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION decide_event_registration(UUID, BOOLEAN) IS 'Organizer approves or declines a pending registration. The only path that turns pending into confirmed, and the only place the participant cap is checked';

-- ============================================================
-- 5. join_venue reads the registration instead of guessing
--
-- Replaces the version in 070. Two changes: a viewer registration now yields
-- 'spectator' rather than 'participant', and a pending registration is turned
-- away with a message that says what it is waiting on — previously it read
-- "register for this event to enter the venue", which is wrong and unhelpful
-- when you have already registered.
-- ============================================================

CREATE OR REPLACE FUNCTION join_venue(p_event_id UUID)
RETURNS event_venue_members AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event events;
  v_rsvp event_rsvps;
  v_role TEXT;
  v_row event_venue_members;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'event not found';
  END IF;
  IF NOT v_event.has_venue THEN
    RAISE EXCEPTION 'this event has no venue';
  END IF;

  -- Already in. Idempotent by design: the client calls this on every entry.
  SELECT * INTO v_row FROM event_venue_members
  WHERE event_id = p_event_id AND user_id = v_user;
  IF v_row.id IS NOT NULL THEN
    UPDATE event_venue_members SET last_seen_at = now()
    WHERE id = v_row.id RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  SELECT * INTO v_rsvp FROM event_rsvps
  WHERE event_id = p_event_id AND user_id = v_user;

  IF is_venue_host(v_user, p_event_id) THEN
    v_role := 'organizer';
  ELSIF v_rsvp.id IS NOT NULL AND v_rsvp.status = 'pending' THEN
    RAISE EXCEPTION 'your registration is waiting on the organizer';
  ELSIF v_rsvp.id IS NOT NULL AND v_rsvp.status IN ('confirmed', 'checked_in') THEN
    v_role := CASE WHEN v_rsvp.attendance_type = 'viewer' THEN 'spectator' ELSE 'participant' END;
  ELSIF v_event.spectators_enabled AND v_event.spectator_scope = 'members' THEN
    v_role := 'spectator';
  ELSE
    RAISE EXCEPTION 'register for this event to enter the venue';
  END IF;

  -- Hosts bypass the window; a host has to be able to set the room up early.
  IF v_role <> 'organizer' THEN
    IF v_event.venue_opens_at IS NOT NULL AND now() < v_event.venue_opens_at THEN
      RAISE EXCEPTION 'the venue has not opened yet';
    END IF;
    IF v_event.venue_closes_at IS NOT NULL AND now() > v_event.venue_closes_at THEN
      RAISE EXCEPTION 'the venue has closed';
    END IF;
  END IF;

  INSERT INTO event_venue_members (event_id, user_id, role, availability)
  VALUES (p_event_id, v_user, v_role, CASE WHEN v_role = 'spectator' THEN 'away' ELSE 'working' END)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 6. File the new notification types under the events category
--
-- Replaces the version in 036. Without this they fall through to ELSE TRUE and
-- a user who turned event notifications off would still be told.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  category_enabled BOOLEAN;
BEGIN
  SELECT CASE
    WHEN NEW.type IN ('video_invite', 'whiteboard_share', 'document_share') THEN collaboration
    WHEN NEW.type IN ('project_invite', 'project_update', 'project_follow') THEN projects
    WHEN NEW.type IN ('connection_request', 'connection_accepted') THEN connections
    WHEN NEW.type IN ('message') THEN messages
    WHEN NEW.type IN (
      'event_reminder', 'event_update',
      'event_registration_request', 'event_registration_result'
    ) THEN events
    WHEN NEW.type IN ('forum_reply') THEN forums
    ELSE TRUE
  END
  INTO category_enabled
  FROM notification_preferences
  WHERE user_id = NEW.user_id;

  IF category_enabled = FALSE THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
