-- ============================================================
-- Hand-run test for migration 126 (catalog trim, 68 badges -> 33).
--
-- Same workflow as 066's test: paste into the Supabase SQL editor and
-- run. It seeds fixtures, asserts, and ROLLBACKs — nothing is left
-- behind. A failing ASSERT aborts with the message shown; silence at
-- the end means every assertion held.
--
-- REPLACES supabase/tests/088_more_achievements_test.sql, which asserted
-- the existence of the thirteen badges 126 deletes. Most of that file
-- was never about those thirteen rows — it asserted the invariants that
-- make changing the catalog safe at all, and those matter more after a
-- deletion than after an insertion. They are carried forward here,
-- retargeted at badges that survive.
--
-- The failure mode throughout is silence. A badge whose check_key the
-- engine does not compute is simply never earned. A collection naming a
-- deleted slug can never complete. A rank threshold above the catalog
-- size is a rank nobody holds. None of these raise anything in
-- production; all of them are one ASSERT here.
--
-- Requires 066, 067, 088, 102, 103 and 126 to be applied first.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_user    UUID := '00000000-0000-4000-8000-000000000126';
  v_other   UUID := '00000000-0000-4000-8000-000000000127';
  v_project UUID := '00000000-0000-4000-8000-0000000000d1';

  v_counts  JSONB;
  v_key     TEXT;
  v_slug    TEXT;
  v_n       INT;
  v_before  INT;
BEGIN
  -- auth.users first: profiles.id is a foreign key to it (000:11), and
  -- 000's on_auth_user_created trigger inserts the profile for us, so the
  -- profiles statement below is an UPDATE in practice. It stays an
  -- INSERT ... ON CONFLICT so the fixture survives that trigger being
  -- removed. Everything is inside the transaction this file ROLLBACKs.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    raw_user_meta_data, created_at, updated_at
  )
  VALUES
    (v_user,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'fixture-126@example.test', '', '{"display_name":"Fixture 126"}'::JSONB, now(), now()),
    (v_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'liker-126@example.test',   '', '{"display_name":"Liker 126"}'::JSONB, now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_user,  'Fixture 126', ARRAY['entrepreneur'], 'Saint Lucia'),
         (v_other, 'Liker 126',   ARRAY['mentor'],       'Saint Lucia')
  ON CONFLICT (id) DO UPDATE
    SET roles = EXCLUDED.roles,
        display_name = EXCLUDED.display_name,
        country = EXCLUDED.country;

  -- ------------------------------------------------------------
  -- 1. The trim landed at the size it claims
  --
  -- 126's own section 7 asserts this too. Repeated here because that
  -- assertion only ever runs once, at deploy, and this file is what
  -- catches 067 or 088 being re-run afterwards — which resurrects every
  -- deleted row and is the single most likely way this regresses.
  -- ------------------------------------------------------------
  SELECT COUNT(*) INTO v_n FROM badges;
  ASSERT v_n = 33,
    'expected 33 badges, found ' || v_n
    || ' — 067 or 088 may have been re-run without re-running 126';

  -- Spot-check both directions rather than listing all 33: one survivor
  -- per reason-to-cut, and one deletion per category that lost a ladder.
  FOR v_slug IN
    SELECT unnest(ARRAY[
      'first_project','popular_project','funded','multi_funded','sponsor',
      'showed_up','front_row','forum_pillar','super_connector','collab_hub',
      'prolific_author','verified_member','streak_100','points_1000','curious'
    ])
  LOOP
    SELECT COUNT(*) INTO v_n FROM badges WHERE slug = v_slug;
    ASSERT v_n = 1, 'badge ' || v_slug || ' should have survived the trim';
  END LOOP;

  FOR v_slug IN
    SELECT unnest(ARRAY[
      -- one per shadowed metric: the case 126 exists to fix
      'well_liked',        -- project_likes_received shadows top_project_likes
      'thread_starter',    -- forum_posts is half of forum_activity
      'helpful_hand',      -- forum_replies is the other half
      'conversationalist', -- messages_sent shadows connections_accepted
      'hundred_days',      -- total_active_days shadows streak_days
      -- and the four cut for their own reasons
      'many_hats',         -- almost every member holds exactly one role
      'points_100',        -- fired minutes after signup
      'collector',         -- 25 of 33 is near-max, not a milestone
      'secret_hunter'      -- needs 3 hidden badges; 2 remain
    ])
  LOOP
    SELECT COUNT(*) INTO v_n FROM badges WHERE slug = v_slug;
    ASSERT v_n = 0, 'badge ' || v_slug || ' should have been deleted by 126';
  END LOOP;

  -- ------------------------------------------------------------
  -- 2. Every check_key still resolves to a real metric
  --
  -- Carried forward from 088's test unchanged in intent. The engine
  -- matches on (v_counts->>check_key) and COALESCEs a miss to 0, so an
  -- unwired key does not error — the badge is just permanently
  -- unearnable. Deleting badges cannot break this, but re-adding one
  -- later can, and this is where that gets caught.
  --
  -- 'total_points' is injected by check_achievements_for() on its second
  -- pass rather than by achievement_counts(), so it is expected to be
  -- absent from this payload. 'badges_earned' and 'hidden_earned' were
  -- also second-pass keys; no surviving badge uses either, but they stay
  -- in the exclusion list so re-adding a badge against one does not fail
  -- here for the wrong reason.
  --
  -- Flag-derived keys only appear once the member has a user_flags row,
  -- so the wired ones are seeded at zero first. 'leaderboard_views' is
  -- still seeded even though scoreboard_watcher is gone: the flag is
  -- still tracked by LeaderboardPage, and dropping it from this list
  -- would hide a regression in the tracking rather than in the catalog.
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

  -- Points are derived from rarity, never typed. No rarity changed in
  -- 126, which is exactly the kind of assumption that goes stale.
  SELECT COUNT(*) INTO v_n FROM badges WHERE points <> rarity_points(rarity);
  ASSERT v_n = 0, v_n || ' badge(s) have points out of step with their rarity';

  -- The ceiling the meta ladder is tuned against. points_500 and
  -- points_1000 are 33% and 66% of this; if the catalog moves again and
  -- this number falls, points_1000 becomes unreachable and nothing says so.
  SELECT SUM(points) INTO v_n FROM badges;
  ASSERT v_n = 1515, 'expected a 1515-point ceiling after the trim, found ' || v_n;
  ASSERT v_n >= (SELECT MAX(check_value) FROM badges WHERE check_key = 'total_points'),
    'the points ceiling is below the highest total_points threshold';

  -- ------------------------------------------------------------
  -- 3. Trophy art, both directions
  --
  -- A badge pointing at a type with no slot renders a fallback icon
  -- forever. A type left carrying no badge is four admin-grid cells that
  -- nothing will ever render — the defect 102 removed by retiring
  -- 'anchor', and the one 126 would have recreated on 'wave' had it not
  -- folded popular_project back into 'rocket'.
  -- ------------------------------------------------------------
  SELECT COUNT(DISTINCT b.trophy_type) INTO v_n
  FROM badges b
  WHERE b.trophy_type IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM trophy_assets t WHERE t.type = b.trophy_type);
  ASSERT v_n = 0, v_n || ' badge trophy_type(s) have no slot in trophy_assets';

  SELECT COUNT(DISTINCT t.type) INTO v_n
  FROM trophy_assets t
  WHERE t.image_url IS NULL
    AND NOT EXISTS (SELECT 1 FROM badges b WHERE b.trophy_type = t.type);
  ASSERT v_n = 0, v_n || ' trophy type(s) carry no badge at all';

  -- Each type must still offer all four tiers or a diamond badge has no art.
  SELECT COUNT(*) INTO v_n
  FROM (SELECT type FROM trophy_assets GROUP BY type HAVING COUNT(DISTINCT tier) <> 4) t;
  ASSERT v_n = 0, v_n || ' trophy type(s) do not have all four tiers seeded';

  -- 102's twelve, less 'wave'. Asserted over badges rather than over
  -- trophy_assets: 126 only retires a wave slot that has no uploaded
  -- image, so counting slots would fail on a database where a
  -- coordinator happened to upload wave art before the deploy. What
  -- must hold either way is that eleven types carry the catalog.
  SELECT COUNT(DISTINCT trophy_type) INTO v_n
  FROM badges WHERE trophy_type IS NOT NULL;
  ASSERT v_n = 11, 'expected 11 trophy types in use after the fold, found ' || v_n;

  SELECT COUNT(*) INTO v_n FROM badges WHERE trophy_type = 'wave';
  ASSERT v_n = 0, 'wave should carry no badges after 126 folded it into rocket';

  -- ------------------------------------------------------------
  -- 4. Collections reference badges that exist
  --
  -- badge_slugs is a plain TEXT[] with no foreign key. Before 126 the
  -- risk was a typo; after it, the risk is a slug the trim deleted —
  -- same silent outcome, a collection nobody can ever complete, and now
  -- reachable by forgetting a single UPDATE in section 3 of 126.
  -- ------------------------------------------------------------
  FOR v_slug IN
    SELECT DISTINCT s FROM achievement_collections c, unnest(c.badge_slugs) AS s
  LOOP
    SELECT COUNT(*) INTO v_n FROM badges WHERE slug = v_slug;
    ASSERT v_n = 1,
      'collection references badge slug "' || v_slug || '", which no longer exists';
  END LOOP;

  SELECT COUNT(*) INTO v_n FROM achievement_collections;
  ASSERT v_n = 8, 'expected 8 collections after dropping the_scholar, found ' || v_n;

  SELECT COUNT(*) INTO v_n FROM achievement_collections WHERE slug = 'the_scholar';
  ASSERT v_n = 0,
    'the_scholar should be gone — at 2 badges it is a ladder, not a collection';

  -- A collection of one or two is not worth a card either. This is the
  -- rule the_scholar was deleted under, asserted rather than remembered.
  SELECT COUNT(*) INTO v_n
  FROM achievement_collections WHERE cardinality(badge_slugs) < 3;
  ASSERT v_n = 0, v_n || ' collection(s) are down to fewer than 3 badges';

  -- ------------------------------------------------------------
  -- 5. Hidden achievements stay hidden
  --
  -- achievement_collections has public SELECT, so listing a hidden slug
  -- in badge_slugs publishes what is_hidden withholds. Unchanged from
  -- 088's test; still the assertion that stops a 'hidden_vault'
  -- collection coming back by accident.
  -- ------------------------------------------------------------
  SELECT COUNT(*) INTO v_n
  FROM achievement_collections c, unnest(c.badge_slugs) AS s
  JOIN badges b ON b.slug = s
  WHERE b.is_hidden;
  ASSERT v_n = 0,
    v_n || ' hidden badge slug(s) are exposed through a public collection';

  -- No badge may key off hidden_earned any more. secret_hunter needed 3
  -- and 2 hidden badges remain, so such a badge would be unearnable
  -- while looking perfectly well formed.
  SELECT COUNT(*) INTO v_n FROM badges WHERE is_hidden;
  ASSERT v_n = 2, 'expected 2 hidden badges after the trim, found ' || v_n;

  SELECT COUNT(*) INTO v_n
  FROM badges WHERE check_key = 'hidden_earned' AND check_value > 2;
  ASSERT v_n = 0,
    'a badge requires more hidden achievements than the catalog contains';

  -- ------------------------------------------------------------
  -- 6. Sort order is still unique
  --
  -- The gallery sorts on a single global sort_order (category is only a
  -- filter), so a collision makes two badges swap places at random
  -- between loads. 126 deletes rows rather than renumbering them, so the
  -- gaps it leaves are harmless and the uniqueness 088's rescale
  -- established should be intact.
  -- ------------------------------------------------------------
  SELECT COUNT(*) INTO v_n
  FROM (SELECT sort_order FROM badges GROUP BY sort_order HAVING COUNT(*) > 1) t;
  ASSERT v_n = 0, v_n || ' sort_order value(s) are shared by more than one badge';

  -- ------------------------------------------------------------
  -- 7. The rank ladder fits inside the catalog
  --
  -- member_rank() keys on badge COUNT, not points, so its thresholds are
  -- a direct function of catalog size. Leaving 067's ladder in place
  -- after this trim would put level 7 at 55 badges out of 33 — a rank
  -- that renders correctly, sorts correctly, and can never be held.
  -- ------------------------------------------------------------
  ASSERT (member_rank(0)->>'next_required')::INT = 2,
    'member_rank() was not retuned by 126';
  ASSERT (member_rank(26)->>'level')::INT = 6, '26 achievements should be level 6';
  ASSERT (member_rank(27)->>'level')::INT = 7, '27 achievements should reach level 7';
  ASSERT member_rank(999)->>'next_required' IS NULL,
    'the top rank must report no next threshold so the UI can say so';

  SELECT COUNT(*) INTO v_n FROM badges;
  ASSERT v_n >= 27,
    'the catalog (' || v_n || ') is smaller than the level 7 threshold of 27';

  -- ------------------------------------------------------------
  -- 8. Anti-gaming survives the trim
  --
  -- top_project_likes is now the only likes metric with a badge behind
  -- it, so the self-like exclusion that used to be covered incidentally
  -- by project_likes_received badges is now covered only here.
  -- ------------------------------------------------------------
  INSERT INTO projects (id, title, description, phase, owner_id, is_public)
  VALUES (v_project, 'Fixture 126 Project', 'For the 126 test', 'concept', v_user, TRUE);

  INSERT INTO project_likes (project_id, user_id) VALUES (v_project, v_user)
  ON CONFLICT DO NOTHING;
  v_counts := achievement_counts(v_user);
  ASSERT (v_counts->>'top_project_likes')::INT = 0,
    'liking your own project must not count, got ' || (v_counts->>'top_project_likes');

  INSERT INTO project_likes (project_id, user_id) VALUES (v_project, v_other)
  ON CONFLICT DO NOTHING;
  v_counts := achievement_counts(v_user);
  ASSERT (v_counts->>'top_project_likes')::INT = 1,
    'another member liking should count once, got ' || (v_counts->>'top_project_likes');

  -- One like is well short of 25, so the badge must not award.
  PERFORM check_achievements_for(v_user, FALSE);
  SELECT COUNT(*) INTO v_n
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_user AND b.slug = 'popular_project';
  ASSERT v_n = 0, 'popular_project awarded below its threshold';

  -- ------------------------------------------------------------
  -- 9. Lowering a threshold still awards retroactively
  --
  -- The property the whole design depends on: definitions ship as data
  -- and the pull engine backfills them. It is what makes 126 a data
  -- migration rather than an engine change, and what would make
  -- restoring any deleted badge a data change too.
  -- ------------------------------------------------------------
  UPDATE badges SET check_value = 1 WHERE slug = 'popular_project';
  PERFORM check_achievements_for(v_user, FALSE);
  SELECT COUNT(*) INTO v_n
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_user AND b.slug = 'popular_project';
  ASSERT v_n = 1, 'popular_project should award once its threshold is met';

  -- ------------------------------------------------------------
  -- 10. Holder counts (103)
  --
  -- The figure this drives — "4 of 27 members" — is stated on a card
  -- members screenshot and share, so it has to be exactly right. The
  -- assertion that matters most is the last: a suspended account must
  -- leave BOTH sides of the fraction, or a badge ends up held by more
  -- members than exist.
  -- ------------------------------------------------------------
  SELECT COUNT(*) INTO v_n FROM get_badge_holder_counts();
  ASSERT v_n = (SELECT COUNT(*) FROM badges),
    'get_badge_holder_counts() should return one row per badge, got ' || v_n;

  SELECT COUNT(DISTINCT eligible) INTO v_n FROM get_badge_holder_counts();
  ASSERT v_n = 1, 'eligible must be the same on every row, found ' || v_n || ' values';

  SELECT eligible INTO v_n FROM get_badge_holder_counts() LIMIT 1;
  ASSERT v_n = (SELECT COUNT(*) FROM profiles WHERE COALESCE(is_suspended, FALSE) = FALSE),
    'eligible should be every non-suspended member, got ' || v_n;

  -- v_user earned popular_project in section 9. Asserted as a DELTA rather
  -- than as "= 1": a real member could already hold it on a live database,
  -- and a test that only passes on an empty one is a test that gets deleted.
  SELECT holders INTO v_before
  FROM get_badge_holder_counts() c
  JOIN badges b ON b.id = c.badge_id
  WHERE b.slug = 'popular_project';
  ASSERT v_before >= 1, 'popular_project should count its holder, got ' || v_before;

  UPDATE profiles SET is_suspended = TRUE WHERE id = v_user;

  SELECT holders INTO v_n
  FROM get_badge_holder_counts() c
  JOIN badges b ON b.id = c.badge_id
  WHERE b.slug = 'popular_project';
  ASSERT v_n = v_before - 1,
    'suspending a holder should drop the count by exactly 1, went from '
      || v_before || ' to ' || v_n;

  -- Both sides, not just the numerator. Dropping a suspended member from
  -- holders but leaving them in eligible is survivable; the reverse
  -- produces a badge held by more members than exist.
  SELECT eligible INTO v_n FROM get_badge_holder_counts() LIMIT 1;
  ASSERT v_n = (SELECT COUNT(*) FROM profiles WHERE COALESCE(is_suspended, FALSE) = FALSE),
    'a suspended member must leave the denominator too';

  UPDATE profiles SET is_suspended = FALSE WHERE id = v_user;

  RAISE NOTICE 'All 126 catalog trim assertions passed.';
END $$;

ROLLBACK;
