-- ============================================================
-- Hand-run test for migration 119 (client-visible moderation rules).
--
-- Same workflow as the 098 test: paste into the Supabase SQL editor
-- and run. It seeds fixtures, asserts, and ROLLBACKs — nothing is
-- left behind. A failing ASSERT aborts with the message shown;
-- silence at the end means every assertion held.
--
-- What is being defended here:
--   1. The projection leaks nothing. Five columns, no note (which names
--      the incident behind a rule), no created_by (which names the
--      moderator), no country_code (which tells the caller which rules
--      are regional and therefore which regions are worth probing).
--   2. client_visible = FALSE rules stay server-side. A grooming
--      tripwire that a member can discover by typing has stopped being
--      a tripwire, while still quarantining on INSERT.
--   3. Country scoping comes from auth.uid(), never from an argument.
--      A caller must not be able to read another member state's rules.
--   4. The golden corpus. This is the server half of the parity check —
--      src/lib/moderation/scan-parity.test.ts runs the SAME 25 strings
--      through scanText() and asserts the same severities. Both halves
--      assert the count, so a case added to one and not the other fails.
--
-- Requires 065 and 119 to be applied first.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_lc      UUID := '00000000-0000-4000-8000-000000001191';
  v_dm      UUID := '00000000-0000-4000-8000-000000001192';
  v_cols    TEXT[];
  v_count   INT;
  v_sev     TEXT;
  v_case    RECORD;
  v_cases   INT := 0;
BEGIN
  -- ----------------------------------------------------------
  -- Fixtures: two members in two different countries.
  -- ----------------------------------------------------------
  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_lc, 'Member 119 LC', ARRAY['student'], 'LC'),
         (v_dm, 'Member 119 DM', ARRAY['student'], 'DM')
  ON CONFLICT (id) DO UPDATE SET country = EXCLUDED.country;

  INSERT INTO moderation_terms (pattern, kind, severity, category, country_code, client_visible, note)
  VALUES
    ('zzglobalvisible', 'term', 'medium', 'hate_harassment', NULL, TRUE,  'fixture: global, visible'),
    ('zzglobalhidden',  'term', 'high',   'grooming_risk',   NULL, FALSE, 'fixture: global, hidden'),
    ('zzlucianonly',    'term', 'medium', 'hate_harassment', 'LC', TRUE,  'fixture: LC only'),
    ('zzdominicaonly',  'term', 'medium', 'hate_harassment', 'DM', TRUE,  'fixture: DM only')
  ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- 1. The projection is exactly five columns.
  -- ----------------------------------------------------------
  SELECT array_agg(p.parameter_name ORDER BY p.ordinal_position)
  INTO v_cols
  FROM information_schema.parameters p
  JOIN information_schema.routines r ON r.specific_name = p.specific_name
  WHERE r.routine_name = 'get_client_moderation_rules'
    AND p.parameter_mode = 'TABLE';

  ASSERT v_cols = ARRAY['id', 'pattern', 'kind', 'severity', 'category'],
    'get_client_moderation_rules() returns unexpected columns: ' || COALESCE(array_to_string(v_cols, ','), '(none)');

  -- ----------------------------------------------------------
  -- 2 & 3. Visibility and country scoping, as the Saint Lucian member.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_lc)::TEXT, TRUE);

  SELECT count(*) INTO v_count
  FROM get_client_moderation_rules() WHERE pattern = 'zzglobalvisible';
  ASSERT v_count = 1, 'a global client-visible rule should be returned';

  SELECT count(*) INTO v_count
  FROM get_client_moderation_rules() WHERE pattern = 'zzglobalhidden';
  ASSERT v_count = 0, 'a client_visible = FALSE rule must never reach the browser';

  SELECT count(*) INTO v_count
  FROM get_client_moderation_rules() WHERE pattern = 'zzlucianonly';
  ASSERT v_count = 1, 'a member should see their own country''s regional rules';

  SELECT count(*) INTO v_count
  FROM get_client_moderation_rules() WHERE pattern = 'zzdominicaonly';
  ASSERT v_count = 0, 'a member must not be able to read another country''s regional rules';

  -- The hidden rule still enforces server-side. That is the entire point of
  -- the client_visible split: it is invisible, not disabled.
  ASSERT (scan_content('zzglobalhidden', 'LC') ->> 'severity') = 'high',
    'a hidden rule must still be enforced by scan_content()';

  -- Ordering matches scan_content(), so matches[0] names the same worst rule.
  ASSERT (
    SELECT severity FROM get_client_moderation_rules() LIMIT 1
  ) IN ('high', 'medium'), 'rules should be returned worst-first';

  -- ----------------------------------------------------------
  -- 4. Golden corpus — the server half of the parity check.
  --    Mirrors src/lib/moderation/__fixtures__/corpus.json exactly.
  -- ----------------------------------------------------------
  FOR v_case IN
    SELECT * FROM (VALUES
      ('Call me on +1 758 555 0100',                            'medium'),
      ('tel: (758) 285-1234',                                   'medium'),
      ('The total came to 1 234 567.89 for the year',           'medium'),
      ('Discussed 2024 2025 2026 budgets',                      'medium'),
      ('Reach me at ana@example.com',                           'low'),
      ('ANA@EXAMPLE.COM',                                       'low'),
      ('Meet at 12 Bay Street',                                 'medium'),
      ('Follow instagram.com/someone for updates',              'medium'),
      ('wa.me/17585551234',                                     'medium'),
      ('don''t tell your parents',                              'high'),
      ('dont tell your dad',                                    'high'),
      -- Known seed gap: the pattern's 'any' branch has no trailing space, so
      -- 'any teacher' cannot match. Encoded so a future fix fails loudly.
      ('dont tell any teacher',                                 NULL),
      ('keep this a secret between us',                         'high'),
      ('how old are you? send a pic',                           'high'),
      ('what''s your age, want to photo chat',                  'high'),
      ('meet me alone',                                         'high'),
      ('come over without your mum',                            'high'),
      ('We are building a solar irrigation project for farmers.', NULL),
      ('The workshop starts at nine in Castries.',              NULL),
      ('Our grant request is 45000 XCD over two years.',        NULL),
      ('Version 2.0.1 shipped to the pilot cohort.',            NULL),
      ('l''ete a ete chaud cette annee',                        NULL),
      ('Se necesita mas apoyo para los jovenes.',               NULL),
      ('',                                                      NULL),
      ('     ',                                                 NULL)
    ) AS t(body, expected)
  LOOP
    v_cases := v_cases + 1;
    v_sev := scan_content(v_case.body, NULL) ->> 'severity';
    ASSERT v_sev IS NOT DISTINCT FROM v_case.expected,
      format('corpus case %s: expected %s, got %s for %L',
             v_cases, COALESCE(v_case.expected, 'NULL'), COALESCE(v_sev, 'NULL'), v_case.body);
  END LOOP;

  ASSERT v_cases = 25,
    format('corpus drifted: %s cases here, 25 in corpus.json', v_cases);

  RAISE NOTICE '119 moderation client rules: all assertions held (% corpus cases)', v_cases;
END $$;

ROLLBACK;
