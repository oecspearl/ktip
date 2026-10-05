-- ============================================================================
-- 159_mfa_email_code_reliability.sql — the email code stops tripping people up
-- ============================================================================
-- 150 shipped the email code as a second step. In use it kept "not working",
-- most of all for members whose code landed in spam, and three of the causes
-- are in the database:
--
-- 1. ASKING AGAIN KILLED THE CODE YOU HAD. issue_mfa_email_code() retired every
--    open code on the account, and the page asks for one every time it opens.
--    A member who reloaded, opened a second tab, or pressed "Send a new code"
--    while the first email sat in spam then typed whichever code they found
--    first — already dead — and got the same "not accepted" a typo gets.
--    Codes now live out their ten minutes. Any open code for the session
--    works, and spending one closes the rest.
--
-- 2. EVERY PAGE OPEN MAILED A CODE. mfa_email_open_code() lets the send route
--    answer "one is already on its way" instead of minting another, so a
--    reload no longer burns one of the five sends an hour, and the member is
--    not left holding two emails and guessing which one counts.
--
-- 3. EVERY SIGN-IN OWED A CODE. The step-up was bound to a GoTrue session and
--    every sign-in is a new session, which is not the cadence that was chosen
--    (a new device, or every thirty days). mfa_email_devices remembers the
--    browser that proved a code: verify_mfa_email_code() hands it a random
--    token, and a later session in that browser trades the token in through
--    redeem_mfa_email_device() for a step-up that ends when the thirty days
--    from the code do. Another browser still owes a code. The token is only a
--    hash here, it is bound to one account, and it stops working the moment
--    the account leaves the email method.
--
-- Idempotent — safe to re-run. Requires 150.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Remembered browsers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfa_email_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE mfa_email_devices IS
  'A browser that proved an email code, as the SHA-256 of a token only that browser holds. '
  'Lets a later sign-in there skip the code until thirty days from the code run out (159).';

CREATE INDEX IF NOT EXISTS idx_mfa_email_devices_user
  ON mfa_email_devices (user_id, expires_at);

ALTER TABLE mfa_email_devices ENABLE ROW LEVEL SECURITY;
-- No policies. Every read and write goes through SECURITY DEFINER below.

-- Core sha256(), not pgcrypto's digest(): one less extension dependency, and
-- the token is 256 random bits, so a fast hash is the right one.
CREATE OR REPLACE FUNCTION mfa_device_token_hash(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

REVOKE ALL ON FUNCTION mfa_device_token_hash(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION mfa_device_token_hash(TEXT) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Is a code already on its way? — service role only
-- ---------------------------------------------------------------------------
-- The send route asks this before minting. Two minutes of life left is the
-- floor: a code about to lapse is no use to someone still opening their mail.
CREATE OR REPLACE FUNCTION mfa_email_open_code(p_user UUID, p_session_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('sent_at', c.created_at, 'expires_at', c.expires_at)
  FROM mfa_email_codes c
  WHERE c.user_id = p_user
    AND c.session_id = p_session_id
    AND c.consumed_at IS NULL
    AND c.expires_at > now() + interval '2 minutes'
  ORDER BY c.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION mfa_email_open_code(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION mfa_email_open_code(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION mfa_email_open_code(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Issue a code — 150's body without the retirement
-- ---------------------------------------------------------------------------
-- Restated from 150. The only change is the UPDATE that retired every open
-- code: gone, for the reason in the header. The five-an-hour limit still caps
-- how many can be open at once, and each is still bound to one session.
CREATE OR REPLACE FUNCTION issue_mfa_email_code(p_user UUID, p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit JSONB;
  v_code TEXT;
  v_expires TIMESTAMPTZ := now() + interval '10 minutes';
BEGIN
  IF p_user IS NULL OR p_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  -- See 150's header: a mailbox is not allowed to stand in for an
  -- authenticator the member set up on purpose.
  IF EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p_user AND f.status = 'verified') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'totp_enrolled');
  END IF;

  v_limit := consume_auth_rate_limit('mfa-email-send:user:' || p_user::TEXT, 3600, 5);
  IF NOT (v_limit ->> 'allowed')::BOOLEAN THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'rate_limited',
                              'retry_after', v_limit -> 'retry_after');
  END IF;

  -- Six digits from the CSPRNG, not random(). 2^32 mod 10^6 leaves a bias of
  -- about one part in 4,000 — irrelevant against a ten-tries-an-hour limit.
  v_code := lpad(
    ((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::BIT(32)::BIGINT) % 1000000)::TEXT,
    6, '0'
  );

  INSERT INTO mfa_email_codes (user_id, session_id, code_hash, expires_at)
  VALUES (p_user, p_session_id, extensions.crypt(v_code, extensions.gen_salt('bf', 8)), v_expires);

  -- Opportunistic housekeeping, the 056 pattern in place of pg_cron.
  IF random() < 0.05 THEN
    DELETE FROM mfa_email_codes WHERE expires_at < now() - interval '1 day';
    DELETE FROM mfa_email_stepups WHERE expires_at < now() - interval '7 days';
    DELETE FROM mfa_email_devices WHERE expires_at < now() - interval '7 days';
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'code', v_code, 'expires_at', v_expires);
END;
$$;

REVOKE ALL ON FUNCTION issue_mfa_email_code(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION issue_mfa_email_code(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION issue_mfa_email_code(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Verify a code — any open one for the session, and remember the browser
-- ---------------------------------------------------------------------------
-- Restated from 150. Two changes: a match closes every other open code for the
-- session, and the result carries a device token for this browser to keep.
-- Every failure is still the one `invalid_code`.
--
-- Handing the token to the browser that holds the password is deliberate, and
-- unlike the code it is safe: the token proves "this browser already passed",
-- which is only worth anything in the browser that did.
CREATE OR REPLACE FUNCTION verify_mfa_email_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_session UUID := mfa_current_session_id();
  v_limit JSONB;
  v_digits TEXT;
  v_consumed UUID;
  v_expires TIMESTAMPTZ;
  v_method TEXT;
  v_device TEXT;
BEGIN
  IF v_actor IS NULL OR v_session IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
  END IF;

  v_limit := consume_auth_rate_limit('mfa-email-verify:user:' || v_actor::TEXT, 3600, 10);
  IF NOT (v_limit ->> 'allowed')::BOOLEAN THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'rate_limited',
                              'retry_after', v_limit -> 'retry_after');
  END IF;

  IF EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = v_actor AND f.status = 'verified') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'totp_enrolled');
  END IF;

  v_digits := regexp_replace(COALESCE(p_code, ''), '\D', '', 'g');
  IF length(v_digits) <> 6 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_code');
  END IF;

  UPDATE mfa_email_codes
  SET consumed_at = now()
  WHERE id = (
    SELECT c.id FROM mfa_email_codes c
    WHERE c.user_id = v_actor
      AND c.session_id = v_session
      AND c.consumed_at IS NULL
      AND c.expires_at > now()
      AND c.code_hash = extensions.crypt(v_digits, c.code_hash)
    LIMIT 1
  )
  RETURNING id INTO v_consumed;

  IF v_consumed IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_code');
  END IF;

  -- The session has proven itself; its other open codes have no job left.
  UPDATE mfa_email_codes SET consumed_at = now()
  WHERE user_id = v_actor AND session_id = v_session AND consumed_at IS NULL;

  v_expires := now() + interval '30 days';
  INSERT INTO mfa_email_stepups (user_id, session_id, verified_at, expires_at)
  VALUES (v_actor, v_session, now(), v_expires)
  ON CONFLICT (user_id, session_id)
  DO UPDATE SET verified_at = now(), expires_at = EXCLUDED.expires_at;

  v_device := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO mfa_email_devices (user_id, token_hash, expires_at)
  VALUES (v_actor, mfa_device_token_hash(v_device), v_expires);

  SELECT p.mfa_method INTO v_method FROM profiles p WHERE p.id = v_actor;

  -- The method is settled and the enrolment gate clears in the same statement,
  -- so the client does not need a second round-trip before ProtectedRoute lets
  -- it through. mfa_enrolled_at is the first successful email verification.
  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET mfa_method = 'email',
      requires_mfa_enrollment = FALSE,
      mfa_enrolled_at = COALESCE(mfa_enrolled_at, now()),
      updated_at = now()
  WHERE id = v_actor;
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  RETURN jsonb_build_object(
    'ok', TRUE,
    'expires_at', v_expires,
    -- The client signs every OTHER session out on a first-time choice, which is
    -- what GoTrue itself does when a factor is first verified.
    'first_time', v_method IS NULL,
    'device_token', v_device
  );
END;
$$;

GRANT EXECUTE ON FUNCTION verify_mfa_email_code(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Trade a remembered browser's token for a step-up on this session
-- ---------------------------------------------------------------------------
-- The step-up ends when the device's thirty days do, not thirty days from now,
-- so "every thirty days" still means every thirty days. Refused for an account
-- that has left the email method or holds an authenticator, the same two rules
-- issue and verify apply.
CREATE OR REPLACE FUNCTION redeem_mfa_email_device(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_session UUID := mfa_current_session_id();
  v_limit JSONB;
  v_device mfa_email_devices%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_session IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
  END IF;

  IF COALESCE(p_token, '') !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_token');
  END IF;

  v_limit := consume_auth_rate_limit('mfa-device-redeem:user:' || v_actor::TEXT, 3600, 20);
  IF NOT (v_limit ->> 'allowed')::BOOLEAN THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'rate_limited');
  END IF;

  IF COALESCE((SELECT mfa_method FROM profiles WHERE id = v_actor), '') <> 'email' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_email');
  END IF;

  IF EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = v_actor AND f.status = 'verified') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'totp_enrolled');
  END IF;

  SELECT * INTO v_device FROM mfa_email_devices d
  WHERE d.user_id = v_actor
    AND d.token_hash = mfa_device_token_hash(p_token)
    AND d.expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_token');
  END IF;

  UPDATE mfa_email_devices SET last_used_at = now() WHERE id = v_device.id;

  INSERT INTO mfa_email_stepups (user_id, session_id, verified_at, expires_at)
  VALUES (v_actor, v_session, now(), v_device.expires_at)
  ON CONFLICT (user_id, session_id)
  DO UPDATE SET expires_at = GREATEST(mfa_email_stepups.expires_at, EXCLUDED.expires_at);

  RETURN jsonb_build_object('ok', TRUE, 'expires_at', v_device.expires_at);
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_mfa_email_device(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Leaving the email method forgets every remembered browser
-- ---------------------------------------------------------------------------
-- A trigger rather than a line in each exit, because there are four exits —
-- disable_my_mfa_email(), clear_mfa_email_method(), and the sync functions
-- flipping the method to totp or NULL — and the next one added would forget.
-- Every one of them writes profiles.mfa_method.
CREATE OR REPLACE FUNCTION forget_mfa_email_devices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM mfa_email_devices WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forget_mfa_email_devices ON profiles;
CREATE TRIGGER trg_forget_mfa_email_devices
  AFTER UPDATE OF mfa_method ON profiles
  FOR EACH ROW
  WHEN (OLD.mfa_method = 'email' AND NEW.mfa_method IS DISTINCT FROM 'email')
  EXECUTE FUNCTION forget_mfa_email_devices();

-- ---------------------------------------------------------------------------
-- 7. Comments
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION mfa_email_open_code(UUID, UUID) IS
  'Service role only. The newest open code for a session with two minutes or more left, so the send route can say one is already on its way (159).';
COMMENT ON FUNCTION issue_mfa_email_code(UUID, UUID) IS
  'Service role only. Mints and hashes a six-digit code for one session and returns the plaintext for the mailer. Earlier codes stay valid until they expire (150, 159).';
COMMENT ON FUNCTION verify_mfa_email_code(TEXT) IS
  'Spends any open code for the caller''s session, records a thirty-day step-up, remembers the browser, and settles mfa_method on first use (150, 159).';
COMMENT ON FUNCTION redeem_mfa_email_device(TEXT) IS
  'Steps up a new session in a browser that already proved a code, until thirty days from that code (159).';

-- ============================================================================
-- Verification — supabase/tests/159_mfa_email_code_reliability_test.sql
-- ============================================================================

NOTIFY pgrst, 'reload schema';
