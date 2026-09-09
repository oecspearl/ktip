-- ============================================================
-- Hand-run test for migration 148 (avatar style).
--
-- Same workflow as the 143 test: paste into the Supabase SQL editor and run.
-- It seeds a fixture, asserts, and ROLLBACKs -- nothing is left behind. A
-- failing ASSERT aborts with the message shown; silence means it held.
--
-- What is being defended:
--   1. profiles.avatar_style exists and takes the JSONB spec the studio writes.
--   2. get_profile_view() returns it as a TEASER field -- present even when
--      can_view is false -- beside avatar_url and banner, so the member page
--      hero can draw the cut-out for a private member the same way their
--      directory card already shows their face.
--   3. Nothing else about the view moved: the gated columns are still NULL
--      when the viewer is not allowed.
--
-- Requires 104 and 148 to be applied first, and a role that can write
-- auth.users (the SQL editor's default is fine).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Fixtures: one private member with a cut-out style, one viewer who is not
-- connected to them.
-- ------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('00000000-0000-4000-8000-000000000148', 'style148@test.local', '{"display_name":"Style Fixture"}'),
  ('00000000-0000-4000-8000-000000000149', 'viewer148@test.local', '{"display_name":"Viewer Fixture"}')
ON CONFLICT (id) DO NOTHING;

UPDATE profiles
SET profile_visibility = 'private',
    avatar_url = 'https://example.test/avatars/148/avatar.webp',
    avatar_style = '{"kind":"backdrop","id":"banner-03","cutout":"https://example.test/avatars/148/avatar-cutout.webp","side":"right","frame":{"x":0.2,"y":0.05,"s":0.6},"animated":true}'::jsonb,
    bio = 'Should be hidden from a stranger.'
WHERE id = '00000000-0000-4000-8000-000000000148';

-- ------------------------------------------------------------
-- 1. The column holds the spec.
-- ------------------------------------------------------------
DO $$
DECLARE v JSONB;
BEGIN
  SELECT avatar_style INTO v FROM profiles WHERE id = '00000000-0000-4000-8000-000000000148';
  ASSERT v->>'kind' = 'backdrop', 'avatar_style did not round-trip';
  ASSERT (v->'frame'->>'s')::numeric = 0.6, 'frame did not round-trip';
END $$;

-- ------------------------------------------------------------
-- 2 + 3. As the stranger: teaser fields present, gated fields NULL.
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000149","role":"authenticated"}', true);

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM get_profile_view('00000000-0000-4000-8000-000000000148');
  ASSERT r.id IS NOT NULL, 'get_profile_view returned no row';
  ASSERT r.can_view = false, 'stranger should not be allowed to view a private member';
  ASSERT r.avatar_url IS NOT NULL, 'avatar_url is a teaser field and must still be returned';
  ASSERT r.avatar_style IS NOT NULL, 'avatar_style is a teaser field and must still be returned';
  ASSERT r.avatar_style->>'side' = 'right', 'avatar_style content did not come through';
  ASSERT r.bio IS NULL, 'bio must be gated for a stranger';
END $$;

RESET ROLE;

ROLLBACK;
