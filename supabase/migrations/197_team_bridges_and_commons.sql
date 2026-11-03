-- Migration 197: Cross-team bridges and the Collab Commons board
--
-- A Homebase is private to its team (190). Teams still need to work together:
-- compare data, pair on a bug, borrow an expert. Two ways in:
--
--   event_team_bridges  one team asks to join another team's Homebase for a
--                       set time. The host team accepts or declines. While
--                       the bridge is open and unexpired, the guests may
--                       enter that Homebase, join its call and read and post
--                       in its chat. They never get the workspace (board,
--                       whiteboard, docs, files): can_use_team() is not
--                       widened, only can_access_venue_room() is.
--   event_commons_notes the Collab Commons board: short public notes under
--                       Offers, Needs and Shared data, each signed by a team.
--
-- The bridge check lives in can_access_venue_room(), the one helper 190 put
-- behind the door, the call token, the room channel and the room chat, so a
-- bridge opens all four together and expiry closes all four together.
--
-- Needs 188 and 190. Idempotent.

-- ============================================================
-- 1. Bridges
-- ============================================================

CREATE TABLE IF NOT EXISTS event_team_bridges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  from_team_id UUID NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  to_team_id UUID NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  message TEXT CHECK (message IS NULL OR char_length(message) <= 300),
  minutes INT NOT NULL DEFAULT 30 CHECK (minutes IN (15, 30, 60, 120)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'declined', 'ended')),
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_team_id <> to_team_id)
);
CREATE INDEX IF NOT EXISTS idx_bridges_to ON event_team_bridges(to_team_id, status);
CREATE INDEX IF NOT EXISTS idx_bridges_from ON event_team_bridges(from_team_id, status);
-- One live request or bridge per direction at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bridges_live
  ON event_team_bridges(from_team_id, to_team_id) WHERE status IN ('pending', 'open');

ALTER TABLE event_team_bridges ENABLE ROW LEVEL SECURITY;

-- Both teams and the hosts see a bridge. Writes go through the functions.
DROP POLICY IF EXISTS "Bridged teams see their bridges" ON event_team_bridges;
CREATE POLICY "Bridged teams see their bridges" ON event_team_bridges FOR SELECT
  USING (
    is_event_team_member(auth.uid(), from_team_id)
    OR is_event_team_member(auth.uid(), to_team_id)
    OR is_venue_host(auth.uid(), event_id)
  );

CREATE OR REPLACE FUNCTION request_team_bridge(p_to_team UUID, p_minutes INT, p_message TEXT DEFAULT NULL)
RETURNS event_team_bridges AS $$
DECLARE
  v_user UUID := auth.uid();
  v_to event_teams;
  v_from UUID;
  v_row event_team_bridges;
BEGIN
  IF v_user IS NULL OR is_suspended(v_user) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT * INTO v_to FROM event_teams WHERE id = p_to_team;
  IF v_to.id IS NULL THEN
    RAISE EXCEPTION 'team not found';
  END IF;
  SELECT team_id INTO v_from FROM event_team_members WHERE event_id = v_to.event_id AND user_id = v_user;
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'join a team before asking for a bridge';
  END IF;
  IF v_from = p_to_team THEN
    RAISE EXCEPTION 'that is your own team';
  END IF;
  INSERT INTO event_team_bridges (event_id, from_team_id, to_team_id, message, minutes, requested_by)
  VALUES (v_to.event_id, v_from, p_to_team, nullif(btrim(coalesce(p_message, '')), ''), coalesce(p_minutes, 30), v_user)
  RETURNING * INTO v_row;
  RETURN v_row;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'your team already has a request or bridge with this team';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION respond_team_bridge(p_bridge_id UUID, p_accept BOOLEAN)
RETURNS event_team_bridges AS $$
DECLARE
  v_row event_team_bridges;
BEGIN
  SELECT * INTO v_row FROM event_team_bridges WHERE id = p_bridge_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'request not found';
  END IF;
  IF NOT (is_event_team_member(auth.uid(), v_row.to_team_id) OR is_venue_host(auth.uid(), v_row.event_id)) THEN
    RAISE EXCEPTION 'only the team being asked can answer';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'this request has already been answered';
  END IF;
  UPDATE event_team_bridges
  SET status = CASE WHEN p_accept THEN 'open' ELSE 'declined' END,
      decided_by = auth.uid(),
      opened_at = CASE WHEN p_accept THEN now() END,
      expires_at = CASE WHEN p_accept THEN now() + make_interval(mins => minutes) END
  WHERE id = p_bridge_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Either team (or a host) can close a bridge early, or withdraw a request.
CREATE OR REPLACE FUNCTION end_team_bridge(p_bridge_id UUID)
RETURNS event_team_bridges AS $$
DECLARE
  v_row event_team_bridges;
BEGIN
  SELECT * INTO v_row FROM event_team_bridges WHERE id = p_bridge_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'bridge not found';
  END IF;
  IF NOT (
    is_event_team_member(auth.uid(), v_row.to_team_id)
    OR is_event_team_member(auth.uid(), v_row.from_team_id)
    OR is_venue_host(auth.uid(), v_row.event_id)
  ) THEN
    RAISE EXCEPTION 'not your bridge';
  END IF;
  UPDATE event_team_bridges SET status = 'ended', expires_at = least(coalesce(expires_at, now()), now())
  WHERE id = p_bridge_id AND status IN ('pending', 'open')
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. The door: 190's rule plus open bridges
-- ============================================================

CREATE OR REPLACE FUNCTION can_access_venue_room(p_user UUID, p_room_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM venue_rooms r
    WHERE r.id = p_room_id
      AND (
        r.kind <> 'team'
        OR is_venue_host(p_user, r.event_id)
        OR NOT EXISTS (SELECT 1 FROM event_teams t WHERE t.homebase_room_id = r.id)
        OR EXISTS (
          SELECT 1 FROM event_teams t
          JOIN event_team_members m ON m.team_id = t.id
          WHERE t.homebase_room_id = r.id AND m.user_id = p_user
        )
        -- A guest over an open, unexpired bridge.
        OR EXISTS (
          SELECT 1 FROM event_teams t
          JOIN event_team_bridges b ON b.to_team_id = t.id
          JOIN event_team_members m ON m.team_id = b.from_team_id
          WHERE t.homebase_room_id = r.id
            AND m.user_id = p_user
            AND b.status = 'open'
            AND b.expires_at > now()
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- 3. Collab Commons notes
-- ============================================================

CREATE TABLE IF NOT EXISTS event_commons_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id UUID REFERENCES event_teams(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  column_key TEXT NOT NULL CHECK (column_key IN ('offers', 'needs', 'data')),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 2 AND 280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commons_event ON event_commons_notes(event_id, created_at DESC);

ALTER TABLE event_commons_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue reads the commons" ON event_commons_notes;
CREATE POLICY "Venue reads the commons" ON event_commons_notes FOR SELECT
  USING (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id));

-- Post as yourself, for your own team (or for no team), never for another.
DROP POLICY IF EXISTS "Members post to the commons" ON event_commons_notes;
CREATE POLICY "Members post to the commons" ON event_commons_notes FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND NOT is_suspended(auth.uid())
    AND is_venue_member(auth.uid(), event_id)
    AND (team_id IS NULL OR is_event_team_member(auth.uid(), team_id))
  );

DROP POLICY IF EXISTS "Authors and hosts remove notes" ON event_commons_notes;
CREATE POLICY "Authors and hosts remove notes" ON event_commons_notes FOR DELETE
  USING (author_id = auth.uid() OR is_venue_host(auth.uid(), event_id));

-- ============================================================
-- 4. Grants
-- ============================================================

REVOKE ALL ON FUNCTION request_team_bridge(UUID, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_team_bridge(UUID, INT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION respond_team_bridge(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION respond_team_bridge(UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION end_team_bridge(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION end_team_bridge(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
