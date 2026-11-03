-- ============================================================
-- Migration 175: verification that depends on an affiliation expires
--
-- A domain, roster or institution verification says "this person has a
-- mailbox at X". That stays true only while they work or study there. 145
-- made those badges permanent, so somebody who left OECS in March still holds
-- one in December.
--
-- From here on those tracks last a term (12 months, verification_term()).
-- Thirty and seven days out the member is reminded. Renewing means proving the
-- mailbox again: a fresh email_proofs token, clicked. If the mailbox is gone
-- because the person left, the proof cannot happen and the badge lapses with
-- nobody having to notice.
--
-- Tracks that prove IDENTITY rather than affiliation do not expire: document,
-- admin, grandfathered.
--
-- THE LAPSE MARKER. claim_email_verification() runs once per session and
-- re-evaluates the primary address. Without a marker, a lapsed @oecs.int
-- account would be re-verified on the next login from the same, unproven,
-- address — and expiry would mean nothing. verification_lapsed_at refuses
-- every automatic source except a freshly consumed proof token
-- ('fresh_proof', passed only by confirm_email_proof below). A document
-- review, a code or a reviewer verifying by hand also clear it.
--
-- WHY 'fresh_proof' AND NOT 'proof'. api/verification/send-proof.ts calls
-- apply_verified_email(…, 'proof') for an address proven at some point in the
-- past, without a new click. That must not count as a renewal.
--
-- Restates apply_verified_email() and confirm_email_proof() from 145 (their
-- latest definitions). Changes are marked "175:".
--
-- Notification type verification_expiring is deliberately left out of
-- enforce_notification_preferences() (112): it falls through to "always
-- deliver", like the other verification_* types, because it is about access
-- to the account.
--
-- Requires 174. Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columns and helpers
-- ------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_until TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_reminded_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_lapsed_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.verified_until IS
  'When an affiliation-based verification (domain, roster, institution, org_code) lapses unless renewed (175). NULL for identity tracks and while unverified.';
COMMENT ON COLUMN profiles.verification_lapsed_at IS
  'Set when verified_until passed (175). While set, only a fresh mailbox proof, a code, a document review or a reviewer can verify again.';

CREATE INDEX IF NOT EXISTS idx_profiles_verified_until
  ON profiles (verified_until) WHERE verified_until IS NOT NULL;

CREATE OR REPLACE FUNCTION verification_term()
RETURNS INTERVAL
LANGUAGE SQL
IMMUTABLE
AS $$ SELECT INTERVAL '12 months' $$;

CREATE OR REPLACE FUNCTION verification_track_expires(p_via TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$ SELECT COALESCE(p_via IN ('domain', 'roster', 'institution', 'org_code'), FALSE) $$;

-- ------------------------------------------------------------
-- 2. Guard and setter
-- ------------------------------------------------------------
-- Members cannot write the three new columns. Same rule as 145's provenance
-- guard: reviewers, the service role, or definer code that set the bypass.
-- Sorts before guard_verification_hold_trigger and set_verification_expiry_trigger.
CREATE OR REPLACE FUNCTION guard_verification_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF NEW.verified_until IS NOT DISTINCT FROM OLD.verified_until
     AND NEW.verification_reminded_at IS NOT DISTINCT FROM OLD.verification_reminded_at
     AND NEW.verification_lapsed_at IS NOT DISTINCT FROM OLD.verification_lapsed_at THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NULL OR current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT has_permission(v_actor, 'verification:review') THEN
    RAISE EXCEPTION 'verification expiry can only be changed by a reviewer';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_verification_expiry_trigger ON profiles;
CREATE TRIGGER guard_verification_expiry_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_verification_expiry();

-- The term follows the track, whichever path set it. Every grant path writes
-- is_verified and verified_via; none needs to know about expiry.
CREATE OR REPLACE FUNCTION set_verification_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_verified, FALSE)
     AND (NOT COALESCE(OLD.is_verified, FALSE) OR NEW.verified_via IS DISTINCT FROM OLD.verified_via) THEN
    NEW.verified_until := CASE
      WHEN verification_track_expires(NEW.verified_via) THEN now() + verification_term()
      ELSE NULL
    END;
    NEW.verification_reminded_at := NULL;
    NEW.verification_lapsed_at := NULL;
  ELSIF NOT COALESCE(NEW.is_verified, FALSE) AND COALESCE(OLD.is_verified, FALSE) THEN
    NEW.verified_until := NULL;
    NEW.verification_reminded_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_verification_expiry_trigger ON profiles;
CREATE TRIGGER set_verification_expiry_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_verification_expiry();

-- ------------------------------------------------------------
-- 3. Launch grace: nobody lapses on the day this is applied
-- ------------------------------------------------------------
-- Runs with no auth.uid(), so the guards let it through. Not logged as a
-- renewal: the log trigger does not watch verified_until.
UPDATE profiles
SET verified_until = now() + verification_term()
WHERE COALESCE(is_verified, FALSE)
  AND verification_track_expires(verified_via)
  AND verified_until IS NULL;

-- ------------------------------------------------------------
-- 4. The decision, restated from 145
-- ------------------------------------------------------------
-- Writes a renewal: same track, term restarted, reminders reset. Logged here
-- because the log trigger only sees flag and track changes.
CREATE OR REPLACE FUNCTION renew_verification_term(
  p_user UUID,
  p_via TEXT,
  p_evidence JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('ktip.verification_evidence', COALESCE(p_evidence, '{}'::jsonb)::TEXT, TRUE);
  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET verified_via = COALESCE(p_via, verified_via),
      verified_until = now() + verification_term(),
      verification_reminded_at = NULL,
      updated_at = now()
  WHERE id = p_user;
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  INSERT INTO verification_events (user_id, event, via, actor_id, evidence)
  SELECT p_user, 'renewed', p.verified_via, auth.uid(), COALESCE(p_evidence, '{}'::jsonb)
  FROM profiles p WHERE p.id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION renew_verification_term(UUID, TEXT, JSONB) FROM PUBLIC;

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
  v_via TEXT;
  v_hold TIMESTAMPTZ;
  v_lapsed TIMESTAMPTZ;
  v_fresh BOOLEAN := p_source = 'fresh_proof';
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

  -- 175: also reads the track, the hold and the lapse marker.
  SELECT COALESCE(p.is_verified, FALSE), p.roles, p.verified_via,
         p.verification_hold_at, p.verification_lapsed_at
    INTO v_verified, v_roles, v_via, v_hold, v_lapsed
  FROM profiles p WHERE p.id = p_user;
  IF v_roles IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_profile');
  END IF;

  -- 175: a reviewer removed the badge. Nothing automatic gives it back.
  IF v_hold IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'on_hold');
  END IF;

  -- 175: the term ran out. Only a mailbox proven just now renews it.
  IF v_lapsed IS NOT NULL AND NOT v_verified AND NOT v_fresh THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'renewal_required', 'domain', v_domain);
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
        -- 175: a fresh proof at a trusted domain renews an affiliation track,
        -- and moves it onto the domain (the strongest of the four).
        IF v_fresh AND verification_track_expires(v_via) THEN
          PERFORM renew_verification_term(p_user, 'domain', jsonb_build_object(
            'email', v_email, 'domain', v_domain, 'label', v_trusted.label, 'source', p_source));
          RETURN jsonb_build_object('ok', TRUE, 'outcome', 'renewed', 'domain', v_domain, 'label', v_trusted.label);
        END IF;
        RETURN jsonb_build_object('ok', TRUE, 'outcome', 'already_verified', 'domain', v_domain);
      END IF;

      -- 175: what the log row should say about this grant.
      PERFORM set_config('ktip.verification_evidence', jsonb_build_object(
        'email', v_email, 'domain', v_domain, 'label', v_trusted.label, 'source', p_source)::TEXT, TRUE);

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

  -- 175: evidence for whichever institution grant follows.
  PERFORM set_config('ktip.verification_evidence', jsonb_build_object(
    'email', v_email, 'domain', v_domain, 'institution_id', v_inst.id,
    'label', v_inst.name, 'source', p_source,
    'roster', v_roster_id IS NOT NULL)::TEXT, TRUE);

  -- Institution path, from here on shared by roster and domain.
  SELECT im.id, im.status INTO v_member_id, v_member_status
  FROM institution_members im
  WHERE im.institution_id = v_inst.id AND im.user_id = p_user;

  IF v_member_status = 'approved' THEN
    IF v_roster_id IS NOT NULL THEN
      UPDATE institution_rosters SET claimed_by = p_user, claimed_at = now() WHERE id = v_roster_id;
    END IF;

    -- 175: a fresh proof renews; an approved member whose term lapsed is
    -- verified again by the same grant that verified them the first time.
    IF v_fresh AND v_verified AND verification_track_expires(v_via) THEN
      PERFORM renew_verification_term(p_user, NULL, verification_context_evidence());
      RETURN jsonb_build_object(
        'ok', TRUE, 'outcome', 'renewed',
        'institution_id', v_inst.id, 'institution_name', v_inst.name, 'domain', v_domain
      );
    END IF;
    IF NOT v_verified AND v_fresh THEN
      v_grant := grant_institution_membership(
        v_member_id, NULL,
        CASE WHEN v_roster_id IS NOT NULL THEN 'roster' ELSE 'institution' END
      );
      RETURN jsonb_build_object(
        'ok', TRUE, 'outcome', 'renewed',
        'institution_id', v_inst.id, 'institution_name', v_inst.name,
        'granted_role', v_grant->>'granted_role', 'domain', v_domain
      );
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

-- 145's confirm_email_proof, restated. 175: the token was consumed in this
-- call, so the proof is fresh.
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

  v_result := apply_verified_email(a.user_id, a.email, 'fresh_proof');
  RETURN v_result || jsonb_build_object('email', a.email);
END;
$$;

REVOKE ALL ON FUNCTION confirm_email_proof(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_email_proof(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_email_proof(TEXT) TO service_role;

-- ------------------------------------------------------------
-- 5. The daily run
-- ------------------------------------------------------------
-- Called by api/cron/verification-expiry.ts under the service role. Sends the
-- in-app reminders and lapses what is due; returns who to email, because
-- mail goes out from the edge, not the database.
--
-- Reminder stages: 30 days and 7 days. A stage is due when the member has not
-- been reminded since that stage began, so a missed cron run catches up
-- without sending both on the same day.
CREATE OR REPLACE FUNCTION run_verification_expiry(p_batch INT DEFAULT 500)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  r RECORD;
  v_reminders JSONB := '[]'::jsonb;
  v_lapsed JSONB := '[]'::jsonb;
  v_days INT;
BEGIN
  FOR r IN
    SELECT p.id, p.display_name, p.verified_until, p.verified_via, u.email,
           CASE WHEN p.verified_until <= now() + INTERVAL '7 days' THEN 7 ELSE 30 END AS stage
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE COALESCE(p.is_verified, FALSE)
      AND p.verified_until IS NOT NULL
      AND p.verified_until > now()
      AND p.verified_until <= now() + INTERVAL '30 days'
      AND (
        p.verification_reminded_at IS NULL
        OR p.verification_reminded_at < p.verified_until
             - make_interval(days => CASE WHEN p.verified_until <= now() + INTERVAL '7 days' THEN 7 ELSE 30 END)
      )
    ORDER BY p.verified_until
    LIMIT GREATEST(COALESCE(p_batch, 500), 1)
  LOOP
    v_days := GREATEST(CEIL(EXTRACT(EPOCH FROM (r.verified_until - now())) / 86400)::INT, 1);

    UPDATE profiles SET verification_reminded_at = now() WHERE id = r.id;

    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      r.id,
      'verification_expiring',
      'Your verification ends in ' || v_days || CASE WHEN v_days = 1 THEN ' day' ELSE ' days' END,
      'Confirm your work or school email again to keep your verified badge.',
      '/settings?tab=verification'
    );

    INSERT INTO verification_events (user_id, event, via, evidence)
    VALUES (r.id, 'reminder_sent', r.verified_via,
            jsonb_build_object('stage_days', r.stage, 'verified_until', r.verified_until));

    v_reminders := v_reminders || jsonb_build_object(
      'user_id', r.id, 'email', r.email, 'display_name', r.display_name,
      'days_left', v_days, 'verified_until', r.verified_until, 'via', r.verified_via
    );
  END LOOP;

  PERFORM set_config('ktip.verification_event', 'expired', TRUE);
  PERFORM set_config('ktip.verification_reason', 'Verification term ended without renewal', TRUE);
  FOR r IN
    SELECT p.id, p.display_name, p.verified_until, p.verified_via, u.email
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE COALESCE(p.is_verified, FALSE)
      AND p.verified_until IS NOT NULL
      AND p.verified_until <= now()
    ORDER BY p.verified_until
    LIMIT GREATEST(COALESCE(p_batch, 500), 1)
  LOOP
    PERFORM set_config('ktip.verification_evidence',
      jsonb_build_object('verified_until', r.verified_until)::TEXT, TRUE);

    UPDATE profiles
    SET is_verified = FALSE,
        verified_via = NULL,
        verified_at = NULL,
        verification_lapsed_at = now(),
        updated_at = now()
    WHERE id = r.id;

    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      r.id,
      'verification_result',
      'Your verification has ended',
      'Your verified badge was tied to a work or school address and was not renewed. Confirm that address again, or use another way to verify.',
      '/settings?tab=verification'
    );

    v_lapsed := v_lapsed || jsonb_build_object(
      'user_id', r.id, 'email', r.email, 'display_name', r.display_name, 'via', r.verified_via
    );
  END LOOP;
  PERFORM set_config('ktip.verification_event', '', TRUE);
  PERFORM set_config('ktip.verification_reason', '', TRUE);
  PERFORM set_config('ktip.verification_evidence', '', TRUE);

  RETURN jsonb_build_object('reminders', v_reminders, 'lapsed', v_lapsed);
END;
$$;

REVOKE ALL ON FUNCTION run_verification_expiry(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION run_verification_expiry(INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION run_verification_expiry(INT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verification
--
--   -- every affiliation track has a term; identity tracks do not
--   SELECT verified_via, count(*), count(verified_until)
--   FROM profiles WHERE is_verified GROUP BY 1;
--     -- domain/roster/institution/org_code: both counts equal
--     -- document/admin/grandfathered: second count 0
--
--   -- a reminder fires once per stage
--   UPDATE profiles SET verified_until = now() + interval '6 days',
--          verification_reminded_at = NULL WHERE id = '<uuid>';
--   SELECT run_verification_expiry();   -- reminders: [<uuid>, days_left 6]
--   SELECT run_verification_expiry();   -- reminders: []
--
--   -- lapse, then the session safety net cannot undo it
--   UPDATE profiles SET verified_until = now() - interval '1 minute' WHERE id = '<uuid>';
--   SELECT run_verification_expiry();   -- lapsed: [<uuid>]
--   SELECT event FROM verification_events WHERE user_id = '<uuid>'
--    ORDER BY created_at DESC LIMIT 1;  -- expired
--   -- as that member:
--   SELECT claim_email_verification();  -- {"ok":false,"reason":"renewal_required"}
--
--   -- a fresh proof renews
--   SELECT apply_verified_email('<uuid>', '<their oecs.int address>', 'fresh_proof');
--     -- outcome verified (after a lapse) or renewed (before one)
-- ============================================================
