-- ============================================================
-- Migration 080: Supporting documents on a grant application
--
-- The application wizard had no upload step, and could not have had one: the
-- only upload surface was the shared DocumentsPanel on the grant *detail*
-- page, whose entity_type CHECK allowed 'grant' and 'project' only. An
-- applicant's budget or registration certificate therefore had nowhere to go
-- except onto the public grant record — where, with the default
-- visibility='restricted', its existence was announced to every member.
--
-- This adds 'grant_application' as a document parent, gives it access rules of
-- its own (the applicant, plus whoever administers grants), and gives each
-- grant a stated list of what it wants uploaded.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. A grant can state what it needs
-- ------------------------------------------------------------
-- [{ "key": "...", "label": "...", "description": "...", "required": true }]
-- Free-form JSONB rather than a table: this is copy a funder writes once per
-- call, not a relation anything joins on.
ALTER TABLE grants
  ADD COLUMN IF NOT EXISTS required_documents JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN grants.required_documents IS
  'Checklist shown on the application wizard''s Supporting documents step.';

-- A sensible default for every call that has not written its own, so the step
-- is never a bare "upload something" box.
UPDATE grants
SET required_documents = '[
  {"key":"budget","label":"Detailed budget","description":"A line-item budget covering the full amount requested, in the grant currency.","required":true},
  {"key":"registration","label":"Proof of registration","description":"Certificate of incorporation, business registration, or your institution''s letter of standing.","required":true},
  {"key":"financials","label":"Recent financial statements","description":"The last full year. Audited if you have them; management accounts are accepted otherwise.","required":false},
  {"key":"workplan","label":"Workplan or timeline","description":"Activities against dates. A one-page Gantt or table is enough.","required":false},
  {"key":"support","label":"Letters of support","description":"From partners, host institutions or beneficiary organisations.","required":false}
]'::jsonb
WHERE required_documents = '[]'::jsonb;

-- ------------------------------------------------------------
-- 2. Documents may now hang off an application
-- ------------------------------------------------------------
ALTER TABLE entity_documents DROP CONSTRAINT IF EXISTS entity_documents_entity_type_check;
ALTER TABLE entity_documents
  ADD CONSTRAINT entity_documents_entity_type_check
  CHECK (entity_type IN ('grant', 'project', 'grant_application'));

-- ------------------------------------------------------------
-- 3. Who may see an application's documents
-- ------------------------------------------------------------
-- Restated from 048 with a 'grant_application' branch. The applicant sees
-- their own; anyone who administers grants (org:manage) sees them because
-- reviewing the attachments is the point of collecting them. Nobody else,
-- including other applicants to the same call.
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
    ELSE FALSE
  END;
$$;

-- Restated from 048 with one added branch: a grant administrator reads an
-- application's attachments as a viewer. Without it, forcing applicant uploads
-- to visibility='private' (which the client now does) would hide them from the
-- very people meant to assess them.
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
  v_role TEXT;
BEGIN
  SELECT owner_id, visibility, entity_type
    INTO v_owner_id, v_visibility, v_entity_type
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

-- ------------------------------------------------------------
-- 4. Close the "anyone can attach anything to any grant" hole
-- ------------------------------------------------------------
-- 048's INSERT policy was `auth.uid() = owner_id` and nothing else, so any
-- signed-in member could attach a file to any grant and — at the default
-- visibility — publish its existence on that grant's public page. Uploading to
-- a grant is now the funder's right; applicants upload to their own
-- application instead.
DROP POLICY IF EXISTS "Members can upload documents" ON entity_documents;
CREATE POLICY "Members can upload documents"
  ON entity_documents FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND CASE entity_type
      -- Only the people who publish the call may attach to it
      WHEN 'grant' THEN has_permission(auth.uid(), 'org:manage')
      -- Owner or an editor on the project
      WHEN 'project' THEN (
        is_project_owner(entity_id, auth.uid())
        OR is_project_member(entity_id, auth.uid(), 'editor')
      )
      -- Only the applicant, and only while it is still theirs to change
      WHEN 'grant_application' THEN EXISTS (
        SELECT 1 FROM grant_applications a
        WHERE a.id = entity_id AND a.user_id = auth.uid()
      )
      ELSE FALSE
    END
  );

NOTIFY pgrst, 'reload schema';
