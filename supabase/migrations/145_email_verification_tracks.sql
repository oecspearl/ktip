-- ============================================================
-- Migration 145: verification by email domain
--
-- 139 made is_verified gate publishing and applying. 142 grandfathered the
-- pilot cohort. What was left for everyone who signs up from now on is one
-- path: upload an identity document and wait for a human at
-- /admin/verification — a queue nobody is told about.
--
-- Most of the people this platform is for can prove who they are with the
-- email address they already have. Somebody at @oecs.int or a ministry is
-- vouched for by whoever runs that mail domain; a student at a partner college
-- is vouched for by the college. This migration turns that into three tracks,
-- ranked by the strength of the evidence:
--
--   roster       the institution listed this exact address       -> approved
--   domain       the address is at an admin-trusted domain        -> verified
--   institution  the address is at a verified institution domain  -> student,
--                approved on the spot if the institution opted in, otherwise
--                queued for an educator exactly as 064 does today
--   (anything else falls through to the 035 document upload)
--
-- ONE DECISION FUNCTION. apply_verified_email() is the only place the three
-- tracks are evaluated. It is reached from: the auth.users confirmation trigger
-- (primary address, zero clicks), claim_email_verification() (the client's
-- once-per-session safety net), and confirm_email_proof() (a mailed token for
-- a work or school address that is not the sign-in address). Every caller
-- hands it an address that has ALREADY been proven — that is the contract, and
-- it is why the function is never granted to authenticated.
--
-- WHAT COUNTS AS PROVEN. The primary address once auth.users.email_confirmed_at
-- is set; any other address once its email_proofs token has been consumed by a
-- POST from the confirmation page (never a GET — link scanners prefetch).
--
-- PROOFS ARE NOT ALIASES. 056's user_email_aliases can sign in. A school
-- address is reissued to somebody else when the student leaves, so it must
-- never become a credential for the account it once verified. email_proofs
-- has the same token machinery and none of the login capability.
--
-- PROVENANCE. 142 said it plainly: a grandfathered account is indistinguishable
-- from a reviewed one, and a column added later cannot recover which was which.
-- This is that column, added before the third and fourth ways of earning the
-- flag arrive. The backfill can still tell the two 142 populations apart
-- because an approved verification_requests row is the document track's
-- receipt.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Provenance: how did this account come to be verified?
-- ------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_via TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_verified_via_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_verified_via_check
  CHECK (verified_via IS NULL OR verified_via IN (
    'document', 'domain', 'institution', 'roster', 'admin', 'grandfathered'
  ));

COMMENT ON COLUMN profiles.verified_via IS
  'Why is_verified is TRUE: document (035 review), domain (trusted_email_domains), institution (institution approval), roster (institution listed the address), admin (flipped on the users page), grandfathered (142). NULL while unverified.';

-- Backfill. An approved request is the document track's receipt; everything
-- else that reads TRUE today was 142.
UPDATE profiles p
SET verified_via = 'document',
    verified_at = COALESCE(vr.reviewed_at, p.created_at)
FROM (
  SELECT DISTINCT ON (user_id) user_id, reviewed_at
  FROM verification_requests
  WHERE status = 'approved'
  ORDER BY user_id, reviewed_at DESC NULLS LAST
) vr
WHERE p.id = vr.user_id
  AND COALESCE(p.is_verified, FALSE)
  AND p.verified_via IS NULL;

UPDATE profiles
SET verified_via = 'grandfathered',
    verified_at = created_at
WHERE COALESCE(is_verified, FALSE)
  AND verified_via IS NULL;

-- The two columns follow the flag. guard_profile_privileged_columns (last
-- restated in 143) already refuses a self-service change to is_verified; this
-- sibling trigger extends the same rule to the provenance without restating a
-- function another migration owns.
CREATE OR REPLACE FUNCTION guard_verification_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  -- The cheap test first: this trigger fires on every profile UPDATE, and
  -- almost none of them touch these two columns.
  IF NEW.verified_via IS NOT DISTINCT FROM OLD.verified_via
     AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NULL OR current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT has_permission(v_actor, 'verification:review') THEN
    RAISE EXCEPTION 'verification provenance can only be changed by a reviewer';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_verification_provenance_trigger ON profiles;
CREATE TRIGGER guard_verification_provenance_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_verification_provenance();

-- Whoever flips the flag from now on says why. Anonymisation clears it.
CREATE OR REPLACE FUNCTION anonymise_account(p_user UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles SET
    display_name = 'Former member',
    username = NULL,
    bio = NULL,
    avatar_url = NULL,
    banner = NULL,
    phone = NULL,
    website = NULL,
    organization = NULL,
    industry = NULL,
    country = NULL,
    skills = ARRAY[]::TEXT[],
    interests = ARRAY[]::TEXT[],
    open_to = ARRAY[]::TEXT[],
    languages = ARRAY[]::TEXT[],
    is_verified = FALSE,
    verified_via = NULL,
    verified_at = NULL,
    account_status = 'deactivated',
    purge_after = NULL,
    status_changed_at = now()
  WHERE id = p_user;
$$;

-- ------------------------------------------------------------
-- 2. Trusted domains
-- ------------------------------------------------------------
-- An address at one of these is proof by itself. The list is small and
-- deliberate: OECS, member-state ministries, agencies. Never a free-mail
-- provider — the CHECK below makes that a database rule rather than a habit.
CREATE TABLE IF NOT EXISTS trusted_email_domains (
  domain TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  grants_role TEXT REFERENCES role_definitions(slug) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trusted_email_domains_shape
    CHECK (domain = lower(domain) AND domain ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'),
  CONSTRAINT trusted_email_domains_not_freemail
    CHECK (domain NOT IN (
      'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com',
      'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
      'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net',
      'mail.com', 'zoho.com', 'yandex.com', 'fastmail.com', 'hey.com'
    ))
);

COMMENT ON TABLE trusted_email_domains IS
  'Email domains whose confirmed addresses verify an account on their own. Exact, lowercase match; no subdomain inference.';

-- Only a non-admin, non-alias, non-institution role may ride on a domain.
-- Admin seats are set_user_roles() business. student / faculty / the two
-- institution-admin roles are granted by the institution path, where the
-- safeguarding record and the roster live — a trusted domain must not be a
-- way to hold 'student' with no institution behind it.
CREATE OR REPLACE FUNCTION guard_trusted_domain_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.grants_role IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM role_definitions rd
    WHERE rd.slug = NEW.grants_role
      AND rd.tier <> 'admin'
      AND rd.alias_of IS NULL
      AND rd.slug NOT IN ('student', 'faculty', 'chamber_admin', 'educational_partner')
  ) THEN
    RAISE EXCEPTION 'role % cannot be granted by an email domain', NEW.grants_role
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_trusted_domain_role_trigger ON trusted_email_domains;
CREATE TRIGGER guard_trusted_domain_role_trigger
  BEFORE INSERT OR UPDATE ON trusted_email_domains
  FOR EACH ROW
  EXECUTE FUNCTION guard_trusted_domain_role();

ALTER TABLE trusted_email_domains ENABLE ROW LEVEL SECURITY;

-- Not public. Knowing which domains auto-verify helps nobody but somebody
-- shopping for one. The decision function is SECURITY DEFINER and reads past
-- this policy.
DROP POLICY IF EXISTS "Reviewers can read trusted domains" ON trusted_email_domains;
CREATE POLICY "Reviewers can read trusted domains"
  ON trusted_email_domains FOR SELECT
  USING (has_permission(auth.uid(), 'verification:review'));

-- No INSERT / UPDATE / DELETE policy: writes go through the RPC below, which
-- is where the role:manage check for a role-bearing domain lives.
CREATE OR REPLACE FUNCTION set_trusted_email_domain(
  p_domain TEXT,
  p_label TEXT,
  p_grants_role TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_domain TEXT := lower(trim(both from COALESCE(p_domain, '')));
BEGIN
  IF NOT has_permission(v_actor, 'verification:review') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;
  -- Attaching a role is handing out a role. Same key the users page needs.
  IF p_grants_role IS NOT NULL AND NOT has_permission(v_actor, 'role:manage') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'role_requires_role_manage');
  END IF;

  v_domain := regexp_replace(v_domain, '^@', '');
  IF v_domain = '' OR length(v_domain) > 253 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_domain');
  END IF;

  INSERT INTO trusted_email_domains (domain, label, grants_role, is_active, notes, created_by)
  VALUES (v_domain, trim(both from p_label), p_grants_role, COALESCE(p_is_active, TRUE), p_notes, v_actor)
  ON CONFLICT (domain) DO UPDATE
    SET label = EXCLUDED.label,
        grants_role = EXCLUDED.grants_role,
        is_active = EXCLUDED.is_active,
        notes = EXCLUDED.notes;

  RETURN jsonb_build_object('ok', TRUE, 'domain', v_domain);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_domain', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION set_trusted_email_domain(TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_trusted_email_domain(TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 3. Institutions: opt-in auto-approval, and a roster of vouched addresses
-- ------------------------------------------------------------
ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS auto_approve_students BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN institutions.auto_approve_students IS
  'When TRUE a confirmed address at one of this institution''s email_domains is approved as a student without an educator click.';

-- A roster row is the institution saying "this address is one of ours". It is
-- matched by exact address, which is what lets a school with no mail system of
-- its own vouch for students on personal addresses. Plain email rather than a
-- hash: pgcrypto is not installed here (056's note on citext applies to digest
-- too), and the readers are exactly the staff who already see these students.
CREATE TABLE IF NOT EXISTS institution_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'educator')),
  added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  CONSTRAINT institution_rosters_lowercase CHECK (email = lower(email)),
  CONSTRAINT institution_rosters_shape
    CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND length(email) <= 254),
  UNIQUE (institution_id, email)
);

CREATE INDEX IF NOT EXISTS idx_institution_rosters_email
  ON institution_rosters (email) WHERE claimed_by IS NULL;

ALTER TABLE institution_rosters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Institution staff can read the roster" ON institution_rosters;
CREATE POLICY "Institution staff can read the roster"
  ON institution_rosters FOR SELECT
  USING (
    is_institution_admin(institution_id, auth.uid())
    OR has_permission(auth.uid(), 'institution:verify')
  );

DROP POLICY IF EXISTS "Institution staff can prune the roster" ON institution_rosters;
CREATE POLICY "Institution staff can prune the roster"
  ON institution_rosters FOR DELETE
  USING (
    is_institution_admin(institution_id, auth.uid())
    OR has_permission(auth.uid(), 'institution:verify')
  );

-- Inserts go through the RPC so the addresses are normalised once, in one place.
CREATE OR REPLACE FUNCTION upsert_institution_roster(
  p_institution UUID,
  p_emails TEXT[],
  p_role TEXT DEFAULT 'student'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_status TEXT;
  v_kind TEXT;
  v_email TEXT;
  v_added INT := 0;
  v_skipped INT := 0;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;
  IF NOT (is_institution_admin(p_institution, v_actor) OR has_permission(v_actor, 'institution:verify')) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;
  IF p_role NOT IN ('student', 'educator') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_role');
  END IF;

  SELECT status, kind INTO v_status, v_kind FROM institutions WHERE id = p_institution;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;
  IF v_status <> 'verified' OR v_kind = 'chamber' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'institution_not_verified');
  END IF;

  FOREACH v_email IN ARRAY COALESCE(p_emails, ARRAY[]::TEXT[]) LOOP
    v_email := lower(trim(both from v_email));
    IF v_email = '' OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(v_email) > 254 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    INSERT INTO institution_rosters (institution_id, email, role, added_by)
    VALUES (p_institution, v_email, p_role, v_actor)
    ON CONFLICT (institution_id, email) DO NOTHING;
    IF FOUND THEN
      v_added := v_added + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', TRUE, 'added', v_added, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION upsert_institution_roster(UUID, TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_institution_roster(UUID, TEXT[], TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 4. Proofs: "I control this work or school mailbox"
-- ------------------------------------------------------------
-- Modelled on user_email_aliases (056), minus the login capability.
CREATE TABLE IF NOT EXISTS email_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  verification_token TEXT,
  token_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  send_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_proofs_lowercase CHECK (email = lower(email)),
  CONSTRAINT email_proofs_shape
    CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND length(email) <= 254),
  CONSTRAINT email_proofs_token_state
    CHECK (verified_at IS NULL OR verification_token IS NULL),
  UNIQUE (user_id, email)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_email_proofs_token
  ON email_proofs (verification_token) WHERE verification_token IS NOT NULL;

ALTER TABLE email_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view own proofs" ON email_proofs;
CREATE POLICY "Owner can view own proofs"
  ON email_proofs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner can remove own proofs" ON email_proofs;
CREATE POLICY "Owner can remove own proofs"
  ON email_proofs FOR DELETE
  USING (auth.uid() = user_id);

-- No INSERT and no UPDATE policy: api/verification/* mints and confirms under
-- the service role. The client hook selects an explicit column list so the
-- token never enters browser memory in normal operation.

-- ------------------------------------------------------------
-- 5. Approving an institution membership, with or without a human
-- ------------------------------------------------------------
-- The approval half of review_institution_member() (064), extracted so the
-- automatic path and the educator path grant the same thing the same way.
-- p_actor is NULL when nobody clicked. Also sets the verified flag: an
-- institution vouching for one of its own is a verification.
--
-- Notifications are a direct INSERT rather than send_notification(): that
-- function needs auth.uid(), and two of the three callers here run with none
-- (the auth trigger and the service role).
CREATE OR REPLACE FUNCTION grant_institution_membership(
  p_member UUID,
  p_actor UUID,
  p_via TEXT DEFAULT 'institution'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
  v_role TEXT;
  v_kind TEXT;
  v_name TEXT;
  v_grant TEXT;
BEGIN
  SELECT im.user_id, im.role, i.kind, i.name
    INTO v_user, v_role, v_kind, v_name
  FROM institution_members im
  JOIN institutions i ON i.id = im.institution_id
  WHERE im.id = p_member;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  UPDATE institution_members
  SET status = 'approved',
      approved_by = p_actor,
      approved_at = now()
  WHERE id = p_member;

  v_grant := CASE
    WHEN v_kind = 'chamber' THEN 'chamber_admin'
    WHEN v_role = 'student' THEN 'student'
    WHEN v_role = 'admin' THEN 'educational_partner'
    ELSE 'faculty'
  END;

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET roles = CASE WHEN v_grant = ANY(roles) THEN roles ELSE array_append(roles, v_grant) END,
      is_verified = TRUE,
      verified_via = COALESCE(verified_via, p_via),
      verified_at = COALESCE(verified_at, now()),
      updated_at = now()
  WHERE id = v_user;
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    v_user,
    'institution_membership',
    'Institution membership approved',
    left(COALESCE(v_name, 'Your institution') || ' approved your account. It now holds the ' || v_grant || ' role and a verified badge.', 1000),
    '/settings?tab=verification'
  );

  RETURN jsonb_build_object('ok', TRUE, 'granted_role', v_grant);
END;
$$;

REVOKE ALL ON FUNCTION grant_institution_membership(UUID, UUID, TEXT) FROM PUBLIC;
-- Internal: reached only through the two definer functions below.

-- 064's function, re-created to delegate the grant. The permission checks are
-- verbatim.
CREATE OR REPLACE FUNCTION review_institution_member(
  p_member UUID,
  p_approve BOOLEAN,
  p_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_institution UUID;
  v_user UUID;
  v_role TEXT;
  v_result JSONB;
BEGIN
  SELECT im.institution_id, im.user_id, COALESCE(p_role, im.role)
    INTO v_institution, v_user, v_role
  FROM institution_members im
  WHERE im.id = p_member;

  IF v_institution IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF NOT (is_institution_admin(v_institution, v_actor) OR has_permission(v_actor, 'institution:verify')) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF v_role = 'student' AND NOT has_permission(v_actor, 'institution:approve_students')
     AND NOT is_institution_admin(v_institution, v_actor) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF NOT p_approve THEN
    UPDATE institution_members
    SET status = 'rejected',
        role = v_role,
        approved_by = v_actor,
        approved_at = NULL
    WHERE id = p_member;
    RETURN jsonb_build_object('ok', TRUE, 'granted_role', NULL);
  END IF;

  UPDATE institution_members SET role = v_role WHERE id = p_member;
  v_result := grant_institution_membership(p_member, v_actor, 'institution');
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION review_institution_member(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_institution_member(UUID, BOOLEAN, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 6. The decision
-- ------------------------------------------------------------
-- Takes an address that has ALREADY been proven to belong to p_user, and
-- decides what it is worth. Never granted to authenticated: the callers are
-- the trigger, the claim RPC and the service-role confirm function, each of
-- which is where the proof happened.
--
-- Order is by strength of evidence: an institution naming this exact address
-- beats a domain, and a trusted domain beats an institution's domain.
CREATE OR REPLACE FUNCTION apply_verified_email(
  p_user UUID,
  p_email TEXT,
  p_source TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(both from COALESCE(p_email, '')));
  v_domain TEXT;
  v_verified BOOLEAN;
  v_roles TEXT[];
  v_trusted trusted_email_domains%ROWTYPE;
  v_inst institutions%ROWTYPE;
  v_roster_id UUID;
  v_roster_role TEXT;
  v_roster_institution UUID;
  v_member_id UUID;
  v_member_status TEXT;
  v_grant JSONB;
BEGIN
  IF p_user IS NULL OR v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_email');
  END IF;
  v_domain := split_part(v_email, '@', 2);

  SELECT COALESCE(p.is_verified, FALSE), p.roles
    INTO v_verified, v_roles
  FROM profiles p WHERE p.id = p_user;
  IF v_roles IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_profile');
  END IF;

  -- Track: roster. The institution named this exact address.
  SELECT r.id, r.role, r.institution_id
    INTO v_roster_id, v_roster_role, v_roster_institution
  FROM institution_rosters r
  JOIN institutions i ON i.id = r.institution_id
  WHERE r.email = v_email
    AND r.claimed_by IS NULL
    AND i.status = 'verified'
    AND i.kind <> 'chamber'
  ORDER BY r.added_at
  LIMIT 1;

  IF v_roster_id IS NOT NULL THEN
    SELECT i.* INTO v_inst FROM institutions i WHERE i.id = v_roster_institution;
  ELSE
    -- Track: trusted domain.
    SELECT t.* INTO v_trusted
    FROM trusted_email_domains t
    WHERE t.domain = v_domain AND t.is_active;

    IF v_trusted.domain IS NOT NULL THEN
      IF v_verified AND (v_trusted.grants_role IS NULL OR v_trusted.grants_role = ANY(v_roles)) THEN
        RETURN jsonb_build_object('ok', TRUE, 'outcome', 'already_verified', 'domain', v_domain);
      END IF;

      PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
      UPDATE profiles
      SET is_verified = TRUE,
          verified_via = COALESCE(verified_via, 'domain'),
          verified_at = COALESCE(verified_at, now()),
          roles = CASE
                    WHEN v_trusted.grants_role IS NULL OR v_trusted.grants_role = ANY(roles) THEN roles
                    ELSE array_append(roles, v_trusted.grants_role)
                  END,
          active_role = CASE
                          WHEN v_trusted.grants_role IS NOT NULL AND active_role IS NULL THEN v_trusted.grants_role
                          ELSE active_role
                        END,
          updated_at = now()
      WHERE id = p_user;
      PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

      INSERT INTO notifications (user_id, type, title, body, link)
      VALUES (
        p_user,
        'verification_result',
        'Your account is verified',
        left('Your ' || v_trusted.label || ' email address (@' || v_domain || ') verified your account.'
             || CASE WHEN v_trusted.grants_role IS NOT NULL AND NOT (v_trusted.grants_role = ANY(v_roles))
                     THEN ' It now holds the ' || v_trusted.grants_role || ' role.' ELSE '' END, 1000),
        '/settings?tab=verification'
      );

      RETURN jsonb_build_object(
        'ok', TRUE,
        'outcome', 'verified',
        'domain', v_domain,
        'label', v_trusted.label,
        'granted_role', v_trusted.grants_role
      );
    END IF;

    -- Track: institution domain (064's match, verbatim).
    SELECT i.* INTO v_inst
    FROM institutions i
    WHERE i.status = 'verified'
      AND i.kind <> 'chamber'
      AND v_domain = ANY(i.email_domains)
    LIMIT 1;

    IF v_inst.id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'reason', 'domain_not_recognised', 'domain', v_domain);
    END IF;
  END IF;

  -- Institution path, from here on shared by roster and domain.
  SELECT im.id, im.status INTO v_member_id, v_member_status
  FROM institution_members im
  WHERE im.institution_id = v_inst.id AND im.user_id = p_user;

  IF v_member_status = 'approved' THEN
    IF v_roster_id IS NOT NULL THEN
      UPDATE institution_rosters SET claimed_by = p_user, claimed_at = now() WHERE id = v_roster_id;
    END IF;
    RETURN jsonb_build_object(
      'ok', TRUE, 'outcome', 'already_member',
      'institution_id', v_inst.id, 'institution_name', v_inst.name, 'domain', v_domain
    );
  END IF;

  INSERT INTO institution_members (institution_id, user_id, role, status)
  VALUES (v_inst.id, p_user, COALESCE(v_roster_role, 'student'), 'pending')
  ON CONFLICT (institution_id, user_id) DO UPDATE
    SET status = CASE WHEN institution_members.status = 'rejected' THEN 'pending' ELSE institution_members.status END,
        role = COALESCE(v_roster_role, institution_members.role)
  RETURNING id INTO v_member_id;

  IF COALESCE(v_roster_role, 'student') = 'student' THEN
    INSERT INTO student_safeguarding (user_id, institution_id, verified_domain)
    VALUES (p_user, v_inst.id, v_domain)
    ON CONFLICT (user_id) DO UPDATE
      SET institution_id = EXCLUDED.institution_id,
          verified_domain = EXCLUDED.verified_domain,
          updated_at = now();
  END IF;

  -- A roster entry is always an approval: the institution wrote the address
  -- down. auto_approve_students covers students only; an educator arriving on
  -- the domain alone still waits for the institution admin, as 064 intended.
  IF v_roster_id IS NOT NULL
     OR (v_inst.auto_approve_students AND COALESCE(v_roster_role, 'student') = 'student') THEN
    v_grant := grant_institution_membership(
      v_member_id, NULL,
      CASE WHEN v_roster_id IS NOT NULL THEN 'roster' ELSE 'institution' END
    );
    IF v_roster_id IS NOT NULL THEN
      UPDATE institution_rosters SET claimed_by = p_user, claimed_at = now() WHERE id = v_roster_id;
    END IF;
    RETURN jsonb_build_object(
      'ok', TRUE,
      'outcome', 'student_approved',
      'institution_id', v_inst.id,
      'institution_name', v_inst.name,
      'granted_role', v_grant->>'granted_role',
      'domain', v_domain
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'outcome', 'student_pending',
    'institution_id', v_inst.id,
    'institution_name', v_inst.name,
    'domain', v_domain
  );
END;
$$;

REVOKE ALL ON FUNCTION apply_verified_email(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_verified_email(UUID, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------
-- 7. The primary address: the claim RPC and the auth trigger
-- ------------------------------------------------------------
-- What the client calls. Refuses until Supabase has confirmed the address —
-- an unconfirmed primary is a string somebody typed.
CREATE OR REPLACE FUNCTION claim_email_verification()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_email TEXT;
  v_confirmed TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;

  SELECT lower(u.email), u.email_confirmed_at
    INTO v_email, v_confirmed
  FROM auth.users u WHERE u.id = v_user;

  IF v_email IS NULL OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_email');
  END IF;
  IF v_confirmed IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'email_unconfirmed');
  END IF;

  RETURN apply_verified_email(v_user, v_email, 'primary');
END;
$$;

REVOKE ALL ON FUNCTION claim_email_verification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_email_verification() TO authenticated;

-- 064's entry point, kept for the onboarding flow and the existing hook. Same
-- decision, legacy shape preserved where the old callers read it.
CREATE OR REPLACE FUNCTION request_student_verification()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := claim_email_verification();
BEGIN
  IF (v_result->>'ok')::BOOLEAN AND v_result ? 'institution_id' THEN
    RETURN v_result || jsonb_build_object(
      'status', CASE WHEN v_result->>'outcome' = 'student_pending' THEN 'pending' ELSE 'approved' END
    );
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION request_student_verification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_student_verification() TO authenticated;

-- Zero clicks for the primary address. GoTrue sets email_confirmed_at when the
-- signup link is followed; OAuth accounts arrive with it already set, hence
-- the second trigger on INSERT. Both swallow errors: a bug in the decision
-- must never make a confirmation link fail.
--
-- The INSERT trigger's name sorts after on_auth_user_created so the profile
-- row exists by the time it runs (same-event triggers fire alphabetically).
CREATE OR REPLACE FUNCTION handle_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM apply_verified_email(NEW.id, NEW.email, 'primary');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'apply_verified_email(%): %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION handle_email_confirmed();

DROP TRIGGER IF EXISTS on_auth_user_inserted_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_inserted_confirmed
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION handle_email_confirmed();

-- ------------------------------------------------------------
-- 8. Secondary addresses: classify before mailing, confirm by token
-- ------------------------------------------------------------
-- The send route asks this before spending a mail, so an unknown domain is
-- refused with no row and no token. service_role only: the answer reveals the
-- trusted list one domain at a time.
CREATE OR REPLACE FUNCTION classify_verification_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(both from COALESCE(p_email, '')));
  v_domain TEXT := split_part(lower(trim(both from COALESCE(p_email, ''))), '@', 2);
BEGIN
  IF v_domain = '' THEN
    RETURN 'unknown';
  END IF;
  IF EXISTS (
    SELECT 1 FROM institution_rosters r
    JOIN institutions i ON i.id = r.institution_id
    WHERE r.email = v_email AND r.claimed_by IS NULL AND i.status = 'verified' AND i.kind <> 'chamber'
  ) THEN
    RETURN 'roster';
  END IF;
  IF EXISTS (SELECT 1 FROM trusted_email_domains t WHERE t.domain = v_domain AND t.is_active) THEN
    RETURN 'trusted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM institutions i
    WHERE i.status = 'verified' AND i.kind <> 'chamber' AND v_domain = ANY(i.email_domains)
  ) THEN
    RETURN 'institution';
  END IF;
  RETURN 'unknown';
END;
$$;

REVOKE ALL ON FUNCTION classify_verification_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION classify_verification_email(TEXT) TO service_role;

-- verify_email_alias() (056), for proofs. Consumed tokens are nulled, not
-- stored, so a second click lands on not_found.
CREATE OR REPLACE FUNCTION confirm_email_proof(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a email_proofs%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO a FROM email_proofs WHERE verification_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF a.token_expires_at IS NULL OR a.token_expires_at < now() THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'expired');
  END IF;

  UPDATE email_proofs
     SET verified_at = now(),
         verification_token = NULL,
         token_expires_at = NULL,
         updated_at = now()
   WHERE id = a.id;

  v_result := apply_verified_email(a.user_id, a.email, 'proof');
  RETURN v_result || jsonb_build_object('email', a.email);
END;
$$;

REVOKE ALL ON FUNCTION confirm_email_proof(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_email_proof(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_email_proof(TEXT) TO service_role;

-- ------------------------------------------------------------
-- 9. The residual queue announces itself
-- ------------------------------------------------------------
-- The document track is unchanged except for this: the people who can work
-- the queue are told when it has an entry. Candidates are prefiltered on the
-- raw admin-tier slugs so has_permission() is not evaluated across the whole
-- membership. Direct INSERT for the reason given in section 5.
CREATE OR REPLACE FUNCTION notify_verification_reviewers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  r RECORD;
BEGIN
  SELECT display_name INTO v_name FROM profiles WHERE id = NEW.user_id;

  FOR r IN
    SELECT p.id
    FROM profiles p
    WHERE p.roles && ARRAY['oecs', 'super_admin', 'admin', 'people_supervisor',
                           'programme_supervisor', 'safety_admin']::TEXT[]
      AND p.id <> NEW.user_id
      AND has_permission(p.id, 'verification:review')
  LOOP
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      r.id,
      'verification_request',
      'New verification request',
      left(COALESCE(v_name, 'A member') ||
           CASE WHEN NEW.requested_role IS NOT NULL
                THEN ' asked for the ' || NEW.requested_role || ' role.'
                ELSE ' submitted identity documents for review.' END, 1000),
      '/admin/verification'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_verification_reviewers_trigger ON verification_requests;
CREATE TRIGGER notify_verification_reviewers_trigger
  AFTER INSERT ON verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_verification_reviewers();

-- The document reviewer records the track too.
CREATE OR REPLACE FUNCTION review_verification_request(
  p_request UUID,
  p_approve BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_user UUID;
  v_role TEXT;
  v_status TEXT;
BEGIN
  IF NOT has_permission(v_actor, 'verification:review') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  SELECT user_id, requested_role, status
  INTO v_user, v_role, v_status
  FROM verification_requests
  WHERE id = p_request;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'already_reviewed');
  END IF;

  IF holds_admin_seat(v_user) AND NOT is_super_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'seat_requires_super_admin');
  END IF;

  UPDATE verification_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewer_id = v_actor,
      reviewed_at = now(),
      admin_note = COALESCE(p_note, admin_note),
      updated_at = now()
  WHERE id = p_request;

  IF p_approve THEN
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET is_verified = TRUE,
        verified_via = COALESCE(verified_via, 'document'),
        verified_at = COALESCE(verified_at, now()),
        roles = CASE
                  WHEN v_role IS NULL OR v_role = ANY(roles) THEN roles
                  ELSE array_append(roles, v_role)
                END,
        active_role = CASE
                        WHEN v_role IS NOT NULL AND active_role IS NULL THEN v_role
                        ELSE active_role
                      END,
        updated_at = now()
    WHERE id = v_user;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'granted_role', CASE WHEN p_approve THEN v_role END
  );
END;
$$;

REVOKE ALL ON FUNCTION review_verification_request(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_verification_request(UUID, BOOLEAN, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verification
--
--   -- nobody verified is without a reason
--   SELECT count(*) FROM profiles WHERE is_verified AND verified_via IS NULL;   -- 0
--
--   -- a trusted domain verifies a confirmed primary (as that user)
--   SELECT set_trusted_email_domain('example.int', 'Example IGO');
--   SELECT claim_email_verification();          -- {"ok":true,"outcome":"verified",...}
--   SELECT is_verified, verified_via FROM profiles WHERE id = auth.uid();  -- t, domain
--
--   -- an admin seat cannot ride on a domain; free-mail cannot be trusted
--   SELECT set_trusted_email_domain('example.int', 'x', 'super_admin');    -- ok:false
--   SELECT set_trusted_email_domain('gmail.com', 'x');                      -- ok:false
--
--   -- a roster entry approves with no educator
--   SELECT upsert_institution_roster('<institution>', ARRAY['s@dsc.edu.dm']);
--   -- as s@dsc.edu.dm: claim_email_verification() -> outcome student_approved
--
--   -- an unknown domain writes nothing
--   -- claim_email_verification() -> reason domain_not_recognised
--
--   -- the queue announces itself
--   INSERT INTO verification_requests (user_id, document_paths) VALUES (auth.uid(), ARRAY['x']);
--   SELECT count(*) FROM notifications WHERE type = 'verification_request';   -- reviewers
-- ============================================================
