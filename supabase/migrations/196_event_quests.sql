-- Migration 196: Quest Board — side quests, claims and the team leaderboard
--
-- Engagement for a hackathon, kept apart from judging on purpose: the
-- leaderboard rewards finishing milestones and doing the side quests the
-- organisers set ("ship a README a stranger can follow", "help another
-- team"). It never reads judge scores, so a team that is behind on the
-- leaderboard is not being told it will lose.
--
--   event_quests        what organisers offer, with points
--   event_quest_claims  a team says it did one; an organiser approves or
--                       rejects. One claim per team per quest.
--   event_leaderboard() points per team: approved quests plus 10 per
--                       finished milestone (team_milestones, 194)
--
-- Needs 188 (teams), 190 (can_use_team) and 194 (team_milestones).
-- Idempotent. Re-running replaces event_leaderboard, which needs a DROP if
-- its return columns ever change.

CREATE TABLE IF NOT EXISTS event_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  points INT NOT NULL DEFAULT 20 CHECK (points BETWEEN 1 AND 500),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_quests_event ON event_quests(event_id, sort_order);

CREATE TABLE IF NOT EXISTS event_quest_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID NOT NULL REFERENCES event_quests(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  claimed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  evidence TEXT CHECK (evidence IS NULL OR char_length(evidence) <= 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quest_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_event_quest_claims_event ON event_quest_claims(event_id, status);

ALTER TABLE event_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_quest_claims ENABLE ROW LEVEL SECURITY;

-- Everyone in the venue sees the quests and who claimed what: a quest board
-- is a public notice board. Writes go through the functions below.
DROP POLICY IF EXISTS "Venue sees quests" ON event_quests;
CREATE POLICY "Venue sees quests" ON event_quests FOR SELECT
  USING (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id));

DROP POLICY IF EXISTS "Venue sees quest claims" ON event_quest_claims;
CREATE POLICY "Venue sees quest claims" ON event_quest_claims FOR SELECT
  USING (is_venue_member(auth.uid(), event_id) OR is_venue_host(auth.uid(), event_id));

-- ============================================================
-- Organisers: add, change, retire quests
-- ============================================================

CREATE OR REPLACE FUNCTION save_event_quest(
  p_event_id UUID,
  p_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_points INT,
  p_active BOOLEAN DEFAULT TRUE
) RETURNS event_quests AS $$
DECLARE
  v_row event_quests;
BEGIN
  IF NOT is_venue_host(auth.uid(), p_event_id) THEN
    RAISE EXCEPTION 'only organisers can set quests';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO event_quests (event_id, title, description, points, is_active, sort_order, created_by)
    VALUES (
      p_event_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_points, coalesce(p_active, TRUE),
      coalesce((SELECT max(sort_order) + 10 FROM event_quests WHERE event_id = p_event_id), 10),
      auth.uid()
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE event_quests
    SET title = btrim(p_title),
        description = nullif(btrim(coalesce(p_description, '')), ''),
        points = p_points,
        is_active = coalesce(p_active, is_active)
    WHERE id = p_id AND event_id = p_event_id
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'quest not found';
    END IF;
  END IF;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Teams claim; organisers decide
-- ============================================================

CREATE OR REPLACE FUNCTION claim_event_quest(p_quest_id UUID, p_evidence TEXT DEFAULT NULL)
RETURNS event_quest_claims AS $$
DECLARE
  v_user UUID := auth.uid();
  v_quest event_quests;
  v_team UUID;
  v_row event_quest_claims;
BEGIN
  IF v_user IS NULL OR is_suspended(v_user) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT * INTO v_quest FROM event_quests WHERE id = p_quest_id;
  IF v_quest.id IS NULL OR NOT v_quest.is_active THEN
    RAISE EXCEPTION 'this quest is not open';
  END IF;
  SELECT team_id INTO v_team FROM event_team_members
  WHERE event_id = v_quest.event_id AND user_id = v_user;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'join a team to claim quests';
  END IF;

  -- A rejected claim can be tried again with better evidence.
  INSERT INTO event_quest_claims (quest_id, team_id, event_id, claimed_by, evidence)
  VALUES (p_quest_id, v_team, v_quest.event_id, v_user, nullif(btrim(coalesce(p_evidence, '')), ''))
  ON CONFLICT (quest_id, team_id) DO UPDATE
    SET evidence = EXCLUDED.evidence, claimed_by = EXCLUDED.claimed_by,
        status = 'pending', decided_by = NULL, decided_at = NULL, created_at = now()
    WHERE event_quest_claims.status = 'rejected'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'your team has already claimed this quest';
  END IF;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION decide_quest_claim(p_claim_id UUID, p_approve BOOLEAN)
RETURNS event_quest_claims AS $$
DECLARE
  v_row event_quest_claims;
BEGIN
  SELECT * INTO v_row FROM event_quest_claims WHERE id = p_claim_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'claim not found';
  END IF;
  IF NOT is_venue_host(auth.uid(), v_row.event_id) THEN
    RAISE EXCEPTION 'only organisers can approve quests';
  END IF;
  UPDATE event_quest_claims
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      decided_by = auth.uid(), decided_at = now()
  WHERE id = p_claim_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- The leaderboard
-- ============================================================

DROP FUNCTION IF EXISTS event_leaderboard(UUID);
CREATE OR REPLACE FUNCTION event_leaderboard(p_event_id UUID)
RETURNS TABLE (team_id UUID, team_name TEXT, quest_points INT, milestone_points INT) AS $$
BEGIN
  IF NOT (is_venue_member(auth.uid(), p_event_id) OR is_venue_host(auth.uid(), p_event_id)) THEN
    RAISE EXCEPTION 'join the venue to see the leaderboard';
  END IF;
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    coalesce((
      SELECT sum(q.points)::INT FROM event_quest_claims c
      JOIN event_quests q ON q.id = c.quest_id
      WHERE c.team_id = t.id AND c.status = 'approved'
    ), 0) AS quest_points,
    coalesce((
      SELECT (count(*) * 10)::INT FROM team_milestones m
      WHERE m.team_id = t.id AND m.done_at IS NOT NULL
    ), 0) AS milestone_points
  FROM event_teams t
  WHERE t.event_id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION event_leaderboard(UUID) IS
  'Team points from approved quests and finished milestones. Never reads judge scores. The client sums and ranks';

REVOKE ALL ON FUNCTION save_event_quest(UUID, UUID, TEXT, TEXT, INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_event_quest(UUID, UUID, TEXT, TEXT, INT, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION claim_event_quest(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_event_quest(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION decide_quest_claim(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decide_quest_claim(UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION event_leaderboard(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION event_leaderboard(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
