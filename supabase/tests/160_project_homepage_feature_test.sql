-- ============================================================
-- Hand-run test for migration 160 (the owner's homepage opt-in, and the star
-- that is finally the admin's alone).
--
-- Same workflow as the 116 test: paste into the Supabase SQL editor and run.
-- It seeds fixtures, asserts, and ROLLBACKs — nothing is left behind. A failing
-- ASSERT aborts with the message shown; silence at the end means every
-- assertion held.
--
-- NOTE ON ROLES. Sections 1-3 exercise the SECURITY DEFINER trigger, which
-- reads auth.uid() from the JWT claims and fires for any caller, so they stay
-- on the editor's BYPASSRLS role. That is deliberate for the INSERT: an
-- entrepreneur owes MFA (118) and the RESTRICTIVE insert policy would refuse
-- the fixture before the trigger was ever reached. Section 4 is about RLS and
-- switches to `authenticated` first.
--
-- What is being defended:
--   1. A member creating a project cannot star it; the opt-in is kept.
--   2. A member editing their project cannot star it, and the edit itself is
--      NOT refused — the trigger pins, it does not raise.
--   3. An admin (project:manage_all) can still star a project, and the owner
--      cannot take the star off again.
--   4. Under RLS, the owner's own opt-in write lands.
--
-- Requires 090, 116 and 160 to be applied first, and a role that can write
-- auth.users (the SQL editor's default is fine).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Fixtures
--
--   royston  programme_supervisor — holds project:manage_all (116)
--   member   entrepreneur, owns the project
-- ------------------------------------------------------------
DO $$
DECLARE
  v_royston UUID := '00000000-0000-4000-8000-000000001601';
  v_member  UUID := '00000000-0000-4000-8000-000000001602';
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_royston, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'royston-160@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Royston 160', 'country', 'Saint Lucia')),
    (v_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'member-160@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member 160', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country) VALUES
    (v_royston, 'Royston 160', ARRAY['programme_supervisor'], 'Saint Lucia'),
    (v_member,  'Member 160',  ARRAY['entrepreneur'],         'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;
END $$;

-- ------------------------------------------------------------
-- 1-3. The trigger
-- ------------------------------------------------------------
DO $$
DECLARE
  v_royston UUID := '00000000-0000-4000-8000-000000001601';
  v_member  UUID := '00000000-0000-4000-8000-000000001602';
  v_proj    UUID;
BEGIN
  -- 1. Creating: the star is dropped, the opt-in kept.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member)::text, TRUE);
  INSERT INTO projects (title, description, owner_id, phase, is_featured, feature_on_homepage)
  VALUES ('Fixture Project 160', 'Owned by the member.', v_member, 'concept', TRUE, TRUE)
  RETURNING id INTO v_proj;

  ASSERT NOT (SELECT is_featured FROM projects WHERE id = v_proj),
    'a member must not be able to create a project already starred';
  ASSERT (SELECT feature_on_homepage FROM projects WHERE id = v_proj),
    'the owner''s homepage opt-in should have been kept';

  -- 2. Editing: the star is pinned, everything else in the statement lands.
  UPDATE projects
     SET is_featured = TRUE, feature_on_homepage = FALSE, title = 'Fixture Project 160 (edited)'
   WHERE id = v_proj;

  ASSERT NOT (SELECT is_featured FROM projects WHERE id = v_proj),
    'a member must not be able to star their own project';
  ASSERT NOT (SELECT feature_on_homepage FROM projects WHERE id = v_proj),
    'the owner should be able to withdraw the opt-in';
  ASSERT (SELECT title FROM projects WHERE id = v_proj) = 'Fixture Project 160 (edited)',
    'the rest of the edit should land — the trigger pins, it does not refuse';

  -- 3. An admin stars it; the owner cannot take the star away.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_royston)::text, TRUE);
  UPDATE projects SET is_featured = TRUE WHERE id = v_proj;
  ASSERT (SELECT is_featured FROM projects WHERE id = v_proj),
    'Royston (project:manage_all) must still be able to star a project';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member)::text, TRUE);
  UPDATE projects SET is_featured = FALSE WHERE id = v_proj;
  ASSERT (SELECT is_featured FROM projects WHERE id = v_proj),
    'the owner must not be able to remove an admin''s star';
END $$;

-- ------------------------------------------------------------
-- 4. Under RLS, the owner's opt-in lands
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member  UUID := '00000000-0000-4000-8000-000000001602';
  v_touched INT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member)::text, TRUE);

  UPDATE projects SET feature_on_homepage = TRUE
   WHERE owner_id = v_member AND title = 'Fixture Project 160 (edited)';
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 1, 'the owner must be able to opt in (touched ' || v_touched || ' rows)';

  RESET ROLE;

  ASSERT (SELECT feature_on_homepage FROM projects
           WHERE owner_id = v_member AND title = 'Fixture Project 160 (edited)'),
    'the opt-in did not persist';
END $$;

ROLLBACK;
