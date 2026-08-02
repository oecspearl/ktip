-- ============================================================
-- Migration 088: 13 more achievements, 2 more collections
--
-- Data only. Nothing here touches the engine in 066: every
-- check_key below is already derived by achievement_counts(), so
-- the pull engine awards these retroactively on each member's next
-- check with no new code, no new trigger and no backfill job.
--
-- WHAT THIS CLOSES
--   project_followers   derived since 066, used by no badge at all
--   forum_posts         only ever read as part of forum_activity
--   forum_replies       same
--   lifetime likes      067 stopped at 5 (first_spark); 50 and 250 added
--   total_active_days   067 stopped at 30; 100 and 365 added
--   diamond gaps        network and collaboration ladders ended at gold
--   knowledge ladder    2 untiered badges, no collection
--
-- DELIBERATELY NOT ADDED
--   search_uses / ai_assistant_uses are in track_my_flag()'s
--   allowlist but no client code ever increments them, so a badge
--   keyed off either would be unearnable. Wire useTrackFlag() on
--   the search and assistant surfaces first, then add them.
--
--   A 'hidden_vault' collection was considered and dropped:
--   achievement_collections.badge_slugs is public SELECT, so listing
--   the four hidden slugs there would publish exactly what
--   is_hidden exists to withhold.
--
-- RUN ORDER
--   Must run after 067. Section 1 rescales sort_order to make room
--   in the projects band, which 067 had filled contiguously.
--   Re-running 067 on its own reverts that spacing and interleaves
--   the new rows; re-run 088 after it to restore.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. SORT ORDER HEADROOM
--
-- AchievementsPage sorts the gallery on a single global sort_order
-- and uses category only as a filter, so a new project badge
-- numbered above 19 would render after the grants block and split
-- its own category in the "All" view. 067 left no gap in the
-- projects band (10-19, ten badges), so multiply everything by 10
-- and insert at the interpolated values.
--
-- Guarded on the current maximum rather than a flag column: after
-- one pass the max is ~1130, so a second pass is a no-op. The guard
-- assumes no hand-added badge already sits above 200; the admin
-- screen writes 067's numbering, so none does today.
-- ============================================================

DO $$
BEGIN
  IF (SELECT COALESCE(MAX(sort_order), 0) FROM badges) < 200 THEN
    UPDATE badges SET sort_order = sort_order * 10;
  END IF;
END $$;

-- ============================================================
-- 2. NEW BADGE DEFINITIONS
--
-- Same column order and the same rules as 067: points come from
-- rarity_points(), never by hand, and every row is ON CONFLICT DO
-- UPDATE so this file is the source of truth for the rows it owns.
--
-- trophy_type reuses the twelve types 067 already seeded — no new
-- artwork slot is introduced, so the trophy grid stays at 12 x 4.
-- ============================================================

INSERT INTO badges (
  slug, name, description, icon, color, category, rarity, points,
  tier, tier_group, check_key, check_value, is_hidden, sort_order, trophy_type
)
SELECT
  d.slug, d.name, d.description, d.icon, d.color, d.category, d.rarity,
  rarity_points(d.rarity),
  d.tier, d.tier_group, d.check_key, d.check_value, d.is_hidden, d.sort_order, d.trophy_type
FROM (VALUES
  -- ---------- Projects: lifetime likes ----------
  -- Kept out of the 'project_likes' tier_group on purpose. That group
  -- ladders top_project_likes ("one project reached N"); these count
  -- likes across every project. Two different claims, so they are not
  -- rungs of the same ladder even though both are about likes.
  ('well_liked',      'Well Liked',      'Your projects have earned 50 likes in total',        'heart',          'tropical', 'projects',  'rare',      NULL,      NULL,        'project_likes_received', 50,  FALSE, 145, 'rocket'),
  ('regional_hit',    'Regional Hit',    'Your projects have earned 250 likes in total',       'heart',          'sun',      'projects',  'epic',      NULL,      NULL,        'project_likes_received', 250, FALSE, 147, 'rocket'),

  -- ---------- Projects: followers ----------
  -- project_followers excludes self-follows at the source (066),
  -- so this cannot be farmed from your own account.
  ('followed_work',   'Followed Work',   '10 members are following your projects',             'users',          'ocean',    'projects',  'uncommon',  'bronze',  'followers', 'project_followers',      10,  FALSE, 182, 'rocket'),
  ('must_follow',     'Must-Follow',     '50 members are following your projects',             'users',          'ocean',    'projects',  'rare',      'silver',  'followers', 'project_followers',      50,  FALSE, 184, 'rocket'),

  -- ---------- Community: posts and replies, separately ----------
  -- 067 only ever rewards forum_activity (posts + replies combined),
  -- which pays the same for starting a discussion and for answering
  -- one. These name the two behaviours apart.
  ('thread_starter',  'Thread Starter',  'Started 10 forum discussions',                       'message-square', 'ocean',    'community', 'uncommon',  NULL,      NULL,        'forum_posts',            10,  FALSE, 445, 'megaphone'),
  ('helpful_hand',    'Helpful Hand',    'Replied to 25 forum discussions',                    'message-circle', 'tropical', 'community', 'uncommon',  NULL,      NULL,        'forum_replies',          25,  FALSE, 447, 'megaphone'),

  -- ---------- Network ----------
  -- Diamond rung for a ladder 067 ended at gold (super_connector, 50).
  ('network_legend',  'Network Legend',  'Made 150 connections',                               'users',          'sun',      'network',   'epic',      'diamond', 'network',   'connections_accepted',   150, FALSE, 525, 'handshake'),
  ('switchboard',     'Switchboard',     'Held conversations with 50 different members',       'send',           'ocean',    'network',   'rare',      NULL,      NULL,        'distinct_conversations', 50,  FALSE, 545, 'handshake'),

  -- ---------- Collaboration ----------
  -- Diamond rung; 067 ended at collab_hub (gold, 25).
  ('collab_titan',    'Collaboration Titan','Shared collaborative work 100 times',             'share-2',        'sun',      'collaboration','epic',   'diamond', 'collaboration','collab_shares',       100, FALSE, 645, 'scroll'),

  -- ---------- Knowledge ----------
  -- Turns two loose badges into a four-rung ladder, which is what
  -- makes the_scholar collection below worth having.
  ('field_notes',     'Field Notes',     'Published 3 resources to the library',               'book-open',      'ocean',    'knowledge', 'uncommon',  NULL,      NULL,        'resources_published',    3,   FALSE, 705, 'beaker'),
  ('reference_shelf', 'Reference Shelf', 'Published 25 resources to the library',              'book-open',      'sun',      'knowledge', 'legendary', NULL,      NULL,        'resources_published',    25,  FALSE, 715, 'beaker'),

  -- ---------- Dedication ----------
  -- Total days active, not consecutive: the streak ladder (streak_3
  -- ... streak_100) already rewards consecutive. This rewards
  -- sticking around, which is survivable after a holiday.
  ('hundred_days',    'Hundred Days',    'Active on 100 separate days',                        'calendar-check', 'sand',     'dedication','rare',      NULL,      NULL,        'total_active_days',      100, FALSE, 945, 'flame'),
  ('year_one',        'Year One',        'Active on 365 separate days',                        'calendar-check', 'sun',      'dedication','legendary', NULL,      NULL,        'total_active_days',      365, FALSE, 947, 'flame')
) AS d(
  slug, name, description, icon, color, category, rarity,
  tier, tier_group, check_key, check_value, is_hidden, sort_order, trophy_type
)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  color       = EXCLUDED.color,
  category    = EXCLUDED.category,
  rarity      = EXCLUDED.rarity,
  points      = EXCLUDED.points,
  tier        = EXCLUDED.tier,
  tier_group  = EXCLUDED.tier_group,
  check_key   = EXCLUDED.check_key,
  check_value = EXCLUDED.check_value,
  is_hidden   = EXCLUDED.is_hidden,
  sort_order  = EXCLUDED.sort_order,
  trophy_type = EXCLUDED.trophy_type;

-- ============================================================
-- 3. NEW COLLECTIONS
--
-- 067 shipped seven, covering five of the nine categories.
-- 'knowledge' and 'profile' had none. Progress is derived from
-- badge_slugs by the engine, so a collection needs no schema.
--
-- first_steps is numbered 0 so it leads the list — it is the one
-- collection a brand-new member can finish in a sitting, and it
-- should be the first thing they see.
-- ============================================================

INSERT INTO achievement_collections (slug, name, description, icon, badge_slugs, sort_order)
VALUES
  ('first_steps', 'First Steps', 'Set yourself up on KTIP', 'user-check',
   ARRAY['all_filled_in','verified_member','many_hats','first_project','first_connection'], 0),
  ('the_scholar', 'The Scholar', 'Publish what you know to the library', 'book-open',
   ARRAY['published','field_notes','prolific_author','reference_shelf'], 8)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  badge_slugs = EXCLUDED.badge_slugs,
  sort_order  = EXCLUDED.sort_order;

-- ============================================================
-- 4. BACKFILL
--
-- Same reasoning as 067: award retroactively and silently, so a
-- member who published 30 resources last year does not wake up to
-- a wall of notifications for work they finished months ago.
--
-- The streak hazard is different this time. 067 ran on a cold
-- system and could safely DELETE every CURRENT_DATE activity row
-- afterwards. Here members have live streaks, and some of them
-- were genuinely active today — deleting their row would break a
-- real streak. So record who already had today marked before the
-- backfill runs, and clear only the rows the backfill itself
-- created.
-- ============================================================

DO $$
DECLARE
  v_user RECORD;
  v_already UUID[];
BEGIN
  SELECT COALESCE(array_agg(user_id), ARRAY[]::UUID[])
  INTO v_already
  FROM user_activity_days
  WHERE activity_date = CURRENT_DATE;

  FOR v_user IN
    SELECT id FROM profiles WHERE COALESCE(is_suspended, FALSE) = FALSE
  LOOP
    -- One bad row must not abort the deploy; the member's next
    -- check picks them up regardless.
    BEGIN
      PERFORM check_achievements_for(v_user.id, FALSE);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'achievement backfill skipped for %: %', v_user.id, SQLERRM;
    END;
  END LOOP;

  DELETE FROM user_activity_days d
  WHERE d.activity_date = CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM _already_active_today a WHERE a.user_id = d.user_id
    );
END $$;
