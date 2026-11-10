-- ============================================================
-- 204: Every account keeps a secondary email, and at least one of
--      the two addresses is not a school address.
--
-- A school inbox is switched off when the student leaves. An account
-- whose only addresses are school addresses becomes unrecoverable at
-- graduation, so the pair must include one the member keeps.
--
-- "School" is decided here, from data the platform already has:
--   1. a domain (or a subdomain of one) listed on a school, university
--      or TVET institution that has not been rejected — the list admins
--      already maintain in Admin → Institutions;
--   2. a domain shaped like an academic one: .edu, .edu.xx, .ac.xx,
--      .sch.xx, or a k12 label.
-- Nothing else counts: free mail, work, ministry and trusted domains
-- (oecs.int) are all non-school. No per-address list is needed.
--
-- Rosters (145) are deliberately NOT consulted. A roster names the
-- PERSON, often by their personal gmail, so a roster hit says nothing
-- about whether the address will outlive their enrolment.
--
-- Enforcement:
--   * api/auth/add-alias refuses a secondary when both addresses are
--     school ones (is_school_email, service role).
--   * ProtectedRoute reads my_secondary_email_status() and holds a
--     non-compliant session on /security/backup-email.
-- ============================================================

CREATE OR REPLACE FUNCTION is_school_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain TEXT := split_part(lower(trim(both from COALESCE(p_email, ''))), '@', 2);
BEGIN
  IF v_domain = '' THEN
    RETURN FALSE;
  END IF;

  -- Same shape test as src/lib/email-policy.ts looksLikeSchoolDomain().
  IF v_domain ~ '(^|\.)edu$|\.edu\.[a-z]{2}$|\.ac\.[a-z]{2}$|\.sch\.[a-z]{2}$|(^|\.)k12\.' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM institutions i, unnest(i.email_domains) AS d(domain)
    WHERE i.kind <> 'chamber'
      AND i.status <> 'rejected'
      AND (v_domain = lower(d.domain) OR v_domain LIKE '%.' || lower(d.domain))
  );
END;
$$;

REVOKE ALL ON FUNCTION is_school_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_school_email(TEXT) TO service_role;

-- The caller's standing against the rule. One row's worth of JSON so the
-- client can say WHY it is holding the session, not just that it is.
--
--   has_secondary   an alias row exists and is not the primary itself (an
--                   alias promoted to primary no longer backs anything up)
--   verified        that alias has been confirmed
--   pending_live    unconfirmed, but its link has not expired yet
--   primary_school / secondary_school   is_school_email() of each
--   compliant       has_secondary AND (verified OR pending_live)
--                   AND NOT (primary_school AND secondary_school)
CREATE OR REPLACE FUNCTION my_secondary_email_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_primary TEXT;
  a user_email_aliases%ROWTYPE;
  v_has BOOLEAN;
  v_verified BOOLEAN;
  v_pending BOOLEAN;
  v_primary_school BOOLEAN;
  v_secondary_school BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT lower(u.email) INTO v_primary FROM auth.users u WHERE u.id = v_uid;
  SELECT * INTO a FROM user_email_aliases WHERE user_id = v_uid;

  v_has := FOUND AND a.email IS DISTINCT FROM v_primary;
  v_verified := v_has AND a.verified_at IS NOT NULL;
  v_pending := v_has AND a.verified_at IS NULL
    AND a.token_expires_at IS NOT NULL AND a.token_expires_at > now();
  v_primary_school := is_school_email(v_primary);
  v_secondary_school := v_has AND is_school_email(a.email);

  RETURN jsonb_build_object(
    'has_secondary', v_has,
    'secondary_email', CASE WHEN v_has THEN a.email END,
    'verified', v_verified,
    'pending_live', v_pending,
    'primary_school', v_primary_school,
    'secondary_school', v_secondary_school,
    'compliant', v_has AND (v_verified OR v_pending)
      AND NOT (v_primary_school AND v_secondary_school)
  );
END;
$$;

REVOKE ALL ON FUNCTION my_secondary_email_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_secondary_email_status() TO authenticated;
