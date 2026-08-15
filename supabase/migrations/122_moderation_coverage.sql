-- Migration 122: Extend write-time moderation beyond the original four tables
--
-- 065 attached moderate_content() to forum_posts, forum_replies,
-- project_comments and messages. Everything else a member writes — a project
-- description, an event listing, a resource, a bio, a venue chat message —
-- has been unscanned since. 119 put highlighting in the composer, but a client
-- block is cosmetic: anyone with devtools can post whatever they like. This is
-- the half that actually holds.
--
-- Four changes to the trigger function, each one a bug waiting to happen if
-- skipped:
--
-- 1. SEVERAL TEXT COLUMNS. A project's title and description are both member
--    prose; scanning one and not the other is an obvious hole.
--
-- 2. BEFORE INSERT **OR UPDATE**. Bios, descriptions and CVs change by UPDATE.
--    An insert-only trigger lets a member post clean and edit a slur in
--    afterwards, which is the first thing anyone would try. Three guards come
--    with it: unchanged text returns early (an edit to an unrelated column must
--    not re-flag, re-report or re-suspend), a moderator-restored row is not
--    flipped back by the author's next keystroke elsewhere, and the row's own
--    status is left alone when the text did not move.
--
-- 3. MODES. Not every surface should be hidden on a match:
--      quarantine  — withhold the row (posts, comments, chat, solutions)
--      flag_only   — record the severity, file a report, leave it visible
--      revert      — restore the previous value of the text column
--    Quarantining an EVENT would make a running 200-person venue vanish
--    mid-session, because venue_rooms, event_rsvps, event_schedule and
--    event_solutions all join it. Hiding a GRANT has a deadline consequence
--    for every applicant. Both are flag_only: report it, notify, let a human
--    decide. A BIO cannot have a status column at all — profiles is joined
--    from everywhere and a status-aware policy there would break dozens of
--    queries and could lock a member out of their own account — but unlike a
--    post it has a prior good value, so it reverts.
--
-- 4. moderation_settings IS NOW HONOURED. moderate_content() has always
--    hard-coded warn/quarantine/suspend and ignored low_action, medium_action
--    and high_action, so the Settings tab has been changing values that do
--    nothing. That is a live bug with a blast radius of four tables. Extending
--    coverage to eleven multiplies it, so it is fixed FIRST, not after.
--
-- Auto-suspension stays on the original four tables only. A high-severity
-- match in a direct message is the grooming case the escalation exists for. A
-- false positive in a grant application on deadline day should cost a review,
-- not an account.
--
-- Rollout is gated by moderation_settings.enforce_tables, which starts EMPTY.
-- Applying this migration changes nothing until a table is named there, and
-- removing one takes effect in seconds without a migration. That switch is the
-- reason this can ship at all: it can hide content on the busiest tables on
-- the platform.
--
-- Idempotent — safe to re-run. Requires 065, 119 and 120.

-- ============================================================
-- 1. The rollout switch
-- ============================================================

ALTER TABLE moderation_settings
  ADD COLUMN IF NOT EXISTS enforce_tables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN moderation_settings.enforce_tables IS
  'Tables added in 122 whose moderation trigger is live. The four tables from 065 are always enforced and are not listed here. Empty means 122 is installed but dormant.';

-- ============================================================
-- 2. Status columns, only where a row can be withheld
-- ============================================================

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['projects', 'resources', 'event_solutions', 'venue_room_messages'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT ''active''', v_table);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', v_table, v_table || '_status_check');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (status IN (''active'', ''quarantined'', ''removed''))',
      v_table, v_table || '_status_check'
    );
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ', v_table);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I(status) WHERE status <> ''active''',
      'idx_' || v_table || '_status', v_table
    );
  END LOOP;

  -- Severity is recorded everywhere, including on the flag_only tables: the
  -- moderation queue needs to show what was found even where nothing was hidden.
  FOREACH v_table IN ARRAY ARRAY['projects', 'resources', 'event_solutions', 'venue_room_messages', 'events', 'grants', 'profiles', 'resumes'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS moderation_severity TEXT', v_table);
  END LOOP;
END $$;

-- venue_room_messages already has is_removed, which a host sets by hand. It is
-- deliberately NOT reused: "a host removed this" and "the filter withheld it"
-- are different facts and the queue has to tell them apart.
COMMENT ON COLUMN venue_room_messages.status IS
  'Set by the content filter. Distinct from is_removed, which is a host action.';

-- ============================================================
-- 3. Report target types
-- ============================================================

-- MUST come before the triggers. The CHECK lists seven values; a trigger that
-- files a report with a new one fails the INSERT, and because that INSERT is
-- inside the member's own transaction, their write fails with it. This is the
-- single most likely way to break the platform with this migration.
ALTER TABLE content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE content_reports ADD CONSTRAINT content_reports_target_type_check
  CHECK (target_type IN (
    'forum_post', 'forum_reply', 'project', 'project_comment', 'message', 'profile', 'grant',
    'event', 'resource', 'event_solution', 'venue_room_message', 'resume'
  ));

-- ============================================================
-- 4. The generalised trigger
-- ============================================================

-- TG_ARGV[0] = comma-separated text columns   ('title,description')
-- TG_ARGV[1] = author column, or '-' when the table has none (grants)
-- TG_ARGV[2] = 'quarantine' (default) | 'flag_only' | 'revert'
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
-- 5. The CV projection
-- ============================================================

CREATE OR REPLACE FUNCTION resume_scannable_text(p_data JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT concat_ws(E'\n',
    p_data ->> 'summary',
    (SELECT string_agg(e ->> 'description', E'\n') FROM jsonb_array_elements(COALESCE(p_data -> 'experience', '[]'::JSONB)) e),
    (SELECT string_agg(e ->> 'description', E'\n') FROM jsonb_array_elements(COALESCE(p_data -> 'education',  '[]'::JSONB)) e),
    (SELECT string_agg(e ->> 'description', E'\n') FROM jsonb_array_elements(COALESCE(p_data -> 'projects',   '[]'::JSONB)) e)
  );
$$;

COMMENT ON FUNCTION resume_scannable_text(JSONB) IS
  'The prose inside a CV. Deliberately narrow: scanning data::text would run the PII patterns over every URL, date and key in the document.';

-- ============================================================
-- 6. Triggers
-- ============================================================

DROP TRIGGER IF EXISTS moderate_projects_trigger ON projects;
CREATE TRIGGER moderate_projects_trigger
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION moderate_content('title,description', 'owner_id', 'quarantine');

DROP TRIGGER IF EXISTS moderate_resources_trigger ON resources;
CREATE TRIGGER moderate_resources_trigger
  BEFORE INSERT OR UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION moderate_content('title,description,content', 'author_id', 'quarantine');

DROP TRIGGER IF EXISTS moderate_event_solutions_trigger ON event_solutions;
CREATE TRIGGER moderate_event_solutions_trigger
  BEFORE INSERT OR UPDATE ON event_solutions
  FOR EACH ROW EXECUTE FUNCTION moderate_content('title,description', 'author_id', 'quarantine');

-- Realtime-published since 070. BEFORE INSERT is the only correct place:
-- Realtime applies RLS per subscriber, so a row inserted already-quarantined is
-- never delivered to the other attendees. The author's own client does receive
-- it, which is why RoomChatPanel renders a quarantine notice.
DROP TRIGGER IF EXISTS moderate_venue_room_messages_trigger ON venue_room_messages;
CREATE TRIGGER moderate_venue_room_messages_trigger
  BEFORE INSERT ON venue_room_messages
  FOR EACH ROW EXECUTE FUNCTION moderate_content('body', 'author_id', 'quarantine');

DROP TRIGGER IF EXISTS moderate_events_trigger ON events;
CREATE TRIGGER moderate_events_trigger
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION moderate_content('title,description', 'organizer_id', 'flag_only');

-- grants has no author column, so nobody is flagged and no report is filed;
-- the severity lands on the row and in the log for a human to pick up.
DROP TRIGGER IF EXISTS moderate_grants_trigger ON grants;
CREATE TRIGGER moderate_grants_trigger
  BEFORE INSERT OR UPDATE ON grants
  FOR EACH ROW EXECUTE FUNCTION moderate_content('title,description,eligibility', '-', 'flag_only');

DROP TRIGGER IF EXISTS moderate_profiles_bio_trigger ON profiles;
CREATE TRIGGER moderate_profiles_bio_trigger
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION moderate_content('bio', 'id', 'revert');

DROP TRIGGER IF EXISTS moderate_resumes_trigger ON resumes;
CREATE TRIGGER moderate_resumes_trigger
  BEFORE INSERT OR UPDATE ON resumes
  FOR EACH ROW EXECUTE FUNCTION moderate_content('data', 'user_id', 'flag_only');

-- Deliberately NOT scanned: sticky_notes, calendar_notes, and any resume with
-- is_public = FALSE. 093 states that notes are private from admins too.
-- Scanning them would mean the platform reads a member's private notebook and
-- can act on something no other person can see, which is a policy decision
-- with legal weight rather than a technical gap.

-- ============================================================
-- 7. SELECT policies — REPLACED, never added alongside
-- ============================================================

-- RLS ORs policies together, so a status-aware policy sitting next to the old
-- permissive one hides nothing at all. 065's header makes the same point.

DROP POLICY IF EXISTS "Public projects are viewable by everyone" ON projects;
CREATE POLICY "Public projects are viewable by everyone"
  ON projects FOR SELECT
  USING (
    (
      status = 'active'
      OR owner_id = auth.uid()
      OR has_permission(auth.uid(), 'moderation:view')
    )
    AND (
      is_public = TRUE
      OR owner_id = auth.uid()
      OR is_project_member(id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Anyone can view published resources" ON resources;
CREATE POLICY "Anyone can view published resources"
  ON resources FOR SELECT
  USING (
    is_published = TRUE
    AND (status = 'active' OR author_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'))
  );

DROP POLICY IF EXISTS "Solutions are readable per event stage" ON event_solutions;
CREATE POLICY "Solutions are readable per event stage"
  ON event_solutions FOR SELECT
  USING (
    (status = 'active' OR author_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'))
    AND (
      author_id = auth.uid()
      OR is_oecs_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_solutions.event_id
          AND e.organizer_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_solutions.event_id
          AND e.end_date IS NOT NULL
          AND e.end_date < now()
      )
    )
  );

DROP POLICY IF EXISTS "Venue members can read room chat" ON venue_room_messages;
CREATE POLICY "Venue members can read room chat"
  ON venue_room_messages FOR SELECT
  USING (
    (status = 'active' OR author_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'))
    AND (
      is_venue_member(auth.uid(), event_id)
      OR is_venue_host(auth.uid(), event_id)
    )
  );

-- ============================================================
-- 8. Restore, for the new target types
-- ============================================================

-- Without these branches, a moderator pressing Restore on one of the new
-- surfaces falls straight through the IF/ELSIF chain: the report is marked
-- actioned, the content stays hidden, and nobody finds out for weeks.
CREATE OR REPLACE FUNCTION set_content_status(
  p_target_type TEXT,
  p_target_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_target_type = 'forum_post' THEN
    UPDATE forum_posts SET status = p_status WHERE id = p_target_id;
  ELSIF p_target_type = 'forum_reply' THEN
    UPDATE forum_replies SET status = p_status WHERE id = p_target_id;
  ELSIF p_target_type = 'project_comment' THEN
    UPDATE project_comments SET status = p_status WHERE id = p_target_id;
  ELSIF p_target_type = 'message' THEN
    UPDATE messages SET status = p_status WHERE id = p_target_id;
  ELSIF p_target_type = 'project' THEN
    UPDATE projects SET status = p_status WHERE id = p_target_id;
  ELSIF p_target_type = 'resource' THEN
    UPDATE resources SET status = p_status WHERE id = p_target_id;
  ELSIF p_target_type = 'event_solution' THEN
    UPDATE event_solutions SET status = p_status WHERE id = p_target_id;
  ELSIF p_target_type = 'venue_room_message' THEN
    UPDATE venue_room_messages SET status = p_status WHERE id = p_target_id;
  ELSIF p_target_type = 'resume' THEN
    -- A CV has no status; the action that was taken was unpublishing it, so
    -- restoring means publishing it again.
    UPDATE resumes SET is_public = (p_status = 'active') WHERE id = p_target_id;
  END IF;
  -- event, grant and profile are flag_only or revert: nothing was hidden, so
  -- there is nothing to restore.
END;
$$;

NOTIFY pgrst, 'reload schema';
