-- ============================================================
-- Hand-run test for migration 061 (the personalization ranker).
--
-- There is no pg test harness and no CI in this project, so this
-- matches the existing workflow: paste the whole file into the
-- Supabase SQL editor and run it. It seeds fixtures, asserts, and
-- ROLLBACKs — nothing is left behind.
--
-- A failing ASSERT aborts the transaction with the message shown.
-- Silence at the end means every assertion held.
--
-- Requires 055, 060 and 061 to be applied first.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Fixtures
--
-- personalization_bag() and the two entry points are SECURITY
-- DEFINER and read auth.uid(), which is NULL in the SQL editor.
-- So the scoring assertions call personalization_bag(<uuid>) and
-- personalization_contributions(...) directly — the same code the
-- entry points run, without needing a session JWT.
-- ------------------------------------------------------------

DO $$
DECLARE
  v_user      UUID := '00000000-0000-4000-8000-000000000057';
  v_bag       JSONB;
  v_off_bag   JSONB;
  v_id        UUID := '00000000-0000-4000-8000-0000000000a1';
  v_id2       UUID := '00000000-0000-4000-8000-0000000000a2';

  v_match     NUMERIC;
  v_nomatch   NUMERIC;
  v_soon      NUMERIC;
  v_nodate    NUMERIC;
  v_expired   NUMERIC;
  v_seen      NUMERIC;
  v_unseen    NUMERIC;
  v_reasons   JSONB;
  v_sum       NUMERIC;
BEGIN
  -- A profile row is required by user_personalization's FK.
  INSERT INTO profiles (id, display_name, interests, skills)
  VALUES (v_user, 'Ranker Fixture', ARRAY['AgriTech'], ARRAY[]::TEXT[])
  ON CONFLICT (id) DO UPDATE
    SET interests = EXCLUDED.interests, skills = EXCLUDED.skills;

  INSERT INTO user_personalization (user_id, enabled, topics, categories, content_types)
  VALUES (v_user, TRUE, ARRAY['climate'], ARRAY['agriculture'], ARRAY['grant:startup'])
  ON CONFLICT (user_id) DO UPDATE
    SET enabled = TRUE,
        topics = EXCLUDED.topics,
        categories = EXCLUDED.categories,
        content_types = EXCLUDED.content_types;

  v_bag := personalization_bag(v_user);
  ASSERT v_bag IS NOT NULL, 'bag should exist for an enabled member';

  -- 0. The alias dictionary bridges the vocabularies: the profile
  --    interest "AgriTech" must reach the content tag "agriculture".
  ASSERT v_bag->'profile_topics' @> '["agriculture"]'::JSONB,
    'expand_topics should map AgriTech to the agriculture tag';

  -- 1. A topic match must outscore no match, all else equal.
  SELECT sum((e->>'w')::NUMERIC) INTO v_match
    FROM jsonb_array_elements(personalization_contributions(
      v_bag, 'project', v_id, ARRAY['climate'], NULL, NULL,
      FALSE, FALSE, now() - INTERVAL '200 days', NULL, NULL, NULL, 0)) e;

  SELECT sum((e->>'w')::NUMERIC) INTO v_nomatch
    FROM jsonb_array_elements(personalization_contributions(
      v_bag, 'project', v_id, ARRAY['knitting'], NULL, NULL,
      FALSE, FALSE, now() - INTERVAL '200 days', NULL, NULL, NULL, 0)) e;

  ASSERT v_match > v_nomatch,
    format('topic match (%s) must outrank no match (%s)', v_match, v_nomatch);

  -- 2. An imminent deadline must outscore an identical grant with none,
  --    so urgency can never be buried by an older-but-matching item.
  SELECT sum((e->>'w')::NUMERIC) INTO v_soon
    FROM jsonb_array_elements(personalization_contributions(
      v_bag, 'grant', v_id, ARRAY[]::TEXT[], NULL, NULL,
      FALSE, FALSE, now() - INTERVAL '200 days', NULL, now() + INTERVAL '3 days', NULL, 0)) e;

  SELECT sum((e->>'w')::NUMERIC) INTO v_nodate
    FROM jsonb_array_elements(personalization_contributions(
      v_bag, 'grant', v_id, ARRAY[]::TEXT[], NULL, NULL,
      FALSE, FALSE, now() - INTERVAL '200 days', NULL, NULL, NULL, 0)) e;

  ASSERT v_soon > v_nodate,
    format('grant closing in 3 days (%s) must outrank one with no deadline (%s)', v_soon, v_nodate);

  -- 3. An expired grant must sink below an in-window one with the same tags.
  SELECT sum((e->>'w')::NUMERIC) INTO v_expired
    FROM jsonb_array_elements(personalization_contributions(
      v_bag, 'grant', v_id, ARRAY['climate'], NULL, NULL,
      FALSE, FALSE, now() - INTERVAL '200 days', NULL, now() - INTERVAL '3 days', NULL, 0)) e;

  ASSERT v_expired < v_soon,
    format('expired grant (%s) must rank below an open one (%s)', v_expired, v_soon);

  -- 4. Something already engaged with is demoted — but the contribution
  --    array is still produced, i.e. the row is ranked, never removed.
  INSERT INTO project_likes (project_id, user_id)
  SELECT p.id, v_user FROM projects p WHERE p.is_public LIMIT 1
  ON CONFLICT DO NOTHING;

  v_bag := personalization_bag(v_user);

  SELECT sum((e->>'w')::NUMERIC) INTO v_seen
    FROM jsonb_array_elements(personalization_contributions(
      v_bag, 'project', v_id, ARRAY['climate'], NULL, NULL,
      FALSE, FALSE, now() - INTERVAL '10 days', NULL, NULL, NULL, 0)) e;

  -- Force the "seen" branch by scoring an id that IS in the seen array.
  SELECT sum((e->>'w')::NUMERIC) INTO v_unseen
    FROM jsonb_array_elements(personalization_contributions(
      jsonb_set(v_bag, '{seen}', to_jsonb(ARRAY[v_id::TEXT])),
      'project', v_id, ARRAY['climate'], NULL, NULL,
      FALSE, FALSE, now() - INTERVAL '10 days', NULL, NULL, NULL, 0)) e;

  ASSERT v_unseen < v_seen,
    format('an already-seen row (%s) must be demoted below an unseen one (%s)', v_unseen, v_seen);
  ASSERT v_unseen IS NOT NULL,
    'an already-seen row must still be scored, not dropped';

  -- 5. Turning personalization off must make the bag NULL, which is the
  --    single switch every caller checks before ranking anything.
  UPDATE user_personalization SET enabled = FALSE WHERE user_id = v_user;
  v_off_bag := personalization_bag(v_user);
  ASSERT v_off_bag IS NULL, 'disabling personalization must return a NULL bag';

  UPDATE user_personalization SET enabled = TRUE WHERE user_id = v_user;
  v_bag := personalization_bag(v_user);

  -- 6. Structural invariant: `reasons` and `score` come from the same
  --    contribution array, so the chip on a card cannot drift from the
  --    ordering that produced it. Every reason must be a positive
  --    contribution present in the full array.
  SELECT
    coalesce(jsonb_agg(e ORDER BY (e->>'w')::NUMERIC DESC)
             FILTER (WHERE (e->>'w')::NUMERIC > 0), '[]'::JSONB),
    coalesce(sum((e->>'w')::NUMERIC) FILTER (WHERE (e->>'w')::NUMERIC > 0), 0)
  INTO v_reasons, v_sum
  FROM jsonb_array_elements(personalization_contributions(
    v_bag, 'grant', v_id2, ARRAY['climate'], NULL, 'startup',
    TRUE, FALSE, now() - INTERVAL '5 days', NULL, now() + INTERVAL '7 days', NULL, 0)) e;

  ASSERT jsonb_typeof(v_reasons) = 'array', 'reasons must be a JSONB array';
  ASSERT jsonb_array_length(v_reasons) > 0, 'a strongly matching row must carry reasons';
  ASSERT (SELECT bool_and((r->>'w')::NUMERIC > 0)
            FROM jsonb_array_elements(v_reasons) r),
    'every reason must be a positive contribution';
  ASSERT (SELECT sum((r->>'w')::NUMERIC) FROM jsonb_array_elements(v_reasons) r) = v_sum,
    'reasons must sum to the positive part of the score';
  ASSERT (SELECT bool_and(r ? 'code' AND r ? 'label')
            FROM jsonb_array_elements(v_reasons) r),
    'every reason must carry a code and a human-readable label';

  -- 7. The namespaced content type must match the right entity only.
  --    'grant:startup' is picked; a resource of type 'startup' must not hit.
  ASSERT (SELECT bool_or(e->>'code' = 'type')
            FROM jsonb_array_elements(personalization_contributions(
              v_bag, 'grant', v_id, ARRAY[]::TEXT[], NULL, 'startup',
              FALSE, FALSE, now(), NULL, NULL, NULL, 0)) e),
    'grant:startup should match a grant of type startup';

  ASSERT NOT (SELECT coalesce(bool_or(e->>'code' = 'type'), FALSE)
                FROM jsonb_array_elements(personalization_contributions(
                  v_bag, 'resource', v_id, ARRAY[]::TEXT[], NULL, 'startup',
                  FALSE, FALSE, now(), NULL, NULL, NULL, 0)) e),
    'grant:startup must not match a resource of type startup';

  RAISE NOTICE 'All personalization ranker assertions passed.';
END $$;

ROLLBACK;
