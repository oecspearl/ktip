-- ============================================================
-- Migration 066: Gamification engine — points, ranks, tiers,
-- streaks, showcase, leaderboards, trophy artwork
--
-- Extends the badge system from 039 rather than replacing it.
-- 039's six award triggers stay: they fire instantly on the hot
-- paths so the unlock popup feels immediate. Everything else is
-- derived by the "pull" engine below.
--
-- WHY PULL INSTEAD OF PUSH
-- The alternative — one trigger per achievement — would mean ~40
-- triggers on a dozen hot tables, each of which has to be written,
-- backfilled and kept in sync with its definition. Instead
-- check_achievements_for() re-derives every count from tables that
-- already exist and awards anything whose threshold is met. That is:
--   idempotent   INSERT ... ON CONFLICT DO NOTHING, awards never repeat
--   self-healing a missed call is caught by the next one, or the
--                client's 2-minute fallback poll
--   retroactive  adding a definition in a later migration awards it
--                to everyone who already qualifies, with no backfill
--
-- SECURITY
-- Same posture as 039/046/051 and the personalization functions in
-- 061: derived tables have public SELECT and *no* client INSERT or
-- UPDATE policy, so nothing here is self-awardable. The client entry
-- point check_my_achievements() takes no user argument and derives
-- the caller from auth.uid(), so it cannot be used as an oracle to
-- read another member's activity. check_achievements_for(uuid) is
-- REVOKEd from clients precisely because it does take one.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. BADGE DEFINITION COLUMNS
-- Additive: the six rows seeded by 039 keep working on defaults
-- until 067 updates them in place.
-- ============================================================

ALTER TABLE badges ADD COLUMN IF NOT EXISTS category    TEXT NOT NULL DEFAULT 'community';
ALTER TABLE badges ADD COLUMN IF NOT EXISTS rarity      TEXT NOT NULL DEFAULT 'common';
ALTER TABLE badges ADD COLUMN IF NOT EXISTS points      INT  NOT NULL DEFAULT 10;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS tier        TEXT;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS tier_group  TEXT;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS check_key   TEXT;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS check_value INT;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS is_hidden   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS sort_order  INT NOT NULL DEFAULT 0;
-- trophy_type + tier resolve to shared artwork in trophy_assets;
-- image_url is the per-badge override for one-off legendary art.
ALTER TABLE badges ADD COLUMN IF NOT EXISTS trophy_type TEXT;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS image_url   TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'badges_rarity_check') THEN
    ALTER TABLE badges ADD CONSTRAINT badges_rarity_check
      CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'badges_tier_check') THEN
    ALTER TABLE badges ADD CONSTRAINT badges_tier_check
      CHECK (tier IS NULL OR tier IN ('bronze', 'silver', 'gold', 'diamond'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_badges_check_key ON badges(check_key) WHERE check_key IS NOT NULL;

-- Rarity is the single source of truth for points; nothing sets
-- points by hand. Kept as a function so 067 and the admin RPC agree.
CREATE OR REPLACE FUNCTION rarity_points(p_rarity TEXT)
RETURNS INT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE p_rarity
    WHEN 'common'    THEN 10
    WHEN 'uncommon'  THEN 25
    WHEN 'rare'      THEN 50
    WHEN 'epic'      THEN 100
    WHEN 'legendary' THEN 200
    ELSE 10
  END;
$$;

-- ============================================================
-- 2. NEW TABLES
-- All read-public, none client-writable.
-- ============================================================

-- Themed sets ("complete all five project badges").
CREATE TABLE IF NOT EXISTS achievement_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'award',
  badge_slugs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per member per active day. This IS the streak tracker —
-- check_achievements_for() writes today's row on every call, so
-- streaks accrue from ordinary app use with no separate heartbeat
-- and no scheduled job.
CREATE TABLE IF NOT EXISTS user_activity_days (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  PRIMARY KEY (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_user_activity_days_user
  ON user_activity_days(user_id, activity_date DESC);

-- Up to five trophies a member pins to their public profile.
CREATE TABLE IF NOT EXISTS user_showcase (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 5),
  PRIMARY KEY (user_id, position),
  UNIQUE (user_id, badge_id)
);

-- Signals the database cannot derive on its own (e.g. "opened the
-- leaderboard"). Written only through track_my_flag(), which
-- allowlists the keys.
CREATE TABLE IF NOT EXISTS user_flags (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,
  flag_value INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, flag_key)
);

-- Shared trophy artwork: ~13 types x 4 tiers, reused across every
-- badge. Uploading one gold rocket updates every gold project badge.
CREATE TABLE IF NOT EXISTS trophy_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'diamond')),
  image_url TEXT,
  -- A trophy is meaningful content, not decoration; alt text is not optional.
  alt_text TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, tier)
);

-- Leaderboard opt-out. Mirrors profiles.connection_count_visibility
-- from 049 — members already asked not to have network size exposed,
-- and a public score is the same class of thing.
-- guard_profile_privileged_columns() (063) guards by denylist, so
-- this column is self-editable without any change there.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS leaderboard_visibility TEXT NOT NULL DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_leaderboard_visibility_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_leaderboard_visibility_check
      CHECK (leaderboard_visibility IN ('public', 'private'));
  END IF;
END $$;

-- Monthly board sorts on award time across all members.
CREATE INDEX IF NOT EXISTS idx_user_badges_awarded_at ON user_badges(awarded_at DESC);

-- ============================================================
-- 3. RLS
-- Definitions and awards are public. Writes go through the
-- SECURITY DEFINER functions below, so there are deliberately no
-- INSERT/UPDATE/DELETE policies on any of these.
-- ============================================================

ALTER TABLE achievement_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_days      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_showcase           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flags              ENABLE ROW LEVEL SECURITY;
ALTER TABLE trophy_assets           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Collections are viewable by everyone" ON achievement_collections;
CREATE POLICY "Collections are viewable by everyone"
  ON achievement_collections FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Trophy assets are viewable by everyone" ON trophy_assets;
CREATE POLICY "Trophy assets are viewable by everyone"
  ON trophy_assets FOR SELECT USING (TRUE);

-- Showcase pins are shown on public profiles.
DROP POLICY IF EXISTS "Showcase is viewable by everyone" ON user_showcase;
CREATE POLICY "Showcase is viewable by everyone"
  ON user_showcase FOR SELECT USING (TRUE);

-- Activity days and flags are behavioural detail; own rows only.
DROP POLICY IF EXISTS "Members can view own activity days" ON user_activity_days;
CREATE POLICY "Members can view own activity days"
  ON user_activity_days FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members can view own flags" ON user_flags;
CREATE POLICY "Members can view own flags"
  ON user_flags FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- 4. TROPHY ARTWORK BUCKET
-- Follows 027_storage_buckets.sql, but gates writes on the 063
-- permission matrix rather than 027's hard-coded 'oecs' literal.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trophy-assets',
  'trophy-assets',
  TRUE,
  10485760, -- 10MB, matching the other image buckets
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view trophy assets" ON storage.objects;
CREATE POLICY "Anyone can view trophy assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trophy-assets');

DROP POLICY IF EXISTS "Admins can upload trophy assets" ON storage.objects;
CREATE POLICY "Admins can upload trophy assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'trophy-assets' AND has_permission(auth.uid(), 'org:manage'));

DROP POLICY IF EXISTS "Admins can update trophy assets" ON storage.objects;
CREATE POLICY "Admins can update trophy assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'trophy-assets' AND has_permission(auth.uid(), 'org:manage'));

DROP POLICY IF EXISTS "Admins can delete trophy assets" ON storage.objects;
CREATE POLICY "Admins can delete trophy assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'trophy-assets' AND has_permission(auth.uid(), 'org:manage'));

-- ============================================================
-- 5. RANKS
-- Thresholds are on earned COUNT, not points: a member who has
-- collected many small achievements has engaged more broadly than
-- one who happened to unlock a single legendary.
-- ============================================================

CREATE OR REPLACE FUNCTION member_rank(p_earned INT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_ranks CONSTANT JSONB := '[
    {"level": 1, "name": "Newcomer",         "required": 0},
    {"level": 2, "name": "Contributor",      "required": 5},
    {"level": 3, "name": "Collaborator",     "required": 12},
    {"level": 4, "name": "Innovator",        "required": 22},
    {"level": 5, "name": "Regional Builder", "required": 33},
    {"level": 6, "name": "Ecosystem Leader", "required": 45},
    {"level": 7, "name": "KTIP Champion",    "required": 55}
  ]'::JSONB;
  v_current JSONB;
  v_next JSONB;
  v_row JSONB;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_ranks) LOOP
    IF COALESCE(p_earned, 0) >= (v_row->>'required')::INT THEN
      v_current := v_row;
    ELSIF v_next IS NULL THEN
      v_next := v_row;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'level',     (v_current->>'level')::INT,
    'name',      v_current->>'name',
    'earned',    COALESCE(p_earned, 0),
    'next_name', v_next->>'name',
    -- NULL at max rank; the client renders "highest rank reached".
    'next_required', CASE WHEN v_next IS NULL THEN NULL ELSE (v_next->>'required')::INT END
  );
END;
$$;

-- ============================================================
-- 6. STREAK
-- Gaps-and-islands over user_activity_days. A streak stays alive
-- while the member was active today or yesterday — a run that ended
-- last week is history, not a current streak.
-- ============================================================

CREATE OR REPLACE FUNCTION current_streak(p_user UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last DATE;
  v_streak INT;
BEGIN
  SELECT MAX(activity_date) INTO v_last FROM user_activity_days WHERE user_id = p_user;

  IF v_last IS NULL OR v_last < CURRENT_DATE - 1 THEN
    RETURN 0;
  END IF;

  WITH islands AS (
    SELECT activity_date,
           activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date))::INT AS island
    FROM user_activity_days
    WHERE user_id = p_user
  )
  SELECT COUNT(*) INTO v_streak
  FROM islands
  WHERE island = (SELECT island FROM islands ORDER BY activity_date DESC LIMIT 1);

  RETURN COALESCE(v_streak, 0);
END;
$$;

-- ============================================================
-- 7. COUNT COLLECTOR
-- Every metric any achievement can key off, derived from tables
-- that already exist. This is the one function to extend when a new
-- kind of achievement is wanted.
--
-- Every count COALESCEs to 0 so a brand-new account returns a full
-- payload of zeros rather than erroring — the client calls this on
-- first paint.
--
-- Content removed by moderation is excluded: posting rubbish and
-- getting actioned must not leave points behind.
-- ============================================================

CREATE OR REPLACE FUNCTION achievement_counts(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v JSONB;
  v_flags JSONB;
BEGIN
  IF p_user IS NULL THEN
    RETURN '{}'::JSONB;
  END IF;

  SELECT jsonb_build_object(
    -- ---------- Projects ----------
    'projects_created', (
      SELECT COUNT(*) FROM projects WHERE owner_id = p_user
    ),
    'projects_launched', (
      SELECT COUNT(*) FROM projects WHERE owner_id = p_user AND phase = 'launch'
    ),
    -- Self-likes excluded: the cheapest possible way to farm a badge.
    'project_likes_received', (
      SELECT COUNT(*) FROM project_likes pl
      JOIN projects p ON p.id = pl.project_id
      WHERE p.owner_id = p_user AND pl.user_id <> p_user
    ),
    -- Likes on the single best-performing project, kept separate from
    -- the lifetime total so 039's "one project reached 25 likes" rule
    -- keeps its exact meaning instead of quietly becoming easier.
    'top_project_likes', (
      SELECT COALESCE(MAX(cnt), 0) FROM (
        SELECT COUNT(*) AS cnt
        FROM project_likes pl
        JOIN projects p ON p.id = pl.project_id
        WHERE p.owner_id = p_user AND pl.user_id <> p_user
        GROUP BY pl.project_id
      ) t
    ),
    'project_followers', (
      SELECT COUNT(*) FROM project_follows pf
      JOIN projects p ON p.id = pf.project_id
      WHERE p.owner_id = p_user AND pf.user_id <> p_user
    ),
    'project_views', (
      SELECT COALESCE(SUM(COALESCE(view_count, 0)), 0) FROM projects WHERE owner_id = p_user
    ),
    'project_comments_made', (
      SELECT COUNT(*) FROM project_comments pc
      WHERE pc.user_id = p_user
        AND NOT EXISTS (
          SELECT 1 FROM content_reports cr
          WHERE cr.target_type = 'project_comment'
            AND cr.target_id = pc.id
            AND cr.status = 'actioned'
        )
    ),
    'project_collaborations', (
      SELECT COUNT(*) FROM project_members
      WHERE user_id = p_user AND status = 'accepted'
    ),

    -- ---------- Grants ----------
    'grant_applications', (
      SELECT COUNT(*) FROM grant_applications WHERE user_id = p_user
    ),
    'grants_approved', (
      SELECT COUNT(*) FROM grant_applications WHERE user_id = p_user AND status = 'approved'
    ),
    -- Faculty sponsoring a student application (064). Two-sided:
    -- the student earns on apply, the sponsor earns on sponsoring.
    'sponsorships_given', (
      SELECT COUNT(*) FROM grant_applications WHERE sponsor_id = p_user
    ),

    -- ---------- Events ----------
    'events_rsvpd', (
      SELECT COUNT(*) FROM event_rsvps WHERE user_id = p_user AND status <> 'cancelled'
    ),
    -- Turning up is worth more than signing up. 'checked_in' has been
    -- modelled since 007 and nothing has used it until now.
    'events_attended', (
      SELECT COUNT(*) FROM event_rsvps WHERE user_id = p_user AND status = 'checked_in'
    ),
    'events_organized', (
      SELECT COUNT(*) FROM events WHERE organizer_id = p_user
    ),

    -- ---------- Forums ----------
    'forum_posts', (
      SELECT COUNT(*) FROM forum_posts fp
      WHERE fp.author_id = p_user
        AND NOT EXISTS (
          SELECT 1 FROM content_reports cr
          WHERE cr.target_type = 'forum_post' AND cr.target_id = fp.id AND cr.status = 'actioned'
        )
    ),
    'forum_replies', (
      SELECT COUNT(*) FROM forum_replies fr
      WHERE fr.author_id = p_user
        AND NOT EXISTS (
          SELECT 1 FROM content_reports cr
          WHERE cr.target_type = 'forum_reply' AND cr.target_id = fr.id AND cr.status = 'actioned'
        )
    ),

    -- ---------- Network ----------
    'connections_accepted', (
      SELECT COUNT(*) FROM connections
      WHERE status = 'accepted' AND (requester_id = p_user OR addressee_id = p_user)
    ),
    'messages_sent', (
      SELECT COUNT(*) FROM messages WHERE sender_id = p_user
    ),
    'distinct_conversations', (
      SELECT COUNT(DISTINCT conversation_id) FROM conversation_participants WHERE user_id = p_user
    ),

    -- ---------- Collaborate ----------
    'documents_created',  (SELECT COUNT(*) FROM documents  WHERE owner_id = p_user),
    'whiteboards_created',(SELECT COUNT(*) FROM whiteboards WHERE owner_id = p_user),
    'snippets_created',   (SELECT COUNT(*) FROM snippets   WHERE owner_id = p_user),
    'collab_shares', (
      (SELECT COUNT(*) FROM document_shares  WHERE shared_by = p_user)
      + (SELECT COUNT(*) FROM whiteboard_shares WHERE shared_by = p_user)
      + (SELECT COUNT(*) FROM snippet_shares  WHERE shared_by = p_user)
    ),
    'resources_published', (
      SELECT COUNT(*) FROM resources WHERE author_id = p_user AND is_published = TRUE
    ),

    -- ---------- Profile ----------
    'is_verified', (
      SELECT CASE WHEN COALESCE(is_verified, FALSE) THEN 1 ELSE 0 END FROM profiles WHERE id = p_user
    ),
    -- All five fields filled. Deliberately strict: a half-filled
    -- profile is the thing this is meant to push members past.
    'profile_complete', (
      SELECT CASE WHEN COALESCE(NULLIF(TRIM(bio), ''), NULL) IS NOT NULL
                   AND COALESCE(NULLIF(TRIM(avatar_url), ''), NULL) IS NOT NULL
                   AND COALESCE(NULLIF(TRIM(country), ''), NULL) IS NOT NULL
                   AND COALESCE(array_length(skills, 1), 0) > 0
                   AND COALESCE(array_length(interests, 1), 0) > 0
             THEN 1 ELSE 0 END
      FROM profiles WHERE id = p_user
    ),
    'roles_held', (
      SELECT COALESCE(array_length(roles, 1), 0) FROM profiles WHERE id = p_user
    ),

    -- ---------- Dedication ----------
    'streak_days', current_streak(p_user),
    'total_active_days', (
      SELECT COUNT(*) FROM user_activity_days WHERE user_id = p_user
    )
  ) INTO v;

  -- Combined forum activity, matching 039's existing community_voice rule.
  v := v || jsonb_build_object(
    'forum_activity', (v->>'forum_posts')::INT + (v->>'forum_replies')::INT
  );

  -- Frontend-reported signals merge in last so a flag can shadow
  -- nothing above it by accident.
  SELECT COALESCE(jsonb_object_agg(flag_key, flag_value), '{}'::JSONB)
  INTO v_flags FROM user_flags WHERE user_id = p_user;

  RETURN v || v_flags;
END;
$$;

-- ============================================================
-- 8. THE CHECK
-- Takes a user id, so it is NOT granted to clients — see the
-- REVOKE below. check_my_achievements() is the client entry point.
--
-- p_notify FALSE is used by bulk/backfill passes so nobody wakes up
-- to thirty notifications at once (039 took the same care).
-- ============================================================

CREATE OR REPLACE FUNCTION check_achievements_for(p_user UUID, p_notify BOOLEAN DEFAULT TRUE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts JSONB;
  v_new JSONB := '[]'::JSONB;
  v_badge RECORD;
  v_points INT;
  v_earned_count INT;
  v_hidden_count INT;
BEGIN
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('newly_earned', '[]'::JSONB);
  END IF;

  -- Any check marks today active. This is the whole streak mechanism:
  -- no heartbeat endpoint, no scheduled job.
  INSERT INTO user_activity_days (user_id, activity_date)
  VALUES (p_user, CURRENT_DATE)
  ON CONFLICT DO NOTHING;

  v_counts := achievement_counts(p_user);

  -- ---------- First pass: threshold achievements ----------
  FOR v_badge IN
    SELECT b.* FROM badges b
    WHERE b.check_key IS NOT NULL
      AND b.check_value IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_badges ub WHERE ub.user_id = p_user AND ub.badge_id = b.id
      )
      AND COALESCE((v_counts->>b.check_key)::INT, 0) >= b.check_value
    ORDER BY b.sort_order, b.slug
  LOOP
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (p_user, v_badge.id)
    ON CONFLICT (user_id, badge_id) DO NOTHING;

    v_new := v_new || jsonb_build_object(
      'slug', v_badge.slug, 'name', v_badge.name, 'description', v_badge.description,
      'icon', v_badge.icon, 'color', v_badge.color, 'rarity', v_badge.rarity,
      'tier', v_badge.tier, 'points', v_badge.points, 'category', v_badge.category,
      'trophy_type', v_badge.trophy_type, 'image_url', v_badge.image_url
    );
  END LOOP;

  -- ---------- Second pass: meta achievements ----------
  -- Points- and count-threshold definitions are re-checked against
  -- the totals the first pass just produced, so "earn 500 points"
  -- fires in the same call that crossed 500 rather than one call late.
  SELECT COALESCE(SUM(b.points), 0), COUNT(*),
         COUNT(*) FILTER (WHERE b.is_hidden)
  INTO v_points, v_earned_count, v_hidden_count
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = p_user;

  v_counts := v_counts || jsonb_build_object(
    'total_points', v_points,
    'badges_earned', v_earned_count,
    'hidden_earned', v_hidden_count
  );

  FOR v_badge IN
    SELECT b.* FROM badges b
    WHERE b.check_key IN ('total_points', 'badges_earned', 'hidden_earned')
      AND b.check_value IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_badges ub WHERE ub.user_id = p_user AND ub.badge_id = b.id
      )
      AND COALESCE((v_counts->>b.check_key)::INT, 0) >= b.check_value
    ORDER BY b.sort_order, b.slug
  LOOP
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (p_user, v_badge.id)
    ON CONFLICT (user_id, badge_id) DO NOTHING;

    v_new := v_new || jsonb_build_object(
      'slug', v_badge.slug, 'name', v_badge.name, 'description', v_badge.description,
      'icon', v_badge.icon, 'color', v_badge.color, 'rarity', v_badge.rarity,
      'tier', v_badge.tier, 'points', v_badge.points, 'category', v_badge.category,
      'trophy_type', v_badge.trophy_type, 'image_url', v_badge.image_url
    );
  END LOOP;

  -- Recompute after the second pass so the returned stats are final.
  SELECT COALESCE(SUM(b.points), 0), COUNT(*)
  INTO v_points, v_earned_count
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = p_user;

  -- ---------- Notifications ----------
  IF p_notify AND jsonb_array_length(v_new) > 0 THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT p_user, 'badge_awarded',
           'Achievement unlocked: ' || (n->>'name'),
           n->>'description',
           '/achievements'
    FROM jsonb_array_elements(v_new) AS n;
  END IF;

  RETURN jsonb_build_object(
    'newly_earned', v_new,
    'stats', jsonb_build_object(
      'points', v_points,
      'earned', v_earned_count,
      'total_available', (SELECT COUNT(*) FROM badges),
      'streak_days', COALESCE((v_counts->>'streak_days')::INT, 0),
      'total_active_days', COALESCE((v_counts->>'total_active_days')::INT, 0),
      'rank', member_rank(v_earned_count),
      'by_category', (
        SELECT COALESCE(jsonb_object_agg(cat, cnt), '{}'::JSONB)
        FROM (
          SELECT b.category AS cat, COUNT(*) AS cnt
          FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
          WHERE ub.user_id = p_user
          GROUP BY b.category
        ) c
      )
    ),
    -- Progress toward everything not yet earned, so the gallery can
    -- render "7 / 10" bars without a second round trip. Hidden
    -- achievements are represented but not described.
    'progress', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'slug', b.slug,
        'current', LEAST(COALESCE((v_counts->>b.check_key)::INT, 0), b.check_value),
        'target', b.check_value
      ) ORDER BY b.sort_order, b.slug), '[]'::JSONB)
      FROM badges b
      WHERE b.check_key IS NOT NULL AND b.check_value IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_badges ub WHERE ub.user_id = p_user AND ub.badge_id = b.id
        )
    ),
    'collections', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'slug', c.slug, 'name', c.name, 'description', c.description, 'icon', c.icon,
        'total', COALESCE(array_length(c.badge_slugs, 1), 0),
        'earned', (
          SELECT COUNT(*) FROM user_badges ub
          JOIN badges b ON b.id = ub.badge_id
          WHERE ub.user_id = p_user AND b.slug = ANY(c.badge_slugs)
        )
      ) ORDER BY c.sort_order), '[]'::JSONB)
      FROM achievement_collections c
    )
  );
END;
$$;

-- Client entry point. No user argument by design: it cannot be
-- pointed at anyone else, so it is not an activity oracle.
CREATE OR REPLACE FUNCTION check_my_achievements()
RETURNS JSONB
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT check_achievements_for(auth.uid(), TRUE);
$$;

-- ============================================================
-- 9. LEADERBOARD
-- The engagement tables this reads are RLS-scoped to their owner,
-- so a client cannot aggregate them; these functions are the only
-- read path, exactly like get_connection_counts() in 049.
--
-- Exclusions, in order of importance:
--   students   safeguarding (064). A minor-facing persona is never
--              ranked publicly, and this is not admin-toggleable.
--   private    the member opted out.
--   suspended  an account under moderation is not showcased.
-- ============================================================

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
  ORDER BY s.pts DESC, s.first_award ASC NULLS LAST, s.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

-- Own standing, returned even when outside the top N and even when
-- opted out — you can always see yourself. Powers the sticky row.
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
  SELECT COUNT(*) FILTER (WHERE pts > v_points) + 1,
         COUNT(*) FILTER (WHERE pts > 0)
  INTO v_rank, v_total
  FROM scored;

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

-- ============================================================
-- 10. PUBLIC PROFILE STATS
-- Anonymous-readable: /u/:id must render for a signed-out visitor
-- following a shared link.
-- ============================================================

CREATE OR REPLACE FUNCTION get_profile_stats(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INT;
  v_count INT;
  v_suspended BOOLEAN;
BEGIN
  SELECT COALESCE(is_suspended, FALSE) INTO v_suspended FROM profiles WHERE id = p_user;
  IF v_suspended IS NULL OR v_suspended THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(b.points), 0), COUNT(*)
  INTO v_points, v_count
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = p_user;

  RETURN jsonb_build_object(
    'user_id', p_user,
    'points', v_points,
    'badge_count', v_count,
    'rank', member_rank(v_count),
    -- Streak is shown on your own profile only; on someone else's it
    -- reads as surveillance rather than achievement.
    'streak_days', CASE WHEN auth.uid() = p_user THEN current_streak(p_user) ELSE NULL END,
    'showcase', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'position', us.position,
        'badge', to_jsonb(b)
      ) ORDER BY us.position), '[]'::JSONB)
      FROM user_showcase us JOIN badges b ON b.id = us.badge_id
      WHERE us.user_id = p_user
    )
  );
END;
$$;

-- Batch variant for the directory and leaderboard rows. 200-id cap
-- matches get_connection_counts() in 049.
CREATE OR REPLACE FUNCTION get_profile_stats_batch(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, points BIGINT, badge_count BIGINT, level INT, rank_name TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    COALESCE(SUM(b.points), 0),
    COUNT(b.id),
    (member_rank(COUNT(b.id)::INT)->>'level')::INT,
    member_rank(COUNT(b.id)::INT)->>'name'
  FROM profiles p
  LEFT JOIN user_badges ub ON ub.user_id = p.id
  LEFT JOIN badges b ON b.id = ub.badge_id
  WHERE p.id = ANY(p_user_ids[1:200])
    AND COALESCE(p.is_suspended, FALSE) = FALSE
  GROUP BY p.id;
$$;

-- ============================================================
-- 11. MEMBER WRITES
-- The only two things a member may change about their own
-- gamification state. Neither can award anything.
-- ============================================================

CREATE OR REPLACE FUNCTION set_my_showcase(p_badge_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  DELETE FROM user_showcase WHERE user_id = v_me;

  -- Truncation is server-side; a client sending six ids gets five
  -- pins, not an error. Unearned badges are filtered out rather than
  -- rejected, so you cannot pin a trophy you have not won.
  INSERT INTO user_showcase (user_id, badge_id, position)
  SELECT v_me, x.badge_id, x.pos
  FROM (
    SELECT id AS badge_id, ROW_NUMBER() OVER () AS pos
    FROM unnest(p_badge_ids[1:5]) AS id
  ) x
  WHERE EXISTS (
    SELECT 1 FROM user_badges ub WHERE ub.user_id = v_me AND ub.badge_id = x.badge_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION track_my_flag(p_key TEXT, p_mode TEXT DEFAULT 'increment', p_value INT DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  -- Allowlisted so the flags table cannot become an arbitrary
  -- client-writable key-value store attached to achievements.
  v_allowed CONSTANT TEXT[] := ARRAY[
    'leaderboard_views', 'achievements_views', 'directory_views',
    'search_uses', 'ai_assistant_uses'
  ];
BEGIN
  IF v_me IS NULL OR NOT (p_key = ANY(v_allowed)) THEN
    RETURN;
  END IF;

  INSERT INTO user_flags (user_id, flag_key, flag_value, updated_at)
  VALUES (v_me, p_key, GREATEST(COALESCE(p_value, 1), 0), now())
  ON CONFLICT (user_id, flag_key) DO UPDATE
  SET flag_value = CASE
        WHEN p_mode = 'set' THEN GREATEST(COALESCE(p_value, 0), 0)
        ELSE user_flags.flag_value + GREATEST(COALESCE(p_value, 1), 0)
      END,
      updated_at = now();
END;
$$;

-- ============================================================
-- 12. ADMIN WRITES
-- Definitions and artwork are runtime-editable so a coordinator can
-- add a badge or swap trophy art without a deploy. The tables stay
-- client-write-free; these RPCs are the only door and they check the
-- 063 permission matrix.
--
-- NOTE: lowering a check_value awards more members on their next
-- check; RAISING ONE REVOKES NOTHING. Earned is permanent — nothing
-- in this engine ever deletes a user_badges row. The admin UI says so.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_upsert_badge(
  p_slug TEXT,
  p_name TEXT,
  p_description TEXT,
  p_icon TEXT,
  p_color TEXT,
  p_category TEXT,
  p_rarity TEXT,
  p_tier TEXT,
  p_tier_group TEXT,
  p_check_key TEXT,
  p_check_value INT,
  p_is_hidden BOOLEAN,
  p_sort_order INT,
  p_trophy_type TEXT,
  p_image_url TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  INSERT INTO badges (
    slug, name, description, icon, color, category, rarity, points,
    tier, tier_group, check_key, check_value, is_hidden, sort_order,
    trophy_type, image_url
  )
  VALUES (
    p_slug, p_name, p_description, COALESCE(p_icon, 'award'), COALESCE(p_color, 'ocean'),
    COALESCE(p_category, 'community'), COALESCE(p_rarity, 'common'), rarity_points(p_rarity),
    p_tier, p_tier_group, p_check_key, p_check_value, COALESCE(p_is_hidden, FALSE),
    COALESCE(p_sort_order, 0), p_trophy_type, p_image_url
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
    color = EXCLUDED.color, category = EXCLUDED.category, rarity = EXCLUDED.rarity,
    points = EXCLUDED.points, tier = EXCLUDED.tier, tier_group = EXCLUDED.tier_group,
    check_key = EXCLUDED.check_key, check_value = EXCLUDED.check_value,
    is_hidden = EXCLUDED.is_hidden, sort_order = EXCLUDED.sort_order,
    trophy_type = EXCLUDED.trophy_type, image_url = EXCLUDED.image_url
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_upsert_trophy_asset(
  p_type TEXT,
  p_tier TEXT,
  p_image_url TEXT,
  p_alt_text TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  INSERT INTO trophy_assets (type, tier, image_url, alt_text, updated_at)
  VALUES (p_type, p_tier, p_image_url, COALESCE(p_alt_text, ''), now())
  ON CONFLICT (type, tier) DO UPDATE
  SET image_url = EXCLUDED.image_url,
      alt_text = EXCLUDED.alt_text,
      updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================
-- 13. GRANTS
-- Postgres grants EXECUTE to PUBLIC by default, so the functions
-- that take a user id must be revoked explicitly — otherwise
-- check_achievements_for(<anyone>) would be callable from the client
-- and the auth.uid() design above would be pointless.
-- ============================================================

REVOKE EXECUTE ON FUNCTION check_achievements_for(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION achievement_counts(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION current_streak(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION check_my_achievements() TO authenticated;
GRANT EXECUTE ON FUNCTION set_my_showcase(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION track_my_flag(TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_leaderboard_rank(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_upsert_badge(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, BOOLEAN, INT, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_upsert_trophy_asset(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Public surfaces: a shared /u/:id link and the leaderboard must
-- render for signed-out visitors.
GRANT EXECUTE ON FUNCTION get_leaderboard(TEXT, TEXT, TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_profile_stats(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_profile_stats_batch(UUID[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION member_rank(INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rarity_points(TEXT) TO anon, authenticated;

-- ============================================================
-- 14. NOTIFICATION CATEGORY
-- 036's enforce_notification_preferences() maps a notification type
-- to a preference column; 'badge_awarded' was never in the CASE, so
-- it fell to ELSE TRUE and could not be turned off. With points and
-- streaks now generating far more of them, give it a real toggle.
-- ============================================================

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS achievements BOOLEAN NOT NULL DEFAULT TRUE;

-- Verbatim copy of 036's mapping with one arm added. The existing
-- type strings are load-bearing — they are what live senders emit —
-- so nothing above 'badge_awarded' changes.
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
    WHEN NEW.type IN ('event_reminder', 'event_update') THEN events
    WHEN NEW.type IN ('forum_reply') THEN forums
    WHEN NEW.type IN ('badge_awarded') THEN achievements
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

-- 039 links badge notifications at /profile/me, which has redirected
-- to the dashboard since the profile page was removed. The gallery is
-- the right destination now.
CREATE OR REPLACE FUNCTION award_badge(p_user_id UUID, p_slug TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badge badges%ROWTYPE;
  v_inserted UUID;
BEGIN
  SELECT * INTO v_badge FROM badges WHERE slug = p_slug;
  IF v_badge.id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO user_badges (user_id, badge_id)
  VALUES (p_user_id, v_badge.id)
  ON CONFLICT (user_id, badge_id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      p_user_id,
      'badge_awarded',
      'Achievement unlocked: ' || v_badge.name,
      v_badge.description,
      '/achievements'
    );
  END IF;
END;
$$;
