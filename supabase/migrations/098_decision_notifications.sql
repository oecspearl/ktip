-- ============================================================
-- 098. Tell people when a decision goes against them.
--
-- Three review paths announced only their happy ending:
--   * grant_applications never notified at all — 046 logs the status
--     change to history and stops there, so an approved *or* declined
--     applicant learnt nothing until they reopened My Applications.
--   * review_institution_member (064) sends inside `IF p_approve`.
--   * set_employer_verification_by_chamber (064) sends inside
--     `IF p_status = 'verified'`.
--
-- Meanwhile the help centre promises "status changes reach you through
-- notifications". This closes the three silent branches. Wording matches
-- the UI vocabulary: a turned-down decision is "not accepted", never
-- "rejected" — the stored status values are unchanged.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Grant application decisions
--
-- A trigger rather than a call in the admin page, because the status is
-- writable from anywhere with the right RLS (admin UI today, a partner
-- integration or a backfill tomorrow) and the applicant should hear about
-- it either way. SECURITY DEFINER for the same reason 046's history
-- trigger needs it — notifications has no INSERT policy of its own.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_grant_application_decision()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT;
  v_grant TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- send_notification raises when there is no session. Seeds and migrations
  -- move rows with no auth.uid(), and a backfill must not fail on a message
  -- nobody is waiting for.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT g.title INTO v_grant FROM grants g WHERE g.id = NEW.grant_id;

  IF NEW.status = 'approved' THEN
    v_title := 'Application approved';
  ELSE
    v_title := 'Application not accepted';
  END IF;

  PERFORM send_notification(
    NEW.user_id,
    'grant_application_result',
    v_title,
    CASE
      WHEN NEW.status = 'approved'
        THEN 'Your application to ' || COALESCE(v_grant, 'this grant') || ' was approved.'
      ELSE 'Your application to ' || COALESCE(v_grant, 'this grant') ||
           ' was not accepted. Any feedback from the reviewer appears with the decision.'
    END,
    '/grants/my-applications'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ga_decision_notify ON grant_applications;
CREATE TRIGGER trg_ga_decision_notify
  AFTER UPDATE OF status ON grant_applications
  FOR EACH ROW EXECUTE FUNCTION notify_grant_application_decision();

-- ------------------------------------------------------------
-- 2. Institution membership decisions
--
-- Unchanged from 064 except for the ELSE branch: a member who is turned
-- down keeps their account, so they need to know the request was seen and
-- closed rather than still queued.
-- ------------------------------------------------------------

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
  v_kind TEXT;
  v_grant TEXT;
  v_name TEXT;
BEGIN
  SELECT im.institution_id, im.user_id, COALESCE(p_role, im.role), i.kind, i.name
    INTO v_institution, v_user, v_role, v_kind, v_name
  FROM institution_members im
  JOIN institutions i ON i.id = im.institution_id
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

  UPDATE institution_members
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      role = v_role,
      approved_by = v_actor,
      approved_at = CASE WHEN p_approve THEN now() ELSE NULL END
  WHERE id = p_member;

  IF p_approve THEN
    v_grant := CASE
      WHEN v_kind = 'chamber' THEN 'chamber_admin'
      WHEN v_role = 'student' THEN 'student'
      WHEN v_role = 'admin' THEN 'educational_partner'
      ELSE 'faculty'
    END;

    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET roles = CASE WHEN v_grant = ANY(roles) THEN roles ELSE array_append(roles, v_grant) END,
        updated_at = now()
    WHERE id = v_user;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

    PERFORM send_notification(
      v_user,
      'institution_membership',
      'Institution membership approved',
      'Your account has been approved and now has the ' || v_grant || ' role.',
      '/settings'
    );
  ELSE
    PERFORM send_notification(
      v_user,
      'institution_membership',
      'Institution membership not accepted',
      COALESCE(v_name, 'The institution') ||
        ' did not accept your membership request. Contact them directly if you think this is wrong.',
      '/settings'
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'granted_role', v_grant);
END;
$$;

REVOKE ALL ON FUNCTION review_institution_member(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_institution_member(UUID, BOOLEAN, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 3. Chamber SME decisions
--
-- Unchanged from 064 except for the non-verified branches. `pending` is
-- deliberately silent: it is the state the owner is already waiting in.
-- The chamber's note is passed through when there is one — it is the only
-- explanation the owner will get, and 064 already stores it.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_employer_verification_by_chamber(
  p_employer UUID,
  p_status TEXT,
  p_registration_number TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_country CHAR(2);
  v_from TEXT;
  v_chamber UUID;
  v_owner UUID;
BEGIN
  IF NOT has_permission(v_actor, 'sme:verify') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_status NOT IN ('pending', 'verified', 'rejected', 'revoked') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_status');
  END IF;

  SELECT e.country_code, e.verification_status, e.created_by
    INTO v_country, v_from, v_owner
  FROM employers e WHERE e.id = p_employer;

  IF v_country IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF NOT (v_country = ANY(chamber_countries(v_actor))) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'wrong_country', 'country', v_country);
  END IF;

  SELECT i.id INTO v_chamber
  FROM institution_members im
  JOIN institutions i ON i.id = im.institution_id
  WHERE im.user_id = v_actor AND im.status = 'approved'
    AND i.kind = 'chamber' AND i.status = 'verified' AND i.country_code = v_country
  LIMIT 1;

  UPDATE employers
  SET verification_status = p_status,
      verification_method = CASE WHEN p_status = 'verified' THEN 'chamber_attestation' ELSE verification_method END,
      registration_number = COALESCE(p_registration_number, registration_number),
      verified_at = CASE WHEN p_status = 'verified' THEN now() ELSE NULL END,
      verified_by = CASE WHEN p_status = 'verified' THEN v_actor ELSE NULL END,
      verification_note = COALESCE(p_note, verification_note),
      chamber_institution_id = v_chamber,
      chamber_reviewed_by = v_actor,
      chamber_reviewed_at = now(),
      updated_at = now()
  WHERE id = p_employer;

  INSERT INTO employer_verification_events (employer_id, from_status, to_status, method, note, actor_id)
  VALUES (p_employer, v_from, p_status, 'chamber_attestation', p_note, v_actor);

  -- A verified company promotes its owner to the SME role, which is what
  -- unlocks posting industry projects and private-sector grants.
  IF p_status = 'verified' AND v_owner IS NOT NULL THEN
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET roles = CASE WHEN 'sme' = ANY(roles) THEN roles ELSE array_append(roles, 'sme') END,
        updated_at = now()
    WHERE id = v_owner;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

    PERFORM send_notification(
      v_owner,
      'employer_verified',
      'Your business is verified',
      'Your National Chamber of Commerce has verified your business. SME features are now available.',
      '/settings'
    );
  ELSIF p_status = 'rejected' AND v_owner IS NOT NULL THEN
    PERFORM send_notification(
      v_owner,
      'employer_verification_result',
      'Business verification not accepted',
      COALESCE(
        p_note,
        'Your National Chamber of Commerce did not accept this submission. Contact them directly to resolve it before resubmitting.'
      ),
      '/sme/verification'
    );
  ELSIF p_status = 'revoked' AND v_owner IS NOT NULL THEN
    PERFORM send_notification(
      v_owner,
      'employer_verification_result',
      'Business verification withdrawn',
      COALESCE(
        p_note,
        'Your verified status has been withdrawn. Contact your Chamber of Commerce for details.'
      ),
      '/sme/verification'
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION set_employer_verification_by_chamber(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_employer_verification_by_chamber(UUID, TEXT, TEXT, TEXT) TO authenticated;
