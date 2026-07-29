-- ============================================================
-- Migration 054: Email invitations
--
-- Every invite path before this required the recipient to already have a
-- KTIP account, discoverable by display-name search. This adds token-based
-- invitations addressed to an email, so a partner who has never signed up
-- can be brought straight into a whiteboard, document or snippet.
--
-- Tokens are minted server-side by api/invite/send.ts (service role) and
-- redeemed through a SECURITY DEFINER RPC. The table itself is never
-- readable by token from the client — knowing a token must not be enough to
-- read who else was invited.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL DEFAULT 'platform'
    CHECK (resource_type IN ('whiteboard','document','snippet','platform')),
  resource_id UUID,
  resource_title TEXT,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view','edit')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days',
  accepted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A 'platform' invite carries no resource; every other kind must.
  CONSTRAINT email_invites_resource_present
    CHECK ((resource_type = 'platform') = (resource_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_email_invites_inviter
  ON email_invites(invited_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_invites_email
  ON email_invites(lower(email), status);

-- ------------------------------------------------------------
-- RLS — the inviter sees and revokes their own invites. Nobody reads
-- by token; redemption goes through redeem_email_invite() below.
-- ------------------------------------------------------------

ALTER TABLE email_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inviter can view own invites" ON email_invites;
CREATE POLICY "Inviter can view own invites"
  ON email_invites FOR SELECT
  USING (auth.uid() = invited_by);

DROP POLICY IF EXISTS "Inviter can revoke own invites" ON email_invites;
CREATE POLICY "Inviter can revoke own invites"
  ON email_invites FOR UPDATE
  USING (auth.uid() = invited_by)
  WITH CHECK (auth.uid() = invited_by);

DROP POLICY IF EXISTS "Inviter can delete own invites" ON email_invites;
CREATE POLICY "Inviter can delete own invites"
  ON email_invites FOR DELETE
  USING (auth.uid() = invited_by);

-- No INSERT policy: rows are created only by api/invite/send.ts using the
-- service role, which bypasses RLS. A client cannot mint its own token.

-- ------------------------------------------------------------
-- Redemption
-- ------------------------------------------------------------
-- Returns a JSON envelope rather than raising, so the /join page can tell
-- "expired" apart from "wrong account" and say something useful.

CREATE OR REPLACE FUNCTION redeem_email_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv        email_invites%ROWTYPE;
  caller     UUID := auth.uid();
  caller_mail TEXT := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
  IF caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO inv FROM email_invites WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF inv.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;

  IF inv.expires_at < now() THEN
    UPDATE email_invites SET status = 'expired' WHERE id = inv.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  -- The token is addressed to one mailbox. Forwarding it does not transfer it.
  IF caller_mail <> lower(inv.email) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_account',
                              'email', inv.email);
  END IF;

  -- Already redeemed by this same person: idempotent, just send them onward.
  IF inv.status = 'accepted' AND inv.accepted_by = caller THEN
    RETURN jsonb_build_object('ok', true, 'resource_type', inv.resource_type,
                              'resource_id', inv.resource_id);
  END IF;

  IF inv.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_used');
  END IF;

  -- The invitee explicitly followed the link, so the share lands accepted —
  -- there is nothing left to confirm in /invitations.
  IF inv.resource_type = 'whiteboard' THEN
    INSERT INTO whiteboard_shares (whiteboard_id, shared_with, shared_by, permission, status)
    VALUES (inv.resource_id, caller, inv.invited_by, inv.permission, 'accepted')
    ON CONFLICT (whiteboard_id, shared_with)
    DO UPDATE SET status = 'accepted', permission = EXCLUDED.permission;

  ELSIF inv.resource_type = 'document' THEN
    INSERT INTO document_shares (document_id, shared_with, shared_by, permission, status)
    VALUES (inv.resource_id, caller, inv.invited_by, inv.permission, 'accepted')
    ON CONFLICT (document_id, shared_with)
    DO UPDATE SET status = 'accepted', permission = EXCLUDED.permission;

  ELSIF inv.resource_type = 'snippet' THEN
    INSERT INTO snippet_shares (snippet_id, shared_with, shared_by, permission, status)
    VALUES (inv.resource_id, caller, inv.invited_by, inv.permission, 'accepted')
    ON CONFLICT (snippet_id, shared_with)
    DO UPDATE SET status = 'accepted', permission = EXCLUDED.permission;
  END IF;

  UPDATE email_invites
     SET status = 'accepted', accepted_by = caller, accepted_at = now()
   WHERE id = inv.id;

  -- Tell the inviter their invite landed. Bypasses send_notification()'s
  -- self-notify guard deliberately: auth.uid() here is the invitee.
  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    inv.invited_by,
    'invite_accepted',
    'Invitation accepted',
    coalesce(inv.email, 'Someone') || ' accepted your invitation'
      || CASE WHEN inv.resource_title IS NULL THEN '' ELSE ' to "' || inv.resource_title || '"' END,
    '/invitations'
  );

  RETURN jsonb_build_object('ok', true, 'resource_type', inv.resource_type,
                            'resource_id', inv.resource_id);
END;
$$;

REVOKE ALL ON FUNCTION redeem_email_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_email_invite(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- Email -> user lookup, for api/invite/send.ts
-- ------------------------------------------------------------
-- Lets the invite endpoint tell "already a member" from "needs an account",
-- so an existing user is never emailed a signup link.
--
-- This is an email-enumeration oracle, so it is granted to service_role ONLY.
-- Never grant it to `authenticated` or `anon`.

CREATE OR REPLACE FUNCTION get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_user_id_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_user_id_by_email(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_id_by_email(TEXT) TO service_role;

-- ------------------------------------------------------------
-- Register the new notification types
-- ------------------------------------------------------------
-- 036's type -> category map falls through to TRUE for unknown types, so any
-- type missing here bypasses the user's preferences entirely. Restated in
-- full with the invite types folded into 'collaboration'.

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

NOTIFY pgrst, 'reload schema';
