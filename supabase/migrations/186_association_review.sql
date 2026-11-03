-- ============================================================
-- Migration 186: association review, for associations and for OECS
--
-- 064 built SME verification around a Chamber of Commerce. 178 renamed the
-- role "Business Association". This migration finishes the job on the
-- database side and fixes the gaps the November review turned up:
--
--   1. A business verified by OECS (set_employer_verification, 116) never
--      marked its owner verified. A business verified by its association
--      (set_employer_verification_by_chamber, 125) did, but left verified_via
--      NULL, so Settings could not say where the badge came from, and it
--      raised verification_on_hold when the owner's badge was under a hold.
--      Both now go through sync_employer_owner_verification(), which sets
--      is_verified with verified_via = 'association' and the business name as
--      the evidence label.
--
--   2. When a verified business loses that status (revoked, rejected, reset),
--      an owner whose badge came from it ('association') loses the badge too.
--      An owner verified any other way keeps theirs. No hold is set: the
--      owner can verify again by another route at once.
--
--   3. association_review_queue(): the OECS view of every country's queue,
--      with the days each submission has waited and the association assigned
--      to its country. An association calling it sees its own countries only.
--
--   4. add_association_admin(): links an account to a verified association as
--      an approved admin. That row is what makes chamber_countries() return
--      anything, and nothing in the app could create it before.
--
-- Database identifiers stay as they were (sme:verify, chamber_admin,
-- institutions.kind = 'chamber', chamber_countries). Only the words change.
--
-- 'association' does not expire: verification_track_expires() (175) is left
-- alone. The business's own status is the source of truth, and losing it
-- clears the badge (point 2).
--
-- Requires 116, 125, 145, 174, 175 and 176. Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The new track
-- ------------------------------------------------------------
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_verified_via_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_verified_via_check
  CHECK (verified_via IS NULL OR verified_via IN (
    'document', 'domain', 'institution', 'roster', 'admin', 'grandfathered', 'org_code', 'association'
  ));

COMMENT ON COLUMN profiles.verified_via IS
  'Why is_verified is TRUE: document (035 review), domain (trusted_email_domains), institution (institution approval), roster (institution listed the address), admin (flipped on the users page), grandfathered (142), org_code (176, a code issued by a verified organisation), association (186, the member''s business was verified by its business association or by OECS). NULL while unverified.';

-- ------------------------------------------------------------
-- 2. The owner follows the business
-- ------------------------------------------------------------
-- Internal. Called by both verification RPCs after the employers row is
-- written. Returns what happened to the owner's badge:
--   verified          the badge was granted now
--   already_verified  the owner already held it (provenance filled if empty)
--   on_hold           a reviewer's hold (174) stops automatic grants and the
--                     caller cannot lift it; the business is still verified
--   cleared           the badge came from this business and was removed
--   unchanged         nothing to do
--   no_owner          the business has no owning account
CREATE OR REPLACE FUNCTION sync_employer_owner_verification(
  p_employer UUID,
  p_status TEXT,
  p_from TEXT,
  p_by TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_owner UUID;
  v_name TEXT;
  v_was BOOLEAN;
  v_via TEXT;
  v_hold TIMESTAMPTZ;
BEGIN
  SELECT e.created_by, COALESCE(NULLIF(e.trading_name, ''), e.legal_name)
    INTO v_owner, v_name
  FROM employers e WHERE e.id = p_employer;

  IF v_owner IS NULL THEN
    RETURN 'no_owner';
  END IF;

  SELECT COALESCE(p.is_verified, FALSE), p.verified_via, p.verification_hold_at
    INTO v_was, v_via, v_hold
  FROM profiles p WHERE p.id = v_owner;

  IF NOT FOUND THEN
    RETURN 'no_owner';
  END IF;

  IF p_status = 'verified' THEN
    IF v_was AND v_via IS NOT NULL THEN
      RETURN 'already_verified';
    END IF;

    -- 174's guard would raise for anyone but a reviewer. A reviewer verifying
    -- here lifts the hold, as a reviewer verifying by hand does.
    IF NOT v_was AND v_hold IS NOT NULL
       AND NOT (v_actor IS NOT NULL AND has_permission(v_actor, 'verification:review')) THEN
      RETURN 'on_hold';
    END IF;

    -- Picked up by 174's log trigger, and read back as the label by
    -- get_my_verification_status() (176): "Verified through <business>".
    PERFORM set_config('ktip.verification_evidence',
      jsonb_build_object('label', v_name, 'employer_id', p_employer, 'by', p_by)::TEXT, TRUE);
    PERFORM set_config('ktip.verification_reason', COALESCE(left(p_note, 1000), ''), TRUE);
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET is_verified = TRUE,
        verified_via = CASE WHEN v_was THEN COALESCE(verified_via, 'association') ELSE 'association' END,
        verified_at = CASE WHEN v_was THEN COALESCE(verified_at, now()) ELSE now() END,
        updated_at = now()
    WHERE id = v_owner;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);
    PERFORM set_config('ktip.verification_evidence', '', TRUE);
    PERFORM set_config('ktip.verification_reason', '', TRUE);

    RETURN CASE WHEN v_was THEN 'already_verified' ELSE 'verified' END;
  END IF;

  -- Leaving verified. Only a badge that came from a business is taken back,
  -- and only when no other verified business of the owner's still stands
  -- behind it.
  IF p_from = 'verified' AND p_status <> 'verified'
     AND v_was AND v_via = 'association'
     AND NOT EXISTS (
       SELECT 1 FROM employers e
       WHERE e.created_by = v_owner
         AND e.id <> p_employer
         AND e.verification_status = 'verified'
     ) THEN
    PERFORM set_config('ktip.verification_evidence',
      jsonb_build_object('label', v_name, 'employer_id', p_employer, 'by', p_by, 'status', p_status)::TEXT, TRUE);
    PERFORM set_config('ktip.verification_reason',
      COALESCE(left(NULLIF(trim(p_note), ''), 1000), 'Business verification ' || p_status), TRUE);
    PERFORM set_config('ktip.verification_event', '', TRUE);
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET is_verified = FALSE,
        verified_via = NULL,
        verified_at = NULL,
        updated_at = now()
    WHERE id = v_owner;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);
    PERFORM set_config('ktip.verification_evidence', '', TRUE);
    PERFORM set_config('ktip.verification_reason', '', TRUE);
    RETURN 'cleared';
  END IF;

  RETURN 'unchanged';
END;
$$;

REVOKE ALL ON FUNCTION sync_employer_owner_verification(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
-- Internal: reached only through the two definer functions below.

-- ------------------------------------------------------------
-- 3. OECS path — 116's function, plus the owner and notifications
-- ------------------------------------------------------------
-- Changes from 116 are marked "186:". The permission check, the evidence rule
-- and the share_externally withdrawal are verbatim.
CREATE OR REPLACE FUNCTION set_employer_verification(
  p_employer_id UUID,
  p_status TEXT,
  p_method TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_registration_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_from TEXT;
  v_owner UUID;
  v_now TIMESTAMPTZ := now();
  v_owner_outcome TEXT;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the check has to be explicit here.
  IF NOT has_permission(v_actor, 'employer:manage') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_status NOT IN ('unverified', 'pending', 'verified', 'rejected', 'revoked') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_status');
  END IF;

  IF p_status = 'verified' AND p_method IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'method_required');
  END IF;

  SELECT verification_status, created_by INTO v_from, v_owner
  FROM employers WHERE id = p_employer_id FOR UPDATE;
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  UPDATE employers SET
    verification_status = p_status,
    verification_method = CASE WHEN p_status = 'verified' THEN p_method ELSE verification_method END,
    registration_number = COALESCE(p_registration_number, registration_number),
    verification_note   = COALESCE(p_note, verification_note),
    verified_at = CASE WHEN p_status = 'verified' THEN v_now ELSE verified_at END,
    verified_by = CASE WHEN p_status = 'verified' THEN v_actor ELSE verified_by END,
    -- Losing verified status also withdraws the row from the outbound feed.
    -- Leaving share_externally on would be a silent no-op today and a leak the
    -- moment the feed's filter changes.
    share_externally = CASE WHEN p_status = 'verified' THEN share_externally ELSE FALSE END,
    updated_at = v_now
  WHERE id = p_employer_id;

  INSERT INTO employer_verification_events (employer_id, from_status, to_status, method, note, actor_id)
  VALUES (p_employer_id, v_from, p_status, p_method, p_note, v_actor);

  -- 186: the owner follows the business, as on the association path.
  v_owner_outcome := sync_employer_owner_verification(p_employer_id, p_status, v_from, 'admin', p_note);

  -- 186: the owner hears about it. 116 sent nothing, so an OECS decision was
  -- invisible to the business until someone looked.
  IF v_owner IS NOT NULL AND p_status IS DISTINCT FROM v_from THEN
    IF p_status = 'verified' THEN
      PERFORM send_notification(
        v_owner,
        'employer_verified',
        'Your business is verified',
        'KTIP has verified your business.'
          || CASE WHEN v_owner_outcome IN ('verified', 'already_verified')
                  THEN ' Your profile now shows the verified badge.' ELSE '' END,
        '/dashboard/verification'
      );
    ELSIF p_status = 'rejected' THEN
      PERFORM send_notification(
        v_owner,
        'employer_verification_result',
        'Business verification not accepted',
        COALESCE(
          NULLIF(trim(p_note), ''),
          'KTIP did not accept this submission. Contact your business association to resolve it before you submit again.'
        ),
        '/dashboard/verification'
      );
    ELSIF p_status = 'revoked' THEN
      PERFORM send_notification(
        v_owner,
        'employer_verification_result',
        'Business verification withdrawn',
        COALESCE(
          NULLIF(trim(p_note), ''),
          'Your business is no longer verified. Contact your business association for details.'
        ),
        '/dashboard/verification'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE, 'from_status', v_from, 'to_status', p_status, 'owner', v_owner_outcome
  );
END;
$$;

REVOKE ALL ON FUNCTION set_employer_verification(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_employer_verification(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION set_employer_verification(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 4. Association path — 125's function
-- ------------------------------------------------------------
-- Changes from 125 are marked "186:". The permission check, the country
-- check, the employers row and the events row are verbatim.
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
  v_owner_outcome TEXT;
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

  -- 186: was an inline UPDATE that set is_verified without verified_via and
  -- raised verification_on_hold for a held owner, failing the whole decision.
  v_owner_outcome := sync_employer_owner_verification(p_employer, p_status, v_from, 'association', p_note);

  -- 186: "business association" wording, and links to the merged page.
  IF p_status = 'verified' AND v_owner IS NOT NULL THEN
    PERFORM send_notification(
      v_owner,
      'employer_verified',
      'Your business is verified',
      'Your business association has verified your business.'
        || CASE WHEN v_owner_outcome IN ('verified', 'already_verified')
                THEN ' Your profile now shows the verified badge.' ELSE '' END,
      '/dashboard/verification'
    );
  ELSIF p_status = 'rejected' AND v_owner IS NOT NULL THEN
    PERFORM send_notification(
      v_owner,
      'employer_verification_result',
      'Business verification not accepted',
      COALESCE(
        p_note,
        'Your business association did not accept this submission. Contact them to resolve it before you submit again.'
      ),
      '/dashboard/verification'
    );
  ELSIF p_status = 'revoked' AND v_owner IS NOT NULL THEN
    PERFORM send_notification(
      v_owner,
      'employer_verification_result',
      'Business verification withdrawn',
      COALESCE(
        p_note,
        'Your business is no longer verified. Contact your business association for details.'
      ),
      '/dashboard/verification'
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'status', p_status, 'owner', v_owner_outcome);
END;
$$;

REVOKE ALL ON FUNCTION set_employer_verification_by_chamber(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_employer_verification_by_chamber(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 5. Backfill: owners verified by an association before 186
-- ------------------------------------------------------------
-- 125 set is_verified and nothing else, so these read as "verified, reason
-- unknown". Runs with no auth.uid(), so the provenance guards let it through;
-- 174's trigger logs each as track_changed.
SELECT set_config('ktip.verification_evidence', '{"backfill":true,"migration":186}', TRUE);
UPDATE profiles p
SET verified_via = 'association',
    verified_at = COALESCE(p.verified_at, now())
WHERE COALESCE(p.is_verified, FALSE)
  AND p.verified_via IS NULL
  AND EXISTS (
    SELECT 1 FROM employers e
    WHERE e.created_by = p.id AND e.verification_status = 'verified'
  );
SELECT set_config('ktip.verification_evidence', '', TRUE);

-- ------------------------------------------------------------
-- 6. The queue, across every country
-- ------------------------------------------------------------
-- OECS staff (employer:manage, verification:review or moderation:view) see
-- every country. An association reviewer (sme:verify alone) sees the
-- countries chamber_countries() gives them, which is what RLS on employers
-- already shows them. Anyone else is refused.
--
-- assigned_* is the association for the business's country: the first
-- verified chamber-kind institution there, by name. reviewer_count is how many
-- approved admins or educators it has; zero means nobody can act on the queue
-- yet, which the admin page shows as "no reviewer".
--
-- waiting_days counts from the latest move to pending, or from registration
-- when there is none (a business's own submission writes no event).
CREATE OR REPLACE FUNCTION association_review_queue(
  p_status TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  legal_name TEXT,
  trading_name TEXT,
  industry TEXT,
  description TEXT,
  website_url TEXT,
  country_code TEXT,
  country_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  registration_number TEXT,
  verification_status TEXT,
  verification_method TEXT,
  verification_note TEXT,
  verified_at TIMESTAMPTZ,
  created_by UUID,
  owner_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  waiting_days INT,
  assigned_institution_id UUID,
  assigned_institution_name TEXT,
  reviewer_count INT,
  reviewed_by_institution_name TEXT,
  chamber_reviewed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_all BOOLEAN;
  v_countries TEXT[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_all := has_permission(v_actor, 'employer:manage')
        OR has_permission(v_actor, 'verification:review')
        OR has_permission(v_actor, 'moderation:view');

  IF NOT v_all THEN
    IF NOT has_permission(v_actor, 'sme:verify') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    v_countries := chamber_countries(v_actor);
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.slug,
    e.legal_name,
    e.trading_name,
    e.industry,
    e.description,
    e.website_url,
    e.country_code::TEXT,
    c.name::TEXT,
    e.contact_email,
    e.contact_phone,
    e.registration_number,
    e.verification_status,
    e.verification_method,
    e.verification_note,
    e.verified_at,
    e.created_by,
    op.display_name::TEXT,
    e.created_at,
    e.updated_at,
    sub.submitted_at,
    CASE WHEN e.verification_status = 'pending'
         THEN GREATEST(0, floor(EXTRACT(EPOCH FROM (now() - sub.submitted_at)) / 86400))::INT
    END,
    assoc.id,
    assoc.name,
    COALESCE(assoc.reviewers, 0)::INT,
    reviewed.name,
    e.chamber_reviewed_at
  FROM employers e
  LEFT JOIN countries c ON c.code = e.country_code
  LEFT JOIN profiles op ON op.id = e.created_by
  LEFT JOIN institutions reviewed ON reviewed.id = e.chamber_institution_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      (SELECT max(ev.created_at) FROM employer_verification_events ev
        WHERE ev.employer_id = e.id AND ev.to_status = 'pending'),
      e.created_at
    ) AS submitted_at
  ) sub ON TRUE
  LEFT JOIN LATERAL (
    SELECT i.id, i.name,
      (SELECT count(*) FROM institution_members im
        WHERE im.institution_id = i.id
          AND im.status = 'approved'
          AND im.role IN ('admin', 'educator')) AS reviewers
    FROM institutions i
    WHERE i.kind = 'chamber'
      AND i.status = 'verified'
      AND i.country_code = e.country_code
    ORDER BY i.name
    LIMIT 1
  ) assoc ON TRUE
  WHERE (p_status IS NULL OR p_status = '' OR e.verification_status = p_status)
    AND (p_country IS NULL OR p_country = '' OR e.country_code = upper(p_country))
    AND (v_all OR e.country_code = ANY(v_countries))
  ORDER BY
    (e.verification_status = 'pending') DESC,
    CASE WHEN e.verification_status = 'pending' THEN sub.submitted_at END ASC,
    e.updated_at DESC
  LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION association_review_queue(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION association_review_queue(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION association_review_queue(TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 7. Linking an account to an association
-- ------------------------------------------------------------
-- The approval half is grant_institution_membership() (145), the same code
-- review_institution_member() uses: it approves the row, grants chamber_admin
-- for a chamber-kind institution, and marks the account verified ('institution').
--
-- An account under a verification hold (174) can only be linked by a reviewer,
-- because granting the membership also verifies it.
CREATE OR REPLACE FUNCTION add_association_admin(p_institution UUID, p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_kind TEXT;
  v_status TEXT;
  v_member UUID;
  v_hold TIMESTAMPTZ;
  v_verified BOOLEAN;
  v_result JSONB;
BEGIN
  IF v_actor IS NULL OR NOT has_permission(v_actor, 'institution:verify') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  SELECT i.kind, i.status INTO v_kind, v_status
  FROM institutions i WHERE i.id = p_institution;

  IF v_kind IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;
  IF v_kind <> 'chamber' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_association');
  END IF;
  IF v_status <> 'verified' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_verified');
  END IF;

  SELECT COALESCE(p.is_verified, FALSE), p.verification_hold_at INTO v_verified, v_hold
  FROM profiles p WHERE p.id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'user_not_found');
  END IF;

  IF NOT v_verified AND v_hold IS NOT NULL AND NOT has_permission(v_actor, 'verification:review') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'on_hold');
  END IF;

  INSERT INTO institution_members (institution_id, user_id, role, status)
  VALUES (p_institution, p_user, 'admin', 'pending')
  ON CONFLICT (institution_id, user_id) DO UPDATE SET role = 'admin'
  RETURNING institution_members.id INTO v_member;

  v_result := grant_institution_membership(v_member, v_actor, 'institution');
  RETURN v_result || jsonb_build_object('member_id', v_member);
END;
$$;

REVOKE ALL ON FUNCTION add_association_admin(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION add_association_admin(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION add_association_admin(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verification
--
--   -- the new track is accepted
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'profiles_verified_via_check';            -- includes 'association'
--
--   -- as an admin: link test.chamber-admin to the LC association
--   SELECT add_association_admin('<ktip-test-chamber id>', '<chamber-admin id>');  -- ok:true
--   SELECT chamber_countries('<chamber-admin id>');           -- {LC}
--
--   -- as an admin: every country, oldest pending first
--   SELECT legal_name, country_code, waiting_days, assigned_institution_name
--     FROM association_review_queue('pending');
--
--   -- as the association: LC only
--   SELECT DISTINCT country_code FROM association_review_queue();   -- LC
--
--   -- verifying marks the owner, with provenance
--   SELECT set_employer_verification_by_chamber('<employer>', 'verified', 'C-123', NULL);
--   SELECT is_verified, verified_via FROM profiles WHERE id = '<owner>';   -- t, association
--   SELECT event, via, evidence->>'label' FROM verification_events
--    WHERE user_id = '<owner>' ORDER BY created_at DESC LIMIT 1;    -- granted, association, <name>
--
--   -- revoking takes the badge back
--   SELECT set_employer_verification('<employer>', 'revoked', NULL, 'Registry shows it dissolved');
--   SELECT is_verified, verified_via FROM profiles WHERE id = '<owner>';   -- f, NULL
-- ============================================================
