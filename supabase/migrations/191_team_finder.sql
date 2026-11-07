-- Migration 191: Team Finder (openings, applications, invitations)
--
-- 188 made teams and said "applications, invites and openings are a later
-- migration". This is that migration. Two tables, and the functions that are
-- the only way to write them:
--
--   1. event_team_openings  a gap a team wants filled ("UI designer"), with
--                           optional skills. Captains post and close them.
--   2. event_team_requests  one person and one team, in one of two directions:
--                             apply   the person asks to join the team
--                             invite  a team member asks the person to join
--                           pending, then accepted, declined or withdrawn.
--
-- WHO ANSWERS
-- -----------
-- The side that did not send it. An application is answered by any member of
-- the team; an invitation by the person invited. The sender may withdraw. An
-- invitation belongs to the team rather than to whoever clicked, so any member
-- may withdraw one: a teammate who leaves does not strand it.
--
-- WHO MAY JOIN
-- ------------
-- A venue member who is not a spectator or a judge, is not suspended, and is
-- not already on a team in the event. Judges are kept out because they score
-- the teams. An invitation also needs the invitee to have said they are
-- discoverable and looking for a team (event_venue_members, 070): nobody is
-- invited who asked not to be found.
--
-- WHY A TRIGGER WITHDRAWS
-- -----------------------
-- Accepting one request has to cancel that person's other pending requests in
-- the event. So does forming a team with create_event_team (188). Doing it in
-- an AFTER INSERT trigger on event_team_members covers both paths, and any
-- later one, without each function having to remember. The same trigger
-- clears looking_for_team, so a person with a team leaves the "looking" list.
--
-- Size and "one team per person per event" are checked under a row lock on the
-- team, and the unique (event_id, user_id) on event_team_members (188) is the
-- backstop if two teams accept the same person at once.
--
-- Needs 188 and 190. Idempotent: safe to re-run.

-- ============================================================
-- 1. Openings
-- ============================================================

CREATE TABLE IF NOT EXISTS event_team_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  -- Denormalised so the finder reads one event's openings with one filter.
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 80),
  skills TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(skills) <= 8),
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_event_team_openings_event ON event_team_openings(event_id) WHERE is_open;
CREATE INDEX IF NOT EXISTS idx_event_team_openings_team ON event_team_openings(team_id);

ALTER TABLE event_team_openings ENABLE ROW LEVEL SECURITY;

-- Openings are adverts: everyone in the venue sees them, like the teams.
DROP POLICY IF EXISTS "Venue members can see openings" ON event_team_openings;
CREATE POLICY "Venue members can see openings"
  ON event_team_openings FOR SELECT
  USING (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id));

COMMENT ON TABLE event_team_openings IS
  'Roles a hackathon team wants filled. Written by post_team_opening / close_team_opening only';

-- ============================================================
-- 2. Requests (applications and invitations)
-- ============================================================

CREATE TABLE IF NOT EXISTS event_team_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- The person who would join, whichever direction the request runs.
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('apply', 'invite')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  message TEXT CHECK (message IS NULL OR char_length(message) <= 500),
  opening_id UUID REFERENCES event_team_openings(id) ON DELETE SET NULL,
  -- The applicant for an application, the inviting member for an invitation.
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  responded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

-- One open conversation per (team, person). Answered ones stay as history.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_team_requests_pending
  ON event_team_requests(team_id, user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_event_team_requests_user
  ON event_team_requests(event_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_event_team_requests_team
  ON event_team_requests(team_id, status);

ALTER TABLE event_team_requests ENABLE ROW LEVEL SECURITY;

-- A request is between one person and one team. Nobody else at the event
-- needs to know who applied where. Hosts see all of them, for moderation.
DROP POLICY IF EXISTS "People and teams can see their requests" ON event_team_requests;
CREATE POLICY "People and teams can see their requests"
  ON event_team_requests FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_event_team_member(auth.uid(), team_id)
    OR is_venue_host(auth.uid(), event_id)
  );

COMMENT ON TABLE event_team_requests IS
  'Applications (kind apply) and invitations (kind invite) to hackathon teams. Written through the team finder functions only';

-- ============================================================
-- 3. Helpers
-- ============================================================

-- May this person join a team in this event at all? Says nothing about
-- whether they already have one; callers check that with their own wording.
CREATE OR REPLACE FUNCTION can_join_event_team(p_user UUID, p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL AND NOT is_suspended(p_user) AND EXISTS (
    SELECT 1 FROM event_venue_members
    WHERE event_id = p_event_id AND user_id = p_user
      AND role NOT IN ('spectator', 'judge')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_event_team_captain(p_user UUID, p_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_team_members
    WHERE team_id = p_team_id AND user_id = p_user AND role = 'captain'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- 4. Joining a team withdraws everything else that was pending
-- ============================================================

CREATE OR REPLACE FUNCTION withdraw_requests_on_join()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE event_team_requests
  SET status = 'withdrawn', responded_at = now()
  WHERE event_id = NEW.event_id
    AND user_id = NEW.user_id
    AND status = 'pending';
  -- They have a team now, so they drop off the "looking" list.
  UPDATE event_venue_members
  SET looking_for_team = FALSE
  WHERE event_id = NEW.event_id AND user_id = NEW.user_id AND looking_for_team;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS event_team_members_withdraw_requests ON event_team_members;
CREATE TRIGGER event_team_members_withdraw_requests
  AFTER INSERT ON event_team_members
  FOR EACH ROW EXECUTE FUNCTION withdraw_requests_on_join();

-- ============================================================
-- 5. Openings: post and close
-- ============================================================

CREATE OR REPLACE FUNCTION post_team_opening(
  p_team_id UUID,
  p_title TEXT,
  p_skills TEXT[] DEFAULT NULL
)
RETURNS event_team_openings AS $$
DECLARE
  v_user UUID := auth.uid();
  v_team event_teams;
  v_skills TEXT[];
  v_row event_team_openings;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT * INTO v_team FROM event_teams WHERE id = p_team_id;
  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'team not found';
  END IF;
  IF NOT is_event_team_captain(v_user, p_team_id) THEN
    RAISE EXCEPTION 'only the captain can post an opening';
  END IF;
  IF char_length(btrim(coalesce(p_title, ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'an opening needs a title of 2 to 80 characters';
  END IF;
  IF (SELECT count(*) FROM event_team_openings WHERE team_id = p_team_id AND is_open) >= 10 THEN
    RAISE EXCEPTION 'a team may have at most 10 open openings';
  END IF;

  -- Trimmed, de-duplicated, blanks dropped, each at most 40 characters.
  SELECT coalesce(array_agg(DISTINCT s), '{}') INTO v_skills
  FROM (
    SELECT left(btrim(x), 40) AS s FROM unnest(coalesce(p_skills, '{}')) AS x
  ) q
  WHERE s <> '';
  IF cardinality(v_skills) > 8 THEN
    RAISE EXCEPTION 'an opening may list at most 8 skills';
  END IF;

  INSERT INTO event_team_openings (team_id, event_id, title, skills, created_by)
  VALUES (p_team_id, v_team.event_id, btrim(p_title), v_skills, v_user)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION close_team_opening(p_opening_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user UUID := auth.uid();
  v_opening event_team_openings;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT * INTO v_opening FROM event_team_openings WHERE id = p_opening_id;
  IF v_opening.id IS NULL THEN
    RAISE EXCEPTION 'opening not found';
  END IF;
  -- The captain, or a host tidying up.
  IF NOT is_event_team_captain(v_user, v_opening.team_id)
     AND NOT is_venue_host(v_user, v_opening.event_id) THEN
    RAISE EXCEPTION 'only the captain can close an opening';
  END IF;

  UPDATE event_team_openings
  SET is_open = FALSE, closed_at = now()
  WHERE id = p_opening_id AND is_open;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 6. Applying and inviting
-- ============================================================

CREATE OR REPLACE FUNCTION apply_to_team(
  p_team_id UUID,
  p_message TEXT DEFAULT NULL,
  p_opening_id UUID DEFAULT NULL
)
RETURNS event_team_requests AS $$
DECLARE
  v_user UUID := auth.uid();
  v_team event_teams;
  v_message TEXT := nullif(btrim(coalesce(p_message, '')), '');
  v_row event_team_requests;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT * INTO v_team FROM event_teams WHERE id = p_team_id;
  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'team not found';
  END IF;
  IF NOT can_join_event_team(v_user, v_team.event_id) THEN
    RAISE EXCEPTION 'you cannot join a team at this event';
  END IF;
  IF EXISTS (SELECT 1 FROM event_team_members WHERE event_id = v_team.event_id AND user_id = v_user) THEN
    RAISE EXCEPTION 'you are already on a team in this event';
  END IF;
  IF NOT v_team.is_discoverable THEN
    RAISE EXCEPTION 'this team is not taking applications';
  END IF;
  IF (SELECT count(*) FROM event_team_members WHERE team_id = p_team_id) >= v_team.max_size THEN
    RAISE EXCEPTION 'this team is full';
  END IF;
  IF char_length(coalesce(v_message, '')) > 500 THEN
    RAISE EXCEPTION 'keep the message under 500 characters';
  END IF;
  IF p_opening_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM event_team_openings WHERE id = p_opening_id AND team_id = p_team_id AND is_open
  ) THEN
    RAISE EXCEPTION 'that opening is closed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM event_team_requests
    WHERE team_id = p_team_id AND user_id = v_user AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'you already have a request open with this team';
  END IF;
  -- A spray of applications to every team is noise for every captain.
  IF (
    SELECT count(*) FROM event_team_requests
    WHERE event_id = v_team.event_id AND user_id = v_user AND kind = 'apply' AND status = 'pending'
  ) >= 5 THEN
    RAISE EXCEPTION 'you have 5 applications waiting. Withdraw one first';
  END IF;

  INSERT INTO event_team_requests (team_id, event_id, user_id, kind, message, opening_id, created_by)
  VALUES (p_team_id, v_team.event_id, v_user, 'apply', v_message, p_opening_id, v_user)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION invite_to_team(
  p_team_id UUID,
  p_user_id UUID,
  p_message TEXT DEFAULT NULL
)
RETURNS event_team_requests AS $$
DECLARE
  v_user UUID := auth.uid();
  v_team event_teams;
  v_message TEXT := nullif(btrim(coalesce(p_message, '')), '');
  v_row event_team_requests;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT * INTO v_team FROM event_teams WHERE id = p_team_id;
  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'team not found';
  END IF;
  IF NOT is_event_team_member(v_user, p_team_id) THEN
    RAISE EXCEPTION 'only members of the team can invite';
  END IF;
  IF p_user_id IS NULL OR p_user_id = v_user THEN
    RAISE EXCEPTION 'choose someone else to invite';
  END IF;
  IF NOT can_join_event_team(p_user_id, v_team.event_id) THEN
    RAISE EXCEPTION 'this person cannot join a team at this event';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM event_venue_members
    WHERE event_id = v_team.event_id AND user_id = p_user_id
      AND is_discoverable AND looking_for_team
  ) THEN
    RAISE EXCEPTION 'this person is not looking for a team';
  END IF;
  IF EXISTS (SELECT 1 FROM event_team_members WHERE event_id = v_team.event_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'this person is already on a team';
  END IF;
  IF (SELECT count(*) FROM event_team_members WHERE team_id = p_team_id) >= v_team.max_size THEN
    RAISE EXCEPTION 'your team is full';
  END IF;
  IF char_length(coalesce(v_message, '')) > 500 THEN
    RAISE EXCEPTION 'keep the message under 500 characters';
  END IF;
  IF EXISTS (
    SELECT 1 FROM event_team_requests
    WHERE team_id = p_team_id AND user_id = p_user_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'there is already a request open between your team and this person';
  END IF;
  IF (
    SELECT count(*) FROM event_team_requests
    WHERE team_id = p_team_id AND kind = 'invite' AND status = 'pending'
  ) >= 20 THEN
    RAISE EXCEPTION 'your team has 20 invitations waiting. Withdraw some first';
  END IF;

  INSERT INTO event_team_requests (team_id, event_id, user_id, kind, message, created_by)
  VALUES (p_team_id, v_team.event_id, p_user_id, 'invite', v_message, v_user)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 7. Answering and withdrawing
-- ============================================================

CREATE OR REPLACE FUNCTION respond_team_request(p_request_id UUID, p_accept BOOLEAN)
RETURNS event_team_requests AS $$
DECLARE
  v_user UUID := auth.uid();
  v_req event_team_requests;
  v_team event_teams;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT * INTO v_req FROM event_team_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'request not found';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'this request has already been answered';
  END IF;
  IF v_req.kind = 'apply' AND NOT is_event_team_member(v_user, v_req.team_id) THEN
    RAISE EXCEPTION 'only the team can answer an application';
  END IF;
  IF v_req.kind = 'invite' AND v_req.user_id <> v_user THEN
    RAISE EXCEPTION 'only the person invited can answer an invitation';
  END IF;

  IF NOT coalesce(p_accept, FALSE) THEN
    UPDATE event_team_requests
    SET status = 'declined', responded_by = v_user, responded_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_req;
    RETURN v_req;
  END IF;

  -- Lock the team so two acceptances cannot both see the last free seat.
  SELECT * INTO v_team FROM event_teams WHERE id = v_req.team_id FOR UPDATE;
  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'team not found';
  END IF;
  IF NOT can_join_event_team(v_req.user_id, v_req.event_id) THEN
    RAISE EXCEPTION 'this person cannot join a team at this event';
  END IF;
  IF EXISTS (
    SELECT 1 FROM event_team_members WHERE event_id = v_req.event_id AND user_id = v_req.user_id
  ) THEN
    RAISE EXCEPTION 'this person is already on a team';
  END IF;
  IF (SELECT count(*) FROM event_team_members WHERE team_id = v_team.id) >= v_team.max_size THEN
    RAISE EXCEPTION 'the team is full';
  END IF;

  -- Mark it accepted first: the join trigger then withdraws every other
  -- pending request for this person and leaves this one alone.
  UPDATE event_team_requests
  SET status = 'accepted', responded_by = v_user, responded_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_req;

  INSERT INTO event_team_members (team_id, event_id, user_id, role)
  VALUES (v_req.team_id, v_req.event_id, v_req.user_id, 'member');

  RETURN v_req;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION withdraw_team_request(p_request_id UUID)
RETURNS event_team_requests AS $$
DECLARE
  v_user UUID := auth.uid();
  v_req event_team_requests;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT * INTO v_req FROM event_team_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'request not found';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'this request has already been answered';
  END IF;
  -- An application is the applicant's. An invitation is the team's.
  IF (v_req.kind = 'apply' AND v_req.user_id <> v_user)
     OR (v_req.kind = 'invite' AND NOT is_event_team_member(v_user, v_req.team_id)) THEN
    RAISE EXCEPTION 'only the sender can withdraw this';
  END IF;

  UPDATE event_team_requests
  SET status = 'withdrawn', responded_by = v_user, responded_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_req;
  RETURN v_req;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 8. Grants
-- ============================================================

REVOKE ALL ON FUNCTION post_team_opening(UUID, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_team_opening(UUID, TEXT, TEXT[]) TO authenticated;
REVOKE ALL ON FUNCTION close_team_opening(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_team_opening(UUID) TO authenticated;
REVOKE ALL ON FUNCTION apply_to_team(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_to_team(UUID, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION invite_to_team(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION invite_to_team(UUID, UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION respond_team_request(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION respond_team_request(UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION withdraw_team_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION withdraw_team_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_join_event_team(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_event_team_captain(UUID, UUID) TO authenticated;
-- The trigger function is never called directly.
REVOKE ALL ON FUNCTION withdraw_requests_on_join() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 9. Verification (read-only)
-- ============================================================
--
--   -- Openings and requests for one event:
--   SELECT t.name, o.title, o.skills, o.is_open
--   FROM event_team_openings o JOIN event_teams t ON t.id = o.team_id
--   WHERE o.event_id = '<event id>';
--   SELECT t.name, r.kind, r.status, r.user_id, r.created_at
--   FROM event_team_requests r JOIN event_teams t ON t.id = r.team_id
--   WHERE r.event_id = '<event id>' ORDER BY r.created_at DESC;
--
--   -- Nobody should be on two teams in one event (expect zero rows):
--   SELECT event_id, user_id, count(*) FROM event_team_members
--   GROUP BY 1, 2 HAVING count(*) > 1;
--
--   -- No team should be over its size (expect zero rows):
--   SELECT t.id, t.max_size, count(m.*) FROM event_teams t
--   JOIN event_team_members m ON m.team_id = t.id
--   GROUP BY t.id, t.max_size HAVING count(m.*) > t.max_size;
--
--   -- Nobody on a team should still have a pending request (expect zero rows):
--   SELECT r.id FROM event_team_requests r
--   JOIN event_team_members m ON m.event_id = r.event_id AND m.user_id = r.user_id
--   WHERE r.status = 'pending';
--
--   -- As someone outside the team: SELECT respond_team_request('<application id>', TRUE);
--   -- must fail with "only the team can answer an application".
