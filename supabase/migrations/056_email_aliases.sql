-- ============================================================
-- Migration 056: Secondary email addresses (login aliases)
--
-- If a member's primary inbox is shut off — a work address after they leave a
-- job, a lapsed domain — their account becomes unreachable: no password reset
-- arrives, and changing the address needs a working session first. This adds
-- ONE verified backup address per account that can also sign in and recover.
--
-- Supabase Auth allows exactly one email per user for password login, so the
-- second address cannot live in auth.users. It lives here, and api/auth/*
-- resolves it to the primary under the service role BEFORE authenticating.
-- That resolution is an email-enumeration oracle — strictly worse than
-- get_user_id_by_email() in 054, because it also yields the primary address —
-- so resolve_email_alias() is granted to service_role ONLY. Never grant it to
-- anon or authenticated.
--
-- NOTE: an alias is an IDENTIFIER, not a CREDENTIAL. Both addresses resolve to
-- one auth.users row and therefore one password hash, so changing or resetting
-- the password already covers both. Do not add a "revoke aliases on password
-- change" rule — it would be meaningless.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- Aliases
-- ------------------------------------------------------------
-- TEXT, not CITEXT: the only extension this project installs is uuid-ossp, and
-- on Supabase citext lands in the `extensions` schema — its operators would not
-- resolve inside the SECURITY DEFINER functions below, which pin
-- `SET search_path = public`. Store lowercased and index on lower(email).

CREATE TABLE IF NOT EXISTS user_email_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE is what enforces "exactly one alias per account".
  -- FK to auth.users: api/delete-account.ts removes that row, so this cascades.
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  verification_token TEXT,
  token_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  send_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_email_aliases_lowercase CHECK (email = lower(email)),
  CONSTRAINT user_email_aliases_shape
    CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND length(email) <= 254),
  -- A verified alias holds no live token.
  CONSTRAINT user_email_aliases_token_state
    CHECK (verified_at IS NULL OR verification_token IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_email_aliases_email
  ON user_email_aliases (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_email_aliases_token
  ON user_email_aliases (verification_token) WHERE verification_token IS NOT NULL;

-- ------------------------------------------------------------
-- RLS — the owner reads and removes their own alias. Nothing else.
-- ------------------------------------------------------------

ALTER TABLE user_email_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view own alias" ON user_email_aliases;
CREATE POLICY "Owner can view own alias"
  ON user_email_aliases FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner can remove own alias" ON user_email_aliases;
CREATE POLICY "Owner can remove own alias"
  ON user_email_aliases FOR DELETE
  USING (auth.uid() = user_id);

-- No INSERT and no UPDATE policy: rows are minted and mutated only by
-- api/auth/* under the service role, mirroring email_invites (054).
--
-- RLS is column-blind, so the owner CAN read their own verification_token.
-- That only lets them verify their own alias, so the risk is nil — but the
-- client hook still selects an explicit column list so the token never enters
-- browser memory in normal operation.

-- ------------------------------------------------------------
-- Rate limiting
-- ------------------------------------------------------------
-- api/auth/login-alias.ts and reset-alias.ts are UNAUTHENTICATED, so the
-- per-caller limiter in api/invite/send.ts (which keys off caller.id) cannot
-- work. Edge functions are stateless, so the counter has to live here.
--
-- Worse: those routes reach GoTrue from Vercel's egress IPs, so GoTrue's own
-- per-IP limiter sees one shared client and offers no protection. This table
-- is the ONLY limiter on those routes.

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket TEXT PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated
  ON auth_rate_limits (updated_at);

ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;
-- Deliberately zero policies. With RLS on and no policy, anon and authenticated
-- see nothing at all; only the service role (which bypasses RLS) touches it.
-- Buckets store a SHA-256 of the email, never the address itself, so this table
-- can never become a harvestable list of probed addresses.

CREATE OR REPLACE FUNCTION consume_auth_rate_limit(
  p_bucket TEXT,
  p_window_seconds INT,
  p_limit INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r auth_rate_limits%ROWTYPE;
BEGIN
  -- ON CONFLICT DO UPDATE takes a row lock, so two concurrent edge invocations
  -- cannot both act on a stale count.
  INSERT INTO auth_rate_limits (bucket, attempts, window_start, updated_at)
  VALUES (p_bucket, 1, now(), now())
  ON CONFLICT (bucket) DO UPDATE SET
    attempts = CASE
      WHEN auth_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
      THEN 1
      ELSE auth_rate_limits.attempts + 1
    END,
    window_start = CASE
      WHEN auth_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
      THEN now()
      ELSE auth_rate_limits.window_start
    END,
    updated_at = now()
  RETURNING * INTO r;

  -- Opportunistic housekeeping; this project has no pg_cron.
  IF random() < 0.01 THEN
    DELETE FROM auth_rate_limits WHERE updated_at < now() - interval '2 days';
  END IF;

  RETURN jsonb_build_object(
    'allowed', r.attempts <= p_limit,
    'retry_after', GREATEST(0, ceil(extract(epoch FROM
      (r.window_start + make_interval(secs => p_window_seconds) - now()))))::int
  );
END;
$$;

REVOKE ALL ON FUNCTION consume_auth_rate_limit(TEXT, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_auth_rate_limit(TEXT, INT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_auth_rate_limit(TEXT, INT, INT) TO service_role;

-- ------------------------------------------------------------
-- Alias -> primary resolution
-- ------------------------------------------------------------
-- An email-enumeration oracle that also discloses the primary address.
-- service_role ONLY — see the header note.
--
-- `primary_conflict` is the authoritative guard for the one invariant a CHECK
-- cannot express: "an alias is never also somebody's auth.users email". It is
-- re-evaluated on EVERY login and reset, so a signup that lands on an existing
-- alias silently wins and the alias stops working, which is the right
-- precedence.

CREATE OR REPLACE FUNCTION resolve_email_alias(p_email TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'user_id', a.user_id,
    'verified', a.verified_at IS NOT NULL,
    'primary_email', u.email,
    'primary_conflict', EXISTS (
      SELECT 1 FROM auth.users c WHERE lower(c.email) = lower(p_email)
    )
  )
  FROM user_email_aliases a
  JOIN auth.users u ON u.id = a.user_id
  WHERE lower(a.email) = lower(p_email)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_email_alias(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_email_alias(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_email_alias(TEXT) TO service_role;

-- ------------------------------------------------------------
-- Token redemption
-- ------------------------------------------------------------
-- JSON envelope rather than raising, so the verify page can tell "expired"
-- apart from "already used" — same convention as redeem_email_invite (054).
--
-- Called only by api/auth/verify-alias.ts. Unlike redeem_email_invite it does
-- NOT bind to auth.jwt()->>'email': possession of the token already proves
-- control of the alias mailbox, and account ownership was proven by the Bearer
-- token back at add-alias. There is no signed-in caller to bind to, because the
-- link is usually opened on whatever device holds the mailbox.

CREATE OR REPLACE FUNCTION verify_email_alias(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a user_email_aliases%ROWTYPE;
BEGIN
  SELECT * INTO a FROM user_email_aliases WHERE verification_token = p_token;

  IF NOT FOUND THEN
    -- Also the "already used" case: a consumed token is nulled, not stored.
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF a.token_expires_at IS NULL OR a.token_expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  -- Re-check the cross-schema invariant at the moment the row becomes
  -- login-capable. Closes the check-to-insert race in add-alias: somebody may
  -- have signed up with this address during the 24h token window.
  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(a.email)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_taken');
  END IF;

  UPDATE user_email_aliases
     SET verified_at = now(),
         verification_token = NULL,
         token_expires_at = NULL,
         updated_at = now()
   WHERE id = a.id;

  RETURN jsonb_build_object('ok', true, 'email', a.email);
END;
$$;

REVOKE ALL ON FUNCTION verify_email_alias(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION verify_email_alias(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_email_alias(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
