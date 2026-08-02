-- Migration 090: retire the literal 'oecs' test, and gate event creation
--
-- Two unrelated-looking problems with one root cause: authorization decisions
-- that were written before 063 existed and never moved onto it.
--
-- 1. THE LITERAL 'oecs' TEST
--
-- 063 introduced expand_roles(), which maps the legacy 'oecs' slug ONTO
-- 'super_admin'. It does not map the other way, and it never could — 'oecs' is
-- the narrower, legacy name. That was fine while every admin account carried
-- the old slug, and it is why 063 deliberately left the ~68 inline
-- `'oecs' = ANY(roles)` clauses alone.
--
-- The consequence only shows up on an admin created AFTER 063: an account
-- holding 'super_admin' and not 'oecs' passes every has_permission() check and
-- fails every legacy clause. It can open /admin, and then cannot update an
-- event, delete a project, review a verification request, manage an employer,
-- or write to the event-assets bucket. Worse, an RLS-filtered UPDATE that
-- matches no rows is not an error — PostgREST returns success, so the admin UI
-- reports "saved" and nothing changed.
--
-- Every clause here is replaced with is_platform_admin(), the helper 063
-- already created for exactly this. Note the direction of the change:
--
--     is_platform_admin(u)  ==  'super_admin' = ANY(expand_roles(roles))
--     legacy clause         ==  'oecs'        = ANY(roles)
--
-- and expand_roles() maps oecs -> super_admin, so is_platform_admin() is a
-- strict SUPERSET of what each clause admitted before. This migration can only
-- widen access, never narrow it: no existing admin can lose anything. That
-- property is what makes a rewrite of this size safe to run in one pass.
--
-- 2. EVENT CREATION WAS NEVER GATED
--
-- projects, forum posts, replies, comments and grants all got a permission
-- check in 064. Events did not — the INSERT policy from 002 is still just
-- `auth.uid() = organizer_id`, so any signed-in account can publish a
-- conference or a virtual hackathon. Section 5 adds `event:create` and grants
-- it to exactly the roles that already hold `project:create`.
--
-- Idempotent — safe to re-run. Every policy is dropped by name first, and the
-- matrix seed uses ON CONFLICT DO NOTHING so a re-run never clobbers an admin's
-- edits at /admin/roles.

-- ============================================================
-- 1. The shared helper
--
-- is_oecs_admin() (077) is called from 20 places across 077, 084 and 085.
-- Redefining its body fixes all of them at once, which is why those three
-- migrations need no policy changes below. The name is kept: it is referenced
-- by policies this migration does not otherwise touch, and renaming it would
-- mean rewriting them for no behavioural gain.
-- ============================================================

CREATE OR REPLACE FUNCTION is_oecs_admin(p_user UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_user IS NULL THEN RETURN FALSE; END IF;
  -- Was: 'oecs' = ANY(roles). is_platform_admin() resolves the alias, so a
  -- legacy oecs account still passes and a modern super_admin now does too.
  RETURN is_platform_admin(p_user);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION is_oecs_admin(UUID) IS
  'True when the user is a platform admin. Kept under its 077 name because ~20 policies call it; the body now resolves the oecs -> super_admin alias via is_platform_admin (090).';

REVOKE ALL ON FUNCTION is_oecs_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_oecs_admin(UUID) TO authenticated;

-- ============================================================
-- 2. Functions that inlined the test in their own body
--
-- Three of them. is_venue_host (070) and vc_resolve_user_by_email (068) also
-- contain the literal but already OR it with a capability check, so they admit
-- a modern super_admin today and are left alone.
--
-- Each body below is reproduced verbatim from its current definition with only
-- the admin branch changed, so no other behaviour moves.
-- ============================================================

-- doc_access_role: defined in 048, replaced in 080, replaced again in 085.
-- Only the 085 form is live, so that is the one restated here.
CREATE OR REPLACE FUNCTION doc_access_role(p_document_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_visibility TEXT;
  v_entity_type TEXT;
  v_entity_id UUID;
  v_role TEXT;
BEGIN
  SELECT owner_id, visibility, entity_type, entity_id
    INTO v_owner_id, v_visibility, v_entity_type, v_entity_id
  FROM entity_documents WHERE id = p_document_id;

  IF v_owner_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id = v_owner_id THEN
    RETURN 'owner';
  END IF;

  -- Platform admins administer every document (090: was an inline 'oecs' test)
  IF p_user_id IS NOT NULL AND is_platform_admin(p_user_id) THEN
    RETURN 'owner';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM document_access
    WHERE document_id = p_document_id AND user_id = p_user_id;
    IF v_role IS NOT NULL THEN
      RETURN v_role;
    END IF;
  END IF;

  -- Assessors read what applicants attach — read only, never edit.
  IF v_entity_type = 'grant_application'
     AND p_user_id IS NOT NULL
     AND has_permission(p_user_id, 'org:manage') THEN
    RETURN 'viewer';
  END IF;

  -- Organizers read what entrants attach to their challenge.
  IF v_entity_type = 'event_solution' AND p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM event_solutions s
    JOIN events e ON e.id = s.event_id
    WHERE s.id = v_entity_id AND e.organizer_id = p_user_id
  ) THEN
    RETURN 'viewer';
  END IF;

  IF v_visibility = 'public' THEN
    RETURN 'viewer';
  END IF;

  IF v_visibility = 'members' AND p_user_id IS NOT NULL THEN
    RETURN 'viewer';
  END IF;

  -- 'private' and 'restricted' need an explicit grant
  RETURN NULL;
END;
$$;

-- can_manage_employer (081)
CREATE OR REPLACE FUNCTION can_manage_employer(p_employer_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM employers e WHERE e.id = p_employer_id AND e.created_by = p_user_id)
    OR EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = p_employer_id
        AND m.user_id = p_user_id
        AND m.role IN ('owner', 'admin')
    )
    OR is_platform_admin(p_user_id)
  );
$$;

-- set_employer_verification (058). SECURITY DEFINER, so the check inside the
-- body IS the authorization boundary — this one matters more than most.
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
  v_now TIMESTAMPTZ := now();
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the role check has to be explicit here.
  IF NOT is_platform_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_status NOT IN ('unverified', 'pending', 'verified', 'rejected', 'revoked') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_status');
  END IF;

  IF p_status = 'verified' AND p_method IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'method_required');
  END IF;

  SELECT verification_status INTO v_from FROM employers WHERE id = p_employer_id FOR UPDATE;
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

  RETURN jsonb_build_object('ok', TRUE, 'from_status', v_from, 'to_status', p_status);
END;
$$;

-- ============================================================
-- 3. Policy rewrites
--
-- Grouped by the migration each policy came from, so a reviewer can diff a
-- block here against the original file. Names are preserved exactly: the DROP
-- has to match, and keeping them stable means a re-run of an old migration
-- cannot silently reinstate the legacy predicate under a different name.
-- ============================================================

-- ---------- 007_admin_events_system.sql ----------

DROP POLICY IF EXISTS "Public can view non-draft events" ON events;
CREATE POLICY "Public can view non-draft events"
  ON events FOR SELECT
  USING (
    status IN ('published', 'completed', 'cancelled')
    OR auth.uid() = organizer_id
    OR is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "OECS admins can update any event" ON events;
CREATE POLICY "OECS admins can update any event"
  ON events FOR UPDATE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can delete any event" ON events;
CREATE POLICY "OECS admins can delete any event"
  ON events FOR DELETE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Organizers and admins can update RSVPs" ON event_rsvps;
CREATE POLICY "Organizers and admins can update RSVPs"
  ON event_rsvps FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid())
    OR is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Public can view published event updates" ON event_updates;
CREATE POLICY "Public can view published event updates"
  ON event_updates FOR SELECT
  USING (
    is_published = TRUE
    OR auth.uid() = author_id
    OR is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Organizers and admins can create event updates" ON event_updates;
CREATE POLICY "Organizers and admins can create event updates"
  ON event_updates FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND (
      EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid())
      OR is_platform_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Organizers and admins can update event updates" ON event_updates;
CREATE POLICY "Organizers and admins can update event updates"
  ON event_updates FOR UPDATE
  USING (auth.uid() = author_id OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Organizers and admins can delete event updates" ON event_updates;
CREATE POLICY "Organizers and admins can delete event updates"
  ON event_updates FOR DELETE
  USING (auth.uid() = author_id OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Public can view published event articles" ON event_articles;
CREATE POLICY "Public can view published event articles"
  ON event_articles FOR SELECT
  USING (
    is_published = TRUE
    OR auth.uid() = author_id
    OR is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Organizers and admins can create event articles" ON event_articles;
CREATE POLICY "Organizers and admins can create event articles"
  ON event_articles FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND (
      EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid())
      OR is_platform_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Organizers and admins can update event articles" ON event_articles;
CREATE POLICY "Organizers and admins can update event articles"
  ON event_articles FOR UPDATE
  USING (auth.uid() = author_id OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Organizers and admins can delete event articles" ON event_articles;
CREATE POLICY "Organizers and admins can delete event articles"
  ON event_articles FOR DELETE
  USING (auth.uid() = author_id OR is_platform_admin(auth.uid()));

-- ---------- 009_event_page_sections.sql ----------

DROP POLICY IF EXISTS "OECS admins can manage all event sections" ON event_page_sections;
CREATE POLICY "OECS admins can manage all event sections"
  ON event_page_sections FOR ALL
  USING (is_platform_admin(auth.uid()));

-- ---------- 010_event_schedule_speakers.sql ----------

DROP POLICY IF EXISTS "OECS admins can manage all speakers" ON event_speakers;
CREATE POLICY "OECS admins can manage all speakers"
  ON event_speakers FOR ALL
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can manage all schedules" ON event_schedule;
CREATE POLICY "OECS admins can manage all schedules"
  ON event_schedule FOR ALL
  USING (is_platform_admin(auth.uid()));

-- ---------- 012_admin_dashboard_policies.sql ----------
--
-- The profiles one is the most consequential in this file: it is what
-- /admin/users writes through when an admin changes somebody's roles.

DROP POLICY IF EXISTS "OECS admins can update any profile" ON profiles;
CREATE POLICY "OECS admins can update any profile"
  ON profiles FOR UPDATE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can create grants" ON grants;
CREATE POLICY "OECS admins can create grants"
  ON grants FOR INSERT
  WITH CHECK (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can update grants" ON grants;
CREATE POLICY "OECS admins can update grants"
  ON grants FOR UPDATE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can delete grants" ON grants;
CREATE POLICY "OECS admins can delete grants"
  ON grants FOR DELETE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can view all applications" ON grant_applications;
CREATE POLICY "OECS admins can view all applications"
  ON grant_applications FOR SELECT
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can update any application" ON grant_applications;
CREATE POLICY "OECS admins can update any application"
  ON grant_applications FOR UPDATE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can update any post" ON forum_posts;
CREATE POLICY "OECS admins can update any post"
  ON forum_posts FOR UPDATE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can delete any post" ON forum_posts;
CREATE POLICY "OECS admins can delete any post"
  ON forum_posts FOR DELETE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can delete any reply" ON forum_replies;
CREATE POLICY "OECS admins can delete any reply"
  ON forum_replies FOR DELETE
  USING (is_platform_admin(auth.uid()));

-- ---------- 015_resource_library.sql ----------

DROP POLICY IF EXISTS "OECS admin can manage resources" ON resources;
CREATE POLICY "OECS admin can manage resources"
  ON resources FOR ALL
  USING (is_platform_admin(auth.uid()));

-- ---------- 018_grievances.sql ----------

DROP POLICY IF EXISTS "OECS admin can manage all grievances" ON grievances;
CREATE POLICY "OECS admin can manage all grievances"
  ON grievances FOR ALL
  USING (is_platform_admin(auth.uid()));

-- ---------- 027_storage_buckets.sql ----------

DROP POLICY IF EXISTS "OECS admins can upload event assets" ON storage.objects;
CREATE POLICY "OECS admins can upload event assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'event-assets' AND is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can update event assets" ON storage.objects;
CREATE POLICY "OECS admins can update event assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'event-assets' AND is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can delete event assets" ON storage.objects;
CREATE POLICY "OECS admins can delete event assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'event-assets' AND is_platform_admin(auth.uid()));

-- ---------- 030_admin_projects_policies.sql ----------

DROP POLICY IF EXISTS "OECS admins can view all projects" ON projects;
CREATE POLICY "OECS admins can view all projects"
  ON projects FOR SELECT
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can update any project" ON projects;
CREATE POLICY "OECS admins can update any project"
  ON projects FOR UPDATE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "OECS admins can delete any project" ON projects;
CREATE POLICY "OECS admins can delete any project"
  ON projects FOR DELETE
  USING (is_platform_admin(auth.uid()));

-- ---------- 035_verification.sql ----------

DROP POLICY IF EXISTS "Users can view own verification requests" ON verification_requests;
CREATE POLICY "Users can view own verification requests"
  ON verification_requests FOR SELECT
  USING (auth.uid() = user_id OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can review verification requests" ON verification_requests;
CREATE POLICY "Admins can review verification requests"
  ON verification_requests FOR UPDATE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Users and admins can view verification documents" ON storage.objects;
CREATE POLICY "Users and admins can view verification documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'verification-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR is_platform_admin(auth.uid())
    )
  );

-- ---------- 037_feedback.sql ----------

DROP POLICY IF EXISTS "Users can view own feedback" ON feedback;
CREATE POLICY "Users can view own feedback"
  ON feedback FOR SELECT
  USING (auth.uid() = user_id OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update feedback" ON feedback;
CREATE POLICY "Admins can update feedback"
  ON feedback FOR UPDATE
  USING (is_platform_admin(auth.uid()));

-- ---------- 038_integrations.sql ----------

DROP POLICY IF EXISTS "Published integrations are viewable by everyone" ON integrations;
CREATE POLICY "Published integrations are viewable by everyone"
  ON integrations FOR SELECT
  USING (is_published = TRUE OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can create integrations" ON integrations;
CREATE POLICY "Admins can create integrations"
  ON integrations FOR INSERT
  WITH CHECK (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update integrations" ON integrations;
CREATE POLICY "Admins can update integrations"
  ON integrations FOR UPDATE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete integrations" ON integrations;
CREATE POLICY "Admins can delete integrations"
  ON integrations FOR DELETE
  USING (is_platform_admin(auth.uid()));

-- ---------- 040_security_fixes.sql ----------

DROP POLICY IF EXISTS "Admins can read UAT responses" ON uat_responses;
CREATE POLICY "Admins can read UAT responses"
  ON uat_responses FOR SELECT
  TO authenticated
  USING (is_platform_admin(auth.uid()));

-- ---------- 046_progress_history.sql ----------

DROP POLICY IF EXISTS "Admins can view all application events" ON grant_application_events;
CREATE POLICY "Admins can view all application events"
  ON grant_application_events FOR SELECT
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all project phase events" ON project_phase_events;
CREATE POLICY "Admins can view all project phase events"
  ON project_phase_events FOR SELECT
  USING (is_platform_admin(auth.uid()));

-- ---------- 048_entity_documents.sql ----------

DROP POLICY IF EXISTS "Users can delete own entity documents" ON storage.objects;
CREATE POLICY "Users can delete own entity documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'entity-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR is_platform_admin(auth.uid())
    )
  );

-- ---------- 051_submission_receipts.sql ----------

DROP POLICY IF EXISTS "Admins can view all receipts" ON submission_receipts;
CREATE POLICY "Admins can view all receipts"
  ON submission_receipts FOR SELECT
  USING (is_platform_admin(auth.uid()));

-- ---------- 058_employers.sql ----------
--
-- "Verified employers are viewable by everyone" is NOT recreated: 081 dropped
-- it and replaced it with the members-and-admins policy below. Recreating it
-- here would re-open unverified employer rows to the public.

DROP POLICY IF EXISTS "Admins can create employers" ON employers;
CREATE POLICY "Admins can create employers"
  ON employers FOR INSERT
  WITH CHECK (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update employers" ON employers;
CREATE POLICY "Admins can update employers"
  ON employers FOR UPDATE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete employers" ON employers;
CREATE POLICY "Admins can delete employers"
  ON employers FOR DELETE
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Members and admins can view employer members" ON employer_members;
CREATE POLICY "Members and admins can view employer members"
  ON employer_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = employer_members.employer_id AND m.user_id = auth.uid()
    )
    OR is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can manage employer members" ON employer_members;
CREATE POLICY "Admins can manage employer members"
  ON employer_members FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view verification events" ON employer_verification_events;
CREATE POLICY "Admins can view verification events"
  ON employer_verification_events FOR SELECT
  USING (is_platform_admin(auth.uid()));

-- ---------- 062_event_challenge.sql ----------

DROP POLICY IF EXISTS "OECS admins can manage all event criteria" ON event_criteria;
CREATE POLICY "OECS admins can manage all event criteria"
  ON event_criteria FOR ALL
  USING (is_platform_admin(auth.uid()));

-- ---------- 070_event_venue.sql ----------

DROP POLICY IF EXISTS "OECS admins can manage all venue rooms" ON venue_rooms;
CREATE POLICY "OECS admins can manage all venue rooms"
  ON venue_rooms FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

-- ---------- 081_employer_portfolio.sql ----------

DROP POLICY IF EXISTS "Employers are viewable by their own members and admins" ON employers;
CREATE POLICY "Employers are viewable by their own members and admins"
  ON employers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = employers.id AND m.user_id = auth.uid()
    )
    OR is_platform_admin(auth.uid())
  );

-- ============================================================
-- 4. event:create
--
-- Granted to exactly the roles that already hold project:create. The reasoning
-- is that running an event and publishing a project are the same kind of act —
-- putting something in front of the community under your own name — and there
-- is no reason a member trusted with one is not trusted with the other.
--
-- Investors and chamber admins are deliberately excluded: neither holds
-- project:create, and both are on the platform to fund and to vet rather than
-- to programme. A super_admin can still create events for them, and either can
-- be granted the permission from /admin/roles without a migration.
-- ============================================================

INSERT INTO permission_definitions (key, label, description, category, is_safeguard, sort_order) VALUES
  ('event:create', 'Create events', 'Publish an event, including hackathons and challenges, and open registrations.', 'projects', FALSE, 145)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_safeguard = EXCLUDED.is_safeguard,
  sort_order = EXCLUDED.sort_order;

-- Restated so "Reset to defaults" at /admin/roles knows about the new key.
-- Body is 063's, with the event:create rows added.
CREATE OR REPLACE FUNCTION default_role_permissions()
RETURNS TABLE (role_slug TEXT, permission_key TEXT)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  -- Super Admin holds everything, including permissions added later.
  SELECT 'super_admin'::TEXT, pd.key FROM permission_definitions pd
  UNION ALL
  SELECT * FROM (VALUES
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

    ('investor', 'grant:view'),
    ('investor', 'grant:post'),
    ('investor', 'grant:manage_funds'),
    ('investor', 'forum:post'),
    ('investor', 'forum:comment'),
    ('investor', 'mentorship:offer'),
    ('investor', 'dm:initiate'),
    ('investor', 'dm:receive'),

    ('sme', 'grant:view'),
    ('sme', 'grant:apply'),
    ('sme', 'project:create'),
    ('sme', 'project:manage'),
    ('sme', 'event:create'),
    ('sme', 'forum:post'),
    ('sme', 'forum:comment'),
    ('sme', 'mentorship:offer'),
    ('sme', 'dm:initiate'),
    ('sme', 'dm:receive'),

    ('private_sector', 'grant:view'),
    ('private_sector', 'project:create'),
    ('private_sector', 'project:manage'),
    ('private_sector', 'event:create'),
    ('private_sector', 'forum:post'),
    ('private_sector', 'forum:comment'),
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

    ('chamber_admin', 'sme:verify'),
    ('chamber_admin', 'grant:view'),
    ('chamber_admin', 'forum:post'),
    ('chamber_admin', 'forum:comment'),
    ('chamber_admin', 'dm:initiate'),
    ('chamber_admin', 'dm:receive'),

    ('entrepreneur', 'grant:view'),
    ('entrepreneur', 'grant:apply'),
    ('entrepreneur', 'project:create'),
    ('entrepreneur', 'project:manage'),
    ('entrepreneur', 'event:create'),
    ('entrepreneur', 'forum:post'),
    ('entrepreneur', 'forum:comment'),
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
    ('researcher', 'dm:initiate'),
    ('researcher', 'dm:receive'),

    ('mentor', 'grant:view'),
    ('mentor', 'project:create'),
    ('mentor', 'project:manage'),
    ('mentor', 'event:create'),
    ('mentor', 'forum:post'),
    ('mentor', 'forum:comment'),
    ('mentor', 'mentorship:offer'),
    ('mentor', 'dm:initiate'),
    ('mentor', 'dm:receive'),

    -- Read-only on grants, receives messages but never initiates.
    ('student', 'grant:view'),
    ('student', 'project:create'),
    ('student', 'project:manage'),
    ('student', 'event:create'),
    ('student', 'forum:post'),
    ('student', 'forum:comment'),
    ('student', 'dm:receive')
  ) AS t(role_slug, permission_key);
$$;

-- Seed the new column of the matrix. DO NOTHING, so an admin who has already
-- tuned event:create by hand keeps their setting on a re-run.
INSERT INTO role_permissions (role_slug, permission_key, allowed)
SELECT rd.slug,
       pd.key,
       EXISTS (SELECT 1 FROM default_role_permissions() d WHERE d.role_slug = rd.slug AND d.permission_key = pd.key)
FROM role_definitions rd
CROSS JOIN permission_definitions pd
WHERE rd.alias_of IS NULL
ON CONFLICT (role_slug, permission_key) DO NOTHING;

-- The gate itself. Replaces 002's `WITH CHECK (auth.uid() = organizer_id)`.
-- has_permission() returns FALSE for a suspended account, so this doubles as
-- the suspension gate — the same note 064 makes about the policies it added.
DROP POLICY IF EXISTS "Authenticated users can create events" ON events;
CREATE POLICY "Authenticated users can create events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = organizer_id AND has_permission(auth.uid(), 'event:create'));

-- ============================================================
-- 5. Suspension on owner-editable content
--
-- has_permission() denies everything to a suspended account, so every policy
-- that routes through it already handles suspension. The owner-ownership
-- policies from 001 and 002 predate it and test nothing but auth.uid(), which
-- left a suspended member able to keep editing — and to cancel — their own
-- events and projects while suspended. Reading is untouched; only writes.
-- ============================================================

DROP POLICY IF EXISTS "Organizers can update their events" ON events;
CREATE POLICY "Organizers can update their events"
  ON events FOR UPDATE
  USING (auth.uid() = organizer_id AND NOT is_suspended(auth.uid()));

DROP POLICY IF EXISTS "Organizers can delete their events" ON events;
CREATE POLICY "Organizers can delete their events"
  ON events FOR DELETE
  USING (auth.uid() = organizer_id AND NOT is_suspended(auth.uid()));

-- 031 widened this one from bare ownership to "owner or project editor". That
-- branch is preserved — only the suspension gate is added, and it wraps BOTH
-- branches so a suspended editor is stopped as well as a suspended owner.
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (
    (auth.uid() = owner_id OR is_project_member(id, auth.uid(), 'editor'))
    AND NOT is_suspended(auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = owner_id AND NOT is_suspended(auth.uid()));

-- ============================================================
-- 6. Verification
--
-- Run these after applying. Each should return zero rows / the stated value.
-- ============================================================

-- a) 24 permissions now, and event:create is one of them.
--      SELECT count(*) FROM permission_definitions;                   -- 24
--      SELECT count(*) FROM role_permissions;                         -- 288
--
-- b) Every role that can create a project can now create an event.
--      SELECT role_slug FROM role_permissions
--       WHERE permission_key = 'project:create' AND allowed
--      EXCEPT
--      SELECT role_slug FROM role_permissions
--       WHERE permission_key = 'event:create' AND allowed;            -- 0 rows
--
-- c) No policy still carries the literal test. Storage policies live in a
--    different schema, so both are checked.
--      SELECT schemaname, tablename, policyname FROM pg_policies
--       WHERE (qual LIKE '%''oecs''%' OR with_check LIKE '%''oecs''%')
--         AND schemaname IN ('public', 'storage');                    -- 0 rows
--
-- d) A modern super_admin and a legacy oecs admin resolve identically.
--      SELECT id, roles, is_platform_admin(id) FROM profiles
--       WHERE 'super_admin' = ANY(expand_roles(roles));   -- all TRUE
