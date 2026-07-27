-- ============================================================
-- Migration 036: Notification Preferences + notification hardening
-- 1. notification_preferences table (per-user category toggles;
--    replaces the localStorage-only 'ktip_preferences' blob).
-- 2. Enforcement at the DB layer: a BEFORE INSERT trigger on
--    notifications silently drops rows whose category the
--    recipient has switched off — enforced no matter who inserts.
-- 3. FIX security hole from 017: INSERT policy was
--    WITH CHECK (true), letting any user spam notifications at
--    any user. Direct inserts are now removed in favour of a
--    send_notification() RPC (SECURITY DEFINER) with basic
--    validation. All client call sites use the RPC.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email BOOLEAN NOT NULL DEFAULT TRUE,
  messages BOOLEAN NOT NULL DEFAULT TRUE,
  events BOOLEAN NOT NULL DEFAULT TRUE,
  projects BOOLEAN NOT NULL DEFAULT TRUE,
  forums BOOLEAN NOT NULL DEFAULT TRUE,
  collaboration BOOLEAN NOT NULL DEFAULT TRUE,
  connections BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER set_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
CREATE POLICY "Users can view own preferences"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own preferences" ON notification_preferences;
CREATE POLICY "Users can create own preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own preferences" ON notification_preferences;
CREATE POLICY "Users can update own preferences"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- Enforcement trigger: category is derived from notification.type.
-- No preferences row (or unknown type) = allow. Returning NULL
-- silently drops the insert — correct for fire-and-forget senders.
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
    WHEN NEW.type IN ('video_invite', 'whiteboard_share', 'document_share') THEN collaboration
    WHEN NEW.type IN ('project_invite', 'project_update', 'project_follow') THEN projects
    WHEN NEW.type IN ('connection_request', 'connection_accepted') THEN connections
    WHEN NEW.type IN ('message') THEN messages
    WHEN NEW.type IN ('event_reminder', 'event_update') THEN events
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

DROP TRIGGER IF EXISTS check_notification_prefs ON notifications;
CREATE TRIGGER check_notification_prefs
  BEFORE INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION enforce_notification_preferences();

-- ============================================================
-- Replace open direct inserts with a validated RPC.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON notifications;

CREATE OR REPLACE FUNCTION send_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_user_id = auth.uid() THEN
    RETURN; -- no self-notifications
  END IF;
  IF length(coalesce(p_title, '')) = 0 OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'invalid title';
  END IF;
  IF length(coalesce(p_body, '')) > 1000 OR length(coalesce(p_link, '')) > 500 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (p_user_id, coalesce(p_type, 'general'), p_title, p_body, p_link);
END;
$$;
