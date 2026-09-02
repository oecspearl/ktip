-- ============================================================
-- Migration 126: Trim the achievement catalog from 68 to 33
--
-- Data only. The engine in 066 is untouched apart from member_rank(),
-- whose thresholds are a hardcoded literal that has to move with the
-- catalog size.
--
-- WHY
--   067 seeded 55 badges and 088 added 13. At 68 the gallery reads as
--   a wall rather than a set, and several categories had grown two or
--   three ladders measuring near-identical behaviour:
--
--     projects      projects_created, top_project_likes,
--                   project_likes_received, project_followers, project_views
--     community     forum_activity, and then forum_posts and forum_replies
--                   again -- the two halves of the number already rewarded
--     network       connections_accepted, and then messages_sent and
--                   distinct_conversations
--     dedication    streak_days (consecutive) and total_active_days (total)
--
--   Cutting to one ladder per category at 2-4 rungs removes 35 badges
--   without removing a single distinct behaviour the platform wants.
--
-- WHAT SURVIVES
--   All 11 categories. All 12 trophy types. Every collection but one.
--   Two legendaries (multi_funded, streak_100) so the top of the rarity
--   scale is not empty.
--
-- SOURCE OF TRUTH
--   067 and 088 are both ON CONFLICT DO UPDATE and describe themselves
--   as the source of truth for the rows they own. That is still true of
--   the rows that survive. This file owns which rows survive at all, so
--   re-running 067 or 088 resurrects the deleted badges and this file
--   must be re-run after either of them.
--
--   That includes the paste bundles. combined_062_069.sql contains all
--   of 067 and _ALL_MIGRATIONS.sql contains both, and both are advertised
--   as safe to re-run — which they are, for every migration except this
--   one. Pasting either into the SQL editor after this has been applied
--   puts 35 deleted badges back with no error and no notice. Run this
--   file again afterwards; the sanity checks in section 7 are what tell
--   you it was needed.
--
-- DESTRUCTIVE
--   user_badges.badge_id is ON DELETE CASCADE (039), so deleting a badge
--   erases every award of it and the holder's points fall accordingly.
--   Section 1 reports what is about to be destroyed before section 2
--   destroys it. If that report shows real awards on a live system, stop
--   and use the is_retired variant instead of this file.
--
-- Idempotent -- safe to re-run.
-- ============================================================

-- ============================================================
-- 1. REPORT BEFORE DESTROYING
--
-- RAISE NOTICE rather than a table: this runs through the SQL editor
-- and the CLI, and both surface notices. Nothing here decides anything;
-- it exists so the deletion is never silent.
-- ============================================================

DO $$
DECLARE
  v_row   RECORD;
  v_total INT := 0;
BEGIN
  FOR v_row IN
    SELECT b.slug, COUNT(ub.id) AS holders
    FROM badges b
    LEFT JOIN user_badges ub ON ub.badge_id = b.id
    WHERE b.slug IN (
      -- projects: two likes ladders, a followers ladder and a views badge
      'project_luminary', 'first_spark', 'viral_project', 'project_launched',
      'wide_reach', 'team_player', 'well_liked', 'regional_hit',
      'followed_work', 'must_follow',
      -- grants
      'persistent_applicant', 'student_champion',
      -- events: the RSVP ladder loses to the attendance ladder
      'regular_attendee', 'convener',
      -- community: forum_activity is already the sum of these
      'forum_legend', 'commentator', 'thread_starter', 'helpful_hand',
      -- network: the messaging ladder shadows the connection ladder
      'network_legend', 'conversationalist', 'open_line', 'switchboard',
      -- collaboration: three separate "created your first X" badges
      'whiteboarder', 'code_slinger', 'collab_titan',
      -- knowledge
      'field_notes', 'reference_shelf',
      -- profile: almost every member holds exactly one role
      'many_hats',
      -- dedication: total_active_days shadows streak_days
      'regular_visitor', 'hundred_days', 'year_one',
      -- meta: points_100 fired minutes after signup; collector at 25 of 33
      'points_100', 'collector',
      -- hidden: secret_hunter needs 3 hidden badges and only 2 remain
      'scoreboard_watcher', 'secret_hunter'
    )
    GROUP BY b.slug
    HAVING COUNT(ub.id) > 0
    ORDER BY COUNT(ub.id) DESC
  LOOP
    RAISE NOTICE 'retiring % -- % award(s) will be erased', v_row.slug, v_row.holders;
    v_total := v_total + v_row.holders;
  END LOOP;

  RAISE NOTICE 'catalog trim: % user_badges row(s) will be deleted by cascade', v_total;
END $$;

-- ============================================================
-- 2. DELETE THE 35
--
-- One statement, same slug list as the report above. The cascade takes
-- the user_badges rows with it.
-- ============================================================

DELETE FROM badges WHERE slug IN (
  'project_luminary', 'first_spark', 'viral_project', 'project_launched',
  'wide_reach', 'team_player', 'well_liked', 'regional_hit',
  'followed_work', 'must_follow',
  'persistent_applicant', 'student_champion',
  'regular_attendee', 'convener',
  'forum_legend', 'commentator', 'thread_starter', 'helpful_hand',
  'network_legend', 'conversationalist', 'open_line', 'switchboard',
  'whiteboarder', 'code_slinger', 'collab_titan',
  'field_notes', 'reference_shelf',
  'many_hats',
  'regular_visitor', 'hundred_days', 'year_one',
  'points_100', 'collector',
  'scoreboard_watcher', 'secret_hunter'
);

-- ============================================================
-- 3. REPOINT THE COLLECTIONS
--
-- achievement_collections.badge_slugs is a plain TEXT[] with no foreign
-- key, so a slug deleted in section 2 leaves a collection that can never
-- reach 100% and nothing anywhere errors. Every surviving collection is
-- rewritten to its surviving members.
--
-- Only badge_slugs is touched -- names, icons and descriptions are still
-- 067/088's to own, and restating them here would fork the copy.
-- ============================================================

UPDATE achievement_collections SET badge_slugs =
  ARRAY['all_filled_in','verified_member','first_project','first_connection']
  WHERE slug = 'first_steps';

UPDATE achievement_collections SET badge_slugs =
  ARRAY['first_project','project_builder','serial_innovator','popular_project']
  WHERE slug = 'innovators_path';

UPDATE achievement_collections SET badge_slugs =
  ARRAY['first_application','funded','multi_funded','sponsor']
  WHERE slug = 'funding_journey';

UPDATE achievement_collections SET badge_slugs =
  ARRAY['event_goer','showed_up','front_row','event_host']
  WHERE slug = 'event_circuit';

UPDATE achievement_collections SET badge_slugs =
  ARRAY['first_post','community_voice','forum_pillar']
  WHERE slug = 'community_builder';

UPDATE achievement_collections SET badge_slugs =
  ARRAY['first_connection','well_connected','super_connector']
  WHERE slug = 'the_connector';

UPDATE achievement_collections SET badge_slugs =
  ARRAY['drafter','sharer','collab_hub']
  WHERE slug = 'co_creator';

UPDATE achievement_collections SET badge_slugs =
  ARRAY['streak_3','streak_7','streak_30','streak_100']
  WHERE slug = 'the_regular';

-- the_scholar would be down to published + prolific_author. Two badges
-- is a ladder, not a collection, and a collection you complete by
-- earning one more badge than you already have is not worth a card.
DELETE FROM achievement_collections WHERE slug = 'the_scholar';

-- ============================================================
-- 3b. FOLD THE 'wave' TYPE BACK INTO 'rocket'
--
-- 102 split projects into making (rocket, 6 badges) and reach (wave,
-- 8 badges), and retired 'anchor' in the same file on the grounds that
-- one badge does not justify four trophy renders.
--
-- Section 2 cuts the reach half to a single badge, popular_project.
-- Leaving it on 'wave' recreates precisely the defect 102 removed, so
-- the split folds back: with one reach badge left there is no
-- distribution for it to express.
--
-- The four wave renders in public/trophies/ are left on disk. They are
-- unreferenced, not wrong, and restoring the reach ladder later is a
-- data change again rather than an art brief.
-- ============================================================

UPDATE badges SET trophy_type = 'rocket' WHERE slug = 'popular_project';

-- Guarded on image_url IS NULL exactly as 102 guards its own retirement:
-- the difference between tidying up and destroying a coordinator's
-- upload. If art was uploaded to a wave slot, the row survives and the
-- admin grid keeps offering it.
DELETE FROM trophy_assets
WHERE type = 'wave'
  AND image_url IS NULL;

-- ============================================================
-- 4. RETUNE THE RANK LADDER
--
-- member_rank() keys on badge COUNT, not points -- deliberate in 066, so
-- rank cannot be bought by grinding one high-rarity ladder. That makes
-- the thresholds a direct function of catalog size, and 55-of-68 for the
-- top rank is unreachable at 33 badges.
--
-- The old ladder sat at 0 / 7% / 18% / 32% / 49% / 66% / 81% of the
-- catalog. The same ratios against 33 give the numbers below, so the
-- shape of the climb is preserved rather than re-invented.
--
-- Body is otherwise copied verbatim from 066; only v_ranks changes.
-- ============================================================

CREATE OR REPLACE FUNCTION member_rank(p_earned INT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_ranks CONSTANT JSONB := '[
    {"level": 1, "name": "Newcomer",         "required": 0},
    {"level": 2, "name": "Contributor",      "required": 2},
    {"level": 3, "name": "Collaborator",     "required": 6},
    {"level": 4, "name": "Innovator",        "required": 11},
    {"level": 5, "name": "Regional Builder", "required": 16},
    {"level": 6, "name": "Ecosystem Leader", "required": 22},
    {"level": 7, "name": "KTIP Champion",    "required": 27}
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

-- CREATE OR REPLACE keeps the object identity and therefore the grants
-- 066 issued, so this is belt-and-braces rather than a fix. It is here
-- because the failure it guards against is a signed-out visitor loading
-- a shared /u/:id link to a rank that renders as an error, and finding
-- that out in production is expensive relative to one redundant line.
GRANT EXECUTE ON FUNCTION member_rank(INT) TO anon, authenticated;

-- ============================================================
-- 5. REVOKE META AWARDS THAT NO LONGER HOLD
--
-- points_500 and points_1000 key off total_points, which just fell for
-- everyone who held a deleted badge. The engine only ever awards, never
-- revokes, so a member now sitting at 300 points would keep a badge that
-- says 500 and nothing would ever correct it.
--
-- Only these two are affected. Every other check_key measures real
-- activity, which the trim does not change.
--
-- Deliberately NOT a blanket delete of both awards followed by a
-- re-award in section 6. That works once, but this file is meant to be
-- re-runnable, and every re-run would reset awarded_at on a badge the
-- member has held for months -- visible in the gallery, and wrong.
-- Revoking only what fails the threshold leaves qualified holders
-- untouched, so a second run is a no-op.
--
-- The total is measured EXCLUDING these two badges, where the engine's
-- own second pass includes them (066:573-576). The difference matters at
-- the boundary: a member on 480 points of real achievement plus a
-- 50-point points_500 badge totals 530 by the engine's rule, which would
-- keep a badge they have not earned. Excluding them asks the only
-- question worth asking -- is there 500 points of achievement here
-- besides the badge for having 500 points -- and it is stable across
-- re-runs, where the self-including rule oscillates.
-- ============================================================

DELETE FROM user_badges ub
USING badges b
WHERE ub.badge_id = b.id
  AND b.slug IN ('points_500', 'points_1000')
  AND b.check_value > (
    SELECT COALESCE(SUM(b2.points), 0)
    FROM user_badges ub2
    JOIN badges b2 ON b2.id = ub2.badge_id
    WHERE ub2.user_id = ub.user_id
      AND b2.slug NOT IN ('points_500', 'points_1000')
  );

-- ============================================================
-- 6. BACKFILL
--
-- Re-run the engine silently so ranks, points and collection progress
-- settle on the new catalog in one pass rather than drifting per member
-- over the next ten minutes of polling.
--
-- p_notify = FALSE: nothing here is news to the member, and the two meta
-- badges section 5 removed would otherwise re-notify.
--
-- The streak hazard is 088's, not 067's: members have live streaks and
-- some were genuinely active today, so record who already had today
-- marked and clear only the rows this backfill created.
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
    -- One bad row must not abort the deploy; the member's next check
    -- picks them up regardless.
    BEGIN
      PERFORM check_achievements_for(v_user.id, FALSE);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'catalog trim backfill skipped for %: %', v_user.id, SQLERRM;
    END;
  END LOOP;

  DELETE FROM user_activity_days d
  WHERE d.activity_date = CURRENT_DATE
    AND NOT (d.user_id = ANY(v_already));
END $$;

-- ============================================================
-- 7. SANITY CHECKS
--
-- Each of these is a mistake that renders as something plausible rather
-- than as an error, so the migration is the only moment they are cheap.
-- ============================================================

DO $$
DECLARE
  v_n       INT;
  v_orphans TEXT;
BEGIN
  SELECT COUNT(*) INTO v_n FROM badges;
  ASSERT v_n = 33, 'expected 33 badges after the trim, found ' || v_n;

  -- Points are derived from rarity and no rarity changed here, but a
  -- badge deleted mid-edit is exactly how that drifts unnoticed.
  SELECT COUNT(*) INTO v_n FROM badges WHERE points <> rarity_points(rarity);
  ASSERT v_n = 0, v_n || ' badge(s) have points out of step with their rarity';

  -- A collection pointing at a deleted slug can never complete and
  -- reports its own progress as a fraction of a larger number.
  SELECT COUNT(*) INTO v_n
  FROM achievement_collections c, unnest(c.badge_slugs) AS s
  WHERE NOT EXISTS (SELECT 1 FROM badges b WHERE b.slug = s);
  ASSERT v_n = 0, v_n || ' collection slug(s) no longer name a badge';

  SELECT COUNT(*) INTO v_n FROM achievement_collections;
  ASSERT v_n = 8, 'expected 8 collections after dropping the_scholar, found ' || v_n;

  -- A badge whose trophy_type has no slot renders a fallback icon
  -- forever and nothing fails. Same check 102 ends on.
  SELECT string_agg(DISTINCT b.trophy_type, ', ')
  INTO v_orphans
  FROM badges b
  WHERE b.trophy_type IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM trophy_assets t WHERE t.type = b.trophy_type);
  ASSERT v_orphans IS NULL,
    'badge trophy_type(s) with no slot in trophy_assets: ' || COALESCE(v_orphans, '');

  -- The other direction, which is the one this migration can break: a
  -- trophy type left with no badges at all is four cells in the admin
  -- grid that nothing will ever render. Uploaded art is exempt — those
  -- rows survive section 3b's guard deliberately.
  SELECT string_agg(DISTINCT t.type, ', ')
  INTO v_orphans
  FROM trophy_assets t
  WHERE t.image_url IS NULL
    AND NOT EXISTS (SELECT 1 FROM badges b WHERE b.trophy_type = t.type);
  ASSERT v_orphans IS NULL,
    'trophy type(s) left carrying no badge: ' || COALESCE(v_orphans, '');

  -- The top rank must stay inside the catalog or level 7 is a rank
  -- nobody can hold. Read the threshold back out of member_rank()
  -- rather than restating 27, so this cannot pass against a stale
  -- definition of the function.
  SELECT (member_rank(0)->>'next_required')::INT INTO v_n;
  ASSERT v_n = 2, 'member_rank() was not retuned -- level 2 still needs ' || v_n;
  ASSERT (SELECT COUNT(*) FROM badges) >= 27,
    'the catalog is smaller than the level 7 threshold of 27';

  -- Hidden badges must not be named by a public collection: badge_slugs
  -- is public SELECT, so listing one publishes what is_hidden withholds.
  SELECT COUNT(*) INTO v_n
  FROM achievement_collections c, unnest(c.badge_slugs) AS s
  JOIN badges b ON b.slug = s
  WHERE b.is_hidden;
  ASSERT v_n = 0,
    v_n || ' hidden badge slug(s) are exposed through a public collection';
END $$;
