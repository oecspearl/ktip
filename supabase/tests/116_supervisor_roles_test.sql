-- ============================================================
-- Hand-run test for migration 116 (two supervisor seats and the domain keys
-- that make them real).
--
-- Same workflow as the 111 test: paste into the Supabase SQL editor and run.
-- It seeds fixtures, asserts, and ROLLBACKs — nothing is left behind. A failing
-- ASSERT aborts with the message shown; silence at the end means every
-- assertion held.
--
-- NOTE ON ROLES. Sections 1-4 exercise has_permission() and the SECURITY
-- DEFINER guards, which run for any caller. Section 5 exercises RLS, and the
-- SQL editor connects as a BYPASSRLS superuser — so it switches to
-- `authenticated` with SET LOCAL ROLE first. Without that switch the policy
-- assertions would pass vacuously.
--
-- What is being defended:
--   1. The catalog is the size the client expects. rbac-parity.test.ts checks
--      the TS copy against this migration's text; this checks the rows that
--      actually landed.
--   2. Each supervisor holds their own domain and NOT the other's. That is the
--      entire content of the three-way split.
--   3. Neither supervisor holds an operator key (org:manage, members:manage,
--      role:manage) and neither holds event:manage.
--   4. super_admin still holds everything, including the nine new keys.
--   5. A supervisor's write actually LANDS. This is the regression the whole
--      migration exists for: before it, RLS filtered the row out and the UPDATE
--      returned success having changed nothing.
--   6. A supervisor's write into the other's domain does NOT land.
--   7. Marvin can set a verified badge; the guard trigger no longer refuses him.
--   8. Nobody but a super_admin can hand out an admin-tier role.
--   9. The super_admin permission column cannot be switched off.
--
-- Requires 063, 090, 110 and 116 to be applied first, and a role that can write
-- auth.users (the SQL editor's default is fine).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Fixtures
--
--   boss     super_admin
--   marvin   people_supervisor
--   royston  programme_supervisor
--   member   entrepreneur, owns the rows the supervisors act on
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss    UUID := '00000000-0000-4000-8000-000000001160';
  v_marvin  UUID := '00000000-0000-4000-8000-000000001161';
  v_royston UUID := '00000000-0000-4000-8000-000000001162';
  v_member  UUID := '00000000-0000-4000-8000-000000001163';
BEGIN
  -- profiles.id is a FK to auth.users (000), so the users have to exist first.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_boss, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'boss-116@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Boss 116', 'country', 'Saint Lucia')),
    (v_marvin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'marvin-116@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Marvin 116', 'country', 'Saint Lucia')),
    (v_royston, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'royston-116@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Royston 116', 'country', 'Saint Lucia')),
    (v_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'member-116@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member 116', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country) VALUES
    (v_boss,    'Boss 116',    ARRAY['super_admin'],          'Saint Lucia'),
    (v_marvin,  'Marvin 116',  ARRAY['people_supervisor'],    'Saint Lucia'),
    (v_royston, 'Royston 116', ARRAY['programme_supervisor'], 'Saint Lucia'),
    (v_member,  'Member 116',  ARRAY['entrepreneur'],         'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;
END $$;

-- ------------------------------------------------------------
-- 1. The catalog landed at the expected size
-- ------------------------------------------------------------
DO $$
DECLARE
  v_perms INT;
  v_roles INT;
  v_cells INT;
BEGIN
  SELECT COUNT(*) INTO v_perms FROM permission_definitions;
  ASSERT v_perms = 33, '33 permission keys expected, found ' || v_perms;

  SELECT COUNT(*) INTO v_roles FROM role_definitions;
  ASSERT v_roles = 21, '21 roles expected, found ' || v_roles;

  -- 20 non-alias roles x 33 keys. oecs is an alias and owns no column.
  SELECT COUNT(*) INTO v_cells FROM role_permissions;
  ASSERT v_cells = 660, '660 matrix cells expected (20 x 33), found ' || v_cells;

  -- Every non-alias role has a full row. A missing cell cannot be created from
  -- the admin UI — role_permissions has an UPDATE policy and no INSERT policy.
  ASSERT NOT EXISTS (
    SELECT 1 FROM role_definitions rd
    CROSS JOIN permission_definitions pd
    WHERE rd.alias_of IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp
        WHERE rp.role_slug = rd.slug AND rp.permission_key = pd.key
      )
  ), 'a role is missing a matrix cell and could never be toggled from /admin/roles';

  ASSERT (SELECT tier FROM role_definitions WHERE slug = 'people_supervisor') = 'admin',
    'people_supervisor must be admin tier';
  ASSERT (SELECT tier FROM role_definitions WHERE slug = 'programme_supervisor') = 'admin',
    'programme_supervisor must be admin tier';
  ASSERT NOT (SELECT is_self_assignable FROM role_definitions WHERE slug = 'people_supervisor'),
    'a supervisor seat must never be self-assignable at signup';
  ASSERT NOT (SELECT is_self_assignable FROM role_definitions WHERE slug = 'programme_supervisor'),
    'a supervisor seat must never be self-assignable at signup';
END $$;

-- ------------------------------------------------------------
-- 2. Each seat holds its own domain and not the other's
-- ------------------------------------------------------------
DO $$
DECLARE
  v_marvin  UUID := '00000000-0000-4000-8000-000000001161';
  v_royston UUID := '00000000-0000-4000-8000-000000001162';
  v_key     TEXT;
BEGIN
  -- Marvin's domain.
  FOREACH v_key IN ARRAY ARRAY[
    'members:view', 'audit:view', 'moderation:view', 'moderation:action',
    'moderation:escalate', 'sme:verify', 'institution:verify',
    'institution:approve_students', 'verification:review'
  ] LOOP
    ASSERT has_permission(v_marvin, v_key), 'Marvin should hold ' || v_key;
    ASSERT NOT has_permission(v_royston, v_key), 'Royston must NOT hold ' || v_key;
  END LOOP;

  -- Royston's domain.
  FOREACH v_key IN ARRAY ARRAY[
    'project:manage_all', 'grant:manage', 'grant:post', 'grant:manage_funds',
    'forum:manage', 'resource:manage', 'achievement:manage', 'employer:manage'
  ] LOOP
    ASSERT has_permission(v_royston, v_key), 'Royston should hold ' || v_key;
    ASSERT NOT has_permission(v_marvin, v_key), 'Marvin must NOT hold ' || v_key;
  END LOOP;

  -- The participant bundle both of them carry, so the relay session works.
  FOREACH v_key IN ARRAY ARRAY[
    'grant:view', 'grant:apply', 'project:create', 'project:manage',
    'event:create', 'forum:post', 'forum:comment', 'dm:receive'
  ] LOOP
    ASSERT has_permission(v_marvin, v_key),  'Marvin should hold ' || v_key;
    ASSERT has_permission(v_royston, v_key), 'Royston should hold ' || v_key;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. No operator keys, no events, and super_admin keeps everything
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss    UUID := '00000000-0000-4000-8000-000000001160';
  v_marvin  UUID := '00000000-0000-4000-8000-000000001161';
  v_royston UUID := '00000000-0000-4000-8000-000000001162';
  v_key     TEXT;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['org:manage', 'members:manage', 'role:manage', 'event:manage'] LOOP
    ASSERT NOT has_permission(v_marvin, v_key),  'Marvin must NOT hold ' || v_key;
    ASSERT NOT has_permission(v_royston, v_key), 'Royston must NOT hold ' || v_key;
    ASSERT has_permission(v_boss, v_key),        'the Super Admin must hold ' || v_key;
  END LOOP;

  -- Every key, including the nine added by this migration.
  ASSERT NOT EXISTS (
    SELECT 1 FROM permission_definitions pd
    WHERE NOT has_permission(v_boss, pd.key)
  ), 'the Super Admin is missing a permission key';
END $$;

-- ------------------------------------------------------------
-- 4. The escalation ceiling and the matrix guard
-- ------------------------------------------------------------
DO $$
DECLARE
  v_marvin UUID := '00000000-0000-4000-8000-000000001161';
  v_member UUID := '00000000-0000-4000-8000-000000001163';
  v_result JSONB;
  v_raised BOOLEAN := FALSE;
BEGIN
  -- Marvin has no role:manage, so the RPC refuses before the ceiling is even
  -- reached. Both refusals matter: the first is today's boundary, the second is
  -- what makes delegating role:manage later a decision rather than a mistake.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_marvin)::text, TRUE);
  v_result := set_user_roles(v_member, ARRAY['entrepreneur', 'super_admin']);
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'a supervisor must not be able to assign roles';
  ASSERT v_result->>'reason' = 'forbidden',
    'expected forbidden, got: ' || COALESCE(v_result->>'reason', 'NULL');

  -- The super_admin column is not revocable, even by a caller who could
  -- otherwise write the matrix.
  BEGIN
    UPDATE role_permissions SET allowed = FALSE
    WHERE role_slug = 'super_admin' AND permission_key = 'role:manage';
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%cannot be revoked%',
      'expected the super_admin guard message, got: ' || SQLERRM;
  END;
  ASSERT v_raised, 'the Super Admin permission column must not be revocable';

  -- Setting it TRUE is still fine, or reset_role_permissions() would break.
  UPDATE role_permissions SET allowed = TRUE
  WHERE role_slug = 'super_admin' AND permission_key = 'role:manage';
END $$;

-- ------------------------------------------------------------
-- 5. RLS — a supervisor's write actually lands, and stops at their border
--
-- This is the assertion the migration exists for. Before 116 the UPDATE below
-- matched zero rows and returned success, so the console showed a saved toast
-- and the database was unchanged.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_marvin  UUID := '00000000-0000-4000-8000-000000001161';
  v_royston UUID := '00000000-0000-4000-8000-000000001162';
  v_member  UUID := '00000000-0000-4000-8000-000000001163';
  v_proj    UUID;
  v_touched INT;
BEGIN
  INSERT INTO projects (title, description, owner_id, phase, is_featured)
  VALUES ('Fixture Project 116', 'Owned by the member, administered by Royston.', v_member, 'concept', FALSE)
  RETURNING id INTO v_proj;

  SET LOCAL ROLE authenticated;

  -- Royston administers projects.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_royston)::text, TRUE);
  UPDATE projects SET is_featured = TRUE WHERE id = v_proj;
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 1, 'Royston must be able to feature any project (touched ' || v_touched || ' rows)';
  ASSERT (SELECT is_featured FROM projects WHERE id = v_proj), 'the feature flag did not persist';

  -- Marvin does not. A zero-row UPDATE is exactly the silent failure this
  -- migration removes on the other side of the border — here it is correct.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_marvin)::text, TRUE);
  UPDATE projects SET is_featured = FALSE WHERE id = v_proj;
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 0, 'Marvin must not be able to edit another member''s project';
  ASSERT (SELECT is_featured FROM projects WHERE id = v_proj), 'Marvin''s write should not have landed';

  RESET ROLE;
END $$;

-- ------------------------------------------------------------
-- 6. Marvin can set a verified badge
--
-- Two things had to change for this: the profiles UPDATE policy, and the
-- guard_profile_privileged_columns trigger, which raised for any actor that was
-- not is_platform_admin() the moment is_verified moved.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_marvin  UUID := '00000000-0000-4000-8000-000000001161';
  v_royston UUID := '00000000-0000-4000-8000-000000001162';
  v_member  UUID := '00000000-0000-4000-8000-000000001163';
  v_touched INT;
  v_raised  BOOLEAN := FALSE;
BEGIN
  SET LOCAL ROLE authenticated;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_marvin)::text, TRUE);
  UPDATE profiles SET is_verified = TRUE WHERE id = v_member;
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 1, 'Marvin must be able to verify a member (touched ' || v_touched || ' rows)';
  ASSERT (SELECT is_verified FROM profiles WHERE id = v_member), 'the verified badge did not persist';

  -- Royston has no verification key. The policy filters the row out before the
  -- trigger is reached, so this is a zero-row UPDATE rather than an exception.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_royston)::text, TRUE);
  UPDATE profiles SET is_verified = FALSE WHERE id = v_member;
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 0, 'Royston must not be able to change a verification badge';
  ASSERT (SELECT is_verified FROM profiles WHERE id = v_member), 'Royston''s write should not have landed';

  -- And an ordinary member still cannot verify themselves — the branch the
  -- guard has always defended, now expressed as a capability.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member)::text, TRUE);
  BEGIN
    UPDATE profiles SET is_verified = FALSE WHERE id = v_member;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%verification state%',
      'expected the verification guard message, got: ' || SQLERRM;
  END;
  ASSERT v_raised, 'a member must not be able to change their own verified badge';

  RESET ROLE;
END $$;

ROLLBACK;
