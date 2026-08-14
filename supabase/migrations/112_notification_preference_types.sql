-- ============================================================
-- Migration 112: seven notification types get their mute switch back
--
-- enforce_notification_preferences() maps a notification's type to the column
-- in notification_preferences that governs it. 096 rewrote the function to add
-- the two event-registration types and, in doing so, restated the CASE from the
-- version before 079 — silently dropping the seven types 079 had added:
--
--   collaboration : snippet_share, collab_invite, invite_accepted,
--                   document_access_request, document_access_result
--   projects      : project_join_request, project_join_result
--
-- The tail of the CASE is ELSE TRUE, so nothing was ever lost — these kept
-- being delivered. What broke is quieter and worse: they stopped answering to
-- the user's preferences. Someone who turned Projects off in Settings still got
-- every join request, and had no way to find out why.
--
-- Only visible on a database that received 079 BEFORE 096. Ours did, in the
-- order the files are numbered; it surfaced while applying 096 late.
--
-- This is the union of both lists. Nothing else about the function changes.
--
-- Not mapped, deliberately: grant_application_result (098) and the 111
-- engagement messages have no column in notification_preferences to answer to,
-- so ELSE TRUE is the correct — and only — answer for them. Muting a decision
-- on your own application is not a setting anyone has asked for.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  category_enabled BOOLEAN;
BEGIN
  SELECT CASE
    WHEN NEW.type IN ('video_invite', 'whiteboard_share', 'document_share',
                      'snippet_share', 'collab_invite', 'invite_accepted',
                      'document_access_request', 'document_access_result') THEN collaboration
    WHEN NEW.type IN ('project_invite', 'project_update', 'project_follow',
                      'project_join_request', 'project_join_result') THEN projects
    WHEN NEW.type IN ('connection_request', 'connection_accepted') THEN connections
    WHEN NEW.type IN ('message') THEN messages
    WHEN NEW.type IN ('event_reminder', 'event_update',
                      'event_registration_request', 'event_registration_result') THEN events
    WHEN NEW.type IN ('forum_reply') THEN forums
    ELSE TRUE
  END
  INTO category_enabled
  FROM notification_preferences
  WHERE user_id = NEW.user_id;

  IF category_enabled = FALSE THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- Verification
--
-- Every type below must appear in the function body; the count is the point.
--
--   SELECT count(*) FROM regexp_matches(
--     (SELECT prosrc FROM pg_proc WHERE proname = 'enforce_notification_preferences'),
--     'project_join_request|project_join_result|snippet_share|collab_invite|'
--     || 'invite_accepted|document_access_request|document_access_result',
--     'g');                                                        -- 7
--
-- End to end, with a user who has turned Projects off:
--
--   UPDATE notification_preferences SET projects = FALSE WHERE user_id = '<uid>';
--   INSERT INTO notifications (user_id, type, title, body)
--   VALUES ('<uid>', 'project_join_request', 't', 'b');
--   SELECT count(*) FROM notifications
--    WHERE user_id = '<uid>' AND type = 'project_join_request';     -- 0, was 1
-- ============================================================

NOTIFY pgrst, 'reload schema';
