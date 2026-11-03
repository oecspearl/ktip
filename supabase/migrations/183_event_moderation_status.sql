-- ============================================================================
-- 183_event_moderation_status.sql — admins can suspend events, and suspending
-- anything from the console is permission-checked and logged
-- ============================================================================
--
-- Four changes.
--
-- 1. events.moderation_status. Events never got the `status` moderation column
--    122 gave projects and resources, because events.status already means
--    draft/published/cancelled/completed. The new column carries the same three
--    values as the others (active / quarantined / removed) under a name that
--    cannot be confused with the lifecycle one. 122's content filter stays
--    flag_only on events: this column is only ever set by a person.
--
-- 2. The public SELECT policy hides a non-active event from everyone except its
--    organizer and staff (event:manage or moderation:view). Policies OR
--    together, so this REPLACES 116's policy of the same name rather than
--    sitting beside it.
--
-- 3. set_content_status() learns 'event', and is no longer callable from the
--    API. Until now it was SECURITY DEFINER with no permission check and the
--    default EXECUTE grant, so any signed-in member could quarantine anyone's
--    project with one RPC. Every legitimate caller (apply_report_threshold,
--    moderate_report, apply_takedown_outcome and the new RPC below) is itself
--    SECURITY DEFINER and runs as the owner, so revoking the grant breaks none
--    of them.
--
-- 4. admin_set_content_status(): the console's door. Permission-checked,
--    resolves the owner, writes moderation_log.
--
-- Plus a guard trigger: an owner can no longer lift a hold by writing the
-- column back to 'active' through the ordinary UPDATE policy.
--
-- Idempotent — safe to re-run. Requires 065, 116 and 122.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
ALTER TABLE events ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_moderation_status_check;
ALTER TABLE events ADD CONSTRAINT events_moderation_status_check
  CHECK (moderation_status IN ('active', 'quarantined', 'removed'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_events_moderation_status
  ON events(moderation_status)
  WHERE moderation_status <> 'active';

COMMENT ON COLUMN events.moderation_status IS
  'Set by an admin (183) or a takedown review (185). Distinct from status, which is the event lifecycle. Non-active rows are hidden from everyone but the organizer and staff.';

-- ---------------------------------------------------------------------------
-- 2. Visibility — replaces 116's policy of the same name
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view non-draft events" ON events;
CREATE POLICY "Public can view non-draft events"
  ON events FOR SELECT
  USING (
    (
      status IN ('published', 'completed', 'cancelled')
      AND moderation_status = 'active'
    )
    OR auth.uid() = organizer_id
    OR has_permission(auth.uid(), 'event:manage')
    OR has_permission(auth.uid(), 'moderation:view')
  );

-- ---------------------------------------------------------------------------
-- 3. set_content_status — 122's body, plus events and the guard bypass
-- ---------------------------------------------------------------------------
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
  -- The guard below refuses an owner lifting a hold. This function is the
  -- moderation path, so it says so for the length of its own writes.
  PERFORM set_config('ktip.bypass_content_status_guard', 'on', TRUE);

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
  ELSIF p_target_type = 'event' THEN
    -- 183. Only a person ever lands here; the filter is flag_only on events.
    UPDATE events
    SET moderation_status = p_status,
        quarantined_at = CASE WHEN p_status = 'active' THEN NULL ELSE now() END
    WHERE id = p_target_id;
  ELSIF p_target_type = 'resume' THEN
    -- A CV has no status; the action that was taken was unpublishing it, so
    -- restoring means publishing it again.
    UPDATE resumes SET is_public = (p_status = 'active') WHERE id = p_target_id;
  END IF;
  -- grant and profile are flag_only or revert: nothing was hidden, so there is
  -- nothing to restore.

  PERFORM set_config('ktip.bypass_content_status_guard', 'off', TRUE);
END;
$$;

-- Internal only. Every caller is a SECURITY DEFINER function.
REVOKE ALL ON FUNCTION set_content_status(TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_content_status(TEXT, UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION set_content_status(TEXT, UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Owners cannot lift a hold themselves
-- ---------------------------------------------------------------------------
-- Before this, the owner UPDATE policies on projects, resources and events let
-- the owner write status = 'active' over a moderator's decision. Only lifting
-- is refused: an owner hiding their own work is harmless, and the content
-- filter sets 'quarantined' inside the author's own write. No JWT (service
-- role, migrations) passes, as the profile guard does.
--
-- TG_ARGV[0] names the column, because events use moderation_status.
CREATE OR REPLACE FUNCTION guard_content_moderation_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col TEXT := TG_ARGV[0];
  v_old TEXT := to_jsonb(OLD) ->> v_col;
  v_new TEXT := to_jsonb(NEW) ->> v_col;
BEGIN
  IF v_old IS NOT DISTINCT FROM v_new THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL
     OR current_setting('ktip.bypass_content_status_guard', TRUE) = 'on'
     OR has_permission(auth.uid(), 'moderation:action') THEN
    RETURN NEW;
  END IF;

  IF v_old IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'This is under moderation review and only a moderator can restore it'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_projects_moderation_status ON projects;
CREATE TRIGGER guard_projects_moderation_status
  BEFORE UPDATE OF status ON projects
  FOR EACH ROW EXECUTE FUNCTION guard_content_moderation_status('status');

DROP TRIGGER IF EXISTS guard_resources_moderation_status ON resources;
CREATE TRIGGER guard_resources_moderation_status
  BEFORE UPDATE OF status ON resources
  FOR EACH ROW EXECUTE FUNCTION guard_content_moderation_status('status');

DROP TRIGGER IF EXISTS guard_events_moderation_status ON events;
CREATE TRIGGER guard_events_moderation_status
  BEFORE UPDATE OF moderation_status ON events
  FOR EACH ROW EXECUTE FUNCTION guard_content_moderation_status('moderation_status');

-- ---------------------------------------------------------------------------
-- 5. The console's door
-- ---------------------------------------------------------------------------
-- Suspend (quarantined), remove, or restore (active) one project, event or
-- resource. The caller needs moderation:action or the domain's own admin key,
-- the same keys the console pages are already gated on. Returns a reason
-- rather than raising, in the shape the client maps, and the owner's id so
-- the console can address its note.
CREATE OR REPLACE FUNCTION admin_set_content_status(
  p_target_type TEXT,
  p_target_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_owner  UUID;
  v_found  BOOLEAN := FALSE;
  v_before TEXT;
  v_reason TEXT := NULLIF(left(btrim(COALESCE(p_reason, '')), 1000), '');
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_target_type NOT IN ('project', 'event', 'resource') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_type');
  END IF;

  IF p_status NOT IN ('active', 'quarantined', 'removed') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_status');
  END IF;

  IF NOT (
    has_permission(v_actor, 'moderation:action')
    OR (p_target_type = 'project'  AND has_permission(v_actor, 'project:manage_all'))
    OR (p_target_type = 'event'    AND has_permission(v_actor, 'event:manage'))
    OR (p_target_type = 'resource' AND has_permission(v_actor, 'resource:manage'))
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_target_type = 'project' THEN
    SELECT TRUE, owner_id, status INTO v_found, v_owner, v_before FROM projects WHERE id = p_target_id;
  ELSIF p_target_type = 'event' THEN
    SELECT TRUE, organizer_id, moderation_status INTO v_found, v_owner, v_before FROM events WHERE id = p_target_id;
  ELSE
    SELECT TRUE, author_id, status INTO v_found, v_owner, v_before FROM resources WHERE id = p_target_id;
  END IF;

  IF NOT COALESCE(v_found, FALSE) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF v_before = p_status THEN
    RETURN jsonb_build_object('ok', TRUE, 'owner_id', v_owner, 'changed', FALSE);
  END IF;

  PERFORM set_content_status(p_target_type, p_target_id, p_status);

  INSERT INTO moderation_log (actor_kind, actor_id, user_id, target_type, target_id, action, detail)
  VALUES (
    'admin',
    v_actor,
    v_owner,
    p_target_type,
    p_target_id,
    CASE p_status
      WHEN 'quarantined' THEN 'quarantined'
      WHEN 'removed' THEN 'removed'
      ELSE 'restored'
    END,
    jsonb_build_object('source', 'admin_console', 'from', v_before, 'to', p_status, 'reason', v_reason)
  );

  RETURN jsonb_build_object('ok', TRUE, 'owner_id', v_owner, 'changed', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION admin_set_content_status(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_content_status(TEXT, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION admin_set_content_status(TEXT, UUID, TEXT, TEXT) IS
  'Console suspend/restore for a project, event or resource. Needs moderation:action or the domain admin key; logs to moderation_log (183).';

NOTIFY pgrst, 'reload schema';

-- Verify:
--   SELECT has_function_privilege('authenticated', 'set_content_status(text,uuid,text)', 'EXECUTE');  -- false
--   SELECT count(*) FROM events WHERE moderation_status <> 'active';                                 -- 0
