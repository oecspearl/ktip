-- ============================================================
-- Migration 048: Entity Document Library
-- Uploadable documents attached to grants and projects, each with
-- a Google-Drive style visibility setting, a per-document ACL, a
-- request-access workflow, a scraped markdown twin, and AI field
-- proposals that are reviewed before they touch the entity.
--
-- Storage: private bucket `entity-documents`, path convention
--   {ownerId}/{entityType}/{entityId}/{ts}_{fileName}
-- (first path segment is the uid, same as verification-documents
-- in migration 035, so the upload policy is identical).
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS entity_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grant', 'project')),
  entity_id UUID NOT NULL,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'restricted'
    CHECK (visibility IN ('private', 'restricted', 'members', 'public')),
  -- Scraped twin of the uploaded file, kept in two shapes:
  --   content_html — what the WYSIWYG editor reads and writes
  --   markdown     — plain text derived from it; what the AI and search read
  content_html TEXT,
  markdown TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'processing', 'done', 'failed', 'unsupported')),
  extraction_error TEXT,
  -- AI field proposals: { "<column>": { "value": ..., "confidence": 0-1, "evidence": "..." } }
  -- Proposals only. Applying them to the parent row is an explicit user action.
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_documents_entity
  ON entity_documents(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_documents_owner
  ON entity_documents(owner_id, created_at DESC);

DROP TRIGGER IF EXISTS set_entity_documents_updated_at ON entity_documents;
CREATE TRIGGER set_entity_documents_updated_at
  BEFORE UPDATE ON entity_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Explicit grants: who the owner has shared this document with
CREATE TABLE IF NOT EXISTS document_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES entity_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_document_access_document ON document_access(document_id);
CREATE INDEX IF NOT EXISTS idx_document_access_user ON document_access(user_id);

-- "Request access" — the Drive-style knock on the door
CREATE TABLE IF NOT EXISTS document_access_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES entity_documents(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  granted_role TEXT CHECK (granted_role IN ('viewer', 'editor')),
  decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_access_requests_document
  ON document_access_requests(document_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_access_requests_requester
  ON document_access_requests(requester_id, created_at DESC);

-- One open request per (document, requester)
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_access_requests_one_pending
  ON document_access_requests(document_id, requester_id) WHERE status = 'pending';

-- ============================================================
-- Helpers: SECURITY DEFINER so policies can cross-reference the
-- ACL tables without recursing (same reason as is_project_member
-- in migration 031).
-- ============================================================

-- 'owner' | 'editor' | 'viewer' | NULL, most privileged wins.
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
  v_role TEXT;
BEGIN
  SELECT owner_id, visibility INTO v_owner_id, v_visibility
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

CREATE OR REPLACE FUNCTION can_view_document(p_document_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT doc_access_role(p_document_id, p_user_id) IS NOT NULL;
$$;

-- ============================================================
-- RLS: entity_documents
-- ============================================================
ALTER TABLE entity_documents ENABLE ROW LEVEL SECURITY;

-- Full rows (including the scraped content) only for those with access.
-- Metadata for everyone else comes from get_entity_documents() below.
DROP POLICY IF EXISTS "Documents are viewable by those with access" ON entity_documents;
CREATE POLICY "Documents are viewable by those with access"
  ON entity_documents FOR SELECT
  USING (can_view_document(id, auth.uid()));

DROP POLICY IF EXISTS "Members can upload documents" ON entity_documents;
CREATE POLICY "Members can upload documents"
  ON entity_documents FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owner and editors can update documents" ON entity_documents;
CREATE POLICY "Owner and editors can update documents"
  ON entity_documents FOR UPDATE
  USING (doc_access_role(id, auth.uid()) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Owner can delete documents" ON entity_documents;
CREATE POLICY "Owner can delete documents"
  ON entity_documents FOR DELETE
  USING (doc_access_role(id, auth.uid()) = 'owner');

-- An UPDATE policy gates the row, not the columns — without this an editor
-- could widen a document's visibility, hand it to someone else, or repoint it
-- at a different file. Those columns stay owner-only.
CREATE OR REPLACE FUNCTION enforce_document_owner_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF doc_access_role(OLD.id, auth.uid()) = 'owner' THEN
    RETURN NEW;
  END IF;

  IF NEW.visibility IS DISTINCT FROM OLD.visibility
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
    RAISE EXCEPTION 'Only the document owner can change who it belongs to or who can see it';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_entity_documents_owner_columns ON entity_documents;
CREATE TRIGGER enforce_entity_documents_owner_columns
  BEFORE UPDATE ON entity_documents
  FOR EACH ROW
  EXECUTE FUNCTION enforce_document_owner_columns();

-- ============================================================
-- RLS: document_access
-- ============================================================
ALTER TABLE document_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Grants are visible to the owner and the grantee" ON document_access;
CREATE POLICY "Grants are visible to the owner and the grantee"
  ON document_access FOR SELECT
  USING (
    user_id = auth.uid()
    OR doc_access_role(document_id, auth.uid()) = 'owner'
  );

DROP POLICY IF EXISTS "Owner can share a document" ON document_access;
CREATE POLICY "Owner can share a document"
  ON document_access FOR INSERT
  WITH CHECK (doc_access_role(document_id, auth.uid()) = 'owner');

DROP POLICY IF EXISTS "Owner can change a grantee role" ON document_access;
CREATE POLICY "Owner can change a grantee role"
  ON document_access FOR UPDATE
  USING (doc_access_role(document_id, auth.uid()) = 'owner');

DROP POLICY IF EXISTS "Owner can revoke and grantees can leave" ON document_access;
CREATE POLICY "Owner can revoke and grantees can leave"
  ON document_access FOR DELETE
  USING (
    user_id = auth.uid()
    OR doc_access_role(document_id, auth.uid()) = 'owner'
  );

-- ============================================================
-- RLS: document_access_requests
-- ============================================================
ALTER TABLE document_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Requests visible to requester and document owner" ON document_access_requests;
CREATE POLICY "Requests visible to requester and document owner"
  ON document_access_requests FOR SELECT
  USING (
    requester_id = auth.uid()
    OR doc_access_role(document_id, auth.uid()) = 'owner'
  );

DROP POLICY IF EXISTS "Members can request access" ON document_access_requests;
CREATE POLICY "Members can request access"
  ON document_access_requests FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND status = 'pending'
    -- no point requesting what you already have
    AND doc_access_role(document_id, auth.uid()) IS NULL
  );

DROP POLICY IF EXISTS "Owner can decide access requests" ON document_access_requests;
CREATE POLICY "Owner can decide access requests"
  ON document_access_requests FOR UPDATE
  USING (doc_access_role(document_id, auth.uid()) = 'owner');

DROP POLICY IF EXISTS "Requester can withdraw a request" ON document_access_requests;
CREATE POLICY "Requester can withdraw a request"
  ON document_access_requests FOR DELETE
  USING (
    requester_id = auth.uid()
    OR doc_access_role(document_id, auth.uid()) = 'owner'
  );

-- ============================================================
-- Discovery RPC
-- A restricted document must be *visible but not readable* — you
-- can see it exists and ask for access, but not read it. Row-level
-- RLS cannot express that, so listing goes through this function:
-- it returns metadata for every document on the entity, omits the
-- scraped content entirely, and nulls storage_path when the caller
-- has no access (no signed URL without a path).
-- ============================================================
-- The RPC bypasses RLS, so it has to re-check the parent itself: a private
-- project's documents must not be listable by anyone who knows the project id.
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
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION get_entity_documents(p_entity_type TEXT, p_entity_id UUID)
RETURNS TABLE (
  id UUID,
  entity_type TEXT,
  entity_id UUID,
  owner_id UUID,
  owner_name TEXT,
  owner_avatar_url TEXT,
  title TEXT,
  description TEXT,
  storage_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  visibility TEXT,
  has_content BOOLEAN,
  extraction_status TEXT,
  extraction_error TEXT,
  extracted_field_count INTEGER,
  my_role TEXT,
  pending_request BOOLEAN,
  open_request_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    d.id,
    d.entity_type,
    d.entity_id,
    d.owner_id,
    p.display_name,
    p.avatar_url,
    d.title,
    d.description,
    CASE WHEN doc_access_role(d.id, auth.uid()) IS NULL THEN NULL ELSE d.storage_path END,
    d.file_name,
    d.mime_type,
    d.file_size,
    d.visibility,
    (d.content_html IS NOT NULL AND length(d.content_html) > 0),
    d.extraction_status,
    CASE WHEN doc_access_role(d.id, auth.uid()) IS NULL THEN NULL ELSE d.extraction_error END,
    (SELECT count(*)::INTEGER FROM jsonb_object_keys(d.extracted_fields)),
    doc_access_role(d.id, auth.uid()),
    EXISTS (
      SELECT 1 FROM document_access_requests r
      WHERE r.document_id = d.id AND r.requester_id = auth.uid() AND r.status = 'pending'
    ),
    CASE
      WHEN doc_access_role(d.id, auth.uid()) = 'owner' THEN (
        SELECT count(*)::INTEGER FROM document_access_requests r
        WHERE r.document_id = d.id AND r.status = 'pending'
      )
      ELSE 0
    END,
    d.created_at,
    d.updated_at
  FROM entity_documents d
  LEFT JOIN profiles p ON p.id = d.owner_id
  WHERE d.entity_type = p_entity_type
    AND d.entity_id = p_entity_id
    AND can_view_document_parent(p_entity_type, p_entity_id)
    -- A private document is invisible to everyone but those with access.
    -- Anything else at least announces itself so access can be requested.
    AND (d.visibility <> 'private' OR doc_access_role(d.id, auth.uid()) IS NOT NULL)
  ORDER BY d.created_at DESC;
$$;

-- ============================================================
-- Approving a request grants access and closes the request in one
-- step, so the client cannot leave the two out of sync.
-- ============================================================
CREATE OR REPLACE FUNCTION decide_document_access_request(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_role TEXT DEFAULT 'viewer'
)
RETURNS document_access_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request document_access_requests;
BEGIN
  SELECT * INTO v_request FROM document_access_requests WHERE id = p_request_id;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF doc_access_role(v_request.document_id, auth.uid()) <> 'owner' THEN
    RAISE EXCEPTION 'Only the document owner can decide access requests';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request has already been decided';
  END IF;

  IF p_approve THEN
    IF p_role NOT IN ('viewer', 'editor') THEN
      RAISE EXCEPTION 'Invalid role';
    END IF;

    INSERT INTO document_access (document_id, user_id, role, granted_by)
    VALUES (v_request.document_id, v_request.requester_id, p_role, auth.uid())
    ON CONFLICT (document_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE document_access_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
      granted_role = CASE WHEN p_approve THEN p_role ELSE NULL END,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

-- ============================================================
-- PRIVATE bucket for uploaded documents.
-- Path convention: {ownerId}/{entityType}/{entityId}/{ts}_{fileName}
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'entity-documents',
  'entity-documents',
  FALSE,
  26214400, -- 25MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/markdown',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload own entity documents" ON storage.objects;
CREATE POLICY "Users can upload own entity documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'entity-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Entity documents readable by those with access" ON storage.objects;
CREATE POLICY "Entity documents readable by those with access"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'entity-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR EXISTS (
        SELECT 1 FROM entity_documents d
        WHERE d.storage_path = storage.objects.name
          AND can_view_document(d.id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete own entity documents" ON storage.objects;
CREATE POLICY "Users can delete own entity documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'entity-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    )
  );
