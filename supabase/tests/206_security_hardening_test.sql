-- ============================================================
-- Hand-run test for migration 206 (security hardening, 2026-11-10).
--
-- Paste into the Supabase SQL editor and run. It seeds fixtures, asserts, and
-- ROLLBACKs, so nothing is left behind. A failing ASSERT aborts with the
-- message shown; silence at the end means every assertion held.
--
-- Fixtures:
--   admin    'admin' seat, grandfathered, verified TOTP factor
--   safety   safety_admin, email method
--   mentor   mentor, verified, no second step (not required)
--   newbie   mentor, NOT verified
--
-- What is being defended:
--   1. Grandfathering spares no admin-tier role.
--   2. A TOTP admin at aal1 holds nothing for itself; at aal2 it does; on
--      someone else's behalf it always does.
--   3. An email-method admin holds nothing until THIS session has a step-up.
--   4. A member whose role needs no second step is unaffected.
--   5. A member cannot edit the closure columns directly, and can still close
--      the account through close_my_account().
--   6. The suspension policies and the UPDATE moderation triggers exist.
--   7. An unverified account cannot start a video call.
--
-- Requires 206 and everything before it. Needs a role that can write
-- auth.users and auth.mfa_factors (the SQL editor's default is fine).
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_admin  UUID := '00000000-0000-4000-8000-000000002061';
  v_safety UUID := '00000000-0000-4000-8000-000000002062';
  v_mentor UUID := '00000000-0000-4000-8000-000000002063';
  v_newbie UUID := '00000000-0000-4000-8000-000000002064';
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin-206@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Admin 206', 'country', 'Saint Lucia')),
    (v_safety, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'safety-206@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Safety 206', 'country', 'Saint Lucia')),
    (v_mentor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'mentor-206@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Mentor 206', 'country', 'Saint Lucia')),
    (v_newbie, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'newbie-206@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Newbie 206', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country) VALUES
    (v_admin,  'Admin 206',  ARRAY['mentor'], 'Saint Lucia'),
    (v_safety, 'Safety 206', ARRAY['mentor'], 'Saint Lucia'),
    (v_mentor, 'Mentor 206', ARRAY['mentor'], 'Saint Lucia'),
    (v_newbie, 'Newbie 206', ARRAY['mentor'], 'Saint Lucia')
  ON CONFLICT (id) DO NOTHING;

  -- Straight to the columns, on the editor's role: the seat cap (143) and the
  -- provenance guards are about members, not about fixtures.
  ALTER TABLE profiles DISABLE TRIGGER USER;
  UPDATE profiles SET roles = ARRAY['admin'], mfa_grandfathered = TRUE, mfa_method = 'totp',
    is_verified = TRUE, account_status = 'active', is_suspended = FALSE WHERE id = v_admin;
  UPDATE profiles SET roles = ARRAY['safety_admin'], mfa_grandfathered = TRUE, mfa_method = 'email',
    is_verified = TRUE, account_status = 'active', is_suspended = FALSE WHERE id = v_safety;
  UPDATE profiles SET roles = ARRAY['mentor'], mfa_grandfathered = TRUE, mfa_method = NULL,
    is_verified = TRUE, verified_via = 'admin', verified_at = NOW(),
    account_status = 'active', is_suspended = FALSE WHERE id = v_mentor;
  UPDATE profiles SET roles = ARRAY['mentor'], is_verified = FALSE,
    account_status = 'active', is_suspended = FALSE WHERE id = v_newbie;
  ALTER TABLE profiles ENABLE TRIGGER USER;

  INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_admin, 'test-206', 'totp', 'verified', NOW(), NOW());
END $$;

-- ------------------------------------------------------------
-- 1. Grandfathering spares no admin-tier role
-- ------------------------------------------------------------
DO $$
BEGIN
  ASSERT account_mfa_required('00000000-0000-4000-8000-000000002061'),
    'a grandfathered admin must still owe a second step';
  ASSERT account_mfa_required('00000000-0000-4000-8000-000000002062'),
    'a grandfathered safety_admin must still owe a second step';
  ASSERT NOT account_mfa_required('00000000-0000-4000-8000-000000002063'),
    'a mentor owes no second step';
  ASSERT (SELECT bool_and(requires_mfa) FROM role_definitions WHERE tier = 'admin'),
    'every admin-tier role requires a second step';
END $$;

-- ------------------------------------------------------------
-- 2. TOTP admin: aal1 refused for itself, aal2 allowed, on behalf allowed
-- ------------------------------------------------------------
DO $$
DECLARE
  v_admin  UUID := '00000000-0000-4000-8000-000000002061';
  v_mentor UUID := '00000000-0000-4000-8000-000000002063';
  v_key    TEXT;
BEGIN
  SELECT rp.permission_key INTO v_key
  FROM role_permissions rp
  WHERE rp.role_slug = 'admin' AND rp.allowed
  ORDER BY rp.permission_key LIMIT 1;
  ASSERT v_key IS NOT NULL, 'the admin column holds at least one key';

  SET LOCAL ROLE authenticated;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'aal', 'aal1')::text, TRUE);
  ASSERT NOT is_platform_admin(v_admin), 'aal1 TOTP admin is not a platform admin for itself';
  ASSERT NOT has_permission(v_admin, v_key), 'aal1 TOTP admin holds no key for itself';
  ASSERT NOT account_mfa_satisfied(v_admin), 'aal1 does not satisfy a TOTP account';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'aal', 'aal2')::text, TRUE);
  ASSERT is_platform_admin(v_admin), 'aal2 TOTP admin is a platform admin';
  ASSERT has_permission(v_admin, v_key), 'aal2 TOTP admin holds its keys';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_mentor, 'aal', 'aal1')::text, TRUE);
  ASSERT is_platform_admin(v_admin), 'asked on the admin''s behalf, the answer is unchanged';
  ASSERT has_permission(v_admin, v_key), 'on behalf, the admin still holds its keys';

  RESET ROLE;
END $$;

-- ------------------------------------------------------------
-- 3. Email admin: nothing until this session has a step-up
-- ------------------------------------------------------------
DO $$
DECLARE
  v_safety UUID := '00000000-0000-4000-8000-000000002062';
  v_s1     UUID := '00000000-0000-4000-8000-0000000020a1';
  v_s2     UUID := '00000000-0000-4000-8000-0000000020a2';
  v_key    TEXT;
BEGIN
  SELECT rp.permission_key INTO v_key
  FROM role_permissions rp
  WHERE rp.role_slug = 'safety_admin' AND rp.allowed
    AND rp.permission_key NOT IN (SELECT permission_key FROM verification_gated_permissions)
  ORDER BY rp.permission_key LIMIT 1;
  ASSERT v_key IS NOT NULL, 'the safety_admin column holds at least one ungated key';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_safety, 'aal', 'aal1', 'session_id', v_s1)::text, TRUE);
  ASSERT NOT has_permission(v_safety, v_key), 'email admin without a step-up holds nothing';
  RESET ROLE;

  INSERT INTO mfa_email_stepups (user_id, session_id, expires_at)
  VALUES (v_safety, v_s1, NOW() + INTERVAL '30 days');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_safety, 'aal', 'aal1', 'session_id', v_s1)::text, TRUE);
  ASSERT has_permission(v_safety, v_key), 'the stepped-up session holds the key';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_safety, 'aal', 'aal1', 'session_id', v_s2)::text, TRUE);
  ASSERT NOT has_permission(v_safety, v_key), 'another session owes its own step-up';
  RESET ROLE;
END $$;

-- ------------------------------------------------------------
-- 4. A role that needs no second step is unaffected
-- ------------------------------------------------------------
DO $$
DECLARE
  v_mentor UUID := '00000000-0000-4000-8000-000000002063';
  v_key    TEXT;
BEGIN
  SELECT rp.permission_key INTO v_key
  FROM role_permissions rp
  WHERE rp.role_slug = 'mentor' AND rp.allowed
  ORDER BY rp.permission_key LIMIT 1;
  ASSERT v_key IS NOT NULL, 'the mentor column holds at least one key';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_mentor, 'aal', 'aal1')::text, TRUE);
  ASSERT has_permission(v_mentor, v_key), 'a verified mentor at aal1 keeps its keys';
  ASSERT account_mfa_satisfied(v_mentor), 'nothing owed, nothing to satisfy';
  RESET ROLE;
END $$;

-- ------------------------------------------------------------
-- 5. Closure columns: no direct edit; close_my_account() still works
-- ------------------------------------------------------------
DO $$
DECLARE
  v_mentor UUID := '00000000-0000-4000-8000-000000002063';
  v_refused BOOLEAN := FALSE;
  v_status TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_mentor, 'aal', 'aal1')::text, TRUE);

  BEGIN
    UPDATE profiles
    SET account_status = 'pending_deletion', purge_after = NOW()
    WHERE id = v_mentor;
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := TRUE;
  END;
  ASSERT v_refused, 'a direct edit of the closure columns must be refused';

  SELECT c.account_status INTO v_status FROM close_my_account('deactivate') c;
  ASSERT v_status = 'deactivated', 'close_my_account() still closes the account';
  RESET ROLE;
END $$;

-- ------------------------------------------------------------
-- 6. Policies and triggers are in place
-- ------------------------------------------------------------
DO $$
BEGIN
  ASSERT (
    SELECT count(*) FROM pg_policies
    WHERE policyname IN (
      'Active accounts only: send messages',
      'Active accounts only: join conversations',
      'Active accounts only: room chat'
    ) AND permissive = 'RESTRICTIVE'
  ) = 3, 'the three suspension policies are restrictive and present';

  -- tgtype bit 16 = UPDATE.
  ASSERT (
    SELECT count(*) FROM pg_trigger
    WHERE tgname IN (
      'moderate_forum_posts_trigger', 'moderate_forum_replies_trigger',
      'moderate_project_comments_trigger', 'moderate_messages_trigger'
    ) AND (tgtype & 16) <> 0
  ) = 4, 'the four moderation triggers fire on UPDATE';
END $$;

-- ------------------------------------------------------------
-- 7. Unverified or closed accounts cannot start a video call
-- ------------------------------------------------------------
DO $$
DECLARE
  v_mentor  UUID := '00000000-0000-4000-8000-000000002063';
  v_refused BOOLEAN := FALSE;
  v_status  TEXT;
BEGIN
  BEGIN
    PERFORM video_call_check_caller('00000000-0000-4000-8000-000000002064');
  EXCEPTION WHEN raise_exception THEN
    v_refused := TRUE;
  END;
  ASSERT v_refused, 'an unverified account must be refused a video call';

  -- Block 5 closed the mentor, so the closed-account gate answers first.
  v_refused := FALSE;
  BEGIN
    PERFORM video_call_check_caller(v_mentor);
  EXCEPTION WHEN raise_exception THEN
    v_refused := TRUE;
  END;
  ASSERT v_refused, 'a closed account must be refused a video call';

  -- Reopened through the member's own path (the lifecycle fence lets it by),
  -- the verified, active mentor may call.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_mentor, 'aal', 'aal1')::text, TRUE);
  SELECT r.account_status INTO v_status FROM reopen_my_account() r;
  ASSERT v_status = 'active', 'reopen_my_account() still reopens the account';
  RESET ROLE;

  PERFORM video_call_check_caller(v_mentor);
END $$;

ROLLBACK;
