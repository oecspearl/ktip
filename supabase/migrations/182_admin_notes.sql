-- ============================================================
-- Migration 182: notes from KTIP to the people behind a piece of content
--
-- Decided at the Nov 2026 stakeholder meeting. An administrator who wants a
-- funding call changed cannot edit it any more (181), so they need a way to
-- say what is wrong to whoever can. That is this table: a short thread
-- between the platform and the owner of one thing on it.
--
--   * an administrator starts a thread about a target: a funding call, a
--     project, an event, a resource, an organisation or an account;
--   * send_admin_note() works out who that goes to (the poster, owner,
--     organiser, author or the account itself) and which organisation, if
--     any, so the organisation's other managers see it too;
--   * the recipient reads it under "Notes from KTIP" on /dashboard/feedback
--     and can reply in the same thread;
--   * each note rings the bell; api/admin/note-notify.ts sends the email.
--
-- Generic on purpose. 181's suspensions file their reason here, and the
-- project, event, resource and account suspensions that follow can do the
-- same through send_admin_note(..., p_kind => 'suspension').
--
-- Writes go through the RPCs only. There is no INSERT, UPDATE or DELETE
-- policy: a note's target, recipient and author are worked out by the
-- database, never taken from the browser.
--
-- Requires 181 (runs_employer, set_grant_suspension).
-- Safe to re-run.
-- ============================================================

-- ============================================================
-- 1. The table
--
-- recipient_user_id and created_by point at auth.users, not profiles, so this
-- table adds no FK to profiles and cannot make an existing profiles embed
-- ambiguous. Names are read from profiles separately.
--
-- ON DELETE SET NULL throughout: an administrator's note about a call is part
-- of the record of how that call was handled and outlives either person.
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_notes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type       TEXT NOT NULL
                    CHECK (target_type IN ('grant', 'project', 'event', 'resource', 'account', 'employer')),
  target_id         UUID NOT NULL,
  -- What the target was called when the thread started. The recipient may lose
  -- sight of the target itself (a suspended event, a deleted project), and the
  -- thread still has to say what it was about.
  subject           TEXT,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  employer_id       UUID REFERENCES employers(id) ON DELETE SET NULL,
  parent_id         UUID REFERENCES admin_notes(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL DEFAULT 'note'
                    CHECK (kind IN ('note', 'suspension', 'restoration')),
  body              TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  -- TRUE when written from the platform side. Decided by send_admin_note(),
  -- and what tells the thread which way round to draw a message.
  from_admin        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Read by the other side. Set through mark_admin_notes_read().
  read_at           TIMESTAMPTZ,
  -- Set by api/admin/note-notify.ts with the service role, so one note is
  -- never emailed twice.
  emailed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_notes_recipient ON admin_notes(recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notes_employer  ON admin_notes(employer_id, created_at DESC) WHERE employer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_notes_target    ON admin_notes(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_notes_parent    ON admin_notes(parent_id) WHERE parent_id IS NOT NULL;

COMMENT ON TABLE admin_notes IS
  'Threads from KTIP administrators to the owner of a piece of content or an account (182). Written only through send_admin_note().';

-- ============================================================
-- 2. Who writes on the platform side
--
-- Any seat that acts on content or accounts: the Admin (org:manage), the
-- Programmes seat (grant:manage, project:manage_all, resource:manage), the
-- People seat and the Safety Admin (moderation:action, members:manage), and
-- whoever holds event:manage. A key test, not a role test, so a seat added
-- later at /admin/roles is covered without touching this.
-- ============================================================

CREATE OR REPLACE FUNCTION can_send_admin_notes(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND (
       has_permission(p_user, 'org:manage')
    OR has_permission(p_user, 'grant:manage')
    OR has_permission(p_user, 'moderation:action')
    OR has_permission(p_user, 'members:manage')
    OR has_permission(p_user, 'project:manage_all')
    OR has_permission(p_user, 'resource:manage')
    OR has_permission(p_user, 'event:manage')
  );
$$;

REVOKE ALL ON FUNCTION can_send_admin_notes(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_send_admin_notes(UUID) TO authenticated;

-- ============================================================
-- 3. RLS
--
-- Read: the platform side, the recipient, and anybody who runs the
-- organisation the note was filed against. Replies copy the root's recipient
-- and organisation, so this one rule covers whole threads.
-- ============================================================

ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notes are read by both sides of the thread" ON admin_notes;
CREATE POLICY "Notes are read by both sides of the thread"
  ON admin_notes FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      recipient_user_id = auth.uid()
      OR runs_employer(employer_id, auth.uid())
      OR can_send_admin_notes(auth.uid())
    )
  );

REVOKE ALL ON admin_notes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON admin_notes FROM authenticated;
GRANT SELECT ON admin_notes TO authenticated;

-- ============================================================
-- 4. Sending a note, or replying to one
--
-- New thread (p_parent NULL): platform side only. The recipient and the
-- organisation are looked up from the target.
-- Reply (p_parent set): either side of that thread. The reply is attached to
-- the thread's first note whatever note was passed, so a thread stays one
-- level deep.
--
-- The other side is told on the bell. The recipient's link is the page the
-- thread lives on; the administrator's is the console page for the target.
-- ============================================================

CREATE OR REPLACE FUNCTION send_admin_note(
  p_target_type TEXT,
  p_target_id   UUID,
  p_body        TEXT,
  p_parent      UUID DEFAULT NULL,
  p_kind        TEXT DEFAULT 'note'
)
RETURNS admin_notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_body       TEXT := btrim(coalesce(p_body, ''));
  v_admin      BOOLEAN;
  v_root       admin_notes%ROWTYPE;
  v_note       admin_notes%ROWTYPE;
  v_recipient  UUID;
  v_employer   UUID;
  v_subject    TEXT;
  v_found      BOOLEAN := FALSE;
  v_from_admin BOOLEAN;
  v_notify     UUID;
  v_link       TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  IF char_length(v_body) < 1 OR char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'a note is between 1 and 4000 characters' USING ERRCODE = 'check_violation';
  END IF;

  IF coalesce(p_kind, 'note') NOT IN ('note', 'suspension', 'restoration') THEN
    RAISE EXCEPTION 'unknown note kind: %', p_kind;
  END IF;

  v_admin := can_send_admin_notes(v_uid);

  IF p_parent IS NOT NULL THEN
    -- ---------- a reply ----------
    SELECT * INTO v_root FROM admin_notes WHERE id = p_parent;
    IF v_root.id IS NOT NULL AND v_root.parent_id IS NOT NULL THEN
      SELECT * INTO v_root FROM admin_notes WHERE id = v_root.parent_id;
    END IF;

    -- One message for "missing" and "not yours": a thread you cannot read is
    -- not one you get to learn exists.
    IF v_root.id IS NULL OR NOT (
         v_admin
      OR v_root.recipient_user_id = v_uid
      OR runs_employer(v_root.employer_id, v_uid)
    ) THEN
      RAISE EXCEPTION 'note not found';
    END IF;

    -- The member side of a thread is the member side even if that member also
    -- holds an admin key.
    v_from_admin := v_admin
      AND v_root.recipient_user_id IS DISTINCT FROM v_uid
      AND NOT runs_employer(v_root.employer_id, v_uid);

    INSERT INTO admin_notes (target_type, target_id, subject, recipient_user_id, employer_id,
                             parent_id, kind, body, from_admin, created_by)
    VALUES (v_root.target_type, v_root.target_id, v_root.subject, v_root.recipient_user_id,
            v_root.employer_id, v_root.id, 'note', v_body, v_from_admin, v_uid)
    RETURNING * INTO v_note;

  ELSE
    -- ---------- a new thread ----------
    IF NOT v_admin THEN
      RAISE EXCEPTION 'only KTIP administrators can start a note' USING ERRCODE = 'insufficient_privilege';
    END IF;

    CASE p_target_type
      WHEN 'grant' THEN
        SELECT g.created_by, g.employer_id, g.title, TRUE
          INTO v_recipient, v_employer, v_subject, v_found
          FROM grants g WHERE g.id = p_target_id;
      WHEN 'project' THEN
        SELECT p.owner_id, p.employer_id, p.title, TRUE
          INTO v_recipient, v_employer, v_subject, v_found
          FROM projects p WHERE p.id = p_target_id;
      WHEN 'event' THEN
        SELECT e.organizer_id, e.employer_id, e.title, TRUE
          INTO v_recipient, v_employer, v_subject, v_found
          FROM events e WHERE e.id = p_target_id;
      WHEN 'resource' THEN
        SELECT r.author_id, NULL::UUID, r.title, TRUE
          INTO v_recipient, v_employer, v_subject, v_found
          FROM resources r WHERE r.id = p_target_id;
      WHEN 'account' THEN
        SELECT pr.id, NULL::UUID, pr.display_name, TRUE
          INTO v_recipient, v_employer, v_subject, v_found
          FROM profiles pr WHERE pr.id = p_target_id;
      WHEN 'employer' THEN
        SELECT em.created_by, em.id, coalesce(em.trading_name, em.legal_name), TRUE
          INTO v_recipient, v_employer, v_subject, v_found
          FROM employers em WHERE em.id = p_target_id;
      ELSE
        RAISE EXCEPTION 'unknown target type: %', p_target_type;
    END CASE;

    IF NOT coalesce(v_found, FALSE) THEN
      RAISE EXCEPTION '% not found', p_target_type;
    END IF;

    IF v_recipient IS NULL AND v_employer IS NULL THEN
      RAISE EXCEPTION 'nobody is responsible for this % any more, so there is nobody to send a note to', p_target_type;
    END IF;

    v_from_admin := TRUE;

    INSERT INTO admin_notes (target_type, target_id, subject, recipient_user_id, employer_id,
                             parent_id, kind, body, from_admin, created_by)
    VALUES (p_target_type, p_target_id, left(v_subject, 300), v_recipient, v_employer,
            NULL, coalesce(p_kind, 'note'), v_body, TRUE, v_uid)
    RETURNING * INTO v_note;
  END IF;

  -- ---------- the bell ----------
  IF v_from_admin THEN
    v_notify := v_note.recipient_user_id;
    IF v_notify IS NULL AND v_note.employer_id IS NOT NULL THEN
      SELECT em.created_by INTO v_notify FROM employers em WHERE em.id = v_note.employer_id;
    END IF;
    v_link := '/dashboard/feedback';
  ELSE
    v_notify := v_root.created_by;
    v_link := CASE v_note.target_type
      WHEN 'grant'    THEN '/admin/grants'
      WHEN 'project'  THEN '/admin/projects'
      WHEN 'event'    THEN '/admin/events'
      WHEN 'resource' THEN '/admin/resources'
      WHEN 'employer' THEN '/admin/employers'
      ELSE '/admin/users'
    END;
  END IF;

  IF v_notify IS NOT NULL THEN
    PERFORM send_notification(
      v_notify,
      'admin_note',
      CASE
        WHEN NOT v_from_admin THEN 'Reply to your note'
        WHEN v_note.kind = 'suspension' THEN 'A note from KTIP about a suspension'
        ELSE 'A note from KTIP'
      END,
      left(coalesce(v_note.subject || ': ', '') || v_note.body, 1000),
      v_link
    );
  END IF;

  RETURN v_note;
END;
$$;

COMMENT ON FUNCTION send_admin_note(TEXT, UUID, TEXT, UUID, TEXT) IS
  'Start a thread about a target (administrators) or reply to one (either side). Resolves the recipient and organisation, and notifies the other side.';

REVOKE ALL ON FUNCTION send_admin_note(TEXT, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION send_admin_note(TEXT, UUID, TEXT, UUID, TEXT) TO authenticated;

-- ============================================================
-- 5. Marking notes read
--
-- Only notes the caller can read and did not write. Returns how many moved,
-- so the client can skip a refetch when nothing did.
-- ============================================================

CREATE OR REPLACE FUNCTION mark_admin_notes_read(p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_admin BOOLEAN;
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL OR p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;

  v_admin := can_send_admin_notes(v_uid);

  UPDATE admin_notes n
     SET read_at = now()
   WHERE n.id = ANY(p_ids)
     AND n.read_at IS NULL
     AND n.created_by IS DISTINCT FROM v_uid
     AND (
       -- the member side reads what the platform wrote
       (n.from_admin AND (n.recipient_user_id = v_uid OR runs_employer(n.employer_id, v_uid)))
       -- the platform side reads the replies
       OR (NOT n.from_admin AND v_admin)
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION mark_admin_notes_read(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_admin_notes_read(UUID[]) TO authenticated;

-- The caller's own threads: addressed to them, or to an organisation they run.
-- RLS alone would hand an administrator every note on the platform, and
-- "Notes from KTIP" is about the notes sent TO you.
CREATE OR REPLACE FUNCTION my_admin_notes()
RETURNS SETOF admin_notes
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT n.*
    FROM admin_notes n
   WHERE auth.uid() IS NOT NULL
     AND (n.recipient_user_id = auth.uid() OR runs_employer(n.employer_id, auth.uid()))
   ORDER BY n.created_at;
$$;

REVOKE ALL ON FUNCTION my_admin_notes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_admin_notes() TO authenticated;

-- ============================================================
-- 6. Suspensions file their reason as a note
--
-- 181's set_grant_suspension() with its bare notification replaced by a
-- thread: the poster gets the reason as a note they can answer, and the
-- result carries the note's id so the console can email it.
-- A restore files a note only when the administrator wrote something; a bare
-- restore still rings the bell.
-- ============================================================

CREATE OR REPLACE FUNCTION set_grant_suspension(
  p_grant UUID,
  p_suspended BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_reason TEXT := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_grant  grants%ROWTYPE;
  v_notify UUID;
  v_note   admin_notes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  IF NOT has_permission(v_uid, 'grant:manage') THEN
    RAISE EXCEPTION 'only a funding administrator can suspend or restore a funding call'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_suspended AND v_reason IS NULL THEN
    RAISE EXCEPTION 'give a reason for the suspension' USING ERRCODE = 'check_violation';
  END IF;

  IF v_reason IS NOT NULL AND char_length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'keep the reason under 2000 characters' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_grant FROM grants WHERE id = p_grant;
  IF v_grant.id IS NULL THEN
    RAISE EXCEPTION 'funding call not found';
  END IF;

  IF (v_grant.moderation_status = 'suspended') = p_suspended THEN
    RETURN jsonb_build_object('ok', TRUE, 'changed', FALSE, 'note_id', NULL);
  END IF;

  UPDATE grants SET
    moderation_status = CASE WHEN p_suspended THEN 'suspended' ELSE 'active' END,
    suspension_reason = CASE WHEN p_suspended THEN v_reason ELSE NULL END,
    suspended_at      = CASE WHEN p_suspended THEN now() ELSE NULL END,
    suspended_by      = CASE WHEN p_suspended THEN v_uid ELSE NULL END,
    updated_at        = now()
  WHERE id = p_grant;

  INSERT INTO moderation_log (actor_kind, actor_id, user_id, target_type, target_id, action, detail)
  VALUES (
    'admin', v_uid, v_grant.created_by, 'grant', p_grant,
    CASE WHEN p_suspended THEN 'suspended' ELSE 'restored' END,
    jsonb_build_object('reason', v_reason, 'title', v_grant.title)
  );

  IF v_reason IS NOT NULL AND (v_grant.created_by IS NOT NULL OR v_grant.employer_id IS NOT NULL) THEN
    -- send_admin_note() rings the bell itself.
    v_note := send_admin_note(
      'grant', p_grant, v_reason, NULL,
      CASE WHEN p_suspended THEN 'suspension' ELSE 'restoration' END
    );
  ELSE
    v_notify := v_grant.created_by;
    IF v_notify IS NULL AND v_grant.employer_id IS NOT NULL THEN
      SELECT e.created_by INTO v_notify FROM employers e WHERE e.id = v_grant.employer_id;
    END IF;

    IF v_notify IS NOT NULL THEN
      PERFORM send_notification(
        v_notify,
        CASE WHEN p_suspended THEN 'grant_suspended' ELSE 'grant_restored' END,
        CASE WHEN p_suspended THEN 'Your funding call was suspended' ELSE 'Your funding call is visible again' END,
        CASE WHEN p_suspended
          THEN left('KTIP suspended "' || v_grant.title || '".', 1000)
          ELSE left('"' || v_grant.title || '" is visible to members again.', 1000)
        END,
        '/grants/' || coalesce(v_grant.slug, v_grant.id::TEXT)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'changed', TRUE, 'note_id', v_note.id);
END;
$$;

COMMENT ON FUNCTION set_grant_suspension(UUID, BOOLEAN, TEXT) IS
  'Suspend (with a reason) or restore a funding call. grant:manage only. Logs to moderation_log and files the reason as an admin note to the poster (182).';

REVOKE ALL ON FUNCTION set_grant_suspension(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_grant_suspension(UUID, BOOLEAN, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 7. Verification
--
--   -- as an administrator
--   SELECT send_admin_note('grant', '<grant id>', 'Please add the closing date to the description.');
--   -- the poster now has a notification of type admin_note, and:
--   SELECT id, subject, body, from_admin FROM admin_notes ORDER BY created_at DESC LIMIT 1;
--
--   -- as the poster: reply, then the administrator has a notification
--   SELECT send_admin_note(NULL, NULL, 'Done, thanks.', '<note id>');
--
--   -- as an unrelated member: nothing
--   SELECT count(*) FROM admin_notes;   -- 0
--   SELECT send_admin_note(NULL, NULL, 'hi', '<note id>');   -- note not found
-- ============================================================
