-- ============================================================
-- Hand-run test for migration 150 (the email code as a second step).
--
-- Same workflow as the 145 test: paste into the Supabase SQL editor and run.
-- It seeds fixtures, asserts, and ROLLBACKs — nothing is left behind. A failing
-- ASSERT aborts with the message shown; silence at the end means every
-- assertion held.
--
-- What is being defended:
--   1. A new entrepreneur with neither method owes enrolment and cannot write.
--   2. Issuing a code returns six digits; issuing again retires the old one.
--   3. Wrong code, wrong session and expired code are all `invalid_code`.
--   4. The right code settles the method, clears the gate, and satisfies the
--      write check for THIS session only — another session owes its own code,
--      and an on-behalf evaluation (a different caller) is satisfied.
--   5. A code cannot be replayed.
--   6. The eleventh verify attempt in an hour is `rate_limited`.
--   7. A member cannot write mfa_method or requires_mfa_enrollment directly —
--      the fence 124 dropped is back.
--   8. A verified factor refuses the email path, and sync flips the method to
--      totp and removes every email row.
--   9. A grandfathered member may choose email voluntarily and owes nothing.
--
-- Requires 118, 124 and 150 to be applied first, and a role that can write
-- auth.users (the SQL editor's default is fine).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Fixtures
--
--   member   new entrepreneur, not grandfathered  -> owes a second step
--   elder    grandfathered entrepreneur           -> owes nothing
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001500';
  v_elder  UUID := '00000000-0000-4000-8000-000000001501';
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES
    (v_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'member-150@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member 150', 'country', 'Saint Lucia')),
    (v_elder, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'elder-150@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Elder 150', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  -- The editor has no JWT subject, so the UPDATE guard returns early and does
  -- not re-derive; sync_mfa_status() does that, exactly as the reset route does.
  UPDATE profiles SET roles = ARRAY['entrepreneur'], mfa_grandfathered = FALSE WHERE id = v_member;
  UPDATE profiles SET roles = ARRAY['entrepreneur'], mfa_grandfathered = TRUE  WHERE id = v_elder;
  PERFORM sync_mfa_status(v_member);
  PERFORM sync_mfa_status(v_elder);
END $$;

-- ------------------------------------------------------------
-- 1. Neither method: owes enrolment, cannot write
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001500';
  v_sess   UUID := '00000000-0000-4000-8000-00000000150a';
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);
  ASSERT account_mfa_required(v_member), 'a fresh entrepreneur is required to hold a second step';
  ASSERT NOT account_mfa_enrolled(v_member), 'nothing enrolled yet';
  ASSERT NOT account_mfa_satisfied(v_member), 'nothing satisfies the write check yet';
  ASSERT ensure_my_mfa_status(), 'ensure_my_mfa_status must report enrolment owed';
  ASSERT (SELECT requires_mfa_enrollment FROM profiles WHERE id = v_member), 'the gate column reads owed';
  ASSERT (SELECT mfa_method FROM profiles WHERE id = v_member) IS NULL, 'no method yet';
END $$;

-- ------------------------------------------------------------
-- 2. Issue: six digits; re-issue retires the first
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001500';
  v_sess   UUID := '00000000-0000-4000-8000-00000000150a';
  v_first  JSONB;
  v_second JSONB;
  v_result JSONB;
BEGIN
  v_first := issue_mfa_email_code(v_member, v_sess);
  ASSERT (v_first->>'ok')::BOOLEAN, 'issue must succeed, got ' || v_first::text;
  ASSERT v_first->>'code' ~ '^[0-9]{6}$', 'the code is six digits, got ' || (v_first->>'code');

  v_second := issue_mfa_email_code(v_member, v_sess);
  ASSERT (v_second->>'ok')::BOOLEAN, 'a second issue must succeed';
  ASSERT (SELECT count(*) FROM mfa_email_codes WHERE user_id = v_member AND consumed_at IS NULL) = 1,
    'only one live code at a time';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);
  v_result := verify_mfa_email_code(v_first->>'code');
  ASSERT v_result->>'reason' = 'invalid_code', 'the retired first code must be invalid, got ' || v_result::text;
END $$;

-- ------------------------------------------------------------
-- 3. Wrong code, wrong session, expired: all invalid_code
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001500';
  v_sess   UUID := '00000000-0000-4000-8000-00000000150a';
  v_other  UUID := '00000000-0000-4000-8000-00000000150b';
  v_issued JSONB;
  v_result JSONB;
  v_wrong  TEXT;
BEGIN
  v_issued := issue_mfa_email_code(v_member, v_sess);
  v_wrong := CASE WHEN v_issued->>'code' = '000000' THEN '000001' ELSE '000000' END;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);
  v_result := verify_mfa_email_code(v_wrong);
  ASSERT v_result->>'reason' = 'invalid_code', 'a wrong code is invalid_code, got ' || v_result::text;

  v_result := verify_mfa_email_code('12-34');
  ASSERT v_result->>'reason' = 'invalid_code', 'a short code is invalid_code';

  -- The right digits from a different session.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_other)::text, TRUE);
  v_result := verify_mfa_email_code(v_issued->>'code');
  ASSERT v_result->>'reason' = 'invalid_code', 'the right code on the wrong session is invalid_code';

  -- Expired.
  UPDATE mfa_email_codes SET expires_at = now() - interval '1 second'
  WHERE user_id = v_member AND consumed_at IS NULL;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);
  v_result := verify_mfa_email_code(v_issued->>'code');
  ASSERT v_result->>'reason' = 'invalid_code', 'an expired code is invalid_code';

  -- No session claim at all fails closed.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member)::text, TRUE);
  v_result := verify_mfa_email_code('123456');
  ASSERT v_result->>'reason' = 'not_authenticated', 'no session_id claim is not_authenticated';
END $$;

-- ------------------------------------------------------------
-- 4. The right code: method settles, gate clears, this session is satisfied
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001500';
  v_elder  UUID := '00000000-0000-4000-8000-000000001501';
  v_sess   UUID := '00000000-0000-4000-8000-00000000150a';
  v_other  UUID := '00000000-0000-4000-8000-00000000150b';
  v_issued JSONB;
  v_result JSONB;
  v_status JSONB;
  p profiles%ROWTYPE;
BEGIN
  v_issued := issue_mfa_email_code(v_member, v_sess);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);

  v_status := mfa_email_session_status();
  ASSERT NOT (v_status->>'step_up_ok')::BOOLEAN, 'no step-up before verifying';

  v_result := verify_mfa_email_code(v_issued->>'code');
  ASSERT (v_result->>'ok')::BOOLEAN, 'the right code must verify, got ' || v_result::text;
  ASSERT (v_result->>'first_time')::BOOLEAN, 'the first verification is first_time';
  ASSERT (v_result->>'expires_at')::TIMESTAMPTZ > now() + interval '29 days', 'the step-up lasts thirty days';

  SELECT * INTO p FROM profiles WHERE id = v_member;
  ASSERT p.mfa_method = 'email', 'the method is now email, got ' || COALESCE(p.mfa_method, 'NULL');
  ASSERT NOT p.requires_mfa_enrollment, 'the enrolment gate is clear';
  ASSERT p.mfa_enrolled_at IS NOT NULL, 'mfa_enrolled_at is set';

  ASSERT account_mfa_enrolled(v_member), 'enrolled reads true';
  ASSERT account_mfa_satisfied(v_member), 'this session satisfies the write check';
  ASSERT NOT ensure_my_mfa_status(), 'ensure_my_mfa_status reports nothing owed';

  v_status := mfa_email_session_status();
  ASSERT v_status->>'method' = 'email' AND (v_status->>'step_up_ok')::BOOLEAN,
    'status reports email + step_up_ok, got ' || v_status::text;

  -- Another session of the same account owes its own code…
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_other)::text, TRUE);
  ASSERT NOT account_mfa_satisfied(v_member), 'a different session is not satisfied';
  ASSERT NOT ensure_my_mfa_status(), '…but does not owe ENROLMENT (verify, not set-up)';
  ASSERT (SELECT requires_mfa_enrollment FROM profiles WHERE id = v_member) = FALSE,
    'the gate column stays clear on the other session';

  -- …while an evaluation on the member's behalf is satisfied by the method.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_elder, 'session_id', v_other)::text, TRUE);
  ASSERT account_mfa_satisfied(v_member), 'on-behalf evaluation is satisfied by the chosen method';
END $$;

-- ------------------------------------------------------------
-- 5. No replay
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001500';
  v_sess   UUID := '00000000-0000-4000-8000-00000000150c';
  v_issued JSONB;
  v_result JSONB;
BEGIN
  v_issued := issue_mfa_email_code(v_member, v_sess);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);
  v_result := verify_mfa_email_code(v_issued->>'code');
  ASSERT (v_result->>'ok')::BOOLEAN, 'verify once';
  ASSERT NOT (v_result->>'first_time')::BOOLEAN, 'a later session is not first_time';
  v_result := verify_mfa_email_code(v_issued->>'code');
  ASSERT v_result->>'reason' = 'invalid_code', 'the same code twice is invalid_code';
END $$;

-- ------------------------------------------------------------
-- 6. Rate limit on verify
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001500';
  v_sess   UUID := '00000000-0000-4000-8000-00000000150d';
  v_result JSONB;
  i INT;
BEGIN
  -- Sections 2–5 already spent some attempts; reset the bucket so the count
  -- below is exact.
  DELETE FROM auth_rate_limits WHERE bucket = 'mfa-email-verify:user:' || v_member::TEXT;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);
  FOR i IN 1..10 LOOP
    v_result := verify_mfa_email_code('000000');
    ASSERT v_result->>'reason' = 'invalid_code', 'attempt ' || i || ' is a plain miss';
  END LOOP;
  v_result := verify_mfa_email_code('000000');
  ASSERT v_result->>'reason' = 'rate_limited', 'the eleventh attempt is rate_limited, got ' || v_result::text;
END $$;

-- ------------------------------------------------------------
-- 7. The fence: no direct writes to the derived columns
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001500';
  v_raised BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', '00000000-0000-4000-8000-00000000150a')::text, TRUE);

  v_raised := FALSE;
  BEGIN
    UPDATE profiles SET mfa_method = 'totp' WHERE id = v_member;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
  END;
  ASSERT v_raised, 'a member writing mfa_method must be refused';

  v_raised := FALSE;
  BEGIN
    UPDATE profiles SET requires_mfa_enrollment = TRUE WHERE id = v_member;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
  END;
  ASSERT v_raised, 'a member writing requires_mfa_enrollment must be refused (the fence 124 dropped)';

  v_raised := FALSE;
  BEGIN
    -- A value the row does not already hold, or the IS DISTINCT FROM test is
    -- false and the fence is never reached.
    UPDATE profiles SET copyright_strikes = 99 WHERE id = v_member;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
  END;
  ASSERT v_raised, 'a member writing copyright_strikes must be refused (117''s fence, also dropped by 124)';

  -- An ordinary edit still goes through.
  UPDATE profiles SET bio = 'still editable' WHERE id = v_member;
END $$;

-- ------------------------------------------------------------
-- 8. A verified factor wins: email refused, method flips, rows gone
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001500';
  v_sess   UUID := '00000000-0000-4000-8000-00000000150a';
  v_result JSONB;
BEGIN
  INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
  VALUES (gen_random_uuid(), v_member, 'test', 'totp', 'verified', now(), now(), 'x');

  v_result := issue_mfa_email_code(v_member, v_sess);
  ASSERT v_result->>'reason' = 'totp_enrolled', 'issue refuses a TOTP account, got ' || v_result::text;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'session_id', v_sess)::text, TRUE);
  v_result := verify_mfa_email_code('123456');
  ASSERT v_result->>'reason' = 'totp_enrolled', 'verify refuses a TOTP account, got ' || v_result::text;

  ASSERT (SELECT count(*) FROM mfa_email_stepups WHERE user_id = v_member) > 0, 'step-ups exist before sync';
  PERFORM sync_mfa_status(v_member);
  ASSERT (SELECT mfa_method FROM profiles WHERE id = v_member) = 'totp', 'sync flips the method to totp';
  ASSERT (SELECT count(*) FROM mfa_email_stepups WHERE user_id = v_member) = 0, 'sync removes the step-ups';
  ASSERT (SELECT count(*) FROM mfa_email_codes WHERE user_id = v_member) = 0, 'sync removes the codes';
  ASSERT account_mfa_satisfied(v_member), 'the factor satisfies the write check';

  -- Factor removed again (Settings, admin reset, recovery): the method is gone
  -- and the account owes a choice.
  DELETE FROM auth.mfa_factors WHERE user_id = v_member;
  PERFORM sync_mfa_status(v_member);
  ASSERT (SELECT mfa_method FROM profiles WHERE id = v_member) IS NULL, 'no factor and no email: method NULL';
  ASSERT (SELECT requires_mfa_enrollment FROM profiles WHERE id = v_member), 'and enrolment is owed again';
END $$;

-- ------------------------------------------------------------
-- 9. A grandfathered member may choose email voluntarily
-- ------------------------------------------------------------
DO $$
DECLARE
  v_elder UUID := '00000000-0000-4000-8000-000000001501';
  v_sess  UUID := '00000000-0000-4000-8000-00000000150e';
  v_issued JSONB;
  v_result JSONB;
BEGIN
  ASSERT NOT account_mfa_required(v_elder), 'grandfathered: nothing required';
  ASSERT account_mfa_satisfied(v_elder), 'grandfathered: satisfied with nothing';

  v_issued := issue_mfa_email_code(v_elder, v_sess);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_elder, 'session_id', v_sess)::text, TRUE);
  v_result := verify_mfa_email_code(v_issued->>'code');
  ASSERT (v_result->>'ok')::BOOLEAN, 'a voluntary email choice verifies';
  ASSERT (SELECT mfa_method FROM profiles WHERE id = v_elder) = 'email', 'the elder now uses email';
  ASSERT NOT (SELECT requires_mfa_enrollment FROM profiles WHERE id = v_elder), 'and still owes nothing';

  -- A voluntary account may switch it off itself, from a proven session only.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_elder, 'session_id', '00000000-0000-4000-8000-00000000150f')::text, TRUE);
  v_result := disable_my_mfa_email();
  ASSERT v_result->>'reason' = 'step_up_required', 'an unproven session cannot switch it off, got ' || v_result::text;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_elder, 'session_id', v_sess)::text, TRUE);
  v_result := disable_my_mfa_email();
  ASSERT (v_result->>'ok')::BOOLEAN, 'the proven session switches it off, got ' || v_result::text;
  ASSERT (SELECT mfa_method FROM profiles WHERE id = v_elder) IS NULL, 'the method is gone';

  -- …but a required account is refused.
  v_issued := issue_mfa_email_code(v_elder, v_sess);
  PERFORM verify_mfa_email_code(v_issued->>'code');
  UPDATE profiles SET mfa_grandfathered = FALSE WHERE id = v_elder;
  v_result := disable_my_mfa_email();
  ASSERT v_result->>'reason' = 'required', 'a required account cannot switch it off, got ' || v_result::text;
  UPDATE profiles SET mfa_grandfathered = TRUE WHERE id = v_elder;

  -- The reset helper strips it again.
  PERFORM clear_mfa_email_method(v_elder);
  ASSERT (SELECT mfa_method FROM profiles WHERE id = v_elder) IS NULL, 'clear_mfa_email_method nulls the method';
  ASSERT (SELECT count(*) FROM mfa_email_stepups WHERE user_id = v_elder) = 0, 'and removes the step-ups';
END $$;

ROLLBACK;
