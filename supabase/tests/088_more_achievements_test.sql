-- ============================================================
-- Hand-run test for migration 088 (13 badges, 2 collections).
--
-- Same workflow as 066's test: paste into the Supabase SQL editor
-- and run. It seeds fixtures, asserts, and ROLLBACKs — nothing is
-- left behind. A failing ASSERT aborts with the message shown;
-- silence at the end means every assertion held.
--
-- Most of this file is not about the thirteen new rows. It asserts
-- the invariants that make adding a row safe at all — that a
-- check_key resolves to something the engine actually computes, and
-- that a collection references badges that exist. Both are typo
-- classes that fail silently in production: the badge simply never
-- awards, and nobody notices for months.
--
-- Requires 066, 067 and 088 to be applied first.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_user    UUID := '00000000-0000-4000-8000-000000000088';
  v_other   UUID := '00000000-0000-4000-8000-000000000089';
  v_project UUID := '00000000-0000-4000-8000-0000000000c1';

  v_counts  JSONB;
  v_key     TEXT;
  v_slug    TEXT;
  v_n       INT;
BEGIN
  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_user,  'Fixture 088',  ARRAY['entrepreneur'], 'Saint Lucia'),
         (v_other, 'Follower 088', ARRAY['mentor'],       'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  -- ------------------------------------------------------------
  -- 1. Every check_key resolves to a real metric
  --
  -- The engine matches on (v_counts->>check_key) and COALESCEs a
  -- miss to 0, so a typo'd or unwired key does not error — the badge
  -- is just permanently unearnable. This is the assertion that keeps
  -- that from shipping. 'search_uses' and 'ai_assistant_uses' are
  -- allowlisted in track_my_flag() but incremented by no client code,
  -- which is exactly why 088 defines no badge against them; if one is
  -- ever added before the tracking is wired, this fails here.
  --
  -- The three meta keys are injected by check_achievements_for() on
  -- its second pass rather than by achievement_counts(), so they are
  -- expected to be absent from this payload.
  --
  -- Flag-derived keys only appear once the member has a user_flags
  -- row, so the wired ones are seeded at zero first. That list is the
  -- point of the test, not setup noise: it is the set of flags some
  -- client surface actually calls useTrackFlag() with. Adding a badge
  -- against a fourth flag means wiring the tracking AND adding it
  -- here — if you only do the first, this assertion fails.
  -- ------------------------------------------------------------
  INSERT INTO user_flags (user_id, flag_key, flag_value)
  SELECT v_user, k, 0
  FROM unnest(ARRAY['leaderboard_views', 'achievements_views', 'directory_views']) AS k
  ON CONFLICT (user_id, flag_key) DO NOTHING;

  v_counts := achievement_counts(v_user);

  FOR v_key IN
    SELECT DISTINCT check_key FROM badges
    WHERE check_key IS NOT NULL
      AND check_key NOT IN ('total_points', 'badges_earned', 'hidden_earned')
  LOOP
    ASSERT v_counts ? v_key,
      'badge check_key "' || v_key || '" is not produced by achievement_counts() '
      || '— any badge using it can never be earned';
  END LOOP;

  -- ------------------------------------------------------------
  -- 2. The thirteen new definitions landed and are well formed
  -- ------------------------------------------------------------
  FOR v_slug IN
    SELECT unnest(ARRAY[
      'well_liked','regional_hit','followed_work','must_follow',
      'thread_starter','helpful_hand','network_legend','switchboard',
      'collab_titan','field_notes','reference_shelf','hundred_days','year_one'
    ])
  LOOP
    SELECT COUNT(*) INTO v_n FROM badges WHERE slug = v_slug;
    ASSERT v_n = 1, 'badge ' || v_slug || ' missing — was 088 applied?';
  END LOOP;

  -- Points are derived, never typed. 066's test asserts this globally;
  -- repeated here so running 088's test alone still catches a hand-set
  -- points value in the new rows.
  SELECT COUNT(*) INTO v_n FROM badges WHERE points <> rarity_points(rarity);
  ASSERT v_n = 0, v_n || ' badge(s) have points out of step with their rarity';

  -- ------------------------------------------------------------
  -- 3. No new trophy artwork slot was introduced
  --
  -- The whole point of reusing trophy types is that the art brief
  -- stays at 12 types x 4 tiers. A trophy_type with no rows in
  -- trophy_assets renders as a fallback icon forever, because the
  -- admin grid only offers a cell for types that already exist.
  -- ------------------------------------------------------------
  SELECT COUNT(DISTINCT b.trophy_type) INTO v_n
  FROM badges b
  WHERE b.trophy_type IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM trophy_assets t WHERE t.type = b.trophy_type);
  ASSERT v_n = 0, v_n || ' badge trophy_type(s) have no slot in trophy_assets';

  -- Each type must offer all four tiers or a diamond badge has no art.
  SELECT COUNT(*) INTO v_n
  FROM (SELECT type FROM trophy_assets GROUP BY type HAVING COUNT(DISTINCT tier) <> 4) t;
  ASSERT v_n = 0, v_n || ' trophy type(s) do not have all four tiers seeded';

  -- ------------------------------------------------------------
  -- 4. Collections reference badges that exist
  --
  -- badge_slugs is a plain TEXT[] with no foreign key, so a typo
  -- shows up only as a collection nobody can ever complete.
  -- ------------------------------------------------------------
  FOR v_slug IN
    SELECT DISTINCT s FROM achievement_collections c, unnest(c.badge_slugs) AS s
  LOOP
    SELECT COUNT(*) INTO v_n FROM badges WHERE slug = v_slug;
    ASSERT v_n = 1,
      'collection references unknown badge slug "' || v_slug || '"';
  END LOOP;

  SELECT COUNT(*) INTO v_n FROM achievement_collections
  WHERE slug IN ('first_steps', 'the_scholar');
  ASSERT v_n = 2, 'both 088 collections should exist, found ' || v_n;

  -- ------------------------------------------------------------
  -- 5. Hidden achievements stay hidden
  --
  -- achievement_collections has public SELECT, so listing a hidden
  -- slug in badge_slugs publishes the thing is_hidden withholds.
  -- 088 dropped a 'hidden_vault' collection for this reason; the
  -- assertion is what stops it coming back by accident.
  -- ------------------------------------------------------------
  SELECT COUNT(*) INTO v_n
  FROM achievement_collections c, unnest(c.badge_slugs) AS s
  JOIN badges b ON b.slug = s
  WHERE b.is_hidden;
  ASSERT v_n = 0,
    v_n || ' hidden badge slug(s) are exposed through a public collection';

  -- ------------------------------------------------------------
  -- 6. Sort order stayed unique through the rescale
  --
  -- The gallery sorts on a single global sort_order (category is only
  -- a filter), so a collision makes two badges swap places at random
  -- between loads. 088 multiplies by 10 and inserts at interpolated
  -- values precisely to keep these distinct.
  -- ------------------------------------------------------------
  SELECT COUNT(*) INTO v_n
  FROM (SELECT sort_order FROM badges GROUP BY sort_order HAVING COUNT(*) > 1) t;
  ASSERT v_n = 0, v_n || ' sort_order value(s) are shared by more than one badge';

  -- The rescale ran. Guarded on MAX < 200, so this also proves a
  -- second application of 088 did not multiply a second time.
  SELECT MAX(sort_order) INTO v_n FROM badges;
  ASSERT v_n BETWEEN 200 AND 9000,
    'sort_order scale looks wrong (max ' || v_n || ') — 088 may have rescaled twice';

  -- ------------------------------------------------------------
  -- 7. project_followers actually counts, and excludes self-follows
  --
  -- This key existed since 066 and no badge used it, so it has never
  -- been exercised. Self-follows are excluded at the source; without
  -- that, followed_work is farmable from one extra account.
  -- ------------------------------------------------------------
  INSERT INTO projects (id, title, description, phase, owner_id, is_public)
  VALUES (v_project, 'Fixture 088 Project', 'For the 088 test', 'concept', v_user, TRUE);

  INSERT INTO project_follows (project_id, user_id) VALUES (v_project, v_user)
  ON CONFLICT DO NOTHING;
  v_counts := achievement_counts(v_user);
  ASSERT (v_counts->>'project_followers')::INT = 0,
    'following your own project must not count, got ' || (v_counts->>'project_followers');

  INSERT INTO project_follows (project_id, user_id) VALUES (v_project, v_other)
  ON CONFLICT DO NOTHING;
  v_counts := achievement_counts(v_user);
  ASSERT (v_counts->>'project_followers')::INT = 1,
    'another member following should count once, got ' || (v_counts->>'project_followers');

  -- One follower is well short of ten, so the badge must not award.
  PERFORM check_achievements_for(v_user, FALSE);
  SELECT COUNT(*) INTO v_n
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_user AND b.slug = 'followed_work';
  ASSERT v_n = 0, 'followed_work awarded below its threshold';

  -- ------------------------------------------------------------
  -- 8. Lowering a threshold awards retroactively
  --
  -- The property 088 depends on: it ships definitions only, and the
  -- pull engine backfills them. Proven here by moving the goalposts
  -- to the fixture's single follower.
  -- ------------------------------------------------------------
  UPDATE badges SET check_value = 1 WHERE slug = 'followed_work';
  PERFORM check_achievements_for(v_user, FALSE);
  SELECT COUNT(*) INTO v_n
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_user AND b.slug = 'followed_work';
  ASSERT v_n = 1, 'followed_work should award once its threshold is met';

  RAISE NOTICE 'All 088 assertions passed.';
END $$;

ROLLBACK;
