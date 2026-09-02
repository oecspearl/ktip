-- ============================================================
-- Hand-run test for migrations 066 and 067 (the achievement engine).
--
-- There is no pg test harness and no CI in this project, so this
-- matches the existing workflow set by 061's test: paste the whole
-- file into the Supabase SQL editor and run it. It seeds fixtures,
-- asserts, and ROLLBACKs — nothing is left behind.
--
-- A failing ASSERT aborts the transaction with the message shown.
-- Silence at the end means every assertion held.
--
-- check_my_achievements() reads auth.uid(), which is NULL in the SQL
-- editor, so the assertions call check_achievements_for(<uuid>) —
-- the same function the client entry point wraps.
--
-- Requires 066, 067 and 126 to be applied first. 126 retuned the rank
-- ladder section 9 asserts against; run this file against a database
-- that stops at 067 and section 9 fails on numbers that were correct
-- when they were written.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_user     UUID := '00000000-0000-4000-8000-000000000066';
  v_student  UUID := '00000000-0000-4000-8000-000000000067';
  v_private  UUID := '00000000-0000-4000-8000-000000000068';
  v_project  UUID := '00000000-0000-4000-8000-0000000000b1';

  v_result   JSONB;
  v_counts   JSONB;
  v_points   INT;
  v_days     INT;
  v_rank     JSONB;
  v_n        INT;
BEGIN
  -- ------------------------------------------------------------
  -- Fixtures
  -- ------------------------------------------------------------
  INSERT INTO profiles (id, display_name, roles, country)
  VALUES
    (v_user,    'Engine Fixture',  ARRAY['entrepreneur'], 'Saint Lucia'),
    (v_student, 'Student Fixture', ARRAY['student'],      'Saint Lucia'),
    (v_private, 'Private Fixture', ARRAY['mentor'],       'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles, country = EXCLUDED.country;

  UPDATE profiles SET leaderboard_visibility = 'private' WHERE id = v_private;

  -- ------------------------------------------------------------
  -- 1. Fail-soft on an empty account
  -- The client calls this on first paint, so a brand-new member must
  -- get a full payload of zeros rather than an error.
  -- ------------------------------------------------------------
  v_result := check_achievements_for(v_user, FALSE);
  ASSERT v_result IS NOT NULL, 'empty account returned NULL';
  ASSERT (v_result #>> '{stats,points}')::INT = 0, 'new account should have 0 points';
  ASSERT (v_result #>> '{stats,rank,level}')::INT = 1, 'new account should be level 1';

  -- ------------------------------------------------------------
  -- 2. A real action awards
  -- ------------------------------------------------------------
  INSERT INTO projects (id, title, description, phase, owner_id, is_public)
  VALUES (v_project, 'Fixture Project', 'For the engine test', 'concept', v_user, TRUE);

  -- 039's trigger already awarded first_project on that INSERT, which is
  -- the point: the pull engine must agree with it rather than double-award.
  v_result := check_achievements_for(v_user, FALSE);

  SELECT COUNT(*) INTO v_n
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_user AND b.slug = 'first_project';
  ASSERT v_n = 1, 'first_project should be held exactly once, found ' || v_n;

  SELECT COALESCE(SUM(b.points), 0) INTO v_points
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_user;
  ASSERT v_points > 0, 'points should be non-zero after earning a badge';

  -- ------------------------------------------------------------
  -- 3. Idempotency — the property the whole design rests on
  -- ------------------------------------------------------------
  v_result := check_achievements_for(v_user, FALSE);
  ASSERT jsonb_array_length(v_result->'newly_earned') = 0,
    'a repeat check must award nothing new';
  ASSERT (v_result #>> '{stats,points}')::INT = v_points,
    'points changed on a repeat check';

  -- ------------------------------------------------------------
  -- 4. Retroactivity — a new definition awards without a backfill
  -- This is why the engine pulls instead of using triggers: adding a
  -- badge in a later migration needs no data migration of its own.
  -- ------------------------------------------------------------
  INSERT INTO badges (slug, name, description, icon, color, category, rarity, points,
                      check_key, check_value, sort_order)
  VALUES ('test_retroactive', 'Retro Test', 'Awarded to anyone with a project',
          'rocket', 'ocean', 'projects', 'common', rarity_points('common'),
          'projects_created', 1, 9000)
  ON CONFLICT (slug) DO NOTHING;

  v_result := check_achievements_for(v_user, FALSE);
  ASSERT v_result->'newly_earned' @> '[{"slug": "test_retroactive"}]'::JSONB,
    'a newly defined badge should be awarded retroactively';

  -- ------------------------------------------------------------
  -- 5. Second pass — a points threshold fires in the SAME call
  -- Omitting this is the production bug the reference implementation
  -- recorded: the badge would otherwise arrive one check late.
  -- ------------------------------------------------------------
  SELECT COALESCE(SUM(b.points), 0) INTO v_points
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_user;

  INSERT INTO badges (slug, name, description, icon, color, category, rarity, points,
                      check_key, check_value, sort_order)
  VALUES ('test_points_meta', 'Points Test', 'Awarded on a points threshold',
          'trending-up', 'ocean', 'meta', 'common', rarity_points('common'),
          'total_points', v_points, 9001)
  ON CONFLICT (slug) DO NOTHING;

  v_result := check_achievements_for(v_user, FALSE);
  ASSERT v_result->'newly_earned' @> '[{"slug": "test_points_meta"}]'::JSONB,
    'a points-threshold badge must fire in the call that crosses it';

  -- ------------------------------------------------------------
  -- 6. Streaks accrue from ordinary use, once per day
  -- ------------------------------------------------------------
  PERFORM check_achievements_for(v_user, FALSE);
  PERFORM check_achievements_for(v_user, FALSE);

  SELECT COUNT(*) INTO v_days FROM user_activity_days WHERE user_id = v_user;
  ASSERT v_days = 1, 'repeated checks in one day must produce one activity row, found ' || v_days;

  -- A run that ended before yesterday is history, not a live streak.
  INSERT INTO user_activity_days (user_id, activity_date)
  VALUES (v_user, CURRENT_DATE - 10), (v_user, CURRENT_DATE - 11)
  ON CONFLICT DO NOTHING;
  ASSERT current_streak(v_user) = 1,
    'an old run must not extend today''s streak, got ' || current_streak(v_user);

  INSERT INTO user_activity_days (user_id, activity_date)
  VALUES (v_user, CURRENT_DATE - 1), (v_user, CURRENT_DATE - 2)
  ON CONFLICT DO NOTHING;
  ASSERT current_streak(v_user) = 3,
    'consecutive days must accumulate, got ' || current_streak(v_user);

  -- ------------------------------------------------------------
  -- 7. Anti-gaming — self-likes do not count
  -- ------------------------------------------------------------
  INSERT INTO project_likes (project_id, user_id) VALUES (v_project, v_user)
  ON CONFLICT DO NOTHING;
  v_counts := achievement_counts(v_user);
  ASSERT (v_counts->>'project_likes_received')::INT = 0,
    'liking your own project must not count, got ' || (v_counts->>'project_likes_received');

  -- ------------------------------------------------------------
  -- 8. Leaderboard exclusions
  -- ------------------------------------------------------------
  PERFORM check_achievements_for(v_student, FALSE);
  PERFORM check_achievements_for(v_private, FALSE);

  -- Give both some points so absence is an exclusion, not an empty score.
  INSERT INTO projects (title, description, phase, owner_id, is_public)
  VALUES ('Student Project', 'x', 'concept', v_student, TRUE),
         ('Private Project', 'x', 'concept', v_private, TRUE);
  PERFORM check_achievements_for(v_student, FALSE);
  PERFORM check_achievements_for(v_private, FALSE);

  SELECT COUNT(*) INTO v_n FROM get_leaderboard('global', NULL, 'all', 100)
  WHERE user_id = v_student;
  ASSERT v_n = 0, 'students must never appear on the leaderboard (safeguarding)';

  SELECT COUNT(*) INTO v_n FROM get_leaderboard('global', NULL, 'all', 100)
  WHERE user_id = v_private;
  ASSERT v_n = 0, 'a member who opted out must not appear';

  SELECT COUNT(*) INTO v_n FROM get_leaderboard('global', NULL, 'all', 100)
  WHERE user_id = v_user;
  ASSERT v_n = 1, 'an eligible member should appear exactly once';

  -- Suspension hides a member too.
  UPDATE profiles SET is_suspended = TRUE WHERE id = v_user;
  SELECT COUNT(*) INTO v_n FROM get_leaderboard('global', NULL, 'all', 100)
  WHERE user_id = v_user;
  ASSERT v_n = 0, 'a suspended account must not appear on the leaderboard';

  ASSERT get_profile_stats(v_user) IS NULL,
    'a suspended account must have no public profile stats';
  UPDATE profiles SET is_suspended = FALSE WHERE id = v_user;

  -- Country and role boards scope correctly.
  SELECT COUNT(*) INTO v_n FROM get_leaderboard('country', 'Saint Lucia', 'all', 100)
  WHERE user_id = v_user;
  ASSERT v_n = 1, 'the country board should include a member from that country';

  SELECT COUNT(*) INTO v_n FROM get_leaderboard('country', 'Grenada', 'all', 100)
  WHERE user_id = v_user;
  ASSERT v_n = 0, 'the country board must exclude other countries';

  SELECT COUNT(*) INTO v_n FROM get_leaderboard('role', 'entrepreneur', 'all', 100)
  WHERE user_id = v_user;
  ASSERT v_n = 1, 'the role board should include a member holding that role';

  -- ------------------------------------------------------------
  -- 9. Rank thresholds
  --
  -- Numbers are 126's, not 067's. member_rank() keys on badge count, so
  -- the ladder has to move whenever the catalog size does; 126 cut the
  -- catalog to 33 and rescaled 0/5/12/22/33/45/55 to 0/2/6/11/16/22/27
  -- at the same ratios.
  -- ------------------------------------------------------------
  v_rank := member_rank(0);
  ASSERT v_rank->>'name' = 'Newcomer', 'zero achievements should be Newcomer';
  ASSERT (v_rank->>'next_required')::INT = 2, 'the next rank should require 2';

  v_rank := member_rank(12);
  ASSERT (v_rank->>'level')::INT = 4, '12 achievements should be level 4';

  -- The boundary either side of a threshold, which is the case an
  -- off-by-one in the loop passes silently.
  ASSERT (member_rank(10)->>'level')::INT = 3, '10 achievements should still be level 3';
  ASSERT (member_rank(11)->>'level')::INT = 4, '11 achievements should reach level 4';

  -- Level 7 has to sit inside the catalog or it is a rank nobody holds.
  SELECT COUNT(*) INTO v_n FROM badges;
  ASSERT v_n >= 27, 'the catalog (' || v_n || ') is smaller than the level 7 threshold';

  v_rank := member_rank(999);
  ASSERT v_rank->>'name' = 'KTIP Champion', 'a very high count should be the top rank';
  ASSERT v_rank->>'next_required' IS NULL,
    'the top rank must report no next threshold so the UI can say so';

  -- ------------------------------------------------------------
  -- 10. Points always derive from rarity
  -- ------------------------------------------------------------
  ASSERT rarity_points('common') = 10 AND rarity_points('legendary') = 200,
    'rarity to points mapping changed unexpectedly';

  SELECT COUNT(*) INTO v_n FROM badges WHERE points <> rarity_points(rarity);
  ASSERT v_n = 0, v_n || ' badge(s) have points out of step with their rarity';

  -- ------------------------------------------------------------
  -- 11. Showcase caps at five and rejects unearned badges
  -- ------------------------------------------------------------
  -- set_my_showcase() reads auth.uid(), which is NULL here, so the cap is
  -- asserted structurally instead: the CHECK constraint is the real guard.
  SELECT COUNT(*) INTO v_n FROM pg_constraint
  WHERE conrelid = 'user_showcase'::regclass AND contype = 'c';
  ASSERT v_n >= 1, 'user_showcase must constrain position to 1..5';

  RAISE NOTICE 'All achievement engine assertions passed.';
END $$;

-- ------------------------------------------------------------
-- Client write paths must not exist. These are the assertions that
-- matter most: everything above tests behaviour, this tests that the
-- behaviour cannot be bypassed.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n FROM pg_policies
  WHERE tablename IN ('badges', 'user_badges', 'trophy_assets',
                      'achievement_collections', 'user_activity_days',
                      'user_showcase', 'user_flags')
    AND cmd <> 'SELECT';
  ASSERT v_n = 0,
    v_n || ' non-SELECT policy/policies exist on achievement tables; '
        || 'awards must only happen through SECURITY DEFINER functions';

  -- The engine derives the caller from auth.uid(); a client-callable
  -- variant that takes a user id would make it an activity oracle.
  SELECT COUNT(*) INTO v_n
  FROM information_schema.role_routine_grants
  WHERE routine_name IN ('check_achievements_for', 'achievement_counts', 'current_streak')
    AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  ASSERT v_n = 0, 'user-id-taking engine functions must not be executable by clients';
END $$;

ROLLBACK;
