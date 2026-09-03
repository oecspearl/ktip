-- Migration 129: discussion boards become creatable, and the BSO can post funding.
--
-- Two gaps reported from the platform's own feedback queue on 2026-09-01, both
-- of which turned out to be the same shape: a capability that exists in the
-- schema with no way to reach it.
--
-- 1. NOBODY COULD CREATE A FORUM BOARD. 005 created forum_boards with exactly
--    one policy — "Anyone can view forum boards" — and seeded six rows. There
--    has never been an INSERT policy, so the six seeded boards are the entire
--    forum and always have been. Even the Super Admin could not add a seventh:
--    /admin/forums renders the boards tab read-only because there was nothing
--    to call. Members can start threads (forum_posts) inside those six boards,
--    which is why the report reads "only allowed to create posts, not
--    discussion topics".
--
--    Fixed here with a new key, `forum:board`, rather than by widening
--    `forum:post`. A board is a section of the platform, not a message in one:
--    the person who opens one is choosing what the community is organised
--    around, and that is an organisation-tier act. `forum:manage` (116) is not
--    the key either — it means "edit, pin and remove any post on any board",
--    which is moderation of what exists, not the right to add to it.
--
--    Ownership works exactly like grants under 077: created_by is stamped at
--    insert, the creator edits and retires their own board, and `forum:manage`
--    covers everyone else's. THE SIX SEEDED BOARDS HAVE created_by = NULL and
--    are therefore editable by `forum:manage` holders only — nobody inherits
--    General Discussion by being the first to create a board of their own.
--
-- 2. THE BSO COULD NOT POST A GRANT. `grant:post` already exists (063) and the
--    INSERT policy on grants already honours it (116), so investor, government,
--    diaspora, igo, mentor and programme_supervisor can post funding calls —
--    the missing part is UI, which lands with this change. But chamber_admin
--    could not, and since 125 that slug IS the BSO: incubators, accelerators
--    and MSME agencies were folded into it, and channelling funding to their
--    cohort is what those bodies do. The cell is granted below.
--
-- Mirrors src/lib/permissions.ts. Idempotent — safe to re-run.

-- ============================================================
-- 1. The new permission
-- ============================================================

INSERT INTO permission_definitions (key, label, description, category, is_safeguard, sort_order) VALUES
  ('forum:board', 'Create discussion boards', 'Open a new forum board and edit or retire the ones you opened.', 'community', FALSE, 155)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_safeguard = EXCLUDED.is_safeguard,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 2. Boards get an owner
-- ============================================================

ALTER TABLE forum_boards
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN forum_boards.created_by IS
  'Who opened this board. NULL on the six rows seeded by 005 — those are manageable by forum:manage holders only, never by a forum:board holder.';

CREATE INDEX IF NOT EXISTS idx_forum_boards_created_by
  ON forum_boards(created_by, created_at DESC)
  WHERE created_by IS NOT NULL;

-- ============================================================
-- 3. Slug and sort order are assigned by the database
--
-- 087 gave every other listing a readable URL segment; boards were left out
-- because nothing ever inserted one. assign_slug_from_title() reads NEW.title
-- and a board's column is `name`, so it needs its own two-line wrapper.
--
-- sort_order rides along: it defaults to 0, which would drop every new board
-- above General Discussion in the board query. max + 1 puts a new board at the
-- end of the list, where a reader expects it.
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_forum_board_slug()
RETURNS TRIGGER AS $$
DECLARE
  v_base TEXT := COALESCE(NULLIF(btrim(NEW.slug), ''), NEW.name);
BEGIN
  -- slugify() strips everything that is not a word character, so a name made
  -- only of punctuation would reduce to '' — and slug is NOT NULL UNIQUE, so
  -- the second such board would collide on an empty string.
  IF slugify(v_base) = '' THEN
    v_base := 'board';
  END IF;

  NEW.slug := unique_slug('forum_boards', v_base);

  IF COALESCE(NEW.sort_order, 0) = 0 THEN
    SELECT COALESCE(MAX(sort_order), 0) + 1 INTO NEW.sort_order FROM forum_boards;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS assign_forum_board_slug_trigger ON forum_boards;
CREATE TRIGGER assign_forum_board_slug_trigger BEFORE INSERT ON forum_boards
  FOR EACH ROW EXECUTE FUNCTION assign_forum_board_slug();

-- ============================================================
-- 4. Who may open, edit and retire a board
--
-- The creator arm is AND-ed with forum:board, not OR-ed: losing the permission
-- has to close the door on the boards already opened, the way 077 wrote the
-- same pair for grants.
-- ============================================================

DROP POLICY IF EXISTS "Board creators can create boards" ON forum_boards;
CREATE POLICY "Board creators can create boards"
  ON forum_boards FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND has_permission(auth.uid(), 'forum:board')
  );

DROP POLICY IF EXISTS "Creators and forum admins can update boards" ON forum_boards;
CREATE POLICY "Creators and forum admins can update boards"
  ON forum_boards FOR UPDATE
  USING (
    (created_by = auth.uid() AND has_permission(auth.uid(), 'forum:board'))
    OR has_permission(auth.uid(), 'forum:manage')
  )
  WITH CHECK (
    (created_by = auth.uid() AND has_permission(auth.uid(), 'forum:board'))
    OR has_permission(auth.uid(), 'forum:manage')
  );

-- Deleting a board cascades to its posts and their replies (005). That is the
-- reason the client asks twice and shows the post count before it does.
DROP POLICY IF EXISTS "Creators and forum admins can delete boards" ON forum_boards;
CREATE POLICY "Creators and forum admins can delete boards"
  ON forum_boards FOR DELETE
  USING (
    (created_by = auth.uid() AND has_permission(auth.uid(), 'forum:board'))
    OR has_permission(auth.uid(), 'forum:manage')
  );

-- ============================================================
-- 5. Moderation coverage
--
-- A board name and description are now member-written text, so they are scanned
-- like every other surface 122 reached. flag_only, not quarantine: forum_boards
-- has no `status` column to hide behind, and a board is created by a verified
-- organisation rather than by an anonymous account — the proportionate action
-- is to put it in front of a human.
--
-- The CHECK widening MUST come before the trigger: a report filed with a
-- target_type the constraint does not list fails inside the author's own
-- transaction and takes their insert with it. 122 section 3 says the same.
--
-- Like everything else 122 added, this fires only once 'forum_boards' is named
-- in moderation_settings.enforce_tables, which starts empty.
-- ============================================================

ALTER TABLE content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE content_reports ADD CONSTRAINT content_reports_target_type_check
  CHECK (target_type IN (
    'forum_post', 'forum_reply', 'project', 'project_comment', 'message', 'profile', 'grant',
    'event', 'resource', 'event_solution', 'venue_room_message', 'resume',
    'forum_board'
  ));

DROP TRIGGER IF EXISTS moderate_forum_boards_trigger ON forum_boards;
CREATE TRIGGER moderate_forum_boards_trigger
  BEFORE INSERT OR UPDATE ON forum_boards
  FOR EACH ROW EXECUTE FUNCTION moderate_content('name,description', 'created_by', 'flag_only');

-- ============================================================
-- 5a. moderate_content() learns the board table
--
-- 122's function verbatim, with one line added to the v_target CASE:
--
--     WHEN 'forum_boards' THEN 'forum_board'
--
-- Without it the ELSE branch falls through to TG_TABLE_NAME, which is the
-- PLURAL table name, and content_reports.target_type only accepts the
-- singular forms. The failing INSERT sits inside the author's own
-- transaction, so a flagged board would not be quarantined — it would refuse
-- to be created at all, with an opaque constraint error. Restated in full
-- rather than patched, because a function body cannot be edited in place.
-- ============================================================
CREATE OR REPLACE FUNCTION moderate_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text     TEXT := '';
  v_old_text TEXT := '';
  v_col      TEXT;
  v_author   UUID;
  v_country  CHAR(2);
  v_scan     JSONB;
  v_severity TEXT;
  v_settings moderation_settings%ROWTYPE;
  v_row      JSONB := to_jsonb(NEW);
  v_old      JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_target   TEXT;
  v_mode     TEXT := COALESCE(TG_ARGV[2], 'quarantine');
  v_legacy   BOOLEAN;
  v_category TEXT;
BEGIN
  SELECT * INTO v_settings FROM moderation_settings WHERE id = 1;

  -- The four tables from 065 are always on. Everything added in 122 waits to
  -- be named in enforce_tables, so this can be rolled out one table at a time
  -- and rolled back in seconds.
  v_legacy := TG_TABLE_NAME IN ('forum_posts', 'forum_replies', 'project_comments', 'messages');
  IF NOT v_legacy AND NOT (TG_TABLE_NAME = ANY(COALESCE(v_settings.enforce_tables, ARRAY[]::TEXT[]))) THEN
    RETURN NEW;
  END IF;

  -- A system notice must never flag anyone: nobody wrote it.
  IF TG_TABLE_NAME = 'venue_room_messages' AND (v_row ->> 'kind') = 'system' THEN
    RETURN NEW;
  END IF;

  -- A private CV is the member's own document. Only a published one is scanned.
  IF TG_TABLE_NAME = 'resumes' AND COALESCE((v_row ->> 'is_public')::BOOLEAN, FALSE) = FALSE THEN
    RETURN NEW;
  END IF;

  FOREACH v_col IN ARRAY string_to_array(TG_ARGV[0], ',') LOOP
    v_col := btrim(v_col);
    IF TG_TABLE_NAME = 'resumes' AND v_col = 'data' THEN
      -- Never data::text. The raw JSONB is keys, URLs and dates, which trips
      -- the PII patterns on every save.
      v_text := v_text || COALESCE(resume_scannable_text(NEW.data), '') || E'\n';
      IF v_old IS NOT NULL THEN
        v_old_text := v_old_text || COALESCE(resume_scannable_text(OLD.data), '') || E'\n';
      END IF;
    ELSE
      v_text := v_text || COALESCE(v_row ->> v_col, '') || E'\n';
      IF v_old IS NOT NULL THEN
        v_old_text := v_old_text || COALESCE(v_old ->> v_col, '') || E'\n';
      END IF;
    END IF;
  END LOOP;

  -- An UPDATE that leaves the text alone must not re-flag, re-report or
  -- re-suspend. Without this, a moderator restoring a row and the author then
  -- editing an unrelated column would put it straight back in the queue.
  IF TG_OP = 'UPDATE' AND v_text IS NOT DISTINCT FROM v_old_text THEN
    RETURN NEW;
  END IF;

  IF TG_ARGV[1] = '-' THEN
    v_author := NULL;
  ELSE
    v_author := NULLIF(v_row ->> TG_ARGV[1], '')::UUID;
  END IF;

  v_target := CASE TG_TABLE_NAME
    WHEN 'forum_posts' THEN 'forum_post'
    WHEN 'forum_replies' THEN 'forum_reply'
    WHEN 'forum_boards' THEN 'forum_board'
    WHEN 'project_comments' THEN 'project_comment'
    WHEN 'messages' THEN 'message'
    WHEN 'projects' THEN 'project'
    WHEN 'events' THEN 'event'
    WHEN 'grants' THEN 'grant'
    WHEN 'resources' THEN 'resource'
    WHEN 'event_solutions' THEN 'event_solution'
    WHEN 'venue_room_messages' THEN 'venue_room_message'
    WHEN 'profiles' THEN 'profile'
    WHEN 'resumes' THEN 'resume'
    ELSE TG_TABLE_NAME
  END;

  IF v_author IS NOT NULL THEN
    SELECT upper(left(COALESCE(p.country, ''), 2)) INTO v_country FROM profiles p WHERE p.id = v_author;
  END IF;

  v_scan := scan_content(v_text, NULLIF(v_country, ''));
  v_severity := v_scan ->> 'severity';

  IF v_severity IS NULL THEN
    RETURN NEW;
  END IF;

  v_category := COALESCE((v_scan -> 'matches' -> 0 ->> 'category'), 'hate_harassment');

  -- Mirrors blocksOn() in src/lib/moderation/policy.ts. A phone number in a
  -- grant budget is a number; the same string in a direct message to a minor
  -- is the thing the filter exists for. Change both or neither.
  IF v_category IN ('pii_leak', 'spam_scam')
     AND TG_TABLE_NAME NOT IN ('messages', 'venue_room_messages') THEN
    v_mode := 'flag_only';
  END IF;

  IF v_row ? 'moderation_severity' THEN
    NEW.moderation_severity := v_severity;
    -- Mirrored into v_row as well: the revert path below rebuilds NEW from
    -- v_row, and would otherwise drop the severity it just recorded.
    v_row := jsonb_set(v_row, '{moderation_severity}', to_jsonb(v_severity));
  END IF;

  -- ---- low: the configured low_action, warn by default ----
  IF v_severity = 'low' THEN
    INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
    VALUES ('system', v_author, v_target, NEW.id, 'low', 'flagged', v_scan);

    IF v_author IS NOT NULL AND COALESCE(v_settings.low_action, 'warned') = 'warned' THEN
      PERFORM send_notification(
        v_author,
        'moderation_warning',
        'Community guidelines reminder',
        'Something you posted was flagged by our automated filter. Please review the community guidelines.',
        '/help'
      );
    END IF;

    RETURN NEW;
  END IF;

  -- ---- medium and high ----
  IF v_mode = 'revert' AND v_old IS NOT NULL THEN
    -- profiles.bio: restore the previous value rather than hiding the row.
    FOREACH v_col IN ARRAY string_to_array(TG_ARGV[0], ',') LOOP
      v_col := btrim(v_col);
      v_row := jsonb_set(v_row, ARRAY[v_col], COALESCE(v_old -> v_col, 'null'::JSONB));
    END LOOP;
    NEW := jsonb_populate_record(NEW, v_row);
  ELSIF v_mode = 'revert' THEN
    -- On INSERT there is no prior value to restore, so clear the field.
    FOREACH v_col IN ARRAY string_to_array(TG_ARGV[0], ',') LOOP
      v_row := jsonb_set(v_row, ARRAY[btrim(v_col)], 'null'::JSONB);
    END LOOP;
    NEW := jsonb_populate_record(NEW, v_row);
  ELSIF v_mode = 'quarantine'
        AND (v_row ? 'status')
        AND COALESCE(v_settings.medium_action, 'quarantined') = 'quarantined' THEN
    NEW.status := 'quarantined';
    NEW.quarantined_at := now();
  ELSIF TG_TABLE_NAME = 'resumes' THEN
    -- A CV belongs to the member; the proportionate action is to unpublish it,
    -- not to hide it from its own author.
    NEW.is_public := FALSE;
  END IF;

  INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
  VALUES (
    'system', v_author, v_target, NEW.id, v_severity,
    CASE WHEN v_mode = 'quarantine' AND (v_row ? 'status') THEN 'quarantined' ELSE 'flagged' END,
    v_scan || jsonb_build_object('mode', v_mode, 'table', TG_TABLE_NAME)
  );

  -- Machine-generated reports are marked by reporter_id = the author. A table
  -- with no author column cannot file one, so it is logged and left to the
  -- severity filter on the automated tab.
  IF v_author IS NOT NULL THEN
    INSERT INTO content_reports (reporter_id, target_type, target_id, target_author_id, category, detail, content_snapshot, severity, status)
    VALUES (
      v_author, v_target, NEW.id, v_author, v_category,
      'Automatically flagged by the content filter.',
      left(v_text, 2000), v_severity, 'open'
    )
    ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING;
  END IF;

  -- ---- high ----
  IF v_severity = 'high' AND v_author IS NOT NULL THEN
    -- Suspension stays on the surfaces where a high-severity match is the
    -- grooming or threat case the escalation was built for. On the tables
    -- added here a false positive would lock a member out over a project
    -- description, so they escalate to the safety team without suspending.
    IF v_legacy AND COALESCE(v_settings.high_action, 'suspended') = 'suspended' THEN
      PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
      UPDATE profiles
      SET is_suspended = TRUE,
          suspension_reason = 'Automated safety escalation pending review',
          updated_at = now()
      WHERE id = v_author;
      PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

      INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
      VALUES ('system', v_author, v_target, NEW.id, 'high', 'suspended', v_scan);
    END IF;

    PERFORM escalate_to_safety(v_author, v_target, NEW.id, v_severity);
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 5b. Consent context for a funding call
--
-- 115 records WHERE an agreement was accepted, as a closed vocabulary. Posting
-- a grant is a publishing act that had no member-facing form until now, so it
-- had no context — 'grant_application' is the applicant's side of the same
-- page and would misfile the funder's acceptance. Widened, never narrowed:
-- every existing value stays, or the rows already written stop validating.
-- ============================================================

ALTER TABLE user_consents DROP CONSTRAINT IF EXISTS user_consents_context_check;
ALTER TABLE user_consents ADD CONSTRAINT user_consents_context_check
  CHECK (context IN (
    'signup', 'onboarding', 'reconsent', 'settings',
    'project', 'event', 'forum_post', 'cv_publish', 'org_publish',
    'event_solution', 'grant_application',
    'grant_post'
  ));

-- ============================================================
-- 6. Default matrix
--
-- 125's body with two changes: `forum:board` for the nine organisation-tier
-- roles and for the Programmes Supervisor, who owns the forums; `grant:post`
-- for chamber_admin. Restated in full rather than as a delta, for the reason
-- 110 gives: this one function is what both the seed below and "Reset to
-- defaults" at /admin/roles read, so a partial body would silently drop every
-- role it omitted. Mirrors DEFAULT_ROLE_PERMISSIONS in src/lib/permissions.ts,
-- and rbac-parity.test.ts compares the two.
--
-- The individual tier does NOT get forum:board. An entrepreneur, a researcher
-- or a student starts a thread; a body that speaks for a constituency opens the
-- section that thread belongs in.
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
    ('investor', 'forum:board'),
    ('investor', 'mentorship:offer'),
    ('investor', 'dm:initiate'),
    ('investor', 'dm:receive'),

    ('private_sector', 'grant:view'),
    ('private_sector', 'project:create'),
    ('private_sector', 'project:manage'),
    ('private_sector', 'event:create'),
    ('private_sector', 'forum:post'),
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

-- ============================================================
-- 7. Move the chamber_admin funding cell
--
-- The seed below is ON CONFLICT DO NOTHING, so it cannot flip a cell that
-- already exists as allowed = FALSE — and chamber_admin/grant:post exists,
-- written FALSE by 125's own seed. Same reasoning as 125 section 5.
--
-- forum:board needs no equivalent: the key is new, so every one of its cells is
-- inserted fresh by section 8 with the matrix value.
-- ============================================================

UPDATE role_permissions
SET allowed = TRUE, updated_at = now()
WHERE role_slug = 'chamber_admin'
  AND permission_key = 'grant:post'
  AND allowed = FALSE;

-- ============================================================
-- 8. Seed any cell that does not exist yet
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
-- 9. Verification
--
--   -- the six seeded boards stay ownerless, and therefore admin-only
--   SELECT name, created_by IS NULL AS seeded FROM forum_boards ORDER BY sort_order;
--
--   -- every organisation-tier role can now open one
--   SELECT role_slug, allowed FROM role_permissions
--    WHERE permission_key = 'forum:board' ORDER BY role_slug;
--
--   -- and the BSO can post funding
--   SELECT allowed FROM role_permissions
--    WHERE role_slug = 'chamber_admin' AND permission_key = 'grant:post';   -- t
-- ============================================================
