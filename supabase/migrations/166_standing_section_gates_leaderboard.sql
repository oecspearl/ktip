-- ============================================================================
-- 166_standing_section_gates_leaderboard.sql — 'standing' reaches the board
-- ============================================================================
-- 162 gave every profile section its own audience, and 'standing' (level,
-- points, rank) is enforced on the profile through get_profile_stats(_batch).
-- Two other public read paths print the same figures and still answered to
-- their own older settings alone:
--
--   get_leaderboard()          name, points, badge count, level — granted to
--                              anon, filtered on leaderboard_visibility (066)
--   get_connection_count(s)()  the count the profile prints beside the
--                              level — granted to anon, gated on
--                              connection_count_visibility (049)
--
-- So a member who set Level & points to connections-only was still ranked in
-- public, and their count still came back to a stranger calling the RPC.
--
-- The rule now: a member whose 'standing' section is hidden from the caller
-- (profile_hidden_sections, 162) is left off the board and gets no count. The
-- older settings stay as a second restriction and the stricter one wins:
--
--   leaderboard off            nobody else sees you on the board, connections
--                              included — unchanged
--   count 'connections'/'private'  unchanged
--   standing private           strangers and signed-out callers lose both;
--                              connections, admins and the member keep them
--
-- Ranks close up per viewer: a hidden member is not a gap at their place,
-- which would say someone is there. get_my_leaderboard_rank() counts the same
-- population, so "You are #N" agrees with the board the member is looking at.
-- 'listed' keeps its 066 meaning — the leaderboard switch — because that is
-- the setting its "change" link leads to.
--
-- get_connection_count() and get_connection_counts() both go through
-- can_view_connection_count(), so restating that gate covers both; their
-- bodies are unchanged.
--
-- NOT covered: user_badges is readable by everyone (066), so points can still
-- be summed off the raw table — the profiles-table gap 083 and 162 document.
--
-- Idempotent — safe to re-run. Signatures and return types are unchanged, so
-- the client needs nothing to ship first.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The connection-count gate
-- ---------------------------------------------------------------------------
-- Restated from 049. The member sees their own count before anything else is
-- asked; 'private' still means nobody else, admins included, as it always has.
CREATE OR REPLACE FUNCTION can_view_connection_count(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visibility TEXT;
  v_viewer UUID := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  IF v_viewer = p_user_id THEN
    RETURN TRUE;
  END IF;

  SELECT connection_count_visibility INTO v_visibility
  FROM profiles WHERE id = p_user_id;

  IF v_visibility IS NULL OR v_visibility = 'private' THEN
    RETURN FALSE;
  END IF;
  -- The count sits in the standing block on the profile (162).
  IF 'standing' = ANY(profile_hidden_sections(p_user_id)) THEN
    RETURN FALSE;
  END IF;
  IF v_visibility = 'public' THEN
    RETURN TRUE;
  END IF;

  -- 'connections' — mutually connected viewers only
  IF v_viewer IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM connections c
    WHERE c.status = 'accepted'
      AND (
        (c.requester_id = v_viewer AND c.addressee_id = p_user_id) OR
        (c.requester_id = p_user_id AND c.addressee_id = v_viewer)
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION can_view_connection_count(UUID) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. The board
-- ---------------------------------------------------------------------------
-- Restated from 066. One added condition, on the grouped rows so the resolver
-- runs once per ranked member rather than once per badge.
CREATE OR REPLACE FUNCTION get_leaderboard(
  p_scope TEXT DEFAULT 'global',
  p_value TEXT DEFAULT NULL,
  p_window TEXT DEFAULT 'all',
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  country TEXT,
  roles TEXT[],
  is_verified BOOLEAN,
  points BIGINT,
  badge_count BIGINT,
  level INT,
  rank_name TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scored AS (
    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.country,
      p.roles,
      p.is_verified,
      COALESCE(SUM(b.points) FILTER (WHERE w.included), 0) AS pts,
      COUNT(b.id)        FILTER (WHERE w.included)         AS cnt,
      -- All-time count drives the rank badge even on the monthly
      -- board: a level is a property of the member, not the window.
      COUNT(b.id)                                          AS lifetime_cnt,
      MIN(ub.awarded_at) FILTER (WHERE w.included)         AS first_award
    FROM profiles p
    LEFT JOIN user_badges ub ON ub.user_id = p.id
    LEFT JOIN badges b ON b.id = ub.badge_id
    LEFT JOIN LATERAL (
      SELECT (p_window <> 'month' OR ub.awarded_at >= date_trunc('month', now())) AS included
    ) w ON TRUE
    WHERE COALESCE(p.leaderboard_visibility, 'public') = 'public'
      AND COALESCE(p.is_suspended, FALSE) = FALSE
      AND NOT ('student' = ANY(COALESCE(p.roles, ARRAY[]::TEXT[])))
      AND (p_scope <> 'country' OR p.country = p_value)
      AND (p_scope <> 'role'    OR p_value = ANY(COALESCE(p.roles, ARRAY[]::TEXT[])))
    GROUP BY p.id, p.display_name, p.avatar_url, p.country, p.roles, p.is_verified
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY s.pts DESC, s.first_award ASC NULLS LAST, s.id),
    s.id,
    s.display_name,
    s.avatar_url,
    s.country,
    s.roles,
    s.is_verified,
    s.pts,
    s.cnt,
    (member_rank(s.lifetime_cnt::INT)->>'level')::INT,
    member_rank(s.lifetime_cnt::INT)->>'name'
  FROM scored s
  -- Zero-point members are not "last place", they are simply not
  -- on the board yet.
  WHERE s.pts > 0
    -- Before ROW_NUMBER(), so the ranks close up around a hidden member.
    AND NOT ('standing' = ANY(profile_hidden_sections(s.id)))
  ORDER BY s.pts DESC, s.first_award ASC NULLS LAST, s.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION get_leaderboard(TEXT, TEXT, TEXT, INT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Your own row
-- ---------------------------------------------------------------------------
-- Restated from 066. Rank and board size are counted over the members this
-- caller can see on the board, so the sticky row and the list agree. Members
-- on zero points never counted towards either (v_points >= 0), which is what
-- lets the resolver skip them.
CREATE OR REPLACE FUNCTION get_my_leaderboard_rank(
  p_scope TEXT DEFAULT 'global',
  p_value TEXT DEFAULT NULL,
  p_window TEXT DEFAULT 'all'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_points BIGINT;
  v_count BIGINT;
  v_rank BIGINT;
  v_total BIGINT;
  v_listed BOOLEAN;
BEGIN
  IF v_me IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(b.points), 0), COUNT(*)
  INTO v_points, v_count
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_me
    AND (p_window <> 'month' OR ub.awarded_at >= date_trunc('month', now()));

  -- Counted against the whole eligible population, not against
  -- get_leaderboard()'s top-100 slice — otherwise everyone below
  -- 100th place would report rank 101.
  WITH scored AS (
    SELECT p.id, COALESCE(SUM(b.points), 0) AS pts
    FROM profiles p
    LEFT JOIN user_badges ub ON ub.user_id = p.id
      AND (p_window <> 'month' OR ub.awarded_at >= date_trunc('month', now()))
    LEFT JOIN badges b ON b.id = ub.badge_id
    WHERE COALESCE(p.leaderboard_visibility, 'public') = 'public'
      AND COALESCE(p.is_suspended, FALSE) = FALSE
      AND NOT ('student' = ANY(COALESCE(p.roles, ARRAY[]::TEXT[])))
      AND (p_scope <> 'country' OR p.country = p_value)
      AND (p_scope <> 'role'    OR p_value = ANY(COALESCE(p.roles, ARRAY[]::TEXT[])))
    GROUP BY p.id
  )
  SELECT COUNT(*) FILTER (WHERE s.pts > v_points) + 1,
         COUNT(*)
  INTO v_rank, v_total
  FROM scored s
  WHERE s.pts > 0
    AND NOT ('standing' = ANY(profile_hidden_sections(s.id)));

  SELECT COALESCE(leaderboard_visibility, 'public') = 'public'
         AND COALESCE(is_suspended, FALSE) = FALSE
         AND NOT ('student' = ANY(COALESCE(roles, ARRAY[]::TEXT[])))
  INTO v_listed FROM profiles WHERE id = v_me;

  RETURN jsonb_build_object(
    'rank', v_rank,
    'points', v_points,
    'badge_count', v_count,
    'board_size', v_total,
    -- FALSE means "this is your score, but nobody else can see it".
    'listed', COALESCE(v_listed, FALSE)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
