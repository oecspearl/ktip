-- ============================================================
-- Hand-run test for migration 097 (shared translation cache).
--
-- Same workflow as 093/095: paste into the Supabase SQL editor and
-- run. It seeds fixtures, asserts, and ROLLBACKs — nothing is left
-- behind. A failing ASSERT aborts with the message shown; the closing
-- NOTICE means every assertion held.
--
-- What is actually being defended here:
--   1. The budget is a HARD ceiling claimed atomically. If it can be
--      overspent, the provider either bills the project or hard-refuses,
--      and the site loses French for the rest of the month.
--   2. The per-IP throttle refuses before the monthly budget is touched,
--      so an abusive caller cannot spend everyone else's quota on its way
--      to a 429.
--   3. An admin override is never clobbered — not by a later machine
--      write, not by the eviction sweep, not by "retranslate".
--   4. The cache is NOT readable by anon or authenticated. This is the
--      one that matters most: the table holds translated text copied out
--      of rows that RLS protects, so a leak here is a leak of those.
--
-- Requires 000, 077 and 097 to be applied first. Run it as a role that
-- can write auth.users (the SQL editor's default is fine).
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_admin   UUID := '00000000-0000-4000-8000-000000000971';
  v_member  UUID := '00000000-0000-4000-8000-000000000972';
  v_hash    TEXT := repeat('a', 64);
  v_hash2   TEXT := repeat('b', 64);
  v_period  DATE := date_trunc('month', now() AT TIME ZONE 'UTC')::DATE;
  v_claim   JSONB;
  v_n       INT;
  v_chars   BIGINT;
  v_failed  BOOLEAN;
BEGIN
  -- profiles.id is a FK to auth.users (000), so the users have to exist first.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin-097@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Admin 097', 'country', 'Saint Lucia')),
    (v_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'member-097@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member 097', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_admin, 'Admin 097', ARRAY['oecs']::TEXT[], 'Saint Lucia'),
         (v_member, 'Member 097', ARRAY[]::TEXT[], 'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  -- ------------------------------------------------------------
  -- 1. Shape of the cache row
  -- ------------------------------------------------------------
  INSERT INTO translations (hash, target_lang, format, source_lang, source_text, translated_text, char_count)
  VALUES (v_hash, 'fr', 'text', 'en', 'Solar irrigation', 'Irrigation solaire', 16);

  SELECT COUNT(*) INTO v_n FROM translations WHERE hash = v_hash AND target_lang = 'fr';
  ASSERT v_n = 1, 'translations: a well-formed row was refused';

  -- The same source in the other language is a separate row, not a conflict.
  INSERT INTO translations (hash, target_lang, format, source_text, translated_text)
  VALUES (v_hash, 'es', 'text', 'Solar irrigation', 'Riego solar');
  SELECT COUNT(*) INTO v_n FROM translations WHERE hash = v_hash;
  ASSERT v_n = 2, 'translations: target_lang is not part of the key';

  -- …and so is the html rendering of the same bytes.
  INSERT INTO translations (hash, target_lang, format, source_text, translated_text)
  VALUES (v_hash, 'fr', 'html', 'Solar irrigation', '<p>Irrigation solaire</p>');
  SELECT COUNT(*) INTO v_n FROM translations WHERE hash = v_hash;
  ASSERT v_n = 3, 'translations: format is not part of the key';

  v_failed := FALSE;
  BEGIN
    INSERT INTO translations (hash, target_lang, source_text, translated_text)
    VALUES ('NOT-A-HASH', 'fr', 'x', 'y');
  EXCEPTION WHEN OTHERS THEN v_failed := TRUE;
  END;
  ASSERT v_failed, 'translations: a malformed hash was accepted';

  v_failed := FALSE;
  BEGIN
    INSERT INTO translations (hash, target_lang, source_text, translated_text)
    VALUES (v_hash2, 'de', 'x', 'y');
  EXCEPTION WHEN OTHERS THEN v_failed := TRUE;
  END;
  ASSERT v_failed, 'translations: an unsupported target language was accepted';

  -- The cap has to agree with MAX_TRANSLATABLE in should-translate.ts, or the
  -- client sends bodies the server cannot store and every view re-translates.
  v_failed := FALSE;
  BEGIN
    INSERT INTO translations (hash, target_lang, source_text, translated_text)
    VALUES (v_hash2, 'fr', repeat('x', 20001), 'y');
  EXCEPTION WHEN OTHERS THEN v_failed := TRUE;
  END;
  ASSERT v_failed, 'translations: a source longer than 20000 chars was accepted';

  -- ------------------------------------------------------------
  -- 2. The budget is a hard ceiling
  -- ------------------------------------------------------------
  DELETE FROM translation_usage WHERE period = v_period;
  DELETE FROM translation_rate_limit;

  v_claim := claim_translation_budget('ip-a', 500, 1000, TRUE);
  ASSERT (v_claim->>'allowed')::BOOLEAN, 'budget: the first claim inside the cap was refused';

  SELECT chars_translated INTO v_chars FROM translation_usage WHERE period = v_period;
  ASSERT v_chars = 500, 'budget: an allowed claim did not spend (saw ' || COALESCE(v_chars, -1) || ')';

  -- Second claim would cross the cap. It must be refused AND must not spend.
  v_claim := claim_translation_budget('ip-b', 600, 1000, TRUE);
  ASSERT NOT (v_claim->>'allowed')::BOOLEAN, 'budget: a claim past the cap was allowed';
  ASSERT v_claim->>'reason' = 'over_budget', 'budget: wrong refusal reason for an over-cap claim';

  SELECT chars_translated INTO v_chars FROM translation_usage WHERE period = v_period;
  ASSERT v_chars = 500, 'budget: a REFUSED claim still spent characters (saw ' || v_chars || ')';

  -- Exactly filling the cap is allowed; one character more is not.
  v_claim := claim_translation_budget('ip-c', 500, 1000, TRUE);
  ASSERT (v_claim->>'allowed')::BOOLEAN, 'budget: a claim that exactly fills the cap was refused';
  v_claim := claim_translation_budget('ip-d', 1, 1000, TRUE);
  ASSERT NOT (v_claim->>'allowed')::BOOLEAN, 'budget: the cap was exceeded by one character';

  -- A zero-character claim is free and must not consume a request slot.
  v_claim := claim_translation_budget('ip-e', 0, 1000, TRUE);
  ASSERT (v_claim->>'allowed')::BOOLEAN, 'budget: a zero-character claim was refused';

  -- ------------------------------------------------------------
  -- 3. The per-IP throttle refuses before the budget is touched
  -- ------------------------------------------------------------
  DELETE FROM translation_usage WHERE period = v_period;
  DELETE FROM translation_rate_limit;

  -- Signed out: 4000 characters per five-minute window.
  v_claim := claim_translation_budget('ip-greedy', 3000, 1000000, FALSE);
  ASSERT (v_claim->>'allowed')::BOOLEAN, 'throttle: a first anonymous claim was refused';

  v_claim := claim_translation_budget('ip-greedy', 3000, 1000000, FALSE);
  ASSERT NOT (v_claim->>'allowed')::BOOLEAN, 'throttle: the anonymous window was not enforced';
  ASSERT v_claim->>'reason' = 'rate_limited', 'throttle: wrong refusal reason';
  ASSERT (v_claim->>'retry_after')::INT > 0, 'throttle: no retry_after was returned';

  SELECT chars_translated INTO v_chars FROM translation_usage WHERE period = v_period;
  ASSERT v_chars = 3000, 'throttle: a throttled caller still spent the shared budget';

  -- A different caller is unaffected — the throttle is per-IP, not global.
  v_claim := claim_translation_budget('ip-innocent', 3000, 1000000, FALSE);
  ASSERT (v_claim->>'allowed')::BOOLEAN, 'throttle: one caller''s limit blocked another';

  -- Signing in raises the ceiling on the same window.
  v_claim := claim_translation_budget('ip-greedy', 3000, 1000000, TRUE);
  ASSERT (v_claim->>'allowed')::BOOLEAN, 'throttle: the signed-in ceiling was not higher';

  -- Rolling the window forward resets the count.
  UPDATE translation_rate_limit SET window_start = now() - INTERVAL '10 minutes' WHERE ip_hash = 'ip-greedy';
  v_claim := claim_translation_budget('ip-greedy', 3000, 1000000, FALSE);
  ASSERT (v_claim->>'allowed')::BOOLEAN, 'throttle: the window never rolled over';

  -- ------------------------------------------------------------
  -- 4. Hits are recorded without becoming a write per read
  -- ------------------------------------------------------------
  PERFORM touch_translations(ARRAY[v_hash], 'fr', 3, 1);

  SELECT hit_count INTO v_n FROM translations WHERE hash = v_hash AND target_lang = 'fr' AND format = 'text';
  ASSERT v_n = 1, 'touch: hit_count did not increment';

  SELECT cache_hits INTO v_chars FROM translation_usage WHERE period = v_period;
  ASSERT v_chars = 3, 'touch: cache_hits did not accumulate (saw ' || COALESCE(v_chars, -1) || ')';

  -- An empty batch is legal and must not raise — the all-miss path calls it.
  PERFORM touch_translations(ARRAY[]::TEXT[], 'fr', 0, 5);
  PERFORM touch_translations(NULL, 'fr', 0, 1);

  -- ------------------------------------------------------------
  -- 5. An override outlives everything that could overwrite it
  -- ------------------------------------------------------------
  UPDATE translations
  SET is_override = TRUE, translated_text = 'Irrigation solaire (corrigé)', last_used_at = now() - INTERVAL '900 days'
  WHERE hash = v_hash AND target_lang = 'fr' AND format = 'text';

  -- Aged far past the sweep horizon, but corrected — it must survive.
  UPDATE translations SET last_used_at = now() - INTERVAL '900 days'
  WHERE hash = v_hash AND target_lang = 'es';

  SELECT prune_translations(INTERVAL '180 days') INTO v_n;
  ASSERT v_n >= 1, 'prune: a stale machine row was not swept';

  SELECT COUNT(*) INTO v_n FROM translations WHERE hash = v_hash AND is_override;
  ASSERT v_n = 1, 'prune: an admin override was swept away';

  SELECT COUNT(*) INTO v_n FROM translations WHERE hash = v_hash AND target_lang = 'es';
  ASSERT v_n = 0, 'prune: a stale machine row survived the sweep';

  -- The edge function writes with ignoreDuplicates, i.e. ON CONFLICT DO NOTHING.
  -- The loser of a two-viewer race must not be able to replace a correction.
  INSERT INTO translations (hash, target_lang, format, source_text, translated_text)
  VALUES (v_hash, 'fr', 'text', 'Solar irrigation', 'Irrigation solaire (machine)')
  ON CONFLICT (hash, target_lang, format) DO NOTHING;

  SELECT COUNT(*) INTO v_n
  FROM translations
  WHERE hash = v_hash AND target_lang = 'fr' AND format = 'text'
    AND translated_text = 'Irrigation solaire (corrigé)';
  ASSERT v_n = 1, 'race: a concurrent machine write clobbered an admin override';

  RAISE NOTICE 'Migration 097 constraint and budget assertions all held.';
END $$;

-- ------------------------------------------------------------
-- 6. The cache is not readable by the people it protects content from
--
-- Outside the DO block so the role really switches — RLS is bypassed by
-- the editor's owner role, so the policies can only be read honestly as
-- `anon` / `authenticated` with a forged JWT claim.
-- ------------------------------------------------------------

-- A missing table grant raises rather than returning zero rows, and that is a
-- pass, not an error — the row is unreachable either way. So each read is
-- wrapped: only an actual row count above zero is a failure.
SET LOCAL ROLE anon;
DO $$
DECLARE v_n INT;
BEGIN
  BEGIN SELECT COUNT(*) INTO v_n FROM translations;
  EXCEPTION WHEN insufficient_privilege THEN v_n := 0; END;
  ASSERT v_n = 0, 'RLS: anon could read the translation cache (saw ' || v_n || ' rows)';

  BEGIN SELECT COUNT(*) INTO v_n FROM translation_usage;
  EXCEPTION WHEN insufficient_privilege THEN v_n := 0; END;
  ASSERT v_n = 0, 'RLS: anon could read translation usage';

  BEGIN SELECT COUNT(*) INTO v_n FROM translation_rate_limit;
  EXCEPTION WHEN insufficient_privilege THEN v_n := 0; END;
  ASSERT v_n = 0, 'RLS: anon could read the rate-limit table';
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;

-- An ordinary signed-in member. This is the case that matters: the cache holds
-- text copied out of rows that RLS protects, including private profile bios.
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000972","role":"authenticated"}';
DO $$
DECLARE v_n INT;
BEGIN
  BEGIN SELECT COUNT(*) INTO v_n FROM translations;
  EXCEPTION WHEN insufficient_privilege THEN v_n := 0; END;
  ASSERT v_n = 0, 'RLS: a signed-in member read the translation cache (saw ' || v_n || ' rows)';

  BEGIN SELECT COUNT(*) INTO v_n FROM translation_rate_limit;
  EXCEPTION WHEN insufficient_privilege THEN v_n := 0; END;
  ASSERT v_n = 0, 'RLS: a signed-in member read pseudonymised reader traffic';
END $$;

-- The admin override screen has to read what it is about to correct.
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000971","role":"authenticated"}';
DO $$
DECLARE v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n FROM translations;
  ASSERT v_n > 0, 'RLS: an admin could not read the cache they are meant to curate';

  SELECT COUNT(*) INTO v_n FROM translation_usage;
  ASSERT v_n > 0, 'RLS: an admin could not read the budget dashboard''s table';

  -- Even an admin gets nothing from the rate-limit table: it is pseudonymised
  -- reader traffic and no screen in the product has a reason to read it.
  BEGIN SELECT COUNT(*) INTO v_n FROM translation_rate_limit;
  EXCEPTION WHEN insufficient_privilege THEN v_n := 0; END;
  ASSERT v_n = 0, 'RLS: the rate-limit table gained a reader';

  RAISE NOTICE 'Migration 097 RLS assertions all held.';
END $$;

RESET ROLE;

ROLLBACK;
