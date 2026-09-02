-- ============================================================
-- Migration 125: Role catalogue consolidation
--
-- Three changes to the role catalogue, plus the path that lets an
-- organisation ask for its role at signup.
--
--   1. 'sme' is deleted. "Verified SME" was a role standing in for a fact
--      about an account rather than a set of things it may do: its column
--      was entrepreneur's. Holders become entrepreneurs with is_verified
--      set, and chamber verification now sets that flag instead of granting
--      a role.
--
--   2. 'bso' is merged into 'chamber_admin', relabelled
--      "Chamber of Commerce / BSO". Both vetted local businesses; two slugs
--      for one duty split the verifier list and nothing else. The merged
--      column is the union, so a migrated BSO keeps project:create,
--      event:create, grant:apply and mentorship:offer.
--
--      Note what a migrated BSO does NOT get: chamber_countries() (064)
--      derives from institution_members of a kind='chamber' institution, so
--      the role carries sme:verify but every call returns wrong_country
--      until an administrator attaches the organisation to a chamber
--      institution. That is the intended shape — the permission says what
--      the role may do, the institution says where.
--
--   3. 'educational_partner' is relabelled "Post-Secondary Institution".
--      Label only. The slug is load-bearing in roughly 290 places across
--      RLS policies and review_institution_member(), and renaming it would
--      buy nothing a label does not.
--
-- Plus: verification_requests.requested_role, so an organisation-tier role
-- can be asked for at onboarding and granted on review, and
-- review_verification_request() to do that grant atomically.
--
-- Requires 063, 098, 110, 116, 124. Restates default_role_permissions() and
-- set_employer_verification_by_chamber() in full — the newest definition of
-- each is the one that runs. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Move the holders before the slugs disappear
--
-- The bypass is what lets a role write through
-- guard_profile_privileged_columns (063/124). auth.uid() is NULL when this
-- file is run from the SQL editor, which already exits the guard early, but
-- the bypass is set anyway so the file behaves the same run from anywhere.
-- ------------------------------------------------------------

SELECT set_config('ktip.bypass_profile_guard', 'on', TRUE);

UPDATE profiles
SET roles = ARRAY(SELECT DISTINCT unnest(array_replace(roles, 'sme', 'entrepreneur'))),
    is_verified = TRUE,
    active_role = CASE WHEN active_role = 'sme' THEN 'entrepreneur' ELSE active_role END,
    updated_at = now()
WHERE 'sme' = ANY(roles);

UPDATE profiles
SET roles = ARRAY(SELECT DISTINCT unnest(array_replace(roles, 'bso', 'chamber_admin'))),
    active_role = CASE WHEN active_role = 'bso' THEN 'chamber_admin' ELSE active_role END,
    updated_at = now()
WHERE 'bso' = ANY(roles);

SELECT set_config('ktip.bypass_profile_guard', 'off', TRUE);

-- ------------------------------------------------------------
-- 2. Drop the two slugs
--
-- role_permissions has an FK to role_definitions(slug), so its rows go
-- first. role_permission_events has no FK and keeps its history: an audit
-- trail that forgets the roles it was about is not an audit trail.
-- ------------------------------------------------------------

DELETE FROM role_permissions WHERE role_slug IN ('sme', 'bso');
DELETE FROM role_definitions WHERE slug IN ('sme', 'bso');

-- ------------------------------------------------------------
-- 3. Relabel what is left
-- ------------------------------------------------------------

INSERT INTO role_definitions (slug, label, tier, description, is_self_assignable, requires_verification, alias_of, sort_order) VALUES
  ('private_sector', 'Private Sector', 'organization', 'Business account. A Chamber of Commerce can verify the business, which marks the owner verified.', TRUE, FALSE, NULL, 50),
  ('educational_partner', 'Post-Secondary Institution', 'organization', 'College, university or other post-secondary institution. Manages domain verification, approves student accounts, oversees submissions.', FALSE, TRUE, NULL, 60),
  ('chamber_admin', 'Chamber of Commerce / BSO', 'organization', 'Chamber of Commerce or business support organisation — incubator, accelerator or MSME agency — that verifies local businesses and supports the cohort it works with.', FALSE, TRUE, NULL, 70)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  tier = EXCLUDED.tier,
  description = EXCLUDED.description,
  is_self_assignable = EXCLUDED.is_self_assignable,
  requires_verification = EXCLUDED.requires_verification,
  alias_of = EXCLUDED.alias_of,
  sort_order = EXCLUDED.sort_order;

-- ------------------------------------------------------------
-- 4. Default matrix
--
-- 124's body with the sme and bso columns removed and chamber_admin widened
-- to the union. Restated in full rather than as a delta — this one function
-- is what both the seed and "Reset to defaults" read.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION default_role_permissions()
RETURNS TABLE (role_slug TEXT, permission_key TEXT)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  -- Super Admin holds everything, including permissions added later.
  SELECT 'super_admin'::TEXT, pd.key FROM permission_definitions pd
  UNION ALL
  -- Admin holds everything too. The difference between the two seats is not in
  -- this matrix at all — it is the ceiling in section 4 below.
  SELECT 'admin'::TEXT, pd.key FROM permission_definitions pd
  UNION ALL
  SELECT * FROM (VALUES
    -- The two supervisors. Domain keys first, then the ordinary participant
    -- bundle — they are members of the platform as well as administrators of
    -- part of it, and docs/QA-RELAY-SESSION.md needs them to be able to create
    -- a project and apply for a grant like anybody else.
    ('people_supervisor', 'members:view'),
    ('people_supervisor', 'audit:view'),
    ('people_supervisor', 'moderation:view'),
    ('people_supervisor', 'moderation:action'),
    ('people_supervisor', 'moderation:escalate'),
    ('people_supervisor', 'sme:verify'),
    ('people_supervisor', 'institution:verify'),
    ('people_supervisor', 'institution:approve_students'),
    ('people_supervisor', 'verification:review'),
    ('people_supervisor', 'grant:view'),
    ('people_supervisor', 'grant:apply'),
    ('people_supervisor', 'project:create'),
    ('people_supervisor', 'project:manage'),
    ('people_supervisor', 'event:create'),
    ('people_supervisor', 'forum:post'),
    ('people_supervisor', 'forum:comment'),
    ('people_supervisor', 'mentorship:offer'),
    ('people_supervisor', 'dm:initiate'),
    ('people_supervisor', 'dm:receive'),
    ('people_supervisor', 'dm:supervise'),

    -- grant:manage_funds rides with grant:manage: the person deciding an
    -- application is the person recording the award, and splitting those across
    -- two seats would only mean every decision waits on somebody else.
    ('programme_supervisor', 'project:manage_all'),
    ('programme_supervisor', 'grant:manage'),
    ('programme_supervisor', 'grant:post'),
    ('programme_supervisor', 'grant:manage_funds'),
    ('programme_supervisor', 'forum:manage'),
    ('programme_supervisor', 'resource:manage'),
    ('programme_supervisor', 'achievement:manage'),
    ('programme_supervisor', 'employer:manage'),
    ('programme_supervisor', 'grant:view'),
    ('programme_supervisor', 'grant:apply'),
    ('programme_supervisor', 'project:create'),
    ('programme_supervisor', 'project:manage'),
    ('programme_supervisor', 'event:create'),
    ('programme_supervisor', 'forum:post'),
    ('programme_supervisor', 'forum:comment'),
    ('programme_supervisor', 'mentorship:offer'),
    ('programme_supervisor', 'dm:initiate'),
    ('programme_supervisor', 'dm:receive'),

    -- The verification keys are here because a safety admin is the first-line
    -- receipt for every complaint, and a complaint about a body claiming to be
    -- a school or a chamber-verified business is answered by looking at that
    -- claim.
    ('safety_admin', 'audit:view'),
    ('safety_admin', 'moderation:view'),
    ('safety_admin', 'moderation:action'),
    ('safety_admin', 'moderation:escalate'),
    ('safety_admin', 'grant:view'),
    ('safety_admin', 'forum:post'),
    ('safety_admin', 'forum:comment'),
    ('safety_admin', 'dm:initiate'),
    ('safety_admin', 'dm:receive'),
    ('safety_admin', 'dm:supervise'),
    ('safety_admin', 'sme:verify'),
    ('safety_admin', 'institution:verify'),
    ('safety_admin', 'institution:approve_students'),

    ('investor', 'grant:view'),
    ('investor', 'grant:post'),
    ('investor', 'grant:manage_funds'),
    ('investor', 'forum:post'),
    ('investor', 'forum:comment'),
    ('investor', 'mentorship:offer'),
    ('investor', 'dm:initiate'),
    ('investor', 'dm:receive'),

    ('private_sector', 'grant:view'),
    ('private_sector', 'project:create'),
    ('private_sector', 'project:manage'),
    ('private_sector', 'event:create'),
    ('private_sector', 'forum:post'),
    ('private_sector', 'forum:comment'),
    ('private_sector', 'mentorship:offer'),
    ('private_sector', 'dm:initiate'),
    ('private_sector', 'dm:receive'),

    ('educational_partner', 'institution:approve_students'),
    ('educational_partner', 'grant:view'),
    ('educational_partner', 'grant:apply'),
    ('educational_partner', 'grant:sponsor'),
    ('educational_partner', 'project:create'),
    ('educational_partner', 'project:manage'),
    ('educational_partner', 'event:create'),
    ('educational_partner', 'forum:post'),
    ('educational_partner', 'forum:comment'),
    ('educational_partner', 'dm:initiate'),
    ('educational_partner', 'dm:receive'),
    ('educational_partner', 'dm:supervise'),

    -- Chamber of Commerce / BSO. One column since 125: the incubator and the
    -- chamber both vet local businesses, and holding two slugs for it split
    -- the verifier list without ever splitting the duty. The union of the two
    -- old sets, so a migrated BSO keeps the projects and events it was running.
    ('chamber_admin', 'sme:verify'),
    ('chamber_admin', 'grant:view'),
    ('chamber_admin', 'grant:apply'),
    ('chamber_admin', 'project:create'),
    ('chamber_admin', 'project:manage'),
    ('chamber_admin', 'event:create'),
    ('chamber_admin', 'forum:post'),
    ('chamber_admin', 'forum:comment'),
    ('chamber_admin', 'mentorship:offer'),
    ('chamber_admin', 'dm:initiate'),
    ('chamber_admin', 'dm:receive'),

    -- Delivery organisations. They run the programme rather than fund it, so
    -- they apply for money and never post it.
    ('ngo', 'grant:view'),
    ('ngo', 'grant:apply'),
    ('ngo', 'project:create'),
    ('ngo', 'project:manage'),
    ('ngo', 'event:create'),
    ('ngo', 'forum:post'),
    ('ngo', 'forum:comment'),
    ('ngo', 'mentorship:offer'),
    ('ngo', 'dm:initiate'),
    ('ngo', 'dm:receive'),

    -- educational_partner's set. A research institution takes students on the
    -- same way a university does — under its own domain, sponsoring their
    -- applications and supervising their channels.
    ('research_institution', 'institution:approve_students'),
    ('research_institution', 'grant:view'),
    ('research_institution', 'grant:apply'),
    ('research_institution', 'grant:sponsor'),
    ('research_institution', 'project:create'),
    ('research_institution', 'project:manage'),
    ('research_institution', 'event:create'),
    ('research_institution', 'forum:post'),
    ('research_institution', 'forum:comment'),
    ('research_institution', 'dm:initiate'),
    ('research_institution', 'dm:receive'),
    ('research_institution', 'dm:supervise'),

    -- Funders and programme administrators: investor's grant keys plus the
    -- ability to run projects and events. government verifies both institutions
    -- and businesses because in most member states it is the registry of record.
    ('government', 'grant:view'),
    ('government', 'grant:post'),
    ('government', 'grant:manage_funds'),
    ('government', 'project:create'),
    ('government', 'project:manage'),
    ('government', 'event:create'),
    ('government', 'forum:post'),
    ('government', 'forum:comment'),
    ('government', 'sme:verify'),
    ('government', 'institution:verify'),
    ('government', 'dm:initiate'),
    ('government', 'dm:receive'),

    ('diaspora', 'grant:view'),
    ('diaspora', 'grant:post'),
    ('diaspora', 'grant:manage_funds'),
    ('diaspora', 'project:create'),
    ('diaspora', 'project:manage'),
    ('diaspora', 'event:create'),
    ('diaspora', 'forum:post'),
    ('diaspora', 'forum:comment'),
    ('diaspora', 'mentorship:offer'),
    ('diaspora', 'institution:verify'),
    ('diaspora', 'dm:initiate'),
    ('diaspora', 'dm:receive'),

    -- No audit:view. Reading the platform's moderation and permission trails is
    -- an operator's power, and it is the one key that would collapse igo back
    -- into super_admin.
    ('igo', 'grant:view'),
    ('igo', 'grant:post'),
    ('igo', 'grant:manage_funds'),
    ('igo', 'project:create'),
    ('igo', 'project:manage'),
    ('igo', 'event:create'),
    ('igo', 'forum:post'),
    ('igo', 'forum:comment'),
    ('igo', 'mentorship:offer'),
    ('igo', 'institution:verify'),
    ('igo', 'dm:initiate'),
    ('igo', 'dm:receive'),

    ('entrepreneur', 'grant:view'),
    ('entrepreneur', 'grant:apply'),
    ('entrepreneur', 'project:create'),
    ('entrepreneur', 'project:manage'),
    ('entrepreneur', 'event:create'),
    ('entrepreneur', 'forum:post'),
    ('entrepreneur', 'forum:comment'),
    ('entrepreneur', 'mentorship:offer'),
    ('entrepreneur', 'dm:initiate'),
    ('entrepreneur', 'dm:receive'),

    ('faculty', 'institution:approve_students'),
    ('faculty', 'grant:view'),
    ('faculty', 'grant:apply'),
    ('faculty', 'grant:sponsor'),
    ('faculty', 'project:create'),
    ('faculty', 'project:manage'),
    ('faculty', 'event:create'),
    ('faculty', 'forum:post'),
    ('faculty', 'forum:comment'),
    ('faculty', 'mentorship:offer'),
    ('faculty', 'dm:initiate'),
    ('faculty', 'dm:receive'),
    ('faculty', 'dm:supervise'),

    ('researcher', 'grant:view'),
    ('researcher', 'grant:apply'),
    ('researcher', 'project:create'),
    ('researcher', 'project:manage'),
    ('researcher', 'event:create'),
    ('researcher', 'forum:post'),
    ('researcher', 'forum:comment'),
    ('researcher', 'mentorship:offer'),
    ('researcher', 'dm:initiate'),
    ('researcher', 'dm:receive'),

    -- The full grant set. A mentor is frequently the person running a small
    -- fund or a prize alongside the mentoring, and splitting those across two
    -- accounts was the only thing the narrower set achieved.
    ('mentor', 'grant:view'),
    ('mentor', 'grant:apply'),
    ('mentor', 'grant:post'),
    ('mentor', 'grant:manage_funds'),
    ('mentor', 'project:create'),
    ('mentor', 'project:manage'),
    ('mentor', 'event:create'),
    ('mentor', 'forum:post'),
    ('mentor', 'forum:comment'),
    ('mentor', 'mentorship:offer'),
    ('mentor', 'dm:initiate'),
    ('mentor', 'dm:receive'),

    -- Applies for its own funding now. Still receives messages and never
    -- initiates them — see the safeguard block in has_permission().
    ('student', 'grant:view'),
    ('student', 'grant:apply'),
    ('student', 'project:create'),
    ('student', 'project:manage'),
    ('student', 'event:create'),
    ('student', 'forum:post'),
    ('student', 'forum:comment'),
    ('student', 'dm:receive')
  ) AS t(role_slug, permission_key);
$$;

-- ------------------------------------------------------------
-- 5. Move the five new chamber_admin cells
--
-- The seed below is ON CONFLICT DO NOTHING, so it cannot flip a row that
-- already exists as allowed = FALSE. The widened cells are written here
-- instead, and log_role_permission_change records them like any other
-- change. Same reasoning as 110 section 2.
-- ------------------------------------------------------------

UPDATE role_permissions
SET allowed = TRUE, updated_at = now()
WHERE role_slug = 'chamber_admin'
  AND permission_key IN ('grant:apply', 'project:create', 'project:manage', 'event:create', 'mentorship:offer')
  AND allowed = FALSE;

-- ------------------------------------------------------------
-- 6. Seed any cell that does not exist yet
-- ------------------------------------------------------------

INSERT INTO role_permissions (role_slug, permission_key, allowed)
SELECT rd.slug, pd.key,
       EXISTS (
         SELECT 1 FROM default_role_permissions() d
         WHERE d.role_slug = rd.slug AND d.permission_key = pd.key
       )
FROM role_definitions rd
CROSS JOIN permission_definitions pd
WHERE rd.alias_of IS NULL
ON CONFLICT (role_slug, permission_key) DO NOTHING;

-- ------------------------------------------------------------
-- 7. Chamber verification marks the owner verified
--
-- 098's function with one branch changed: no role is granted any more.
-- Everything else — the country check, the events row, the rejected and
-- revoked notifications — is 098 verbatim.
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

  -- A verified company marks its owner verified. Until 125 this granted the
  -- 'sme' role; that slug is gone, and a business account is a private_sector
  -- or entrepreneur account whose claim has been checked, not a fourth kind of
  -- member. is_verified is the badge, and 039's trigger awards it.
  IF p_status = 'verified' AND v_owner IS NOT NULL THEN
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET is_verified = TRUE,
        updated_at = now()
    WHERE id = v_owner AND is_verified IS DISTINCT FROM TRUE;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

    PERFORM send_notification(
      v_owner,
      'employer_verified',
      'Your business is verified',
      'Your National Chamber of Commerce has verified your business. Your profile now carries a verified badge.',
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

-- ------------------------------------------------------------
-- 8. Organisation roles can be requested
--
-- An organisation-tier role is not self-assignable: guard_profile_insert_roles
-- strips it at signup and guard_profile_privileged_columns raises on update.
-- Before 125 that left an NGO with no way to ask for its role at all — the
-- only self-serve path was request_student_verification(), which matches an
-- email domain against a school and has nothing to say about an NGO.
--
-- So the ask rides on verification_requests, which already carries documents,
-- a note, a reviewer and the one-pending-per-user index.
-- ------------------------------------------------------------

ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS requested_role TEXT REFERENCES role_definitions(slug) ON DELETE SET NULL;

COMMENT ON COLUMN verification_requests.requested_role IS
  'Organisation-tier, review-gated role the member asked for at onboarding. NULL for plain identity verification. Granted on approval by review_verification_request().';

-- Only an organisation-tier, review-gated, non-alias role may be requested.
-- Without this the column would be a self-service route to any slug in the
-- catalogue, admin seats included: the request row is written by the member.
CREATE OR REPLACE FUNCTION guard_verification_request_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.requested_role IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM role_definitions rd
    WHERE rd.slug = NEW.requested_role
      AND rd.tier = 'organization'
      AND rd.requires_verification
      AND rd.alias_of IS NULL
  ) THEN
    RAISE EXCEPTION 'role % cannot be requested through verification', NEW.requested_role
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_verification_request_role_trigger ON verification_requests;
CREATE TRIGGER guard_verification_request_role_trigger
  BEFORE INSERT OR UPDATE ON verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION guard_verification_request_role();

-- ------------------------------------------------------------
-- 8b. The queue has to be visible to whoever works it
--
-- 035 wrote these policies before the permission system existed, so both the
-- read and the review test `'oecs' = ANY(roles)` — the legacy Secretariat
-- slug. Nobody is granted 'oecs' any more: it survives as an alias of
-- super_admin for old RLS clauses. The result is a /admin/verification page
-- that renders an empty queue for the People supervisor who owns it, and for
-- any Super Admin created since the alias stopped being handed out.
--
-- With organisation roles now requested through this table, an unreadable
-- queue is a request nobody can answer. Both policies move onto
-- verification:review, which is the same key that puts the page in the admin
-- console. The 'oecs' clause stays alongside it, because an account that still
-- holds the legacy slug is still the Secretariat.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own verification requests" ON verification_requests;
CREATE POLICY "Users can view own verification requests"
  ON verification_requests FOR SELECT
  USING (
    auth.uid() = user_id
    OR has_permission(auth.uid(), 'verification:review')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can review verification requests" ON verification_requests;
CREATE POLICY "Admins can review verification requests"
  ON verification_requests FOR UPDATE
  USING (
    has_permission(auth.uid(), 'verification:review')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- ------------------------------------------------------------
-- 9. Reviewing a request, including the role grant
--
-- Why a function rather than the two table writes the client used to make:
--
--   * set_user_roles() is gated on role:manage, which only the two admin
--     seats hold. The People supervisor owns this queue through
--     verification:review and would be refused.
--   * A direct profiles UPDATE from that supervisor raises in
--     guard_profile_privileged_columns, because an organisation role is not
--     self-assignable. The bypass is the only way through, and the bypass
--     belongs inside a definer function, not in a client's hands.
--   * The request row, the badge and the role are one decision. Three
--     statements from a browser are three chances to land half of it.
-- ------------------------------------------------------------

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

  -- The 124 ceiling, restated: a seat holder's badge and roles are the Super
  -- Admin's business. Without this an Admin could verify a Super Admin, and
  -- the guard would raise inside the definer context rather than answering.
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

-- ------------------------------------------------------------
-- 10. Verify
--
--   SELECT slug, label FROM role_definitions ORDER BY sort_order;
--     -- no 'sme', no 'bso'; chamber_admin reads "Chamber of Commerce / BSO"
--
--   SELECT count(*) FROM role_permissions
--    WHERE role_slug = 'chamber_admin' AND allowed;              -- 11
--
--   SELECT count(*) FROM profiles
--    WHERE 'sme' = ANY(roles) OR 'bso' = ANY(roles);             -- 0
--
--   SELECT polname, polcmd FROM pg_policy
--    WHERE polrelid = 'verification_requests'::regclass;    -- 3 policies
--
--   SELECT count(*) FROM role_definitions rd
--    WHERE rd.alias_of IS NULL
--      AND NOT EXISTS (SELECT 1 FROM role_permissions rp
--                       WHERE rp.role_slug = rd.slug);           -- 0
-- ------------------------------------------------------------
