-- ============================================================
-- Migration 039: Achievement Badges
-- badges (definitions) + user_badges (awards). Awards happen only
-- through SECURITY DEFINER trigger functions — there is no client
-- INSERT path, so badges cannot be self-awarded. Award inserts a
-- notification (type 'badge_awarded') which flows through the
-- notification-preferences trigger from 036.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'award',
  color TEXT NOT NULL DEFAULT 'ocean',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id, awarded_at DESC);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Definitions and awards are public; no client writes on either
-- (awards go through SECURITY DEFINER functions only).
DROP POLICY IF EXISTS "Badges are viewable by everyone" ON badges;
CREATE POLICY "Badges are viewable by everyone"
  ON badges FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "User badges are viewable by everyone" ON user_badges;
CREATE POLICY "User badges are viewable by everyone"
  ON user_badges FOR SELECT
  USING (TRUE);

-- ============================================================
-- Badge definitions
-- ============================================================
INSERT INTO badges (slug, name, description, icon, color) VALUES
  ('first_project',    'Innovator',       'Created your first project', 'rocket', 'ocean'),
  ('popular_project',  'Crowd Favourite', 'One of your projects reached 25 likes', 'heart', 'tropical'),
  ('first_connection', 'Networker',       'Made your first connection', 'users', 'ocean'),
  ('community_voice',  'Community Voice', 'Posted 10 times in the forums', 'message-square', 'sand'),
  ('verified_member',  'Verified Member', 'Completed identity verification', 'shield-check', 'tropical'),
  ('event_goer',       'Event Goer',      'RSVP''d to your first event', 'calendar', 'sand')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Award helper: idempotent; notifies on first award only.
-- ============================================================
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
      '/profile/me'
    );
  END IF;
END;
$$;

-- ============================================================
-- Awarding triggers
-- ============================================================

-- first_project
CREATE OR REPLACE FUNCTION badge_on_project_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM award_badge(NEW.owner_id, 'first_project');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS badge_on_project_insert ON projects;
CREATE TRIGGER badge_on_project_insert
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION badge_on_project_insert();

-- popular_project (25 likes -> owner)
CREATE OR REPLACE FUNCTION badge_on_project_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner UUID;
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM project_likes WHERE project_id = NEW.project_id;
  IF v_count >= 25 THEN
    SELECT owner_id INTO v_owner FROM projects WHERE id = NEW.project_id;
    IF v_owner IS NOT NULL THEN
      PERFORM award_badge(v_owner, 'popular_project');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS badge_on_project_like ON project_likes;
CREATE TRIGGER badge_on_project_like
  AFTER INSERT ON project_likes
  FOR EACH ROW EXECUTE FUNCTION badge_on_project_like();

-- first_connection (both parties, on acceptance)
CREATE OR REPLACE FUNCTION badge_on_connection_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    PERFORM award_badge(NEW.requester_id, 'first_connection');
    PERFORM award_badge(NEW.addressee_id, 'first_connection');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS badge_on_connection_accepted ON connections;
CREATE TRIGGER badge_on_connection_accepted
  AFTER UPDATE ON connections
  FOR EACH ROW EXECUTE FUNCTION badge_on_connection_accepted();

-- community_voice (10 forum posts + replies combined)
CREATE OR REPLACE FUNCTION badge_on_forum_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM forum_posts WHERE author_id = NEW.author_id)
    + (SELECT COUNT(*) FROM forum_replies WHERE author_id = NEW.author_id)
  INTO v_count;
  IF v_count >= 10 THEN
    PERFORM award_badge(NEW.author_id, 'community_voice');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS badge_on_forum_post ON forum_posts;
CREATE TRIGGER badge_on_forum_post
  AFTER INSERT ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION badge_on_forum_activity();
DROP TRIGGER IF EXISTS badge_on_forum_reply ON forum_replies;
CREATE TRIGGER badge_on_forum_reply
  AFTER INSERT ON forum_replies
  FOR EACH ROW EXECUTE FUNCTION badge_on_forum_activity();

-- verified_member
CREATE OR REPLACE FUNCTION badge_on_profile_verified()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_verified = TRUE AND coalesce(OLD.is_verified, FALSE) = FALSE THEN
    PERFORM award_badge(NEW.id, 'verified_member');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS badge_on_profile_verified ON profiles;
CREATE TRIGGER badge_on_profile_verified
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION badge_on_profile_verified();

-- event_goer
CREATE OR REPLACE FUNCTION badge_on_event_rsvp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM award_badge(NEW.user_id, 'event_goer');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS badge_on_event_rsvp ON event_rsvps;
CREATE TRIGGER badge_on_event_rsvp
  AFTER INSERT ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION badge_on_event_rsvp();

-- ============================================================
-- Backfill: award already-earned badges without notifications
-- ============================================================
INSERT INTO user_badges (user_id, badge_id)
SELECT DISTINCT p.owner_id, b.id
FROM projects p, badges b
WHERE b.slug = 'first_project'
ON CONFLICT (user_id, badge_id) DO NOTHING;

INSERT INTO user_badges (user_id, badge_id)
SELECT DISTINCT p.owner_id, b.id
FROM projects p
JOIN (
  SELECT project_id FROM project_likes GROUP BY project_id HAVING COUNT(*) >= 25
) pop ON pop.project_id = p.id,
badges b
WHERE b.slug = 'popular_project'
ON CONFLICT (user_id, badge_id) DO NOTHING;

INSERT INTO user_badges (user_id, badge_id)
SELECT author_id, b.id
FROM (
  SELECT author_id FROM (
    SELECT author_id FROM forum_posts
    UNION ALL
    SELECT author_id FROM forum_replies
  ) fa GROUP BY author_id HAVING COUNT(*) >= 10
) authors, badges b
WHERE b.slug = 'community_voice'
ON CONFLICT (user_id, badge_id) DO NOTHING;

INSERT INTO user_badges (user_id, badge_id)
SELECT pr.id, b.id
FROM profiles pr, badges b
WHERE pr.is_verified = TRUE AND b.slug = 'verified_member'
ON CONFLICT (user_id, badge_id) DO NOTHING;

INSERT INTO user_badges (user_id, badge_id)
SELECT DISTINCT r.user_id, b.id
FROM event_rsvps r, badges b
WHERE b.slug = 'event_goer'
ON CONFLICT (user_id, badge_id) DO NOTHING;
