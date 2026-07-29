-- Migration 068: OECS Virtual Campus single sign-on
--
-- A learner on the OECS Virtual Campus (oecscampus.org / mypd.oecscampus.org)
-- presses "Go to KTIP" and arrives at
--
--   https://oecsinnovation.org/auth/vc/callback?vc_token=<jwt>
--
-- The JWT is ES256, signed by the key published at
-- https://oecscampus.org/api/auth/oidc/jwks (kid vc-oidc-1). Signature
-- verification happens in api/auth/vc/callback.ts — it is an edge concern, not
-- a database one. What lives here is everything that must not be expressible
-- from the client:
--
--   1. vc_identities      — which VC account maps to which KTIP account
--   2. vc_replay_guard    — a vc_token is single-use
--   3. vc_handoff_tickets — the Supabase session never travels in a URL
--   4. vc_provision_identity() — the only path that grants `student` from SSO
--
-- Why a bespoke provisioning function rather than the existing helpers:
--
--   * set_user_roles() checks has_permission(auth.uid(), 'role:manage'). The
--     service role has auth.uid() = NULL, so has_permission returns FALSE at
--     step 1 and the call would silently no-op. It cannot be reused here.
--   * review_institution_member() is the human-approval path and requires an
--     actor. SSO has no actor — the VC's signature IS the approval.
--
-- So this follows review_institution_member's *shape* (SECURITY DEFINER +
-- ktip.bypass_profile_guard) without its authorisation model, and it is granted
-- to service_role ONLY. An authenticated user must never be able to call it:
-- it would be a self-service `student` grant, and `student` carries the
-- safeguarding denials that the rest of the platform relies on.
--
-- Note on the student role: it is deliberately restrictive, not a privilege.
-- has_permission() hard-denies dm:initiate, grant:apply, grant:manage_funds,
-- moderation:action and moderation:escalate for anyone holding it, above the
-- matrix. Granting it to a verified minor arriving from a school LMS is the
-- correct and intended outcome.
--
-- Idempotent — safe to re-run. Requires 063 and 064.

-- ============================================================
-- 1. Identity link
-- ============================================================

CREATE TABLE IF NOT EXISTS vc_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Issuer is part of the key, not decoration: `sub` is only unique within an
  -- issuer, and a second OECS property could later mint tokens of its own.
  issuer TEXT NOT NULL,
  vc_sub TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email TEXT,
  -- The full verified claim set, kept verbatim. The VC's exact claim names are
  -- not contractually fixed, so the mapper in api/_lib/vc-oidc.ts reads through
  -- an alias table and this column is what lets that table be corrected from
  -- real traffic instead of guesswork. Never contains the raw JWT.
  raw_claims JSONB NOT NULL DEFAULT '{}'::jsonb,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issuer, vc_sub)
);

CREATE INDEX IF NOT EXISTS idx_vc_identities_user ON vc_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_vc_identities_email ON vc_identities(lower(email));

ALTER TABLE vc_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view own VC link" ON vc_identities;
CREATE POLICY "Owner can view own VC link"
  ON vc_identities FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy on purpose. Every write is service_role, from
-- the callback route. A user who could edit this row could point somebody
-- else's VC account at their own KTIP account.

-- ============================================================
-- 2. Replay guard
-- ============================================================

-- A handoff token is bearer credential in a URL: it lands in browser history,
-- and on a shared machine that is enough to sign in again. Single-use closes
-- that. Keyed on jti when the token carries one, otherwise on a hash of the
-- token itself (see api/_lib/vc-oidc.ts).
CREATE TABLE IF NOT EXISTS vc_replay_guard (
  jti TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_replay_expires ON vc_replay_guard(expires_at);

ALTER TABLE vc_replay_guard ENABLE ROW LEVEL SECURITY;
-- Zero policies: service_role only, same reasoning as auth_rate_limits (056).

-- Claims a jti. Returns TRUE on first use, FALSE if it has been seen.
-- The INSERT ... ON CONFLICT DO NOTHING is the whole mechanism: two concurrent
-- replays of the same token race on the primary key and exactly one wins.
CREATE OR REPLACE FUNCTION vc_claim_jti(p_jti TEXT, p_expires_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT;
BEGIN
  -- Opportunistic housekeeping; this project has no pg_cron.
  IF random() < 0.02 THEN
    DELETE FROM vc_replay_guard WHERE expires_at < now() - interval '1 day';
  END IF;

  INSERT INTO vc_replay_guard (jti, expires_at)
  VALUES (p_jti, p_expires_at)
  ON CONFLICT (jti) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$$;

REVOKE ALL ON FUNCTION vc_claim_jti(TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION vc_claim_jti(TEXT, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION vc_claim_jti(TEXT, TIMESTAMPTZ) TO service_role;

-- ============================================================
-- 3. Handoff tickets
-- ============================================================

-- The callback runs server-side and ends up holding a real Supabase session,
-- but supabase-js keeps its session in localStorage, so the browser has to
-- install it. Passing the tokens through the URL (query or fragment) would put
-- a live session in history. Instead the callback stores the pair here and
-- redirects with a short opaque ticket, which the SPA exchanges once over POST.
--
-- Only the SHA-256 of the ticket is stored, so a database leak does not hand
-- over usable sessions — same posture as auth_rate_limits' hashed buckets.
-- The same one-shot mechanism also carries the PKCE code_verifier for the
-- KTIP-initiated flow (api/auth/vc/start.ts), which is why user_id is nullable:
-- at the moment a sign-in *starts* there is no user yet. Both uses want exactly
-- the same properties — short-lived, hashed key, redeemable once — so they share
-- one table rather than duplicating the redemption logic.
CREATE TABLE IF NOT EXISTS vc_handoff_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_tickets_expires ON vc_handoff_tickets(expires_at);

ALTER TABLE vc_handoff_tickets ENABLE ROW LEVEL SECURITY;
-- Zero policies: service_role only.

-- Redeems a ticket. Single statement so the "mark consumed" and the "return
-- payload" cannot be separated by a concurrent second redemption — the UPDATE
-- takes the row lock, and the WHERE clause is what makes it one-shot.
CREATE OR REPLACE FUNCTION vc_claim_handoff_ticket(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  IF random() < 0.05 THEN
    DELETE FROM vc_handoff_tickets WHERE expires_at < now() - interval '1 hour';
  END IF;

  UPDATE vc_handoff_tickets
  SET consumed_at = now()
  WHERE token_hash = p_token_hash
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING payload INTO v_payload;

  IF v_payload IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION vc_claim_handoff_ticket(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION vc_claim_handoff_ticket(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION vc_claim_handoff_ticket(TEXT) TO service_role;

-- ============================================================
-- 4. Email resolution across primary + verified alias
-- ============================================================

-- resolve_email_alias() (056) covers only the alias half and is shaped around
-- the password-login flow. SSO needs the plain question: "does any account own
-- this address?" — checking auth.users first, because a primary always beats an
-- alias (the same precedence primary_conflict encodes in 056).
--
-- service_role ONLY. Exposing this to authenticated would be an email
-- enumeration oracle over the whole user table.
CREATE OR REPLACE FUNCTION vc_resolve_user_by_email(p_email TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object('user_id', u.id, 'matched', 'primary')
      FROM auth.users u
      WHERE lower(u.email) = lower(p_email)
      LIMIT 1
    ),
    (
      -- Unverified aliases are ignored: an unverified alias is a claim, not a
      -- fact, and linking on one would let anyone attach an address they do not
      -- control and then have SSO hand them that account.
      SELECT jsonb_build_object('user_id', a.user_id, 'matched', 'alias')
      FROM user_email_aliases a
      WHERE lower(a.email) = lower(p_email)
        AND a.verified_at IS NOT NULL
      LIMIT 1
    ),
    jsonb_build_object('user_id', NULL, 'matched', 'none')
  );
$$;

REVOKE ALL ON FUNCTION vc_resolve_user_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION vc_resolve_user_by_email(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION vc_resolve_user_by_email(TEXT) TO service_role;

-- ============================================================
-- 5. The Virtual Campus as an institution
-- ============================================================

-- email_domains stays EMPTY, and that is deliberate. VC learners sign up with
-- whatever address they have — school, ministry, gmail — so there is no domain
-- that identifies them. Trust here comes from the ES256 signature on the
-- handoff token, not from the right-hand side of an email address. Leaving the
-- array empty also keeps request_student_verification() from matching this row
-- and handing out self-service student membership.
INSERT INTO institutions (slug, name, kind, country_code, website_url, contact_email, status, verified_at, verified_by, review_note)
SELECT
  'oecs-virtual-campus',
  'OECS Virtual Campus',
  'university',
  'LC',
  'https://oecscampus.org',
  NULL,
  -- The institutions_verified_has_evidence CHECK requires both verified_at and
  -- verified_by on a verified row. On a fresh database with no admin seeded yet
  -- there is nobody to name, so the row lands as 'pending' with instructions
  -- rather than failing the migration. An admin verifying it in
  -- /admin/institutions is all that is then needed.
  CASE WHEN a.admin_id IS NULL THEN 'pending' ELSE 'verified' END,
  CASE WHEN a.admin_id IS NULL THEN NULL ELSE now() END,
  a.admin_id,
  CASE WHEN a.admin_id IS NULL
    THEN 'Seeded by migration 068. No platform admin existed at migration time, so this row could not satisfy institutions_verified_has_evidence. Verify it before enabling Virtual Campus SSO — vc_provision_identity() will not grant the student role while it is pending.'
    ELSE 'Seeded and auto-verified by migration 068 (OECS Virtual Campus SSO).'
  END
-- Scalar subquery, so this always produces exactly one row to insert even when
-- no admin exists yet. A plain FROM over profiles would produce zero rows and
-- silently skip the seed on a fresh database.
FROM (
  SELECT (
    SELECT p.id
    FROM profiles p
    WHERE 'super_admin' = ANY(p.roles) OR 'oecs' = ANY(p.roles)
    ORDER BY p.created_at
    LIMIT 1
  ) AS admin_id
) a
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 6. SSO provisioning
-- ============================================================

-- Called by api/auth/vc/callback.ts once the token signature, issuer, audience,
-- expiry, replay status and email_verified flag have all passed. The auth user
-- already exists at this point — the edge function either resolved it via
-- vc_resolve_user_by_email or created it with the admin API — so this function
-- is purely about linking and role state.
--
-- Everything it does is idempotent: the same learner pressing the button twice
-- a minute apart must end up in exactly the state they were already in.
CREATE OR REPLACE FUNCTION vc_provision_identity(
  p_user UUID,
  p_issuer TEXT,
  p_vc_sub TEXT,
  p_email TEXT,
  p_claims JSONB DEFAULT '{}'::jsonb,
  p_birth_year INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution UUID;
  v_inst_status TEXT;
  v_existing UUID;
  v_granted BOOLEAN := FALSE;
BEGIN
  IF p_user IS NULL OR p_vc_sub IS NULL OR p_issuer IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'missing_arguments');
  END IF;

  -- A VC subject that already points somewhere else is a conflict, not an
  -- update. Silently repointing it would move a learner's identity onto
  -- whichever account the current token happened to resolve to.
  SELECT user_id INTO v_existing
  FROM vc_identities
  WHERE issuer = p_issuer AND vc_sub = p_vc_sub;

  IF v_existing IS NOT NULL AND v_existing <> p_user THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'subject_bound_elsewhere');
  END IF;

  INSERT INTO vc_identities (issuer, vc_sub, user_id, email, raw_claims)
  VALUES (p_issuer, p_vc_sub, p_user, lower(p_email), COALESCE(p_claims, '{}'::jsonb))
  ON CONFLICT (issuer, vc_sub) DO UPDATE
    SET email = EXCLUDED.email,
        raw_claims = EXCLUDED.raw_claims,
        last_seen_at = now();

  SELECT id, status INTO v_institution, v_inst_status
  FROM institutions
  WHERE slug = 'oecs-virtual-campus';

  -- An unverified institution grants nothing. This is the kill switch: an
  -- operator who suspects the VC integration can set the row back to 'pending'
  -- and new arrivals immediately stop receiving the student role, without a
  -- deploy.
  IF v_institution IS NOT NULL AND v_inst_status = 'verified' THEN
    INSERT INTO institution_members (institution_id, user_id, role, status, approved_at)
    VALUES (v_institution, p_user, 'student', 'approved', now())
    ON CONFLICT (institution_id, user_id) DO UPDATE
      SET status = 'approved',
          approved_at = COALESCE(institution_members.approved_at, now());

    INSERT INTO student_safeguarding (user_id, institution_id, birth_year)
    VALUES (p_user, v_institution, p_birth_year)
    ON CONFLICT (user_id) DO UPDATE
      SET institution_id = EXCLUDED.institution_id,
          -- Never overwrite a known birth year with NULL: a later token that
          -- omits the claim must not silently un-flag a minor.
          birth_year = COALESCE(EXCLUDED.birth_year, student_safeguarding.birth_year),
          updated_at = now();

    -- Additive, exactly like review_institution_member. A learner who is also
    -- an entrepreneur keeps that role; `student` is layered on top, and
    -- has_permission() treats the combination as a student regardless.
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET roles = CASE WHEN 'student' = ANY(roles) THEN roles ELSE array_append(roles, 'student') END,
        updated_at = now()
    WHERE id = p_user;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

    v_granted := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'institution_id', v_institution,
    'institution_status', v_inst_status,
    'student_granted', v_granted
  );
END;
$$;

REVOKE ALL ON FUNCTION vc_provision_identity(UUID, TEXT, TEXT, TEXT, JSONB, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION vc_provision_identity(UUID, TEXT, TEXT, TEXT, JSONB, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION vc_provision_identity(UUID, TEXT, TEXT, TEXT, JSONB, INT) TO service_role;

-- Read-side helper for /api/vc/sync: the caller proves who they are with their
-- own JWT, and this returns their VC link so the sync route knows which email
-- to ask MyPD about. Safe for authenticated because it is scoped to auth.uid().
CREATE OR REPLACE FUNCTION vc_my_identity()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'issuer', v.issuer,
    'vc_sub', v.vc_sub,
    'email', v.email,
    'linked_at', v.linked_at,
    'last_seen_at', v.last_seen_at
  )
  FROM vc_identities v
  WHERE v.user_id = auth.uid()
  ORDER BY v.last_seen_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION vc_my_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vc_my_identity() TO authenticated, service_role;
