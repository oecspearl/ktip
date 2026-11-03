-- ============================================================
-- Migration 176: organisations vouch for their people with a one-time code
--
-- 145 covers anybody with a work or school mailbox. It leaves out the people
-- who have none: staff at a small business on Gmail, field officers at an
-- NGO, students at a TVET centre without institutional mail. Today they can
-- only upload an identity document and wait for KTIP.
--
-- Their organisation already knows them. An admin of a VERIFIED institution or
-- business issues a single-use code, hands it over in person or by message,
-- and the member types it in. The organisation is vouching, and the record
-- says so: verified_via = 'org_code', the code row names the issuer, and the
-- log carries both.
--
-- SAFEGUARDS
--   - Only a verified organisation can issue, and only its admins:
--       institution  approved admin (any code) or educator (student codes only)
--       business     owner or admin (can_manage_employer), never a recruiter
--     plus KTIP reviewers (verification:review) for any verified organisation.
--   - The issuer must be verified, and cannot redeem their own code.
--   - Single use. 14 days by default, 30 at most. 25 unused per organisation,
--     50 issued per person per day.
--   - Stored as sha256 only. The plain code is returned once, to the issuer.
--   - About 60 random bits; redemption is capped at 10 tries an hour and every
--     failure reads the same (invalid_code).
--   - A code can attach student or faculty (institutions, through 145's
--     grant_institution_membership) or private_sector (businesses). Never an
--     admin, chamber or partner role: the CHECK enforces it.
--   - An optional intended_email locks the code to one person's confirmed
--     address (primary, or a proven email_proofs row).
--   - org_code is an affiliation track: it expires with the 175 term, and the
--     organisation can withdraw it when the person leaves.
--
-- Also adds get_my_verification_status(), which the Settings page reads.
--
-- Requires 174 and 175. Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The new track
-- ------------------------------------------------------------
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_verified_via_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_verified_via_check
  CHECK (verified_via IS NULL OR verified_via IN (
    'document', 'domain', 'institution', 'roster', 'admin', 'grandfathered', 'org_code'
  ));

COMMENT ON COLUMN profiles.verified_via IS
  'Why is_verified is TRUE: document (035 review), domain (trusted_email_domains), institution (institution approval), roster (institution listed the address), admin (flipped on the users page), grandfathered (142), org_code (176, a code issued by a verified organisation). NULL while unverified.';

-- ------------------------------------------------------------
-- 2. Codes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  employer_id UUID REFERENCES employers(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  label TEXT NOT NULL,
  intended_email TEXT,
  grants_role TEXT,
  issued_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT verification_codes_one_org
    CHECK (num_nonnulls(institution_id, employer_id) = 1),
  CONSTRAINT verification_codes_label_len
    CHECK (length(trim(both from label)) BETWEEN 1 AND 120),
  CONSTRAINT verification_codes_email_shape
    CHECK (intended_email IS NULL OR (intended_email = lower(intended_email)
           AND intended_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND length(intended_email) <= 254)),
  CONSTRAINT verification_codes_role_allowed
    CHECK (
      grants_role IS NULL
      OR (institution_id IS NOT NULL AND grants_role IN ('student', 'faculty'))
      OR (employer_id IS NOT NULL AND grants_role = 'private_sector')
    ),
  CONSTRAINT verification_codes_term
    CHECK (expires_at > issued_at AND expires_at <= issued_at + INTERVAL '30 days'),
  CONSTRAINT verification_codes_single_outcome
    CHECK (redeemed_at IS NULL OR revoked_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_institution
  ON verification_codes (institution_id, issued_at DESC) WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_verification_codes_employer
  ON verification_codes (employer_id, issued_at DESC) WHERE employer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_verification_codes_redeemed_by
  ON verification_codes (redeemed_by, redeemed_at DESC) WHERE redeemed_by IS NOT NULL;

COMMENT ON TABLE verification_codes IS
  'Single-use codes a verified organisation issues to vouch for one person (176). Hash only. Read and written through the RPCs below.';

ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;
-- No policies. Every read and write goes through SECURITY DEFINER below.

-- Crockford base32: no I, L, O or U, so a code read aloud survives.
CREATE OR REPLACE FUNCTION verification_code_alphabet()
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$ SELECT '0123456789ABCDEFGHJKMNPQRSTVWXYZ'::TEXT $$;

-- What the member typed, reduced to the 12 characters that were hashed.
-- Accepts lower case, spaces, dashes, the KTIP prefix, and the usual
-- misreadings (I and L for 1, O for 0). NULL when it cannot be a code.
CREATE OR REPLACE FUNCTION normalise_verification_code(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT := upper(regexp_replace(COALESCE(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
BEGIN
  -- A code body never contains I, so a leading KTIP is always the prefix
  -- (and a truncated "KTIP-XXXX-XXXX" is refused rather than misread).
  IF left(v, 4) = 'KTIP' THEN
    v := substr(v, 5);
  END IF;
  v := translate(v, 'ILO', '110');
  IF length(v) <> 12 OR v ~ '[^0-9A-HJKMNP-TV-Z]' THEN
    RETURN NULL;
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION verification_code_hash(p_body TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT encode(sha256(convert_to('ktip-verification-code:' || p_body, 'UTF8')), 'hex');
$$;

REVOKE ALL ON FUNCTION verification_code_hash(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION verification_code_hash(TEXT) FROM anon, authenticated;

-- Who may issue for (and manage the codes of) an organisation.
--   p_role NULL means "any code"; 'student' is the one an educator may issue.
--   p_any TRUE asks the weaker question "may this person see the list".
CREATE OR REPLACE FUNCTION can_issue_verification_codes(
  p_kind TEXT,
  p_org UUID,
  p_user UUID,
  p_role TEXT DEFAULT NULL,
  p_any BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL OR p_org IS NULL THEN
    RETURN FALSE;
  END IF;
  IF has_permission(p_user, 'verification:review') THEN
    RETURN TRUE;
  END IF;

  IF p_kind = 'institution' THEN
    RETURN EXISTS (
      SELECT 1 FROM institution_members im
      WHERE im.institution_id = p_org
        AND im.user_id = p_user
        AND im.status = 'approved'
        AND (
          im.role = 'admin'
          OR (im.role = 'educator' AND (p_any OR p_role = 'student'))
        )
    );
  ELSIF p_kind = 'employer' THEN
    RETURN can_manage_employer(p_org, p_user);
  END IF;
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION can_issue_verification_codes(TEXT, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC;

-- Name and standing of the organisation, or NULL when it is not verified.
CREATE OR REPLACE FUNCTION verified_org_name(p_kind TEXT, p_org UUID)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_kind
    WHEN 'institution' THEN (SELECT i.name FROM institutions i WHERE i.id = p_org AND i.status = 'verified')
    WHEN 'employer' THEN (SELECT COALESCE(e.trading_name, e.legal_name) FROM employers e WHERE e.id = p_org AND e.verification_status = 'verified')
  END;
$$;

REVOKE ALL ON FUNCTION verified_org_name(TEXT, UUID) FROM PUBLIC;

-- ------------------------------------------------------------
-- 3. Issue
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION issue_verification_code(
  p_org_kind TEXT,
  p_org_id UUID,
  p_label TEXT,
  p_intended_email TEXT DEFAULT NULL,
  p_grants_role TEXT DEFAULT NULL,
  p_valid_days INT DEFAULT 14
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_label TEXT := trim(both from COALESCE(p_label, ''));
  v_email TEXT := NULLIF(lower(trim(both from COALESCE(p_intended_email, ''))), '');
  v_role TEXT := NULLIF(trim(both from COALESCE(p_grants_role, '')), '');
  v_days INT := LEAST(GREATEST(COALESCE(p_valid_days, 14), 1), 30);
  v_org_name TEXT;
  v_open INT;
  v_limit JSONB;
  v_bytes BYTEA;
  v_body TEXT;
  v_id UUID;
  v_expires TIMESTAMPTZ := now() + make_interval(days => LEAST(GREATEST(COALESCE(p_valid_days, 14), 1), 30));
  v_alpha TEXT := verification_code_alphabet();
  i INT;
  attempt INT := 0;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;
  IF p_org_kind NOT IN ('institution', 'employer') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_org_kind');
  END IF;
  IF NOT is_verified_member(v_actor) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'issuer_unverified');
  END IF;

  v_org_name := verified_org_name(p_org_kind, p_org_id);
  IF v_org_name IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'org_unverified');
  END IF;

  IF v_role IS NOT NULL AND NOT (
    (p_org_kind = 'institution' AND v_role IN ('student', 'faculty'))
    OR (p_org_kind = 'employer' AND v_role = 'private_sector')
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'role_not_allowed');
  END IF;

  IF NOT can_issue_verification_codes(p_org_kind, p_org_id, v_actor, v_role) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF length(v_label) < 1 OR length(v_label) > 120 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'label_required');
  END IF;
  IF v_email IS NOT NULL AND (v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(v_email) > 254) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_email');
  END IF;

  SELECT count(*) INTO v_open
  FROM verification_codes c
  WHERE (CASE WHEN p_org_kind = 'institution' THEN c.institution_id ELSE c.employer_id END) = p_org_id
    AND c.redeemed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > now();
  IF v_open >= 25 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'too_many_open');
  END IF;

  v_limit := consume_auth_rate_limit('verification-code-issue:user:' || v_actor, 86400, 50);
  IF v_limit IS NOT NULL AND (v_limit->>'allowed')::BOOLEAN IS FALSE THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'rate_limited');
  END IF;

  LOOP
    attempt := attempt + 1;
    v_bytes := extensions.gen_random_bytes(12);
    v_body := '';
    FOR i IN 0..11 LOOP
      -- 256 is a multiple of 32, so the modulo is unbiased.
      v_body := v_body || substr(v_alpha, (get_byte(v_bytes, i) % 32) + 1, 1);
    END LOOP;

    BEGIN
      INSERT INTO verification_codes (
        institution_id, employer_id, code_hash, code_hint, label,
        intended_email, grants_role, issued_by, expires_at
      ) VALUES (
        CASE WHEN p_org_kind = 'institution' THEN p_org_id END,
        CASE WHEN p_org_kind = 'employer' THEN p_org_id END,
        verification_code_hash(v_body), right(v_body, 4), v_label,
        v_email, v_role, v_actor, v_expires
      )
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF attempt >= 3 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  INSERT INTO verification_events (user_id, event, via, actor_id, evidence)
  VALUES (v_actor, 'code_issued', 'org_code', v_actor, jsonb_build_object(
    'code_id', v_id, 'org_kind', p_org_kind, 'org_id', p_org_id, 'org_name', v_org_name,
    'code_label', v_label, 'grants_role', v_role, 'locked_to_email', v_email IS NOT NULL
  ));

  RETURN jsonb_build_object(
    'ok', TRUE,
    'id', v_id,
    'code', 'KTIP-' || substr(v_body, 1, 4) || '-' || substr(v_body, 5, 4) || '-' || substr(v_body, 9, 4),
    'expires_at', v_expires,
    'org_name', v_org_name,
    'valid_days', v_days
  );
END;
$$;

REVOKE ALL ON FUNCTION issue_verification_code(TEXT, UUID, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION issue_verification_code(TEXT, UUID, TEXT, TEXT, TEXT, INT) TO authenticated;

-- ------------------------------------------------------------
-- 4. Redeem
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION redeem_verification_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_limit JSONB;
  v_body TEXT := normalise_verification_code(p_code);
  v_confirmed TIMESTAMPTZ;
  v_primary TEXT;
  v_was BOOLEAN;
  v_via TEXT;
  v_hold TIMESTAMPTZ;
  c verification_codes%ROWTYPE;
  v_kind TEXT;
  v_org UUID;
  v_org_name TEXT;
  v_member UUID;
  v_evidence JSONB;
  v_new_via TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;

  v_limit := consume_auth_rate_limit('verification-code-redeem:user:' || v_actor, 3600, 10);
  IF v_limit IS NOT NULL AND (v_limit->>'allowed')::BOOLEAN IS FALSE THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'rate_limited');
  END IF;

  SELECT lower(u.email), u.email_confirmed_at INTO v_primary, v_confirmed
  FROM auth.users u WHERE u.id = v_actor;
  IF v_confirmed IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'email_unconfirmed');
  END IF;

  SELECT COALESCE(p.is_verified, FALSE), p.verified_via, p.verification_hold_at
    INTO v_was, v_via, v_hold
  FROM profiles p WHERE p.id = v_actor;
  IF v_hold IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'on_hold');
  END IF;

  IF v_body IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_code');
  END IF;

  SELECT * INTO c
  FROM verification_codes
  WHERE code_hash = verification_code_hash(v_body)
    AND redeemed_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_code');
  END IF;

  v_kind := CASE WHEN c.institution_id IS NOT NULL THEN 'institution' ELSE 'employer' END;
  v_org := COALESCE(c.institution_id, c.employer_id);
  v_org_name := verified_org_name(v_kind, v_org);

  -- Every one of these reads the same to the person typing: no oracle for
  -- "right code, wrong person".
  IF v_org_name IS NULL
     OR c.issued_by = v_actor
     OR (c.intended_email IS NOT NULL
         AND c.intended_email <> v_primary
         AND NOT EXISTS (
           SELECT 1 FROM email_proofs ep
           WHERE ep.user_id = v_actor AND ep.email = c.intended_email AND ep.verified_at IS NOT NULL
         )) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_code');
  END IF;

  UPDATE verification_codes
  SET redeemed_by = v_actor, redeemed_at = now()
  WHERE id = c.id;

  v_evidence := jsonb_build_object(
    'code_id', c.id, 'org_kind', v_kind, 'org_id', v_org, 'label', v_org_name,
    'issued_by', c.issued_by, 'code_label', c.label, 'grants_role', c.grants_role
  );
  PERFORM set_config('ktip.verification_evidence', v_evidence::TEXT, TRUE);

  -- Institution roles go through the same grant every other institution path
  -- uses, so membership, role and safeguarding stay consistent.
  IF v_kind = 'institution' AND c.grants_role IN ('student', 'faculty') THEN
    INSERT INTO institution_members (institution_id, user_id, role, status)
    VALUES (v_org, v_actor, CASE WHEN c.grants_role = 'student' THEN 'student' ELSE 'educator' END, 'pending')
    ON CONFLICT (institution_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          status = CASE WHEN institution_members.status = 'approved' THEN 'approved' ELSE 'pending' END
    RETURNING id INTO v_member;

    IF c.grants_role = 'student' THEN
      INSERT INTO student_safeguarding (user_id, institution_id, sponsor_user_id)
      VALUES (v_actor, v_org, c.issued_by)
      ON CONFLICT (user_id) DO UPDATE
        SET institution_id = EXCLUDED.institution_id,
            sponsor_user_id = COALESCE(student_safeguarding.sponsor_user_id, EXCLUDED.sponsor_user_id),
            updated_at = now();
    END IF;

    PERFORM grant_institution_membership(v_member, c.issued_by, 'org_code');
  END IF;

  -- Identity tracks stay as they are: a document or a reviewer outranks a
  -- code. Anything else becomes org_code with a fresh term.
  v_new_via := CASE
    WHEN v_was AND v_via IS NOT NULL AND NOT verification_track_expires(v_via) THEN v_via
    ELSE 'org_code'
  END;

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET is_verified = TRUE,
      verified_via = v_new_via,
      verified_at = COALESCE(verified_at, now()),
      verified_until = CASE WHEN v_new_via = 'org_code' THEN now() + verification_term() ELSE verified_until END,
      verification_reminded_at = NULL,
      roles = CASE
                WHEN c.grants_role = 'private_sector' AND NOT ('private_sector' = ANY(roles))
                THEN array_append(roles, 'private_sector')
                ELSE roles
              END,
      updated_at = now()
  WHERE id = v_actor;
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  INSERT INTO verification_events (user_id, event, via, actor_id, evidence)
  VALUES (v_actor, 'code_redeemed', 'org_code', v_actor, v_evidence);

  IF NOT (v_kind = 'institution' AND c.grants_role IN ('student', 'faculty')) THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      v_actor,
      'verification_result',
      CASE WHEN v_was THEN 'Verification renewed' ELSE 'Your account is verified' END,
      left(v_org_name || ' vouched for you with a verification code.', 1000),
      '/settings?tab=verification'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'outcome', CASE WHEN v_was THEN 'renewed' ELSE 'verified' END,
    'org_name', v_org_name,
    'granted_role', c.grants_role,
    'via', v_new_via
  );
END;
$$;

REVOKE ALL ON FUNCTION redeem_verification_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_verification_code(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 5. Revoke an unused code; withdraw a vouch when someone leaves
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION revoke_verification_code(p_code_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  c verification_codes%ROWTYPE;
  v_kind TEXT;
BEGIN
  SELECT * INTO c FROM verification_codes WHERE id = p_code_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;
  v_kind := CASE WHEN c.institution_id IS NOT NULL THEN 'institution' ELSE 'employer' END;

  IF NOT (c.issued_by = v_actor
          OR can_issue_verification_codes(v_kind, COALESCE(c.institution_id, c.employer_id), v_actor, NULL)) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;
  IF c.redeemed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'already_redeemed');
  END IF;
  IF c.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'outcome', 'already_revoked');
  END IF;

  UPDATE verification_codes SET revoked_at = now(), revoked_by = v_actor WHERE id = c.id;

  INSERT INTO verification_events (user_id, event, via, actor_id, evidence)
  VALUES (v_actor, 'code_revoked', 'org_code', v_actor, jsonb_build_object(
    'code_id', c.id, 'org_kind', v_kind, 'org_id', COALESCE(c.institution_id, c.employer_id),
    'code_label', c.label
  ));

  RETURN jsonb_build_object('ok', TRUE, 'outcome', 'revoked');
END;
$$;

REVOKE ALL ON FUNCTION revoke_verification_code(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revoke_verification_code(UUID) TO authenticated;

-- The organisation takes back what it gave, and nothing more: only a badge
-- that currently rests on this organisation's code. No hold — the person can
-- verify another way at once. Roles stay; a role removal is set_user_roles().
-- An institution membership the code created is marked rejected.
CREATE OR REPLACE FUNCTION withdraw_org_vouch(p_user UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_reason TEXT := trim(both from COALESCE(p_reason, ''));
  c verification_codes%ROWTYPE;
  v_kind TEXT;
  v_org UUID;
  v_org_name TEXT;
  v_via TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;
  IF length(v_reason) < 10 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'reason_required');
  END IF;

  SELECT * INTO c
  FROM verification_codes
  WHERE redeemed_by = p_user
  ORDER BY redeemed_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_vouched');
  END IF;

  v_kind := CASE WHEN c.institution_id IS NOT NULL THEN 'institution' ELSE 'employer' END;
  v_org := COALESCE(c.institution_id, c.employer_id);

  IF NOT can_issue_verification_codes(v_kind, v_org, v_actor, NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  SELECT verified_via INTO v_via FROM profiles WHERE id = p_user;
  IF v_via IS DISTINCT FROM 'org_code' THEN
    -- They have since verified some other way; that is not ours to remove.
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_vouched');
  END IF;

  SELECT COALESCE(
    (SELECT i.name FROM institutions i WHERE i.id = c.institution_id),
    (SELECT COALESCE(e.trading_name, e.legal_name) FROM employers e WHERE e.id = c.employer_id)
  ) INTO v_org_name;

  PERFORM set_config('ktip.verification_event', 'code_withdrawn', TRUE);
  PERFORM set_config('ktip.verification_reason', left(v_reason, 1000), TRUE);
  PERFORM set_config('ktip.verification_evidence', jsonb_build_object(
    'code_id', c.id, 'org_kind', v_kind, 'org_id', v_org, 'label', v_org_name)::TEXT, TRUE);
  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET is_verified = FALSE,
      verified_via = NULL,
      verified_at = NULL,
      updated_at = now()
  WHERE id = p_user;
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);
  PERFORM set_config('ktip.verification_event', '', TRUE);
  PERFORM set_config('ktip.verification_reason', '', TRUE);

  IF v_kind = 'institution' AND c.grants_role IN ('student', 'faculty') THEN
    UPDATE institution_members
    SET status = 'rejected', approved_by = v_actor, approved_at = NULL
    WHERE institution_id = v_org AND user_id = p_user;
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    p_user,
    'verification_result',
    'Your verification was withdrawn',
    left(COALESCE(v_org_name, 'Your organisation') || ' no longer vouches for your account. Reason: ' || v_reason
         || ' You can verify another way from Settings, Verification.', 1000),
    '/settings?tab=verification'
  );

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION withdraw_org_vouch(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION withdraw_org_vouch(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 6. Reads
-- ------------------------------------------------------------
-- The organisations this caller can issue codes for. Drives the panel.
CREATE OR REPLACE FUNCTION get_my_code_issuing_orgs()
RETURNS TABLE (
  org_kind TEXT,
  org_id UUID,
  org_name TEXT,
  allowed_roles TEXT[]
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'institution'::TEXT, i.id, i.name,
         CASE WHEN bool_or(im.role = 'admin')
              THEN ARRAY['student', 'faculty']::TEXT[]
              ELSE ARRAY['student']::TEXT[] END
  FROM institution_members im
  JOIN institutions i ON i.id = im.institution_id
  WHERE im.user_id = auth.uid()
    AND im.status = 'approved'
    AND im.role IN ('admin', 'educator')
    AND i.status = 'verified'
  GROUP BY i.id, i.name
  UNION ALL
  SELECT 'employer'::TEXT, e.id, COALESCE(e.trading_name, e.legal_name), ARRAY['private_sector']::TEXT[]
  FROM employers e
  WHERE e.verification_status = 'verified'
    AND (
      e.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM employer_members m
        WHERE m.employer_id = e.id AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')
      )
    )
  ORDER BY 3;
$$;

REVOKE ALL ON FUNCTION get_my_code_issuing_orgs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_code_issuing_orgs() TO authenticated;

-- One organisation's codes, hint only. member_verified says whether the
-- redeemer's badge still rests on this code (the Withdraw button).
CREATE OR REPLACE FUNCTION list_org_verification_codes(p_org_kind TEXT, p_org_id UUID)
RETURNS TABLE (
  id UUID,
  code_hint TEXT,
  label TEXT,
  intended_email TEXT,
  grants_role TEXT,
  issued_by_name TEXT,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT,
  redeemed_by UUID,
  redeemed_by_name TEXT,
  redeemed_at TIMESTAMPTZ,
  member_verified BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_issue_verification_codes(p_org_kind, p_org_id, auth.uid(), NULL, TRUE) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.id, c.code_hint, c.label, c.intended_email, c.grants_role,
         ip.display_name, c.issued_at, c.expires_at,
         CASE
           WHEN c.redeemed_at IS NOT NULL THEN 'redeemed'
           WHEN c.revoked_at IS NOT NULL THEN 'revoked'
           WHEN c.expires_at <= now() THEN 'expired'
           ELSE 'unused'
         END,
         c.redeemed_by, rp.display_name, c.redeemed_at,
         (c.redeemed_by IS NOT NULL
          AND rp.verified_via = 'org_code'
          AND COALESCE(rp.is_verified, FALSE)
          AND c.id = (SELECT c2.id FROM verification_codes c2
                      WHERE c2.redeemed_by = c.redeemed_by
                      ORDER BY c2.redeemed_at DESC LIMIT 1))
  FROM verification_codes c
  LEFT JOIN profiles ip ON ip.id = c.issued_by
  LEFT JOIN profiles rp ON rp.id = c.redeemed_by
  WHERE (CASE WHEN p_org_kind = 'institution' THEN c.institution_id ELSE c.employer_id END) = p_org_id
  ORDER BY c.issued_at DESC
  LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION list_org_verification_codes(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_org_verification_codes(TEXT, UUID) TO authenticated;

-- Every code on the platform, for the admin Codes tab.
CREATE OR REPLACE FUNCTION list_all_verification_codes(p_status TEXT DEFAULT NULL, p_limit INT DEFAULT 200)
RETURNS TABLE (
  id UUID,
  org_kind TEXT,
  org_id UUID,
  org_name TEXT,
  code_hint TEXT,
  label TEXT,
  grants_role TEXT,
  issued_by_name TEXT,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT,
  redeemed_by_name TEXT,
  redeemed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'verification:review') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM (
    SELECT c.id AS code_id,
           CASE WHEN c.institution_id IS NOT NULL THEN 'institution' ELSE 'employer' END AS kind,
           COALESCE(c.institution_id, c.employer_id) AS org,
           COALESCE(i.name, e.trading_name, e.legal_name) AS org_label,
           c.code_hint AS hint, c.label AS code_label, c.grants_role AS role,
           ip.display_name AS issuer_name, c.issued_at AS issued, c.expires_at AS expires,
           CASE
             WHEN c.redeemed_at IS NOT NULL THEN 'redeemed'
             WHEN c.revoked_at IS NOT NULL THEN 'revoked'
             WHEN c.expires_at <= now() THEN 'expired'
             ELSE 'unused'
           END AS code_status,
           rp.display_name AS redeemer_name, c.redeemed_at AS redeemed
    FROM verification_codes c
    LEFT JOIN institutions i ON i.id = c.institution_id
    LEFT JOIN employers e ON e.id = c.employer_id
    LEFT JOIN profiles ip ON ip.id = c.issued_by
    LEFT JOIN profiles rp ON rp.id = c.redeemed_by
  ) x
  WHERE p_status IS NULL OR x.code_status = p_status
  ORDER BY x.issued DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$$;

REVOKE ALL ON FUNCTION list_all_verification_codes(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_all_verification_codes(TEXT, INT) TO authenticated;

-- What the member's Settings page shows: the track, the term, and how to
-- renew. label and renew_email come from the latest grant in the log.
CREATE OR REPLACE FUNCTION get_my_verification_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user UUID := auth.uid();
  p RECORD;
  v_evidence JSONB;
  v_primary TEXT;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;

  SELECT COALESCE(pr.is_verified, FALSE) AS verified, pr.verified_via, pr.verified_at,
         pr.verified_until, pr.verification_hold_at, pr.verification_lapsed_at
    INTO p
  FROM profiles pr WHERE pr.id = v_user;

  SELECT lower(u.email) INTO v_primary FROM auth.users u WHERE u.id = v_user;

  SELECT e.evidence INTO v_evidence
  FROM verification_events e
  WHERE e.user_id = v_user
    AND e.event IN ('granted', 'renewed', 'track_changed', 'code_redeemed', 'expired')
    AND (e.evidence ? 'label' OR e.evidence ? 'email')
  ORDER BY e.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'verified', p.verified,
    'via', p.verified_via,
    'verified_at', p.verified_at,
    'verified_until', p.verified_until,
    'on_hold', p.verification_hold_at IS NOT NULL,
    'lapsed', p.verification_lapsed_at IS NOT NULL AND NOT p.verified,
    'label', v_evidence->>'label',
    'renew_email', CASE
      WHEN p.verified_via IN ('domain', 'roster', 'institution')
        OR (p.verification_lapsed_at IS NOT NULL AND v_evidence ? 'email')
      THEN COALESCE(v_evidence->>'email', v_primary)
    END,
    'renew_method', CASE
      WHEN p.verified_via IN ('domain', 'roster', 'institution') THEN 'email'
      WHEN p.verified_via = 'org_code' THEN 'code'
      WHEN p.verification_lapsed_at IS NOT NULL AND v_evidence ? 'email' THEN 'email'
      WHEN p.verification_lapsed_at IS NOT NULL THEN 'code'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION get_my_verification_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_verification_status() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verification
--
--   -- as the owner of a verified business:
--   SELECT * FROM get_my_code_issuing_orgs();          -- the business, {private_sector}
--   SELECT issue_verification_code('employer', '<employer>', 'Field officer, Roseau');
--     -- {"ok":true,"code":"KTIP-XXXX-XXXX-XXXX",...}
--   SELECT issue_verification_code('employer', '<employer>', 'x', NULL, 'admin');
--     -- role_not_allowed
--
--   -- as a second, unverified account:
--   SELECT redeem_verification_code('ktip xxxx xxxx xxxx');   -- ok:true, outcome verified
--   SELECT verified_via, verified_until > now() + interval '11 months'
--   FROM profiles WHERE id = auth.uid();                    -- org_code, t
--   SELECT redeem_verification_code('<same code>');          -- invalid_code
--
--   -- the issuer cannot vouch for themselves
--   -- (issue, then redeem as the issuer)                     -- invalid_code
--
--   -- withdrawal leaves no hold
--   SELECT withdraw_org_vouch('<redeemer>', 'Left the company in November');  -- ok:true
--   SELECT is_verified, verification_hold_at FROM profiles WHERE id = '<redeemer>';  -- f, NULL
--
--   -- a recruiter cannot issue
--   -- (as an employer_members row with role recruiter)       -- forbidden
-- ============================================================
