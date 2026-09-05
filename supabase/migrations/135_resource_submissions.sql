-- Migration 135: members can contribute to the resource library.
--
-- Numbered 135, not 130: this was written as 130 and renumbered when
-- 130_funders_read_their_applications.sql claimed that slot. Nothing in
-- 131-134 depends on it, and it must stay the highest-numbered migration
-- defining default_role_permissions() for rbac-parity.test.ts.
--
-- From the same feedback queue as 129, 2026-09-01: "Not seeing any options
-- allowing users to upload resources." Accurate. /resources has been read-only
-- for everyone since 015. Creating a resource is an admin act at
-- /admin/resources behind `resource:manage`, which since 116 only
-- programme_supervisor holds outside the two admin seats — and even that form
-- takes a typed URL, never a file. There was no route, no permission, no INSERT
-- policy and no bucket for anything a member wanted to contribute.
--
-- WHY A NEW COLUMN RATHER THAN REUSING is_published. Three orthogonal questions
-- now hang off a resource row, and folding any two together breaks a query that
-- already exists:
--
--   approval_status (here)  has a reviewer looked at it?
--   is_published    (015)   is it live? — the admin's staging switch
--   status          (122)   did the moderation filter object?
--
-- A quarantined row is not a rejected one, and an approved row that an admin has
-- not switched on yet is not a pending one. The review queue reads the first,
-- the public grid reads all three.
--
-- approval_status DEFAULTS TO 'approved'. Every row that exists today was
-- written by a resource:manage holder and has already been vouched for;
-- defaulting to 'pending' would empty the live library into the review queue on
-- deploy.
--
-- Mirrors src/lib/permissions.ts. Idempotent — safe to re-run.

-- ============================================================
-- 1. The new permission
--
-- Category 'community', beside forum:post (150), forum:board (155) and
-- forum:comment (160) — contributing to the library is a participant act. NOT
-- 'content', which permissions.ts documents as the domain keys carved out of
-- org:manage, i.e. administrative.
--
-- Granted below to every role that holds forum:post, students included. The
-- queue is what bounds the risk: nothing a member submits is visible to anyone
-- else until a reviewer approves it. Withholding it from students would exclude
-- exactly the teaching material a resource library exists to carry.
-- ============================================================

INSERT INTO permission_definitions (key, label, description, category, is_safeguard, sort_order) VALUES
  ('resource:submit', 'Submit resources', 'Contribute a guide, template or case study to the resource library. Published after review.', 'community', FALSE, 175)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_safeguard = EXCLUDED.is_safeguard,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 2. Review state and the uploaded file
-- ============================================================

ALTER TABLE resources ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_approval_status_check;
ALTER TABLE resources ADD CONSTRAINT resources_approval_status_check
  CHECK (approval_status IN ('draft', 'pending', 'approved', 'rejected'));

ALTER TABLE resources ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS reviewed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS review_note  TEXT;

-- download_url (015) stays for the admin-typed link. file_path is the object in
-- the private bucket below, and the two are alternatives rather than a pair: a
-- submission has one or the other.
ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_mime TEXT;

COMMENT ON COLUMN resources.approval_status IS
  'Has a reviewer looked at it. Distinct from is_published (is it live) and status (did the moderation filter object). Defaults to approved so pre-130 rows, all admin-written, are not swept into the queue.';
COMMENT ON COLUMN resources.file_path IS
  'Object name in the private resource-files bucket. Read through a signed URL; never a public URL.';

CREATE INDEX IF NOT EXISTS idx_resources_review_queue
  ON resources(approval_status, submitted_at DESC)
  WHERE approval_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_resources_author
  ON resources(author_id, created_at DESC);

-- ============================================================
-- 3. Who may submit, revise and withdraw
--
-- 116's "OECS admin can manage resources" (FOR ALL, resource:manage) is left
-- alone. Policies OR together, so it keeps covering the reviewer's queue read
-- and the admin insert that publishes straight away.
-- ============================================================

DROP POLICY IF EXISTS "Members can submit resources" ON resources;
CREATE POLICY "Members can submit resources"
  ON resources FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND has_permission(auth.uid(), 'resource:submit')
    AND is_published = FALSE
    AND approval_status IN ('draft', 'pending')
  );

-- USING admits 'rejected' so a member can revise something that came back;
-- WITH CHECK forces the row's NEW state back to unpublished and undecided. That
-- asymmetry is the whole resubmission mechanism — without it, "edit and send it
-- again" would either be refused or would let the author publish themselves.
DROP POLICY IF EXISTS "Submitters can edit their own pending resources" ON resources;
CREATE POLICY "Submitters can edit their own pending resources"
  ON resources FOR UPDATE
  USING (
    author_id = auth.uid()
    AND has_permission(auth.uid(), 'resource:submit')
    AND approval_status IN ('draft', 'pending', 'rejected')
  )
  WITH CHECK (
    author_id = auth.uid()
    AND has_permission(auth.uid(), 'resource:submit')
    AND is_published = FALSE
    AND approval_status IN ('draft', 'pending')
  );

DROP POLICY IF EXISTS "Submitters can withdraw their own pending resources" ON resources;
CREATE POLICY "Submitters can withdraw their own pending resources"
  ON resources FOR DELETE
  USING (
    author_id = auth.uid()
    AND approval_status IN ('draft', 'pending', 'rejected')
  );

-- 122:427-432 with one clause added. An unreviewed row is not public even if
-- something else flips is_published.
DROP POLICY IF EXISTS "Anyone can view published resources" ON resources;
CREATE POLICY "Anyone can view published resources"
  ON resources FOR SELECT
  USING (
    is_published = TRUE
    AND approval_status = 'approved'
    AND (
      status = 'active'
      OR author_id = auth.uid()
      OR has_permission(auth.uid(), 'moderation:view')
    )
  );

-- 015's author-read policy restated rather than assumed: "My submissions" is
-- built on it, and a feature should not depend on an un-restated policy from
-- fifteen migrations ago still being present.
DROP POLICY IF EXISTS "Authors can view own resources" ON resources;
CREATE POLICY "Authors can view own resources"
  ON resources FOR SELECT
  USING (author_id = auth.uid());

-- ============================================================
-- 4. The review columns are not the submitter's to write
--
-- An UPDATE policy gates the row, not the columns: without this, the same
-- policy that lets an author fix a typo lets them write their own review_note
-- or hand the row to somebody else. 048 solves this shape by RAISING; this one
-- PINS, because a member editing a description sends the whole row back and
-- would otherwise be refused over a column they never touched.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_resource_review_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR has_permission(auth.uid(), 'resource:manage') THEN
    RETURN NEW;
  END IF;

  NEW.author_id    := OLD.author_id;
  NEW.reviewed_by  := OLD.reviewed_by;
  NEW.reviewed_at  := OLD.reviewed_at;
  NEW.review_note  := OLD.review_note;
  NEW.submitted_at := COALESCE(OLD.submitted_at, NEW.submitted_at);

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS enforce_resources_review_columns ON resources;
CREATE TRIGGER enforce_resources_review_columns
  BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION enforce_resource_review_columns();

CREATE OR REPLACE FUNCTION public.stamp_resource_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.approval_status = 'pending' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS stamp_resource_submission_trigger ON resources;
CREATE TRIGGER stamp_resource_submission_trigger
  BEFORE INSERT ON resources
  FOR EACH ROW EXECUTE FUNCTION stamp_resource_submission();

-- ============================================================
-- 5. Moderation coverage
--
-- 122 built the trigger and left it inert: enforce_tables starts empty. The
-- text on this table stops being admin-written here, so it goes on.
--
-- CONSEQUENCE THE QUEUE HAS TO HANDLE: mode 'quarantine' means a flagged
-- submission is written with status = 'quarantined' before it is ever visible.
-- If the admin queue filtered on status, that row would be invisible to the
-- reviewer and the member would wait forever. The queue therefore selects on
-- approval_status alone and RENDERS status as a badge.
-- ============================================================

UPDATE moderation_settings
SET enforce_tables = ARRAY(SELECT DISTINCT unnest(enforce_tables || ARRAY['resources']));

-- ============================================================
-- 5a. Consent context for a contribution
--
-- 115 records WHERE an agreement was accepted as a closed vocabulary, and 129
-- widened it for grant_post. Contributing to the library is its own moment —
-- the publishing terms are accepted over a file the member is handing to the
-- platform, which is not the same act as posting a project.
--
-- Mirrors ConsentContext in src/hooks/useAgreementGate.ts.
-- ============================================================

ALTER TABLE user_consents DROP CONSTRAINT IF EXISTS user_consents_context_check;
ALTER TABLE user_consents ADD CONSTRAINT user_consents_context_check
  CHECK (context IN (
    'signup', 'onboarding', 'reconsent', 'settings',
    'project', 'event', 'forum_post', 'cv_publish', 'org_publish',
    'event_solution', 'grant_application',
    'grant_post',
    'resource_submit'
  ));

-- ============================================================
-- 6. The bucket
--
-- PRIVATE, read through signed URLs, same posture as entity-documents (048).
-- An unreviewed submission must not be fetchable by anyone who guesses the
-- object name the moment it is uploaded.
--
-- The trade-off, stated plainly: downloading a member-contributed file requires
-- a signed-in session, where an admin-typed download_url does not. That is the
-- price of not publishing unreviewed uploads, and it is the right way round.
--
-- 25 MB matches MAX_FILE_SIZE in src/lib/document-extract.ts. Keep them equal —
-- a client-side limit that is looser than the bucket's fails at upload time
-- with a storage error the form cannot explain.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resource-files', 'resource-files', FALSE, 26214400,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- storage.objects carries one policy set for every bucket in the project and
-- they OR together, so the bucket_id guard on each of these is load-bearing,
-- not decoration. Path is {authorId}/{ts}_{name}, so foldername[1] is the uid —
-- the same shape 035 and 048 use.

DROP POLICY IF EXISTS "Members can upload resource files" ON storage.objects;
CREATE POLICY "Members can upload resource files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'resource-files'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
    AND (
      has_permission(auth.uid(), 'resource:submit')
      OR has_permission(auth.uid(), 'resource:manage')
    )
  );

DROP POLICY IF EXISTS "Resource files readable by author, reviewer and members" ON storage.objects;
CREATE POLICY "Resource files readable by author, reviewer and members"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'resource-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR has_permission(auth.uid(), 'resource:manage')
      OR EXISTS (
        SELECT 1 FROM resources r
        WHERE r.file_path = storage.objects.name
          AND r.is_published
          AND r.approval_status = 'approved'
          AND r.status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Authors and resource admins can delete resource files" ON storage.objects;
CREATE POLICY "Authors and resource admins can delete resource files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'resource-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR has_permission(auth.uid(), 'resource:manage')
    )
  );

-- ============================================================
-- 7. The decision
--
-- One call, so approval_status, is_published and the notification cannot drift
-- apart — the same argument 048 makes for decide_document_access_request.
--
-- Returns {ok: false, reason} rather than raising, matching set_user_roles (124)
-- and what src/hooks/useAdminDashboard.ts already unwraps.
--
-- The notification type is deliberately absent from
-- enforce_notification_preferences() (112): a decision on your own submission
-- is not a digest item to be muted, and 112's ELSE TRUE is the right answer for
-- it. send_notification (036) returns silently when the actor is the recipient,
-- so a reviewer approving their own submission simply gets no ping.
-- ============================================================

CREATE OR REPLACE FUNCTION public.review_resource_submission(
  p_resource UUID,
  p_approve  BOOLEAN,
  p_note     TEXT DEFAULT NULL,
  p_publish  BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_author UUID;
  v_title  TEXT;
  v_slug   TEXT;
  v_state  TEXT;
BEGIN
  IF NOT has_permission(auth.uid(), 'resource:manage') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  SELECT author_id, title, slug, approval_status
    INTO v_author, v_title, v_slug, v_state
  FROM resources WHERE id = p_resource;

  IF v_title IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF v_state = 'approved' AND p_approve THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'already_decided');
  END IF;

  UPDATE resources SET
    approval_status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    is_published    = CASE WHEN p_approve THEN COALESCE(p_publish, TRUE) ELSE FALSE END,
    reviewed_by     = auth.uid(),
    reviewed_at     = now(),
    review_note     = p_note,
    updated_at      = now()
  WHERE id = p_resource;

  IF v_author IS NOT NULL THEN
    PERFORM send_notification(
      v_author,
      'resource_submission_result',
      CASE WHEN p_approve THEN 'Resource published' ELSE 'Resource not accepted' END,
      CASE
        WHEN p_approve THEN '"' || v_title || '" is now in the resource library.'
        ELSE COALESCE(
          p_note,
          '"' || v_title || '" was not accepted. You can edit it and submit it again.'
        )
      END,
      CASE
        WHEN p_approve THEN '/resources/' || COALESCE(v_slug, p_resource::TEXT)
        ELSE '/resources/my-submissions'
      END
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'approval_status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.review_resource_submission(UUID, BOOLEAN, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_resource_submission(UUID, BOOLEAN, TEXT, BOOLEAN) TO authenticated;

-- ============================================================
-- 8. Default matrix
--
-- 129's body verbatim, with resource:submit added to every role that already
-- holds forum:post. Restated in full and not as a delta because
-- src/lib/__tests__/rbac-parity.test.ts reads the HIGHEST-numbered migration
-- defining this function and diffs it against DEFAULT_ROLE_PERMISSIONS — a
-- partial restatement here would silently revoke 129's forum:board rows.
-- ============================================================

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
  -- this matrix at all — it is the Super Admin ceiling from 124.
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
    ('people_supervisor', 'resource:submit'),
    ('people_supervisor', 'forum:comment'),
    ('people_supervisor', 'mentorship:offer'),
    ('people_supervisor', 'dm:initiate'),
    ('people_supervisor', 'dm:receive'),
    ('people_supervisor', 'dm:supervise'),

    -- grant:manage_funds rides with grant:manage: the person deciding an
    -- application is the person recording the award, and splitting those across
    -- two seats would only mean every decision waits on somebody else.
    -- forum:board joins forum:manage for the same reason — the seat that owns
    -- what the platform publishes owns the shape of the forum as well.
    ('programme_supervisor', 'project:manage_all'),
    ('programme_supervisor', 'grant:manage'),
    ('programme_supervisor', 'grant:post'),
    ('programme_supervisor', 'grant:manage_funds'),
    ('programme_supervisor', 'forum:manage'),
    ('programme_supervisor', 'forum:board'),
    ('programme_supervisor', 'resource:manage'),
    ('programme_supervisor', 'achievement:manage'),
    ('programme_supervisor', 'employer:manage'),
    ('programme_supervisor', 'grant:view'),
    ('programme_supervisor', 'grant:apply'),
    ('programme_supervisor', 'project:create'),
    ('programme_supervisor', 'project:manage'),
    ('programme_supervisor', 'event:create'),
    ('programme_supervisor', 'forum:post'),
    ('programme_supervisor', 'resource:submit'),
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
    ('safety_admin', 'resource:submit'),
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
    ('investor', 'resource:submit'),
    ('investor', 'forum:comment'),
    ('investor', 'forum:board'),
    ('investor', 'mentorship:offer'),
    ('investor', 'dm:initiate'),
    ('investor', 'dm:receive'),

    ('private_sector', 'grant:view'),
    ('private_sector', 'project:create'),
    ('private_sector', 'project:manage'),
    ('private_sector', 'event:create'),
    ('private_sector', 'forum:post'),
    ('private_sector', 'resource:submit'),
    ('private_sector', 'forum:comment'),
    ('private_sector', 'forum:board'),
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
    ('educational_partner', 'resource:submit'),
    ('educational_partner', 'forum:comment'),
    ('educational_partner', 'forum:board'),
    ('educational_partner', 'dm:initiate'),
    ('educational_partner', 'dm:receive'),
    ('educational_partner', 'dm:supervise'),

    -- Chamber of Commerce / BSO. One column since 125: the incubator and the
    -- chamber both vet local businesses, and holding two slugs for it split
    -- the verifier list without ever splitting the duty. grant:post is new in
    -- 129 — an incubator or an MSME agency channels funding to its cohort, and
    -- withholding the key meant the money was posted from somebody else's
    -- account or not at all.
    ('chamber_admin', 'sme:verify'),
    ('chamber_admin', 'grant:view'),
    ('chamber_admin', 'grant:apply'),
    ('chamber_admin', 'grant:post'),
    ('chamber_admin', 'project:create'),
    ('chamber_admin', 'project:manage'),
    ('chamber_admin', 'event:create'),
    ('chamber_admin', 'forum:post'),
    ('chamber_admin', 'resource:submit'),
    ('chamber_admin', 'forum:comment'),
    ('chamber_admin', 'forum:board'),
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
    ('ngo', 'resource:submit'),
    ('ngo', 'forum:comment'),
    ('ngo', 'forum:board'),
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
    ('research_institution', 'resource:submit'),
    ('research_institution', 'forum:comment'),
    ('research_institution', 'forum:board'),
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
    ('government', 'resource:submit'),
    ('government', 'forum:comment'),
    ('government', 'forum:board'),
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
    ('diaspora', 'resource:submit'),
    ('diaspora', 'forum:comment'),
    ('diaspora', 'forum:board'),
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
    ('igo', 'resource:submit'),
    ('igo', 'forum:comment'),
    ('igo', 'forum:board'),
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
    ('entrepreneur', 'resource:submit'),
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
    ('faculty', 'resource:submit'),
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
    ('researcher', 'resource:submit'),
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
    ('mentor', 'resource:submit'),
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
    ('student', 'resource:submit'),
    ('student', 'forum:comment'),
    ('student', 'dm:receive')
  ) AS t(role_slug, permission_key);
$$;

-- ============================================================
-- 9. Seed any cell that does not exist yet
--
-- resource:submit is a brand-new key, so every one of its cells is inserted
-- fresh with the matrix value. No UPDATE fixup of the kind 129 section 7 needed
-- — that one existed because 125 had already written the cell FALSE.
-- ============================================================

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

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 10. Verification
--
--   -- existing library is untouched and still public
--   SELECT count(*) FROM resources WHERE approval_status <> 'approved';   -- 0
--
--   -- every role that can start a discussion can contribute a resource
--   SELECT role_slug, allowed FROM role_permissions
--    WHERE permission_key = 'resource:submit' ORDER BY role_slug;
--
--   -- 129's board key survived the restatement
--   SELECT count(*) FROM default_role_permissions()
--    WHERE permission_key = 'forum:board';                                -- 10
--
--   -- the bucket is private
--   SELECT public, file_size_limit FROM storage.buckets WHERE id = 'resource-files';
--
--   -- and the filter is armed for this table
--   SELECT 'resources' = ANY(enforce_tables) FROM moderation_settings;     -- t
-- ============================================================
