-- ============================================================
-- Migration 085: Participant solutions on a challenge
--
-- 062 gave an event a brief — what the organizer asks for. This is the other
-- half: what participants hand back. A solution is one participant's answer to
-- the challenge, with its own supporting files.
--
-- Solutions are their own table, not event_criteria rows: the brief is
-- authored by the organizer and read by everyone, whereas a submission is
-- authored by a member, is not readable by rival entrants before the deadline,
-- and carries uploads of its own.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The submissions
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS event_solutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  -- Demo, repo or write-up hosted elsewhere. Files live in entity_documents.
  link_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_solutions_event ON event_solutions(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_solutions_author ON event_solutions(author_id);

COMMENT ON TABLE event_solutions IS
  'What participants submit against an event challenge; supporting files hang off it via entity_documents.';

-- ------------------------------------------------------------
-- 2. When a submission becomes public
--
-- Before entries close, a solution is visible to its author, the organizer and
-- OECS admins only — showing rival entries to the people still writing theirs
-- is the one thing a challenge must not do. Afterwards everyone sees them,
-- which is what makes a past challenge worth reading.
--
-- "Afterwards" is the submission deadline if the organizer set one, else the
-- event's end date, else its start date. Every event has a start_date, so this
-- always resolves.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION event_entries_closed(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT now() > COALESCE(e.submission_deadline, e.end_date, e.start_date)
  FROM events e
  WHERE e.id = p_event_id;
$$;

COMMENT ON FUNCTION event_entries_closed(UUID) IS
  'TRUE once an event stops accepting entries: submission_deadline, else end_date, else start_date.';

-- ------------------------------------------------------------
-- 3. RLS
-- ------------------------------------------------------------

ALTER TABLE event_solutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solutions are readable per event stage" ON event_solutions;
CREATE POLICY "Solutions are readable per event stage"
  ON event_solutions FOR SELECT
  USING (
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
        AND e.status <> 'draft'
        AND COALESCE(event_entries_closed(e.id), FALSE)
    )
  );

-- Any signed-in member may enter a challenge that is still open. RSVP is not
-- required: people routinely submit to an open call without ever having
-- clicked "attend", and the organizer can remove an entry that does not belong.
DROP POLICY IF EXISTS "Members can submit solutions" ON event_solutions;
CREATE POLICY "Members can submit solutions"
  ON event_solutions FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
        AND e.has_challenge = TRUE
        AND e.status <> 'draft'
        AND (e.submission_deadline IS NULL OR now() <= e.submission_deadline)
    )
  );

-- The deadline binds edits too, or it binds nothing.
DROP POLICY IF EXISTS "Authors can edit their own solutions" ON event_solutions;
CREATE POLICY "Authors can edit their own solutions"
  ON event_solutions FOR UPDATE
  USING (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_solutions.event_id
        AND (e.submission_deadline IS NULL OR now() <= e.submission_deadline)
    )
  )
  WITH CHECK (auth.uid() = author_id);

-- Withdrawing is always allowed; the organizer and admins can remove an entry
-- as moderation.
DROP POLICY IF EXISTS "Authors and organizers can delete solutions" ON event_solutions;
CREATE POLICY "Authors and organizers can delete solutions"
  ON event_solutions FOR DELETE
  USING (
    auth.uid() = author_id
    OR is_oecs_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_solutions.event_id
        AND e.organizer_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION touch_event_solutions()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_event_solutions_trigger ON event_solutions;
CREATE TRIGGER touch_event_solutions_trigger
  BEFORE UPDATE ON event_solutions
  FOR EACH ROW
  EXECUTE FUNCTION touch_event_solutions();

-- ------------------------------------------------------------
-- 4. Participants attach files to their own solution
-- ------------------------------------------------------------

ALTER TABLE entity_documents DROP CONSTRAINT IF EXISTS entity_documents_entity_type_check;
ALTER TABLE entity_documents
  ADD CONSTRAINT entity_documents_entity_type_check
  CHECK (entity_type IN ('grant', 'project', 'grant_application', 'event', 'event_solution'));

-- Restated from 084 with an 'event_solution' branch. A solution's documents
-- are listable by exactly the people who can see the solution itself.
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
    WHEN 'event_solution' THEN EXISTS (
      SELECT 1 FROM event_solutions s
      JOIN events e ON e.id = s.event_id
      WHERE s.id = p_entity_id
        AND (
          s.author_id = auth.uid()
          OR e.organizer_id = auth.uid()
          OR is_oecs_admin(auth.uid())
          OR (e.status <> 'draft' AND COALESCE(event_entries_closed(e.id), FALSE))
        )
    )
    ELSE FALSE
  END;
$$;

-- Restated from 080 with an 'event_solution' branch. The organizer reads what
-- was submitted to their own challenge — judging it is the point of collecting
-- it — and reads it as a viewer, never an editor, whatever visibility the
-- participant chose.
CREATE OR REPLACE FUNCTION doc_access_role(p_document_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_visibility TEXT;
  v_entity_type TEXT;
  v_entity_id UUID;
  v_role TEXT;
BEGIN
  SELECT owner_id, visibility, entity_type, entity_id
    INTO v_owner_id, v_visibility, v_entity_type, v_entity_id
  FROM entity_documents WHERE id = p_document_id;

  IF v_owner_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id = v_owner_id THEN
    RETURN 'owner';
  END IF;

  -- OECS admins administer every document
  IF p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND 'oecs' = ANY(roles)
  ) THEN
    RETURN 'owner';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM document_access
    WHERE document_id = p_document_id AND user_id = p_user_id;
    IF v_role IS NOT NULL THEN
      RETURN v_role;
    END IF;
  END IF;

  -- Assessors read what applicants attach — read only, never edit.
  IF v_entity_type = 'grant_application'
     AND p_user_id IS NOT NULL
     AND has_permission(p_user_id, 'org:manage') THEN
    RETURN 'viewer';
  END IF;

  -- Organizers read what entrants attach to their challenge.
  IF v_entity_type = 'event_solution' AND p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM event_solutions s
    JOIN events e ON e.id = s.event_id
    WHERE s.id = v_entity_id AND e.organizer_id = p_user_id
  ) THEN
    RETURN 'viewer';
  END IF;

  IF v_visibility = 'public' THEN
    RETURN 'viewer';
  END IF;

  IF v_visibility = 'members' AND p_user_id IS NOT NULL THEN
    RETURN 'viewer';
  END IF;

  -- 'private' and 'restricted' need an explicit grant
  RETURN NULL;
END;
$$;

-- Restated from 084 with an 'event_solution' branch: only the entrant attaches
-- files to their own entry, and only while entries are open.
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
      WHEN 'event_solution' THEN EXISTS (
        SELECT 1 FROM event_solutions s
        JOIN events e ON e.id = s.event_id
        WHERE s.id = entity_id
          AND s.author_id = auth.uid()
          AND (e.submission_deadline IS NULL OR now() <= e.submission_deadline)
      )
      ELSE FALSE
    END
  );

-- Restated from 084 with an 'event_solution' branch, gated like the solution's
-- own DELETE policy (author, organizer or admin).
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
  ELSIF p_entity_type = 'event_solution' THEN
    SELECT TRUE INTO v_allowed FROM event_solutions s
     JOIN events e ON e.id = s.event_id
     WHERE s.id = p_entity_id
       AND (s.author_id = auth.uid()
            OR e.organizer_id = auth.uid()
            OR is_oecs_admin(auth.uid()));
  ELSE
    RETURN ARRAY[]::TEXT[];
  END IF;

  IF NOT COALESCE(v_allowed, FALSE) THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  -- Deleting an event cascades to its solutions, so the caller has to clear
  -- the entrants' blobs as well as the organizer's — they get one list.
  IF p_entity_type = 'event' THEN
    RETURN COALESCE(
      (SELECT array_agg(d.storage_path)
         FROM entity_documents d
        WHERE d.storage_path IS NOT NULL
          AND (
            (d.entity_type = 'event' AND d.entity_id = p_entity_id)
            OR (d.entity_type = 'event_solution' AND d.entity_id IN (
              SELECT s.id FROM event_solutions s WHERE s.event_id = p_entity_id
            ))
          )),
      ARRAY[]::TEXT[]
    );
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

-- Restated from 084: solutions join the table→entity_type map, so deleting a
-- solution (or the event it hangs off, which cascades) reaps its document rows.
CREATE OR REPLACE FUNCTION reap_entity_documents()
RETURNS TRIGGER AS $$
DECLARE
  v_entity_type TEXT;
  v_count INT;
BEGIN
  v_entity_type := CASE TG_TABLE_NAME
    WHEN 'projects'        THEN 'project'
    WHEN 'grants'          THEN 'grant'
    WHEN 'events'          THEN 'event'
    WHEN 'event_solutions' THEN 'event_solution'
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

DROP TRIGGER IF EXISTS reap_documents_on_event_solution_delete ON event_solutions;
CREATE TRIGGER reap_documents_on_event_solution_delete
  AFTER DELETE ON event_solutions
  FOR EACH ROW
  EXECUTE FUNCTION reap_entity_documents();

NOTIFY pgrst, 'reload schema';
