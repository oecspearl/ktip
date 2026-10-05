-- ============================================================
-- Hand-run test for migration 159 (the email code stops tripping people up).
--
-- Same workflow as the 150 test: paste into the Supabase SQL editor and run.
-- It seeds fixtures, asserts, and ROLLBACKs — nothing is left behind. A failing
-- ASSERT aborts with the message shown; silence at the end means every
-- assertion held.
--
-- What is being defended:
--   1. Asking for a second code does not kill the first: either one verifies,
--      and spending one closes the rest for that session.
--   2. mfa_email_open_code() reports the newest live code, and nothing once it
--      is spent or nearly expired.
--   3. A verified code hands back a device token; a NEW session presenting it
--      is stepped up until the original thirty days run out.
--   4. A wrong, malformed or other account's token is refused.
--   5. Leaving the email method forgets every remembered browser, and coming
--      back to it does not revive the old tokens.
--
-- Requires 150 and 159 to be applied first.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001590';
  v_other  UUID := '00000000-0000-4000-8000-000000001591';
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES
    (v_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'member-159@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member 159', 'country', 'Saint Lucia')),
    (v_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'other-159@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Other 159', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  UPDATE profiles SET roles = ARRAY['entrepreneur'], mfa_grandfathered = FALSE WHERE id IN (v_member, v_other);
  PERFORM sync_mfa_status(v_member);
  PERFORM sync_mfa_status(v_other);
END $$;

-- ------------------------------------------------------------
-- 1. Two codes in flight; the OLDER one still verifies
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001590';
  v_sess   UUID := '00000000-0000-4000-8000-00000000159a';
  v_first  JSONB;
  v_second JSONB;
  v_result JSONB;
BEGIN
  v_first := issue_mfa_email_code(v_member, v_sess);
  v_second := issue_mfa_email_code(v_member, v_sess);
  ASSERT (v_first->>'ok')::BOOLEAN AND (v_second->>'ok')::BOOLEAN, 'both issues succeed';
  ASSERT (SELECT count(*) FROM mfa_email_codes
          WHERE user_id = v_member AND session_id = v_sess AND consumed_at IS NULL) = 2,
    'asking again leaves the first code open';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);
  v_result := verify_mfa_email_code(v_first->>'code');
  ASSERT (v_result->>'ok')::BOOLEAN, 'the first code verifies after a second was sent, got ' || v_result::text;
  ASSERT v_result->>'device_token' ~ '^[0-9a-f]{64}$', 'a device token comes back, got ' || v_result::text;

  ASSERT (SELECT count(*) FROM mfa_email_codes
          WHERE user_id = v_member AND session_id = v_sess AND consumed_at IS NULL) = 0,
    'spending one closes the rest for the session';
  v_result := verify_mfa_email_code(v_second->>'code');
  ASSERT v_result->>'reason' = 'invalid_code', 'the closed second code is invalid_code';
END $$;

-- ------------------------------------------------------------
-- 2. mfa_email_open_code()
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001590';
  v_sess   UUID := '00000000-0000-4000-8000-00000000159b';
  v_open   JSONB;
BEGIN
  ASSERT mfa_email_open_code(v_member, v_sess) IS NULL, 'nothing open on a fresh session';

  PERFORM issue_mfa_email_code(v_member, v_sess);
  v_open := mfa_email_open_code(v_member, v_sess);
  ASSERT v_open IS NOT NULL AND (v_open->>'expires_at')::TIMESTAMPTZ > now(),
    'a live code is reported, got ' || COALESCE(v_open::text, 'NULL');

  UPDATE mfa_email_codes SET expires_at = now() + interval '1 minute'
  WHERE user_id = v_member AND session_id = v_sess;
  ASSERT mfa_email_open_code(v_member, v_sess) IS NULL, 'a code with under two minutes left is not offered';
END $$;

-- ------------------------------------------------------------
-- 3. A remembered browser steps up a new session
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001590';
  v_sess   UUID := '00000000-0000-4000-8000-00000000159c';
  v_later  UUID := '00000000-0000-4000-8000-00000000159d';
  v_issued JSONB;
  v_token  TEXT;
  v_result JSONB;
  v_device_expiry TIMESTAMPTZ;
BEGIN
  DELETE FROM auth_rate_limits WHERE bucket = 'mfa-email-send:user:' || v_member::TEXT;
  v_issued := issue_mfa_email_code(v_member, v_sess);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);
  v_token := verify_mfa_email_code(v_issued->>'code')->>'device_token';
  ASSERT v_token IS NOT NULL, 'verify returned a token';
  SELECT expires_at INTO v_device_expiry FROM mfa_email_devices
  WHERE token_hash = mfa_device_token_hash(v_token);

  -- Sign out, sign back in: a new session with no step-up of its own.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_later)::text, TRUE);
  ASSERT NOT (mfa_email_session_status()->>'step_up_ok')::BOOLEAN, 'the new session starts unproven';

  v_result := redeem_mfa_email_device(v_token);
  ASSERT (v_result->>'ok')::BOOLEAN, 'the remembered browser redeems, got ' || v_result::text;
  ASSERT (mfa_email_session_status()->>'step_up_ok')::BOOLEAN, 'and the new session is stepped up';
  ASSERT account_mfa_satisfied(v_member), 'the write check passes for the new session';
  ASSERT (SELECT expires_at FROM mfa_email_stepups WHERE user_id = v_member AND session_id = v_later)
         = v_device_expiry,
    'the step-up ends with the device, not thirty days from now';
END $$;

-- ------------------------------------------------------------
-- 4. Wrong, malformed, and another account's token
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001590';
  v_other  UUID := '00000000-0000-4000-8000-000000001591';
  v_sess   UUID := '00000000-0000-4000-8000-00000000159e';
  v_issued JSONB;
  v_token  TEXT;
  v_result JSONB;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);
  v_result := redeem_mfa_email_device(repeat('0', 64));
  ASSERT v_result->>'reason' = 'invalid_token', 'an unknown token is refused, got ' || v_result::text;
  v_result := redeem_mfa_email_device('not-a-token');
  ASSERT v_result->>'reason' = 'invalid_token', 'a malformed token is refused';

  -- The other account proves a code and gets its own token…
  v_issued := issue_mfa_email_code(v_other, v_sess);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other, 'session_id', v_sess)::text, TRUE);
  v_token := verify_mfa_email_code(v_issued->>'code')->>'device_token';

  -- …which is no use to the member.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);
  v_result := redeem_mfa_email_device(v_token);
  ASSERT v_result->>'reason' = 'invalid_token', 'another account''s token is refused, got ' || v_result::text;
  ASSERT NOT (mfa_email_session_status()->>'step_up_ok')::BOOLEAN, 'and nothing was stepped up';
END $$;

-- ------------------------------------------------------------
-- 5. Leaving the method forgets the browser for good
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001590';
  v_sess   UUID := '00000000-0000-4000-8000-00000000159f';
  v_issued JSONB;
  v_token  TEXT;
  v_result JSONB;
BEGIN
  DELETE FROM auth_rate_limits WHERE bucket = 'mfa-email-send:user:' || v_member::TEXT;
  v_issued := issue_mfa_email_code(v_member, v_sess);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);
  v_token := verify_mfa_email_code(v_issued->>'code')->>'device_token';
  ASSERT (SELECT count(*) FROM mfa_email_devices WHERE user_id = v_member) > 0, 'devices remembered';

  PERFORM clear_mfa_email_method(v_member);
  ASSERT (SELECT count(*) FROM mfa_email_devices WHERE user_id = v_member) = 0,
    'an admin reset forgets every remembered browser';

  v_result := redeem_mfa_email_device(v_token);
  ASSERT v_result->>'reason' = 'not_email', 'no method, no redeem, got ' || v_result::text;

  -- Choosing email again does not bring the old token back.
  v_issued := issue_mfa_email_code(v_member, v_sess);
  PERFORM verify_mfa_email_code(v_issued->>'code');
  v_result := redeem_mfa_email_device(v_token);
  ASSERT v_result->>'reason' = 'invalid_token', 'the pre-reset token stays dead, got ' || v_result::text;

  -- An authenticator wins here too: sync flips the method and the browsers go.
  INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
  VALUES (gen_random_uuid(), v_member, 'test', 'totp', 'verified', now(), now(), 'x');
  PERFORM sync_mfa_status(v_member);
  ASSERT (SELECT count(*) FROM mfa_email_devices WHERE user_id = v_member) = 0,
    'verifying an authenticator forgets every remembered browser';
END $$;

ROLLBACK;
