-- ============================================================
-- Migration 079: Request to collaborate on a project
--
-- Until now project_members was owner-push only: the INSERT policy in 031
-- requires is_project_owner() AND user_id <> auth.uid(), so a member could not
-- ask to join even if the UI offered a button — Postgres refused the row.
-- This adds the requester-initiated half, modelled on document_access_requests
-- (048), which is the same knock-on-the-door shape.
--
-- Also here, because they are the same feature from the visitor's side:
--   * a public team roster + count (project_members SELECT is members-only, so
--     a visitor could not see who is on a project or how many),
--   * the missing column guard on the 031 UPDATE policy, which let an invitee
--     promote themselves to 'editor' while accepting.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS project_join_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_join_requests_project
  ON project_join_requests(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_join_requests_requester
  ON project_join_requests(requester_id, created_at DESC);

-- One open request per (project, requester). A denied request may be retried;
-- a pending one may not be duplicated.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_join_requests_one_pending
  ON project_join_requests(project_id, requester_id) WHERE status = 'pending';

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE project_join_requests ENABLE ROW LEVEL SECURITY;

-- The requester sees their own; the owner sees requests on their projects.
DROP POLICY IF EXISTS "Requester and owner can see join requests" ON project_join_requests;
CREATE POLICY "Requester and owner can see join requests"
  ON project_join_requests FOR SELECT
  USING (
    requester_id = auth.uid()
    OR is_project_owner(project_id, auth.uid())
  );

-- Anyone signed in may ask, on their own behalf, for a project they can see.
-- Not the owner (nothing to ask for) and not an existing accepted member.
DROP POLICY IF EXISTS "Members can request to collaborate" ON project_join_requests;
CREATE POLICY "Members can request to collaborate"
  ON project_join_requests FOR INSERT
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'pending'
    AND NOT is_project_owner(project_id, auth.uid())
    AND NOT is_project_member(project_id, auth.uid())
  );

-- Deciding goes through the RPC below, which is SECURITY DEFINER; this policy
-- exists so an owner can still deny directly if they ever need to.
DROP POLICY IF EXISTS "Owner can decide join requests" ON project_join_requests;
CREATE POLICY "Owner can decide join requests"
  ON project_join_requests FOR UPDATE
  USING (is_project_owner(project_id, auth.uid()))
  WITH CHECK (is_project_owner(project_id, auth.uid()));

-- The requester can withdraw while it is still pending.
DROP POLICY IF EXISTS "Requester can withdraw a join request" ON project_join_requests;
CREATE POLICY "Requester can withdraw a join request"
  ON project_join_requests FOR DELETE
  USING (requester_id = auth.uid() AND status = 'pending');

-- ============================================================
-- Approving writes the membership and closes the request together, so the
-- client cannot leave the two out of sync. Same contract as
-- decide_document_access_request (048).
--
-- An approved requester joins as 'viewer'. Promotion to 'editor' stays an
-- explicit, separate act by the owner in Manage team — accepting someone into
-- the room is not the same decision as handing them the pen.
-- ============================================================
CREATE OR REPLACE FUNCTION decide_project_join_request(
  p_request_id UUID,
  p_approve BOOLEAN
)
RETURNS project_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request project_join_requests;
BEGIN
  SELECT * INTO v_request FROM project_join_requests WHERE id = p_request_id;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF NOT is_project_owner(v_request.project_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the project owner can decide join requests';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request has already been decided';
  END IF;

  IF p_approve THEN
    INSERT INTO project_members (project_id, user_id, role, status, invited_by)
    VALUES (v_request.project_id, v_request.requester_id, 'viewer', 'accepted', auth.uid())
    ON CONFLICT (project_id, user_id)
      DO UPDATE SET status = 'accepted', updated_at = now();
  END IF;

  UPDATE project_join_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION decide_project_join_request(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decide_project_join_request(UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- Public team size.
--
-- project_members SELECT is owner-or-member only, so a visitor counting rows
-- gets 0 — which is why no project ever showed a team size. Denormalised onto
-- projects rather than exposed through a per-row RPC, so a list of 24 cards
-- stays one query instead of 24.
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS member_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION sync_project_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
  UPDATE projects
  SET member_count = (
    SELECT COUNT(*) FROM project_members
    WHERE project_id = v_project_id AND status = 'accepted'
  )
  WHERE id = v_project_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_project_member_count ON project_members;
CREATE TRIGGER sync_project_member_count
  AFTER INSERT OR UPDATE OR DELETE ON project_members
  FOR EACH ROW EXECUTE FUNCTION sync_project_member_count();

-- Backfill for everything that existed before the trigger.
UPDATE projects p
SET member_count = COALESCE((
  SELECT COUNT(*) FROM project_members pm
  WHERE pm.project_id = p.id AND pm.status = 'accepted'
), 0);

-- ============================================================
-- Public team roster.
--
-- Same problem as the count, but the roster cannot be denormalised. Bypasses
-- RLS deliberately and exposes only what the public profile already shows, and
-- only for a project the caller can actually see.
-- ============================================================
CREATE OR REPLACE FUNCTION get_project_team(p_project_id UUID)
RETURNS TABLE (
  user_id UUID,
  role TEXT,
  display_name TEXT,
  avatar_url TEXT,
  country TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT pm.user_id, pm.role, pr.display_name, pr.avatar_url, pr.country
  FROM project_members pm
  JOIN profiles pr ON pr.id = pm.user_id
  WHERE pm.project_id = p_project_id
    AND pm.status = 'accepted'
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_project_id
        AND (p.is_public OR p.owner_id = auth.uid() OR is_project_member(p.id, auth.uid()))
    )
  ORDER BY pm.created_at;
$$;

GRANT EXECUTE ON FUNCTION get_project_team(UUID) TO anon, authenticated;

-- ============================================================
-- Column guard for project_members.
--
-- 031's UPDATE policy has no WITH CHECK and RLS cannot restrict columns, so an
-- invitee accepting an invitation could set role = 'editor' in the same
-- statement. Same fix, same shape as guard_share_recipient_update (053).
-- ============================================================
CREATE OR REPLACE FUNCTION guard_project_member_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The owner may change anything; only the member themself is constrained.
  IF is_project_owner(OLD.project_id, auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.user_id THEN
    IF NEW.role       IS DISTINCT FROM OLD.role
       OR NEW.user_id    IS DISTINCT FROM OLD.user_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN
      RAISE EXCEPTION 'Members may only change the status of their own membership';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_project_member_update ON project_members;
CREATE TRIGGER guard_project_member_update
  BEFORE UPDATE ON project_members
  FOR EACH ROW EXECUTE FUNCTION guard_project_member_update();

-- ============================================================
-- Notification preferences.
--
-- 036's type -> category map falls through to TRUE for unknown types, so a new
-- type that is not listed bypasses the member's preferences entirely. Restated
-- in full (last full restatement: 054) with the two join-request types folded
-- into 'projects'.
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
