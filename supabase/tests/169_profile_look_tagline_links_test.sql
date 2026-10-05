-- ============================================================
-- Hand-run test for migration 169 (profile look, tagline, social links).
--
-- Same workflow as the 148 test: paste into the Supabase SQL editor and run.
-- It seeds a fixture, asserts, and ROLLBACKs -- nothing is left behind. A
-- failing ASSERT aborts with the message shown; silence means it held.
--
-- What is being defended:
--   1. The three columns take what the editor writes, and the checks refuse
--      a long tagline, an unknown link key and a non-https link.
--   2. get_profile_view() returns profile_look as a TEASER field -- present
--      for a stranger -- while tagline follows 'about' and social_links
--      follows 'details', NULL when those sections are closed to the viewer.
--   3. The member sees their own fields whatever their section settings.
--
-- Requires 162 and 169 applied, and a role that can write auth.users (the SQL
-- editor's default is fine).
-- ============================================================

BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('00000000-0000-4000-8000-000000000169', 'look169@test.local', '{"display_name":"Look Fixture"}'),
  ('00000000-0000-4000-8000-000000000170', 'viewer169@test.local', '{"display_name":"Viewer Fixture"}')
ON CONFLICT (id) DO NOTHING;

UPDATE profiles
SET profile_visibility = 'public',
    section_visibility = '{"about":"private","details":"private"}'::jsonb,
    tagline = 'Training teachers across the Eastern Caribbean.',
    social_links = '{"linkedin":"https://www.linkedin.com/in/fixture","x":"https://x.com/fixture"}'::jsonb,
    profile_look = '{"photo":"bw","tone":"colour","accent":"#B08D57","align":"center"}'::jsonb
WHERE id = '00000000-0000-4000-8000-000000000169';

-- ------------------------------------------------------------
-- 1. Round trip, and the checks refuse bad values.
-- ------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  SELECT tagline, social_links, profile_look INTO r
    FROM profiles WHERE id = '00000000-0000-4000-8000-000000000169';
  ASSERT r.tagline LIKE 'Training%', 'tagline did not round-trip';
  ASSERT r.social_links->>'x' = 'https://x.com/fixture', 'social_links did not round-trip';
  ASSERT r.profile_look->>'photo' = 'bw', 'profile_look did not round-trip';

  BEGIN
    UPDATE profiles SET tagline = repeat('a', 121) WHERE id = '00000000-0000-4000-8000-000000000169';
    RAISE EXCEPTION 'a 121-character tagline was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE profiles SET social_links = '{"myspace":"https://myspace.com/x"}'::jsonb
     WHERE id = '00000000-0000-4000-8000-000000000169';
    RAISE EXCEPTION 'an unknown link key was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE profiles SET social_links = '{"x":"javascript:alert(1)"}'::jsonb
     WHERE id = '00000000-0000-4000-8000-000000000169';
    RAISE EXCEPTION 'a non-https link was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE profiles SET profile_look = '"bw"'::jsonb WHERE id = '00000000-0000-4000-8000-000000000169';
    RAISE EXCEPTION 'a non-object profile_look was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ------------------------------------------------------------
-- 2. As a stranger: the look is there, the gated fields are not.
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000170","role":"authenticated"}', true);

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM get_profile_view('00000000-0000-4000-8000-000000000169');
  ASSERT r.id IS NOT NULL, 'get_profile_view returned no row';
  ASSERT r.profile_look IS NOT NULL, 'profile_look is a teaser field and must be returned';
  ASSERT r.profile_look->>'align' = 'center', 'profile_look content did not come through';
  ASSERT r.tagline IS NULL, 'tagline must follow the about section';
  ASSERT r.social_links IS NULL, 'social_links must follow the details section';
END $$;

-- ------------------------------------------------------------
-- 3. As the member: everything.
-- ------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000169","role":"authenticated"}', true);

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM get_profile_view('00000000-0000-4000-8000-000000000169');
  ASSERT r.tagline IS NOT NULL, 'the member must see their own tagline';
  ASSERT r.social_links->>'linkedin' IS NOT NULL, 'the member must see their own links';
END $$;

RESET ROLE;

ROLLBACK;
