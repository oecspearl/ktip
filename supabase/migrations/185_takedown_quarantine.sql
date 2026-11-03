-- ============================================================================
-- 185_takedown_quarantine.sql — a copyright notice under review hides the work
-- ============================================================================
--
-- 117 built the notice workflow but never touched the content: the queue's
-- "Action — remove content" button recorded a decision and left the resource
-- up. This makes each status do what it says.
--
--   reviewing                       → the content is quarantined (hidden from
--                                     everyone but its author and staff)
--   actioned                        → the content is removed
--   rejected / restored / withdrawn → the content comes back, if this notice
--                                     is what took it down and no other open
--                                     notice still holds it
--
-- A notice filed from the public form carries a URL and, when it came from a
-- "Report infringement" link, a type and id hint that nothing checked. A
-- moderator confirms the target with set_takedown_target() before review, which
-- also fills target_author_id. 117 left that NULL on every web filing, so the
-- accused author could not see the notice their own content was under.
--
-- held_content records that THIS notice changed the content's status. Without
-- it, rejecting a notice would restore a resource the content filter or a
-- report had quarantined for an unrelated reason.
--
-- Idempotent — safe to re-run. Requires 117, 122 and 183.
-- ============================================================================

ALTER TABLE takedown_notices
  ADD COLUMN IF NOT EXISTS held_content BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN takedown_notices.held_content IS
  'TRUE while this notice has quarantined or removed its target. Cleared when the content is released (185).';

CREATE INDEX IF NOT EXISTS idx_takedown_target
  ON takedown_notices(target_type, target_id)
  WHERE target_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 1. Who wrote it
-- ---------------------------------------------------------------------------
-- The content types set_content_status() can hide. Everything else a notice may
-- name (profile, document, snippet, cv, org_profile) has no status column, so
-- the moderator acts on it by hand and the notice records the decision only.
CREATE OR REPLACE FUNCTION takedown_target_author(p_type TEXT, p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author UUID;
BEGIN
  IF p_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_type = 'project' THEN
    SELECT owner_id INTO v_author FROM projects WHERE id = p_id;
  ELSIF p_type = 'resource' THEN
    SELECT author_id INTO v_author FROM resources WHERE id = p_id;
  ELSIF p_type = 'event' THEN
    SELECT organizer_id INTO v_author FROM events WHERE id = p_id;
  ELSIF p_type = 'forum_post' THEN
    SELECT author_id INTO v_author FROM forum_posts WHERE id = p_id;
  ELSIF p_type = 'forum_reply' THEN
    SELECT author_id INTO v_author FROM forum_replies WHERE id = p_id;
  ELSIF p_type = 'project_comment' THEN
    SELECT user_id INTO v_author FROM project_comments WHERE id = p_id;
  ELSIF p_type = 'event_solution' THEN
    SELECT author_id INTO v_author FROM event_solutions WHERE id = p_id;
  END IF;

  RETURN v_author;
END;
$$;

REVOKE ALL ON FUNCTION takedown_target_author(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- Current moderation status of a holdable target, or NULL when it does not
-- exist (deleted since the filing) or cannot be held.
CREATE OR REPLACE FUNCTION takedown_target_status(p_type TEXT, p_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF p_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_type = 'project' THEN
    SELECT status INTO v_status FROM projects WHERE id = p_id;
  ELSIF p_type = 'resource' THEN
    SELECT status INTO v_status FROM resources WHERE id = p_id;
  ELSIF p_type = 'event' THEN
    SELECT moderation_status INTO v_status FROM events WHERE id = p_id;
  ELSIF p_type = 'forum_post' THEN
    SELECT status INTO v_status FROM forum_posts WHERE id = p_id;
  ELSIF p_type = 'forum_reply' THEN
    SELECT status INTO v_status FROM forum_replies WHERE id = p_id;
  ELSIF p_type = 'project_comment' THEN
    SELECT status INTO v_status FROM project_comments WHERE id = p_id;
  ELSIF p_type = 'event_solution' THEN
    SELECT status INTO v_status FROM event_solutions WHERE id = p_id;
  END IF;

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION takedown_target_status(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Confirming the target
-- ---------------------------------------------------------------------------
-- Refused while the notice holds content: re-pointing it then would strand
-- the first target hidden with nothing left to release it.
CREATE OR REPLACE FUNCTION set_takedown_target(
  p_notice_id UUID,
  p_target_type TEXT,
  p_target_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_notice takedown_notices%ROWTYPE;
  v_author UUID;
BEGIN
  IF v_actor IS NULL OR NOT has_permission(v_actor, 'moderation:action') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_target_type NOT IN (
    'project', 'resource', 'event', 'forum_post', 'forum_reply', 'project_comment', 'event_solution'
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_type');
  END IF;

  SELECT * INTO v_notice FROM takedown_notices WHERE id = p_notice_id;
  IF NOT FOUND OR v_notice.kind <> 'takedown' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF v_notice.held_content THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'content_held');
  END IF;

  IF takedown_target_status(p_target_type, p_target_id) IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'target_not_found');
  END IF;

  v_author := takedown_target_author(p_target_type, p_target_id);

  UPDATE takedown_notices
  SET target_type = p_target_type,
      target_id = p_target_id,
      target_author_id = v_author,
      updated_at = now()
  WHERE id = p_notice_id;

  -- A counter-notice mirrors its parent's target, so the author's view of the
  -- pair stays consistent.
  UPDATE takedown_notices
  SET target_type = p_target_type,
      target_id = p_target_id,
      updated_at = now()
  WHERE parent_id = p_notice_id;

  -- The strike count follows the author; if the notice moved between authors
  -- the old one is recomputed too.
  IF v_notice.target_author_id IS DISTINCT FROM v_author THEN
    PERFORM refresh_copyright_strikes(v_notice.target_author_id);
    PERFORM refresh_copyright_strikes(v_author);
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'target_author_id', v_author);
END;
$$;

REVOKE ALL ON FUNCTION set_takedown_target(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_takedown_target(UUID, TEXT, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. apply_takedown_outcome — 117's body, now acting on the content
-- ---------------------------------------------------------------------------
-- Changes from 117, all marked 185 below:
--   * the content follows the status (the table at the top of this file);
--   * a missing target_author_id is filled from the target on the way through;
--   * 'reviewing' no longer stamps resolved_by/resolved_at, since starting a
--     review resolves nothing;
--   * the result says what happened to the content, so the queue can tell the
--     moderator instead of implying it.
CREATE OR REPLACE FUNCTION apply_takedown_outcome(
  p_notice_id UUID,
  p_status    TEXT,
  p_notes     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_notice  takedown_notices%ROWTYPE;
  v_strike  BOOLEAN;
  v_count   INTEGER;
  v_limit   INTEGER;
  v_author  UUID;
  v_current TEXT;
  v_want    TEXT;
  v_held    BOOLEAN;
  v_content TEXT := 'no_target';
BEGIN
  IF v_actor IS NULL OR NOT has_permission(v_actor, 'moderation:action') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_status NOT IN ('reviewing', 'actioned', 'rejected', 'restored', 'withdrawn') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_status');
  END IF;

  SELECT * INTO v_notice FROM takedown_notices WHERE id = p_notice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  -- 185. Fill the author from the target when the filing left it blank.
  v_author := COALESCE(
    v_notice.target_author_id,
    takedown_target_author(v_notice.target_type, v_notice.target_id)
  );

  -- 185. The content.
  v_held := v_notice.held_content;
  v_current := takedown_target_status(v_notice.target_type, v_notice.target_id);

  IF v_notice.target_id IS NULL THEN
    v_content := 'no_target';
  ELSIF v_current IS NULL THEN
    -- Deleted since filing, or a type with no status column.
    v_content := 'unsupported';
  ELSE
    v_want := CASE p_status
      WHEN 'reviewing' THEN 'quarantined'
      WHEN 'actioned'  THEN 'removed'
      ELSE 'active'
    END;

    IF v_want = 'active' THEN
      IF NOT v_notice.held_content THEN
        -- Hidden for some other reason, or never hidden: not this notice's to release.
        v_content := 'kept';
      ELSIF EXISTS (
        SELECT 1 FROM takedown_notices o
        WHERE o.id <> p_notice_id
          AND o.kind = 'takedown'
          AND o.target_type = v_notice.target_type
          AND o.target_id = v_notice.target_id
          AND o.held_content
      ) THEN
        -- Another notice still holds it. Release this one's claim only.
        v_held := FALSE;
        v_content := 'still_held';
      ELSE
        IF v_current <> 'active' THEN
          PERFORM set_content_status(v_notice.target_type, v_notice.target_id, 'active');
          INSERT INTO moderation_log (actor_kind, actor_id, user_id, target_type, target_id, action, detail)
          VALUES ('admin', v_actor, v_author, v_notice.target_type, v_notice.target_id, 'restored',
                  jsonb_build_object('notice_id', p_notice_id, 'reference', v_notice.reference, 'status', p_status));
        END IF;
        v_held := FALSE;
        v_content := 'restored';
      END IF;
    ELSIF v_want = 'quarantined' AND v_current = 'removed' THEN
      -- Back to review after an upheld notice: it stays down until decided.
      v_content := 'kept';
    ELSIF v_current = v_want THEN
      -- Already in that state. Claim it only if this notice put it there.
      v_content := 'kept';
    ELSE
      PERFORM set_content_status(v_notice.target_type, v_notice.target_id, v_want);
      INSERT INTO moderation_log (actor_kind, actor_id, user_id, target_type, target_id, action, detail)
      VALUES ('admin', v_actor, v_author, v_notice.target_type, v_notice.target_id, v_want,
              jsonb_build_object('notice_id', p_notice_id, 'reference', v_notice.reference, 'status', p_status));
      v_held := TRUE;
      v_content := v_want;
    END IF;
  END IF;

  -- Actioned means the content came down and the notice stands. Everything
  -- else — rejected, restored after a counter-notice, withdrawn by the
  -- claimant — clears the strike, which is what makes a counter-notice worth
  -- filing.
  v_strike := (p_status = 'actioned');

  UPDATE takedown_notices
  SET status = p_status,
      counts_as_strike = v_strike,
      held_content = v_held,
      target_author_id = v_author,
      admin_notes = COALESCE(p_notes, admin_notes),
      resolved_by = CASE WHEN p_status = 'reviewing' THEN resolved_by ELSE v_actor END,
      resolved_at = CASE WHEN p_status = 'reviewing' THEN resolved_at ELSE now() END,
      updated_at = now()
  WHERE id = p_notice_id;

  v_count := refresh_copyright_strikes(v_author);

  INSERT INTO moderation_log (actor_kind, actor_id, user_id, target_type, target_id, action, detail)
  VALUES (
    'admin',
    v_actor,
    v_author,
    v_notice.target_type,
    v_notice.target_id,
    CASE WHEN p_status = 'restored' THEN 'restored_after_counter' ELSE 'takedown' END,
    jsonb_build_object(
      'notice_id', p_notice_id,
      'reference', v_notice.reference,
      'status', p_status,
      'strikes', v_count,
      'content', v_content
    )
  );

  SELECT copyright_strike_limit INTO v_limit FROM moderation_settings WHERE id = 1;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'strikes', v_count,
    'limit', COALESCE(v_limit, 3),
    -- Reported, not executed. Terminating an account is a decision a person
    -- makes with the queue in front of them.
    'at_limit', v_count >= COALESCE(v_limit, 3),
    -- 185: no_target | unsupported | kept | still_held | quarantined | removed | restored
    'content', v_content
  );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_takedown_outcome(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Verify, with a test resource R and notice N:
--   SELECT set_takedown_target(N, 'resource', R);
--   SELECT apply_takedown_outcome(N, 'reviewing');   -- content: quarantined
--   SELECT status FROM resources WHERE id = R;      -- quarantined
--   SELECT apply_takedown_outcome(N, 'rejected');    -- content: restored
--   SELECT status FROM resources WHERE id = R;      -- active
