-- Migration 064: Institutions, student safeguarding, Chamber of Commerce
--
-- Three problems this closes, all of them currently wide open:
--
--   1. Anyone can message anyone. conversation_participants lets the creator
--      add any user, and nothing in the messaging policies reads a role. A
--      platform that hosts school-verified minors cannot ship that.
--   2. Anyone can submit a grant application. The gate is
--      WITH CHECK (auth.uid() = user_id) and nothing else, so a student can
--      apply for and be awarded funding with no institutional sponsor.
--   3. "Student" and "SME" are unverified self-declared strings. There is no
--      record of which school owns dsc.edu.dm, and no country-level authority
--      that vets a business.
--
-- Institutions are one table for schools, universities, TVETs and chambers:
-- they differ only in what their membership means, and a chamber's country is
-- the same column as a school's country. institution_members therefore doubles
-- as the chamber-admin mapping.
--
-- Employers are NOT rebuilt. 058 already models a verified company with an
-- append-only verification event log; the chamber is a second review authority
-- writing into the same tables, not a parallel universe.
--
-- Note on enforcement points: `messages` is in the supabase_realtime
-- publication, so a rule applied after insert has already reached the
-- recipient's socket. All messaging rules here are WITH CHECK predicates.
--
-- Idempotent — safe to re-run. Requires 063.

-- ============================================================
-- 1. Institutions
-- ============================================================

CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('school', 'university', 'tvet', 'chamber')),
  country_code CHAR(2) NOT NULL REFERENCES countries(code),
  -- Domains this institution owns. A student email must match one of these
  -- AND the institution must be verified before the student role is granted.
  email_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  contact_email TEXT CHECK (contact_email IS NULL OR contact_email = lower(contact_email)),
  website_url TEXT,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  review_note TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Same rule as employers_verified_has_evidence (058): a verified record must
  -- name who verified it and when.
  CONSTRAINT institutions_verified_has_evidence CHECK (
    status <> 'verified' OR (verified_at IS NOT NULL AND verified_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_institutions_country ON institutions(country_code);
CREATE INDEX IF NOT EXISTS idx_institutions_kind_status ON institutions(kind, status);
CREATE INDEX IF NOT EXISTS idx_institutions_domains ON institutions USING GIN (email_domains);

CREATE TABLE IF NOT EXISTS institution_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'educator', 'student')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_institution_members_user ON institution_members(user_id);
CREATE INDEX IF NOT EXISTS idx_institution_members_pending
  ON institution_members(institution_id) WHERE status = 'pending';

-- Minor-safety record. Only the birth YEAR is stored: enough to decide minor
-- status for COPPA/GDPR handling, without holding a full date of birth for a
-- child. is_minor is derived, so it cannot drift from the year it came from.
CREATE TABLE IF NOT EXISTS student_safeguarding (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  verified_domain TEXT,
  sponsor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  birth_year INTEGER CHECK (birth_year IS NULL OR (birth_year > 1900 AND birth_year <= EXTRACT(YEAR FROM now()))),
  guardian_consent_at TIMESTAMPTZ,
  guardian_consent_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Not a GENERATED column: the expression depends on the current year, and
-- generated columns must be immutable. Maintained on write instead, and
-- recomputed whenever the row is touched.
ALTER TABLE student_safeguarding ADD COLUMN IF NOT EXISTS is_minor BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION derive_student_minor_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_minor := NEW.birth_year IS NOT NULL
    AND (EXTRACT(YEAR FROM now())::INTEGER - NEW.birth_year) < 18;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS derive_student_minor_status_trigger ON student_safeguarding;
CREATE TRIGGER derive_student_minor_status_trigger
  BEFORE INSERT OR UPDATE ON student_safeguarding
  FOR EACH ROW
  EXECUTE FUNCTION derive_student_minor_status();

-- ============================================================
-- 2. Institution membership helpers
-- ============================================================

CREATE OR REPLACE FUNCTION is_institution_admin(p_institution UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM institution_members im
    WHERE im.institution_id = p_institution
      AND im.user_id = p_user
      AND im.status = 'approved'
      AND im.role IN ('admin', 'educator')
  );
$$;

-- A chamber admin's authority is bounded by the country of the chamber they
-- belong to. Returns the set of ISO codes this user may act on.
CREATE OR REPLACE FUNCTION chamber_countries(p_user UUID)
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT i.country_code
    FROM institution_members im
    JOIN institutions i ON i.id = im.institution_id
    WHERE im.user_id = p_user
      AND im.status = 'approved'
      AND im.role IN ('admin', 'educator')
      AND i.kind = 'chamber'
      AND i.status = 'verified'
  ), ARRAY[]::TEXT[]);
$$;

-- Self-serve: a user asks to be recognised as a student of the institution
-- that owns their email domain. Grants nothing on its own — an educator still
-- has to approve, which is what actually assigns the student role.
CREATE OR REPLACE FUNCTION request_student_verification()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_email TEXT;
  v_domain TEXT;
  v_institution UUID;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_user;
  IF v_email IS NULL OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_email');
  END IF;

  v_domain := split_part(v_email, '@', 2);

  SELECT i.id INTO v_institution
  FROM institutions i
  WHERE i.status = 'verified'
    AND i.kind <> 'chamber'
    AND v_domain = ANY(i.email_domains)
  LIMIT 1;

  IF v_institution IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'domain_not_recognised', 'domain', v_domain);
  END IF;

  INSERT INTO institution_members (institution_id, user_id, role, status)
  VALUES (v_institution, v_user, 'student', 'pending')
  ON CONFLICT (institution_id, user_id) DO UPDATE
    SET status = CASE WHEN institution_members.status = 'rejected' THEN 'pending' ELSE institution_members.status END;

  INSERT INTO student_safeguarding (user_id, institution_id, verified_domain)
  VALUES (v_user, v_institution, v_domain)
  ON CONFLICT (user_id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        verified_domain = EXCLUDED.verified_domain,
        updated_at = now();

  RETURN jsonb_build_object('ok', TRUE, 'institution_id', v_institution, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION request_student_verification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_student_verification() TO authenticated;

-- Educator approval. This is the only path that grants the student role, which
-- is why it opts into the profile guard bypass from 063 rather than the caller
-- being able to write profiles.roles directly.
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
BEGIN
  SELECT im.institution_id, im.user_id, COALESCE(p_role, im.role), i.kind
    INTO v_institution, v_user, v_role, v_kind
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
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'granted_role', v_grant);
END;
$$;

REVOKE ALL ON FUNCTION review_institution_member(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_institution_member(UUID, BOOLEAN, TEXT) TO authenticated;

-- ============================================================
-- 3. Chamber of Commerce SME verification
-- ============================================================

ALTER TABLE employers ADD COLUMN IF NOT EXISTS chamber_institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;
ALTER TABLE employers ADD COLUMN IF NOT EXISTS chamber_reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE employers ADD COLUMN IF NOT EXISTS chamber_reviewed_at TIMESTAMPTZ;

-- 058 fixed the method vocabulary before chambers existed.
ALTER TABLE employers DROP CONSTRAINT IF EXISTS employers_verification_method_check;
ALTER TABLE employers ADD CONSTRAINT employers_verification_method_check
  CHECK (verification_method IS NULL OR verification_method IN (
    'document_review', 'registry_lookup', 'manual_attestation', 'chamber_attestation'
  ));

-- Mirrors set_employer_verification (058) but scoped: the caller must be an
-- approved admin of a verified chamber in the SAME country as the employer.
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
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION set_employer_verification_by_chamber(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_employer_verification_by_chamber(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- 058 let only platform admins create an employer, because there was no
-- reviewer other than the Secretariat. Chambers are that reviewer, so a
-- business can now register itself — unverified, and unable to edit itself
-- afterwards (058 deliberately has no member-facing UPDATE policy, and that
-- stays true: an employer that could edit its own row post-verification would
-- put attacker-controlled data behind a verified badge).
DROP POLICY IF EXISTS "Businesses can register themselves" ON employers;
CREATE POLICY "Businesses can register themselves"
  ON employers FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND verification_status = 'pending'
    AND verified_at IS NULL
    AND verified_by IS NULL
  );

DROP POLICY IF EXISTS "Registrants and chambers can view employers" ON employers;
CREATE POLICY "Registrants and chambers can view employers"
  ON employers FOR SELECT
  USING (
    created_by = auth.uid()
    OR (has_permission(auth.uid(), 'sme:verify') AND country_code = ANY(chamber_countries(auth.uid())))
  );

DROP POLICY IF EXISTS "Chambers can view verification events" ON employer_verification_events;
CREATE POLICY "Chambers can view verification events"
  ON employer_verification_events FOR SELECT
  USING (
    has_permission(auth.uid(), 'sme:verify')
    AND EXISTS (
      SELECT 1 FROM employers e
      WHERE e.id = employer_verification_events.employer_id
        AND e.country_code = ANY(chamber_countries(auth.uid()))
    )
  );

-- ============================================================
-- 4. Messaging safeguards
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_supervised BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION conversation_has_student(p_conversation UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants cp
    JOIN profiles p ON p.id = cp.user_id
    WHERE cp.conversation_id = p_conversation AND 'student' = ANY(p.roles)
  );
$$;

CREATE OR REPLACE FUNCTION conversation_has_supervisor(p_conversation UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = p_conversation
      AND has_permission(cp.user_id, 'dm:supervise')
  );
$$;

-- The rule: a thread containing a student must be a group thread with at
-- least one designated educator in it. That makes unmonitored 1-on-1 contact
-- between an adult and a minor unrepresentable rather than merely discouraged.
CREATE OR REPLACE FUNCTION can_message(p_sender UUID, p_conversation UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_group BOOLEAN;
BEGIN
  IF p_sender IS NULL OR p_conversation IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT is_conversation_participant(p_conversation, p_sender) THEN
    RETURN FALSE;
  END IF;

  IF NOT has_permission(p_sender, 'dm:receive') THEN
    RETURN FALSE;
  END IF;

  IF NOT conversation_has_student(p_conversation) THEN
    RETURN TRUE;
  END IF;

  SELECT c.is_group INTO v_is_group FROM conversations c WHERE c.id = p_conversation;

  RETURN COALESCE(v_is_group, FALSE) AND conversation_has_supervisor(p_conversation);
END;
$$;

-- Keeps conversations.is_supervised in step with who is actually in the room,
-- so the UI can label a channel without recomputing the predicate per render.
CREATE OR REPLACE FUNCTION refresh_conversation_supervision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation UUID := COALESCE(NEW.conversation_id, OLD.conversation_id);
BEGIN
  UPDATE conversations
  SET is_supervised = conversation_has_supervisor(v_conversation),
      updated_at = now()
  WHERE id = v_conversation;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS refresh_conversation_supervision_trigger ON conversation_participants;
CREATE TRIGGER refresh_conversation_supervision_trigger
  AFTER INSERT OR DELETE ON conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION refresh_conversation_supervision();

DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND has_permission(auth.uid(), 'dm:initiate')
  );

-- Blocks a 1-to-1 thread from ever containing a student, in either insert
-- order: the student cannot be added to a direct thread, and nobody can be
-- added to a direct thread that already holds one.
DROP POLICY IF EXISTS "Authenticated users can add participants" ON conversation_participants;
CREATE POLICY "Authenticated users can add participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    (
      user_id = auth.uid()
      OR is_conversation_creator(conversation_id, auth.uid())
      OR is_conversation_admin(conversation_id, auth.uid())
    )
    AND (
      EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.is_group)
      OR (
        NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = conversation_participants.user_id AND 'student' = ANY(p.roles))
        AND NOT conversation_has_student(conversation_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can send messages to own conversations" ON messages;
CREATE POLICY "Users can send messages to own conversations"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND can_message(auth.uid(), conversation_id)
  );

-- ============================================================
-- 5. Grant application safeguards
-- ============================================================

ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS sponsor_approved_at TIMESTAMPTZ;
ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS sponsor_note TEXT;

CREATE INDEX IF NOT EXISTS idx_grant_applications_sponsor
  ON grant_applications(sponsor_id) WHERE sponsor_id IS NOT NULL;

-- Drafting is allowed to anyone who can see grants, so a student can prepare
-- an application; only leaving 'draft' requires the right to apply. Students
-- never hold grant:apply (063 denies it in has_permission), so for them the
-- only route out of draft is an accepted faculty sponsor.
CREATE OR REPLACE FUNCTION enforce_grant_application_sponsor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_student BOOLEAN;
BEGIN
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT 'student' = ANY(p.roles) INTO v_is_student FROM profiles p WHERE p.id = NEW.user_id;

  IF COALESCE(v_is_student, FALSE) THEN
    IF NEW.sponsor_id IS NULL THEN
      RAISE EXCEPTION 'a student application requires a faculty or school sponsor';
    END IF;
    IF NEW.sponsor_approved_at IS NULL THEN
      RAISE EXCEPTION 'the nominated sponsor has not accepted this application yet';
    END IF;
    IF NOT has_permission(NEW.sponsor_id, 'grant:sponsor') THEN
      RAISE EXCEPTION 'the nominated sponsor is not permitted to sponsor applications';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT has_permission(NEW.user_id, 'grant:apply') THEN
    RAISE EXCEPTION 'this account is not permitted to submit grant applications';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_grant_application_sponsor_trigger ON grant_applications;
CREATE TRIGGER enforce_grant_application_sponsor_trigger
  BEFORE INSERT OR UPDATE ON grant_applications
  FOR EACH ROW
  EXECUTE FUNCTION enforce_grant_application_sponsor();

DROP POLICY IF EXISTS "Users can create applications" ON grant_applications;
CREATE POLICY "Users can create applications"
  ON grant_applications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      has_permission(auth.uid(), 'grant:apply')
      OR (status = 'draft' AND has_permission(auth.uid(), 'grant:view'))
    )
  );

DROP POLICY IF EXISTS "Users can update their own applications" ON grant_applications;
CREATE POLICY "Users can update their own applications"
  ON grant_applications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      has_permission(auth.uid(), 'grant:apply')
      OR status = 'draft'
      OR sponsor_approved_at IS NOT NULL
    )
  );

-- The sponsor's side of the handshake. A student nominates; the sponsor
-- accepts here. Without this the student could name any faculty member and
-- submit in their name.
CREATE OR REPLACE FUNCTION review_grant_sponsorship(
  p_application UUID,
  p_accept BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_sponsor UUID;
  v_applicant UUID;
BEGIN
  SELECT ga.sponsor_id, ga.user_id INTO v_sponsor, v_applicant
  FROM grant_applications ga WHERE ga.id = p_application;

  IF v_sponsor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF v_sponsor <> v_actor OR NOT has_permission(v_actor, 'grant:sponsor') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  UPDATE grant_applications
  SET sponsor_approved_at = CASE WHEN p_accept THEN now() ELSE NULL END,
      sponsor_id = CASE WHEN p_accept THEN sponsor_id ELSE NULL END,
      sponsor_note = p_note,
      updated_at = now()
  WHERE id = p_application;

  PERFORM send_notification(
    v_applicant,
    'grant_sponsorship',
    CASE WHEN p_accept THEN 'Sponsor accepted' ELSE 'Sponsor declined' END,
    COALESCE(p_note, CASE WHEN p_accept
      THEN 'Your sponsor accepted. You can now submit this application.'
      ELSE 'Your nominated sponsor declined this application.' END),
    '/grants/my-applications'
  );

  RETURN jsonb_build_object('ok', TRUE, 'accepted', p_accept);
END;
$$;

REVOKE ALL ON FUNCTION review_grant_sponsorship(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_grant_sponsorship(UUID, BOOLEAN, TEXT) TO authenticated;

-- A sponsor has to be able to read what they are being asked to vouch for.
DROP POLICY IF EXISTS "Sponsors can view applications naming them" ON grant_applications;
CREATE POLICY "Sponsors can view applications naming them"
  ON grant_applications FOR SELECT
  USING (sponsor_id = auth.uid());

-- ============================================================
-- 6. Permission gates on content creation
-- ============================================================

-- has_permission() already returns FALSE for a suspended account, so these
-- double as the suspension gate.

DROP POLICY IF EXISTS "Authenticated users can create posts" ON forum_posts;
CREATE POLICY "Authenticated users can create posts"
  ON forum_posts FOR INSERT
  WITH CHECK (auth.uid() = author_id AND has_permission(auth.uid(), 'forum:post'));

DROP POLICY IF EXISTS "Authenticated users can create replies" ON forum_replies;
CREATE POLICY "Authenticated users can create replies"
  ON forum_replies FOR INSERT
  WITH CHECK (auth.uid() = author_id AND has_permission(auth.uid(), 'forum:comment'));

DROP POLICY IF EXISTS "Authenticated users can comment" ON project_comments;
CREATE POLICY "Authenticated users can comment"
  ON project_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND has_permission(auth.uid(), 'forum:comment')
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE id = project_id
      AND (is_public = TRUE OR owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create projects" ON projects;
CREATE POLICY "Authenticated users can create projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id AND has_permission(auth.uid(), 'project:create'));

-- 003 left grants writable by ANY authenticated user, including UPDATE and
-- DELETE of rows they did not create, with a comment deferring the fix. The
-- grant:post permission is that fix.
DROP POLICY IF EXISTS "Authenticated users can create grants" ON grants;
CREATE POLICY "Authenticated users can create grants"
  ON grants FOR INSERT
  WITH CHECK (has_permission(auth.uid(), 'grant:post'));

DROP POLICY IF EXISTS "Users can update grants they created" ON grants;
CREATE POLICY "Users can update grants they created"
  ON grants FOR UPDATE
  USING (has_permission(auth.uid(), 'grant:post'));

DROP POLICY IF EXISTS "Users can delete grants they created" ON grants;
CREATE POLICY "Users can delete grants they created"
  ON grants FOR DELETE
  USING (has_permission(auth.uid(), 'grant:post'));

-- ============================================================
-- 7. RLS
-- ============================================================

ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_safeguarding ENABLE ROW LEVEL SECURITY;

-- Verified institutions are public: the signup screen has to tell a student
-- whether their school is recognised before they try.
DROP POLICY IF EXISTS "Verified institutions are public" ON institutions;
CREATE POLICY "Verified institutions are public"
  ON institutions FOR SELECT
  USING (
    status = 'verified'
    OR created_by = auth.uid()
    OR has_permission(auth.uid(), 'institution:verify')
  );

DROP POLICY IF EXISTS "Authenticated users can register an institution" ON institutions;
CREATE POLICY "Authenticated users can register an institution"
  ON institutions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Institution verifiers can review" ON institutions;
CREATE POLICY "Institution verifiers can review"
  ON institutions FOR UPDATE
  USING (has_permission(auth.uid(), 'institution:verify') OR is_institution_admin(id, auth.uid()))
  WITH CHECK (has_permission(auth.uid(), 'institution:verify') OR is_institution_admin(id, auth.uid()));

DROP POLICY IF EXISTS "Members can view their institution roster" ON institution_members;
CREATE POLICY "Members can view their institution roster"
  ON institution_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_institution_admin(institution_id, auth.uid())
    OR has_permission(auth.uid(), 'institution:verify')
  );

DROP POLICY IF EXISTS "Users can request membership" ON institution_members;
CREATE POLICY "Users can request membership"
  ON institution_members FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Institution admins can manage the roster" ON institution_members;
CREATE POLICY "Institution admins can manage the roster"
  ON institution_members FOR UPDATE
  USING (is_institution_admin(institution_id, auth.uid()) OR has_permission(auth.uid(), 'institution:verify'));

-- Safeguarding records describe a minor. Readable by the student, their
-- institution's staff, and safety admins — nobody else, including other
-- platform admins without the moderation permission.
DROP POLICY IF EXISTS "Safeguarding records are restricted" ON student_safeguarding;
CREATE POLICY "Safeguarding records are restricted"
  ON student_safeguarding FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_institution_admin(institution_id, auth.uid())
    OR has_permission(auth.uid(), 'moderation:view')
  );

DROP POLICY IF EXISTS "Students can maintain their own safeguarding record" ON student_safeguarding;
CREATE POLICY "Students can maintain their own safeguarding record"
  ON student_safeguarding FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
