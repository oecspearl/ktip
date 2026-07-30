-- ============================================================
-- Migration 084: Challenge as an event type, and documents on events
--
-- Two changes, one release:
--
--   1. 'challenge' joins the event_type enum. The create form no longer has a
--      separate "sets a challenge" checkbox — picking the Challenge type is
--      what turns the brief on (the client writes has_challenge = TRUE for
--      it). has_challenge stays, unchanged, for every existing event and for
--      organizers who still want a brief on a hackathon or workshop.
--
--   2. 'event' joins entity_documents.entity_type, so organizers can attach
--      files (briefs, rules, datasets) when creating an event. What
--      participants submit is a separate parent — see migration 085.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Event type
-- ------------------------------------------------------------
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE events
  ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('hackathon', 'workshop', 'meetup', 'conference', 'demo_day', 'challenge'));

-- ------------------------------------------------------------
-- 2. Documents may hang off an event
-- ------------------------------------------------------------
ALTER TABLE entity_documents DROP CONSTRAINT IF EXISTS entity_documents_entity_type_check;
ALTER TABLE entity_documents
  ADD CONSTRAINT entity_documents_entity_type_check
  CHECK (entity_type IN ('grant', 'project', 'grant_application', 'event'));

-- Restated from 080 with an 'event' branch. Same visibility rule as the
-- challenge brief: non-draft events are public, drafts are the organizer's
-- (and admins').
CREATE OR REPLACE FUNCTION can_view_document_parent(p_entity_type TEXT, p_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE p_entity_type
    WHEN 'grant' THEN EXISTS (
      SELECT 1 FROM grants g
      WHERE g.id = p_entity_id
        AND (g.is_active = TRUE OR auth.uid() IS NOT NULL)
    )
    WHEN 'project' THEN EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_entity_id
        AND (
          p.is_public = TRUE
          OR p.owner_id = auth.uid()
          OR is_project_member(p.id, auth.uid())
        )
    )
    WHEN 'grant_application' THEN EXISTS (
      SELECT 1 FROM grant_applications a
      WHERE a.id = p_entity_id
        AND (a.user_id = auth.uid() OR has_permission(auth.uid(), 'org:manage'))
    )
    WHEN 'event' THEN EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = p_entity_id
        AND (
          e.status <> 'draft'
          OR e.organizer_id = auth.uid()
          OR is_oecs_admin(auth.uid())
        )
    )
    ELSE FALSE
  END;
$$;

-- Restated from 080 with an 'event' branch: only the organizer (or an OECS
-- admin) attaches files to an event.
DROP POLICY IF EXISTS "Members can upload documents" ON entity_documents;
CREATE POLICY "Members can upload documents"
  ON entity_documents FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND CASE entity_type
      WHEN 'grant' THEN has_permission(auth.uid(), 'org:manage')
      WHEN 'project' THEN (
        is_project_owner(entity_id, auth.uid())
        OR is_project_member(entity_id, auth.uid(), 'editor')
      )
      WHEN 'grant_application' THEN EXISTS (
        SELECT 1 FROM grant_applications a
        WHERE a.id = entity_id AND a.user_id = auth.uid()
      )
      WHEN 'event' THEN EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = entity_id
          AND (e.organizer_id = auth.uid() OR is_oecs_admin(auth.uid()))
      )
      ELSE FALSE
    END
  );

-- Restated from 077 with an 'event' branch, gated like the events DELETE
-- policy (organizer or admin).
CREATE OR REPLACE FUNCTION parent_upload_paths(p_entity_type TEXT, p_entity_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL OR p_entity_id IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  IF p_entity_type = 'project' THEN
    SELECT TRUE INTO v_allowed FROM projects
     WHERE id = p_entity_id AND owner_id = auth.uid();
  ELSIF p_entity_type = 'grant' THEN
    SELECT TRUE INTO v_allowed FROM grants
     WHERE id = p_entity_id
       AND ((created_by = auth.uid() AND has_permission(auth.uid(), 'grant:post'))
            OR is_oecs_admin(auth.uid()));
  ELSIF p_entity_type = 'event' THEN
    SELECT TRUE INTO v_allowed FROM events
     WHERE id = p_entity_id
       AND (organizer_id = auth.uid() OR is_oecs_admin(auth.uid()));
  ELSE
    RETURN ARRAY[]::TEXT[];
  END IF;

  IF NOT COALESCE(v_allowed, FALSE) THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  RETURN COALESCE(
    (SELECT array_agg(storage_path)
       FROM entity_documents
      WHERE entity_type = p_entity_type
        AND entity_id = p_entity_id
        AND storage_path IS NOT NULL),
    ARRAY[]::TEXT[]
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Restated from 077: events join the table→entity_type map so deleting an
-- event reaps its document rows.
CREATE OR REPLACE FUNCTION reap_entity_documents()
RETURNS TRIGGER AS $$
DECLARE
  v_entity_type TEXT;
  v_count INT;
BEGIN
  v_entity_type := CASE TG_TABLE_NAME
    WHEN 'projects' THEN 'project'
    WHEN 'grants'   THEN 'grant'
    WHEN 'events'   THEN 'event'
    ELSE NULL
  END;

  IF v_entity_type IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM entity_documents
  WHERE entity_type = v_entity_type
    AND entity_id = OLD.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    RAISE NOTICE 'Reaped % entity_documents row(s) for % %', v_count, v_entity_type, OLD.id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS reap_documents_on_event_delete ON events;
CREATE TRIGGER reap_documents_on_event_delete
  AFTER DELETE ON events
  FOR EACH ROW
  EXECUTE FUNCTION reap_entity_documents();

NOTIFY pgrst, 'reload schema';
