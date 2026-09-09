-- ============================================================================
-- 150_mfa_email_code.sql — an email code as the alternative second step
-- ============================================================================
-- 118 made a TOTP authenticator the only way past /security/set-up for the roles
-- that demand a second factor. For a member with no smartphone, or one who will
-- not install an app, that page is a wall and "no app" means "no account".
--
-- This adds a second method: a six-digit code sent to the account's own email
-- address. It is NOT a GoTrue factor and never earns the aal2 claim — GoTrue
-- owns that, and 118's header explains why the application must not talk a
-- session past a factor. It is an application-level step-up:
--
--   * profiles.mfa_method records which method the account uses
--     ('totp' | 'email' | NULL). Derived, guarded, written only here.
--   * mfa_email_codes holds the bcrypt hash of the code in flight, ten minutes,
--     one active code per account, bound to the GoTrue session that asked.
--   * mfa_email_stepups records a successful verification for ONE SESSION,
--     thirty days. A new device is a new GoTrue session and owes a fresh code;
--     so does the same device once the thirty days are up.
--
-- WHY THE SESSION BRANCH LIVES IN account_mfa_satisfied(). 118:163-175 keeps
-- "does this ACCOUNT hold a factor" and "has this SESSION proven it" apart, and
-- lets GoTrue's aal claim do the session half. Email has no aal, so the session
-- half has to be enforced here or it is not enforced at all. The predicate is
-- session-bound only when the caller IS the account (auth.uid() = p_user); when
-- it is evaluated on someone's behalf — the sponsor trigger passing NEW.user_id,
-- an administrator — a chosen email method counts the way a verified factor
-- does, so those paths do not flap on a thirty-day clock TOTP never had.
--
-- WHY A TOTP ACCOUNT IS REFUSED THE EMAIL PATH. Password + mailbox must never be
-- enough to walk round an authenticator the member deliberately set up. Both
-- issue and verify refuse while a verified factor exists, and every sync
-- function flips mfa_method to 'totp' and deletes the email rows the moment a
-- factor is verified.
--
-- ALSO IN THIS MIGRATION, AND NOT OPTIONAL: 124 restated
-- guard_profile_privileged_columns() from 116's text and dropped 117's fence on
-- the copyright-strike columns and 118's fence on the MFA columns. Since 124 a
-- member could PATCH `requires_mfa_enrollment: false` and walk past the gate.
-- Section 9 restates the guard from 124's body with both fences back, plus the
-- new column.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The method column
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mfa_method TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_mfa_method_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_mfa_method_check CHECK (mfa_method IN ('totp', 'email'));
  END IF;
END $$;

COMMENT ON COLUMN profiles.mfa_method IS
  'Which second step this account uses: totp (an authenticator app), email (a '
  'code to the account address), or NULL for neither. Derived by the MFA sync '
  'functions and verify_mfa_email_code(); never a direct write (150).';

-- ---------------------------------------------------------------------------
-- 2. The code in flight
-- ---------------------------------------------------------------------------
-- Only the hash is stored. The plaintext exists in one RPC result, read by the
-- service role, and in one email.
CREATE TABLE IF NOT EXISTS mfa_email_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes',
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mfa_email_codes IS
  'Email second-step codes, bcrypt-hashed, ten minutes, bound to the GoTrue '
  'session that asked. One unconsumed code per account at a time (150).';

CREATE INDEX IF NOT EXISTS idx_mfa_email_codes_open
  ON mfa_email_codes (user_id, session_id) WHERE consumed_at IS NULL;

ALTER TABLE mfa_email_codes ENABLE ROW LEVEL SECURITY;
-- No policies. Every read and write goes through SECURITY DEFINER below; the
-- shape 056 uses for auth_rate_limits.

-- ---------------------------------------------------------------------------
-- 3. The proven session
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfa_email_stepups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, session_id)
);

COMMENT ON TABLE mfa_email_stepups IS
  'A GoTrue session that has proven an email code, and until when. Thirty days '
  'per session; a new device is a new session and owes a new code (150).';

CREATE INDEX IF NOT EXISTS idx_mfa_email_stepups_live
  ON mfa_email_stepups (user_id, expires_at);

ALTER TABLE mfa_email_stepups ENABLE ROW LEVEL SECURITY;
-- No policies. mfa_email_session_status() is the read path.

-- ---------------------------------------------------------------------------
-- 4. The session claim
-- ---------------------------------------------------------------------------
-- GoTrue writes `session_id` into every user access token and keeps it across
-- refreshes — a refresh rotates the token, not the session row — which is what
-- makes a thirty-day binding workable. Anon and service-role tokens carry none.
-- A NULL here fails closed everywhere it is compared.
CREATE OR REPLACE FUNCTION mfa_current_session_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN NULLIF(auth.jwt() ->> 'session_id', '')::UUID;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION mfa_current_session_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Account-level predicates
-- ---------------------------------------------------------------------------
-- "Has this account set up a second step at all" — the question the enrolment
-- gate asks. Deliberately separate from account_mfa_satisfied(): with the email
-- method the satisfied predicate is session-bound, and an email member on a
-- fresh session would otherwise be told they owe ENROLMENT and be sent to
-- /security/set-up instead of to /security/verify.
CREATE OR REPLACE FUNCTION account_mfa_enrolled(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = p_user AND f.status = 'verified'
    )
    OR COALESCE((SELECT p.mfa_method FROM profiles p WHERE p.id = p_user), '') = 'email';
$$;

GRANT EXECUTE ON FUNCTION account_mfa_enrolled(UUID) TO authenticated;

-- The authoritative write-path check, restated from 118 with the email branch.
-- See the header for why the session test sits here.
CREATE OR REPLACE FUNCTION account_mfa_satisfied(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT account_mfa_required(p_user)
      OR EXISTS (
        SELECT 1 FROM auth.mfa_factors f
        WHERE f.user_id = p_user AND f.status = 'verified'
      )
      OR (
        COALESCE((SELECT p.mfa_method FROM profiles p WHERE p.id = p_user), '') = 'email'
        AND (
          -- Evaluated on someone's behalf: the chosen method is enough, as a
          -- verified factor would be.
          auth.uid() IS DISTINCT FROM p_user
          -- The account itself: this session must have proven a code.
          OR EXISTS (
            SELECT 1 FROM mfa_email_stepups s
            WHERE s.user_id = p_user
              AND s.session_id = mfa_current_session_id()
              AND s.expires_at > now()
          )
        )
      );
$$;

GRANT EXECUTE ON FUNCTION account_mfa_satisfied(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Issue a code — service role only
-- ---------------------------------------------------------------------------
-- Returns the plaintext, which is why `authenticated` may not call it: the
-- browser holding the password must never be the thing that receives the code.
-- api/auth/mfa-email-send.ts authenticates the caller, reads the session id off
-- the token GoTrue just validated, calls this, and mails the result.
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

  -- See the header: a mailbox is not allowed to stand in for an authenticator
  -- the member set up on purpose.
  IF EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p_user AND f.status = 'verified') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'totp_enrolled');
  END IF;

  v_limit := consume_auth_rate_limit('mfa-email-send:user:' || p_user::TEXT, 3600, 5);
  IF NOT (v_limit ->> 'allowed')::BOOLEAN THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'rate_limited',
                              'retry_after', v_limit -> 'retry_after');
  END IF;

  -- One live code per account. Asking again retires the previous one, so a
  -- code that was mis-delivered cannot be tried alongside its replacement.
  UPDATE mfa_email_codes SET consumed_at = now()
  WHERE user_id = p_user AND consumed_at IS NULL;

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
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'code', v_code, 'expires_at', v_expires);
END;
$$;

REVOKE ALL ON FUNCTION issue_mfa_email_code(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION issue_mfa_email_code(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION issue_mfa_email_code(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Verify a code — the member's own session
-- ---------------------------------------------------------------------------
-- This is the brute-force surface. The limiter runs before any lookup, the
-- match is one atomic statement, and every failure is the same `invalid_code`:
-- wrong, expired, already used and wrong-session are indistinguishable, so the
-- response is not an oracle for which codes exist.
--
-- A successful first verification is also the moment the account CHOOSES the
-- email method. That needs no more than an aal1 session, and deliberately so:
-- TOTP enrolment has exactly the same exposure — whoever holds the password can
-- enrol their own authenticator — and the code went only to the account's own
-- confirmed address.
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

  v_expires := now() + interval '30 days';
  INSERT INTO mfa_email_stepups (user_id, session_id, verified_at, expires_at)
  VALUES (v_actor, v_session, now(), v_expires)
  ON CONFLICT (user_id, session_id)
  DO UPDATE SET verified_at = now(), expires_at = EXCLUDED.expires_at;

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
    'first_time', v_method IS NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION verify_mfa_email_code(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Session status — what the client gates on
-- ---------------------------------------------------------------------------
-- The email counterpart of getAuthenticatorAssuranceLevel(). Returns NULL for
-- a caller with no profile; the client treats NULL and any error as "nothing
-- owed" so a deploy ahead of this migration gates nobody.
CREATE OR REPLACE FUNCTION mfa_email_session_status()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'method', p.mfa_method,
    'required', account_mfa_required(p.id),
    'step_up_ok', EXISTS (
      SELECT 1 FROM mfa_email_stepups s
      WHERE s.user_id = p.id
        AND s.session_id = mfa_current_session_id()
        AND s.expires_at > now()
    ),
    'expires_at', (
      SELECT max(s.expires_at) FROM mfa_email_stepups s
      WHERE s.user_id = p.id
        AND s.session_id = mfa_current_session_id()
        AND s.expires_at > now()
    )
  )
  FROM profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION mfa_email_session_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. The sync functions, restated from 118 with the method derivation
-- ---------------------------------------------------------------------------
-- Shared derivation. A verified factor always wins: the method becomes 'totp'
-- and every email row for the account is removed, so an authenticator that was
-- set up later cannot be bypassed by a step-up that predates it. Without a
-- factor a stored 'email' stays; a stored 'totp' whose factor is gone (removed
-- from Settings, admin reset, recovery code) becomes NULL and the account owes
-- a choice again.
CREATE OR REPLACE FUNCTION derive_mfa_state(p_user UUID)
RETURNS TABLE (owes BOOLEAN, enrolled_at TIMESTAMPTZ, method TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_factor BOOLEAN;
  v_method TEXT;
  v_enrolled TIMESTAMPTZ;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p_user AND f.status = 'verified'
  ) INTO v_has_factor;

  SELECT p.mfa_method INTO v_method FROM profiles p WHERE p.id = p_user;

  IF v_has_factor THEN
    v_method := 'totp';
    DELETE FROM mfa_email_stepups WHERE user_id = p_user;
    DELETE FROM mfa_email_codes WHERE user_id = p_user;
    SELECT MIN(f.updated_at) INTO v_enrolled
    FROM auth.mfa_factors f
    WHERE f.user_id = p_user AND f.status = 'verified';
  ELSIF v_method = 'email' THEN
    SELECT MIN(s.verified_at) INTO v_enrolled FROM mfa_email_stepups s WHERE s.user_id = p_user;
  ELSE
    v_method := NULL;
    v_enrolled := NULL;
  END IF;

  -- COALESCE, or a NULL method turns the whole predicate NULL and the column
  -- write below refuses a NOT NULL boolean.
  owes := account_mfa_required(p_user) AND NOT (v_has_factor OR COALESCE(v_method, '') = 'email');
  enrolled_at := v_enrolled;
  method := v_method;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION derive_mfa_state(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION derive_mfa_state(UUID) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION ensure_my_mfa_status()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_state RECORD;
BEGIN
  IF v_actor IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_state FROM derive_mfa_state(v_actor);

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET requires_mfa_enrollment = v_state.owes,
      mfa_enrolled_at = v_state.enrolled_at,
      mfa_method = v_state.method,
      updated_at = now()
  WHERE id = v_actor
    AND (requires_mfa_enrollment IS DISTINCT FROM v_state.owes
         OR mfa_enrolled_at IS DISTINCT FROM v_state.enrolled_at
         OR mfa_method IS DISTINCT FROM v_state.method);
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  RETURN v_state.owes;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_my_mfa_status() TO authenticated;

CREATE OR REPLACE FUNCTION ensure_mfa_status(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_state RECORD;
BEGIN
  IF v_actor IS NULL OR NOT has_permission(v_actor, 'members:manage') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  SELECT * INTO v_state FROM derive_mfa_state(p_user);

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET requires_mfa_enrollment = v_state.owes,
      mfa_enrolled_at = v_state.enrolled_at,
      mfa_method = v_state.method,
      updated_at = now()
  WHERE id = p_user;
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  RETURN jsonb_build_object('ok', TRUE, 'requires_enrollment', v_state.owes,
                            'method', v_state.method);
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_mfa_status(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION sync_mfa_status(p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state RECORD;
BEGIN
  SELECT * INTO v_state FROM derive_mfa_state(p_user);

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET requires_mfa_enrollment = v_state.owes,
      mfa_enrolled_at = v_state.enrolled_at,
      mfa_method = v_state.method,
      updated_at = now()
  WHERE id = p_user;
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  RETURN v_state.owes;
END;
$$;

REVOKE ALL ON FUNCTION sync_mfa_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION sync_mfa_status(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_mfa_status(UUID) TO service_role;

-- The member's own off switch, for an account that CHOSE email rather than
-- owing it. Mirrors GoTrue's rule for unenrolling a factor — only a session
-- that has just proven the step may remove it — and refuses outright when a
-- role demands a second step, because removing it would only bounce the member
-- straight back to set-up.
CREATE OR REPLACE FUNCTION disable_my_mfa_email()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_session UUID := mfa_current_session_id();
BEGIN
  IF v_actor IS NULL OR v_session IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
  END IF;
  IF COALESCE((SELECT mfa_method FROM profiles WHERE id = v_actor), '') <> 'email' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_email');
  END IF;
  IF account_mfa_required(v_actor) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'required');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM mfa_email_stepups s
    WHERE s.user_id = v_actor AND s.session_id = v_session AND s.expires_at > now()
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'step_up_required');
  END IF;

  DELETE FROM mfa_email_stepups WHERE user_id = v_actor;
  DELETE FROM mfa_email_codes WHERE user_id = v_actor;
  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles SET mfa_method = NULL, mfa_enrolled_at = NULL, updated_at = now()
  WHERE id = v_actor;
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION disable_my_mfa_email() TO authenticated;

-- Service-role only: what the two reset endpoints call to strip the email
-- method along with the factors. Deleting the rows and nulling the column in
-- one place keeps "reset MFA" meaning reset.
CREATE OR REPLACE FUNCTION clear_mfa_email_method(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM mfa_email_stepups WHERE user_id = p_user;
  DELETE FROM mfa_email_codes WHERE user_id = p_user;
  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles SET mfa_method = NULL, updated_at = now()
  WHERE id = p_user AND mfa_method IS NOT NULL;
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION clear_mfa_email_method(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION clear_mfa_email_method(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION clear_mfa_email_method(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 10. The privileged-column guard — 124's body, with the missing fences back
-- ---------------------------------------------------------------------------
-- Restated in full from 124 (seat ceiling intact) plus 117's copyright-strike
-- fence and 118's MFA fence and role-change re-derive, both of which 124 lost
-- by restating 116's text. mfa_method joins the MFA fence. Order matters and is
-- 118's: the RAISE blocks reject a client-supplied delta first; the derive runs
-- after role validation on the server's own recomputation.
--
-- Derived columns are compared through JSONB, as 124 does, so the guard keeps
-- working on a database where one of them does not exist yet.
CREATE OR REPLACE FUNCTION guard_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_added TEXT[];
  v_illegal TEXT[];
  v_new JSONB := to_jsonb(NEW);
  v_old JSONB := to_jsonb(OLD);
BEGIN
  -- service_role has no JWT subject; trusted RPCs opt in explicitly.
  IF v_actor IS NULL OR current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  -- The Super Admin keeps the blanket exemption 063 gave the platform admin.
  IF is_super_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  -- An account holding one of the two SEATS (super_admin, admin) is the Super
  -- Admin's to change, whoever is asking. (124.)
  IF OLD.id <> v_actor
     AND holds_admin_seat(OLD.id)
     AND (NEW.roles IS DISTINCT FROM OLD.roles
          OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
          OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
          OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason
          OR NEW.is_verified IS DISTINCT FROM OLD.is_verified) THEN
    RAISE EXCEPTION 'administrator accounts can only be changed by a super admin';
  END IF;

  -- An Admin is a platform admin for every other purpose.
  IF is_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
      OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
      OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason)
     AND NOT has_permission(v_actor, 'moderation:escalate') THEN
    RAISE EXCEPTION 'suspension state can only be changed by a platform admin';
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     AND NOT has_permission(v_actor, 'verification:review') THEN
    RAISE EXCEPTION 'verification state can only be changed by a platform admin';
  END IF;

  -- Age state is derived from account_age. (091.)
  IF v_new ->> 'is_minor' IS DISTINCT FROM v_old ->> 'is_minor'
     OR v_new ->> 'requires_age_declaration' IS DISTINCT FROM v_old ->> 'requires_age_declaration'
     OR v_new ->> 'age_declared_at' IS DISTINCT FROM v_old ->> 'age_declared_at' THEN
    RAISE EXCEPTION 'age status is derived from the declared date of birth and cannot be set directly';
  END IF;

  -- Consent state is derived from user_consents. (115.)
  IF v_new ->> 'requires_consent' IS DISTINCT FROM v_old ->> 'requires_consent'
     OR v_new ->> 'consent_recorded_at' IS DISTINCT FROM v_old ->> 'consent_recorded_at' THEN
    RAISE EXCEPTION 'consent state is derived from recorded acceptances and cannot be set directly';
  END IF;

  -- Strikes are derived from actioned, unreversed notices. (117.)
  IF v_new ->> 'copyright_strikes' IS DISTINCT FROM v_old ->> 'copyright_strikes'
     OR v_new ->> 'copyright_strike_at' IS DISTINCT FROM v_old ->> 'copyright_strike_at' THEN
    RAISE EXCEPTION 'copyright strike state is derived from takedown notices and cannot be set directly';
  END IF;

  -- MFA state is derived from role_definitions.requires_mfa, auth.mfa_factors
  -- and the email step-ups. (118, 150.)
  IF v_new ->> 'requires_mfa_enrollment' IS DISTINCT FROM v_old ->> 'requires_mfa_enrollment'
     OR v_new ->> 'mfa_enrolled_at' IS DISTINCT FROM v_old ->> 'mfa_enrolled_at'
     OR v_new ->> 'mfa_grandfathered' IS DISTINCT FROM v_old ->> 'mfa_grandfathered'
     OR v_new ->> 'mfa_method' IS DISTINCT FROM v_old ->> 'mfa_method' THEN
    RAISE EXCEPTION 'mfa enrolment state is derived and cannot be set directly';
  END IF;

  -- Only newly ADDED roles are validated. Removing a role from yourself is
  -- always allowed, and existing rows are never re-checked.
  IF NEW.roles IS DISTINCT FROM OLD.roles THEN
    v_added := ARRAY(
      SELECT unnest(COALESCE(NEW.roles, ARRAY[]::TEXT[]))
      EXCEPT
      SELECT unnest(COALESCE(OLD.roles, ARRAY[]::TEXT[]))
    );

    SELECT ARRAY_AGG(slug) INTO v_illegal
    FROM unnest(v_added) AS slug
    WHERE NOT EXISTS (
      SELECT 1 FROM role_definitions rd
      WHERE rd.slug = slug AND rd.is_self_assignable
    );

    IF v_illegal IS NOT NULL AND array_length(v_illegal, 1) > 0 THEN
      RAISE EXCEPTION 'role(s) % require verification or an administrator', array_to_string(v_illegal, ', ');
    END IF;

    -- A member who adds `entrepreneur` to an account they already hold starts
    -- owing a second step from this update. Grandfathered accounts stay exempt.
    -- (118.)
    IF NOT COALESCE(NEW.mfa_grandfathered, FALSE) THEN
      NEW.requires_mfa_enrollment :=
        EXISTS (
          SELECT 1 FROM role_definitions rd
          WHERE rd.requires_mfa AND rd.slug = ANY(expand_roles(NEW.roles))
        )
        AND NOT EXISTS (
          SELECT 1 FROM auth.mfa_factors f
          WHERE f.user_id = NEW.id AND f.status = 'verified'
        )
        AND COALESCE(NEW.mfa_method, '') <> 'email';
    END IF;
  END IF;

  -- The active context must be a role the account actually holds.
  IF NEW.active_role IS NOT NULL AND NOT (NEW.active_role = ANY(COALESCE(NEW.roles, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION 'active_role % is not held by this account', NEW.active_role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_privileged_columns_trigger ON profiles;
CREATE TRIGGER guard_profile_privileged_columns_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- 11. The INSERT guard — 118's body plus the new column
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_profile_insert_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.roles := COALESCE(ARRAY(
    SELECT slug FROM unnest(COALESCE(NEW.roles, ARRAY[]::TEXT[])) AS slug
    WHERE EXISTS (
      SELECT 1 FROM role_definitions rd WHERE rd.slug = slug AND rd.is_self_assignable
    )
  ), ARRAY[]::TEXT[]);

  NEW.is_verified := FALSE;
  NEW.is_suspended := FALSE;

  NEW.is_minor := account_is_minor(NEW.id);
  NEW.requires_age_declaration := NOT EXISTS (SELECT 1 FROM account_age WHERE user_id = NEW.id);
  NEW.age_declared_at := (SELECT declared_at FROM account_age WHERE user_id = NEW.id);

  NEW.requires_consent := account_owes_consent(NEW.id);
  NEW.consent_recorded_at := (SELECT MAX(accepted_at) FROM user_consents WHERE user_id = NEW.id);

  NEW.mfa_grandfathered := FALSE;
  NEW.requires_mfa_enrollment :=
    EXISTS (
      SELECT 1 FROM role_definitions rd
      WHERE rd.requires_mfa AND rd.slug = ANY(expand_roles(NEW.roles))
    )
    AND NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = NEW.id AND f.status = 'verified'
    );
  NEW.mfa_enrolled_at := NULL;
  -- A hand-rolled INSERT cannot pre-declare a method it has not proven.
  NEW.mfa_method := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_insert_roles_trigger ON profiles;
CREATE TRIGGER guard_profile_insert_roles_trigger
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profile_insert_roles();

-- ---------------------------------------------------------------------------
-- 12. Comments
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION account_mfa_enrolled(UUID) IS
  'Has this account set up ANY second step — a verified factor or the email method. The enrolment gate''s question (150).';
COMMENT ON FUNCTION account_mfa_satisfied(UUID) IS
  'The write-path check. A verified factor, or the email method with a live step-up for the caller''s own session (150).';
COMMENT ON FUNCTION issue_mfa_email_code(UUID, UUID) IS
  'Service role only. Mints and hashes a six-digit code for one session and returns the plaintext for the mailer (150).';
COMMENT ON FUNCTION verify_mfa_email_code(TEXT) IS
  'Spends the code for the caller''s session, records a thirty-day step-up, and settles mfa_method on first use (150).';
COMMENT ON FUNCTION mfa_email_session_status() IS
  'The client gate for the email method: method, requirement, and whether this session has a live step-up (150).';
COMMENT ON FUNCTION clear_mfa_email_method(UUID) IS
  'Service role only. Strips the email method and its rows; the reset endpoints call it beside the factor deletes (150).';

-- ============================================================================
-- Verification
--
--   SELECT count(*) FILTER (WHERE mfa_method = 'email') AS email,
--          count(*) FILTER (WHERE mfa_method = 'totp')  AS totp,
--          count(*) FILTER (WHERE requires_mfa_enrollment) AS owing
--     FROM profiles;
--   -- email and totp both 0 straight after this migration (methods are derived
--   -- lazily by ensure_my_mfa_status on each member's next sign-in).
--
--   As a member: UPDATE profiles SET requires_mfa_enrollment = FALSE WHERE id = auth.uid();
--   -- must raise "mfa enrolment state is derived"
-- ============================================================================

NOTIFY pgrst, 'reload schema';
