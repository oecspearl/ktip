-- ============================================================================
-- COMBINED MIGRATION: 048 → 054
--
-- Migrations 048-054 concatenated in order, for pasting into the Supabase
-- SQL editor in one go (Dashboard → SQL Editor → New query → paste → Run).
--
-- Generated from the individual files in supabase/migrations/. Those remain
-- the source of truth — regenerate this file rather than editing it.
--
-- SAFE TO RE-RUN. Every statement is idempotent (CREATE ... IF NOT EXISTS,
-- DROP POLICY IF EXISTS before CREATE POLICY, CREATE OR REPLACE FUNCTION),
-- so applying this over a partially-applied database repairs it.
--
-- ORDER MATTERS. 053 adds `status` to whiteboard_shares/document_shares and
-- backfills existing rows to 'accepted' BEFORE its SELECT policies start
-- requiring that column. Running these out of order would silently revoke
-- every share already in the database. The BEGIN/COMMIT below keeps the whole
-- set all-or-nothing: a failure anywhere rolls back, so you can never end up
-- half-applied again.
--
-- What this fixes:
--   403 "new row violates row-level security policy" on entity_documents
--       → 048 created the table and enabled RLS but its policies are missing
--   404 on snippet_shares          → 052 never applied
--   400 on whiteboard_shares /
--       document_shares            → 053 never applied, so `status` does not exist
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- ############################################################################
-- ## 048_entity_documents.sql
-- ############################################################################

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


-- ############################################################################
-- ## 049_connection_count_visibility.sql
-- ############################################################################

-- ============================================================
-- Migration 049: Connection count + visibility control
-- 1. profiles.connection_count_visibility — who may see how many
--    connections a member has ('public' | 'connections' | 'private').
-- 2. get_connection_count(uuid) — single-profile count, returns
--    NULL when the viewer is not allowed to see it.
-- 3. get_connection_counts(uuid[]) — batch variant for the member
--    directory (one round trip instead of N).
-- The connections table's RLS only lets the two parties read a row,
-- so counting another member's connections is impossible from the
-- client. These SECURITY DEFINER functions are the only read path
-- and they enforce the visibility setting themselves.
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS connection_count_visibility TEXT NOT NULL DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_connection_count_visibility_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_connection_count_visibility_check
      CHECK (connection_count_visibility IN ('public', 'connections', 'private'));
  END IF;
END $$;

-- ============================================================
-- Visibility gate. Own profile always visible; 'connections'
-- requires an accepted connection between viewer and target.
-- ============================================================
CREATE OR REPLACE FUNCTION can_view_connection_count(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visibility TEXT;
  v_viewer UUID := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  IF v_viewer = p_user_id THEN
    RETURN TRUE;
  END IF;

  SELECT connection_count_visibility INTO v_visibility
  FROM profiles WHERE id = p_user_id;

  IF v_visibility IS NULL OR v_visibility = 'private' THEN
    RETURN FALSE;
  END IF;
  IF v_visibility = 'public' THEN
    RETURN TRUE;
  END IF;

  -- 'connections' — mutually connected viewers only
  IF v_viewer IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM connections c
    WHERE c.status = 'accepted'
      AND (
        (c.requester_id = v_viewer AND c.addressee_id = p_user_id) OR
        (c.requester_id = p_user_id AND c.addressee_id = v_viewer)
      )
  );
END;
$$;

-- ============================================================
-- Single count. NULL = hidden from this viewer (distinct from 0).
-- ============================================================
CREATE OR REPLACE FUNCTION get_connection_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT can_view_connection_count(p_user_id) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_count
  FROM connections c
  WHERE c.status = 'accepted'
    AND (c.requester_id = p_user_id OR c.addressee_id = p_user_id);

  RETURN v_count;
END;
$$;

-- ============================================================
-- Batch count for the directory. Hidden users are omitted from
-- the result set rather than returned as NULL.
-- ============================================================
CREATE OR REPLACE FUNCTION get_connection_counts(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, connection_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  IF array_length(p_user_ids, 1) > 200 THEN
    RAISE EXCEPTION 'too many ids';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    (
      SELECT count(*)::INTEGER FROM connections c
      WHERE c.status = 'accepted'
        AND (c.requester_id = p.id OR c.addressee_id = p.id)
    )
  FROM profiles p
  WHERE p.id = ANY(p_user_ids)
    AND can_view_connection_count(p.id);
END;
$$;

REVOKE ALL ON FUNCTION can_view_connection_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_connection_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_connection_counts(UUID[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_connection_count(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_connection_counts(UUID[]) TO anon, authenticated;


-- ############################################################################
-- ## 050_summaries_and_tags.sql
-- ############################################################################

-- 050: Short summary one-liners + a tag vocabulary for resources, integrations,
-- events and projects.
--
-- Brings the remaining content entities in line with grants, which have had a
-- `summary` since 042_hero_summaries.sql. Tags follow the array pattern
-- established by 015_resource_library.sql (TEXT[] + GIN index).
--
-- Projects deliberately keep their existing `hashtags` column as the tag field
-- (001_create_projects_table.sql) — a second free-form array on the same table
-- would be ambiguous at every read site.
--
-- Idempotent: safe to re-run.

-- === Summary =================================================================
ALTER TABLE resources    ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS summary TEXT;
-- events and projects already got `summary` in 042 — these are no-ops, kept so
-- this file states the full end state.
ALTER TABLE events       ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE projects     ADD COLUMN IF NOT EXISTS summary TEXT;

-- === Tags ====================================================================
-- resources.tags exists (015) and projects.hashtags exists (001).
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE events       ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_integrations_tags ON integrations USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_events_tags       ON events       USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_projects_hashtags ON projects     USING GIN (hashtags);
-- idx_resources_tags already created in 015.

-- === Free-text search over tags ==============================================
-- `ilike` cannot be applied to a text[] column — PostgREST would emit
-- `"tags" ILIKE '%x%'` and Postgres raises 42883. A function taking the table's
-- composite type is exposed by PostgREST as a virtual, filterable column, so
-- `tags_text.ilike.%x%` can sit inside the same .or(...) as title/description.
-- Computed fields are not returned by `select('*')`, so this costs no payload.
CREATE OR REPLACE FUNCTION public.tags_text(resources) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.tags, ' ') $$;

CREATE OR REPLACE FUNCTION public.tags_text(integrations) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.tags, ' ') $$;

CREATE OR REPLACE FUNCTION public.tags_text(events) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.tags, ' ') $$;

CREATE OR REPLACE FUNCTION public.tags_text(projects) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.hashtags, ' ') $$;

GRANT EXECUTE ON FUNCTION public.tags_text(resources)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tags_text(integrations) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tags_text(events)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tags_text(projects)     TO anon, authenticated;

-- PostgREST caches the schema; without this the new computed fields are
-- invisible and every filter referencing them returns 400.
NOTIFY pgrst, 'reload schema';


-- ############################################################################
-- ## 051_submission_receipts.sql
-- ############################################################################

-- 051: Submission receipts — applicants keep an immutable copy of what they sent.
--
-- Every grant application, event registration and grievance report writes one
-- receipt row holding a frozen snapshot of the answers, plus the field labels
-- needed to render them later. Receipts are written exclusively by triggers
-- (same trigger-only + read-only-RLS pattern as grant_application_events in 046),
-- so the client cannot skip, forge or backdate one.

-- ============================================================
-- Table
-- ============================================================

CREATE TABLE IF NOT EXISTS submission_receipts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('grant_application', 'event_registration', 'grievance')),
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_config JSONB,
  template_key TEXT,
  link TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_receipts_user
  ON submission_receipts(user_id, submitted_at DESC);

COMMENT ON COLUMN submission_receipts.data IS 'Frozen snapshot of the submitted answers';
COMMENT ON COLUMN submission_receipts.field_config IS 'Frozen field definitions (events.registration_fields) so labels survive later form edits';
COMMENT ON COLUMN submission_receipts.template_key IS 'Tells the renderer which label source to use';

-- ============================================================
-- RLS: read-only. Writes happen exclusively via triggers, so there
-- are deliberately no INSERT/UPDATE/DELETE policies.
-- ============================================================

ALTER TABLE submission_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own receipts" ON submission_receipts;
CREATE POLICY "Users can view own receipts" ON submission_receipts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all receipts" ON submission_receipts;
CREATE POLICY "Admins can view all receipts" ON submission_receipts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- Triggers. SECURITY DEFINER is required: submission_receipts has no
-- INSERT policy, and the notifications insert must bypass
-- send_notification()'s no-self-notification rule (a receipt IS a
-- self-notification). The check_notification_prefs BEFORE INSERT
-- trigger still applies; type 'submission_receipt' is uncategorised
-- there, so it always delivers.
-- ============================================================

CREATE OR REPLACE FUNCTION log_grant_application_receipt()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_id UUID;
  grant_title TEXT;
BEGIN
  -- Only on the draft -> submitted transition (or a row created already submitted)
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  SELECT g.title INTO grant_title FROM grants g WHERE g.id = NEW.grant_id;

  INSERT INTO submission_receipts (
    user_id, kind, source_table, source_id, title, subtitle,
    data, template_key, link, submitted_at
  )
  VALUES (
    NEW.user_id,
    'grant_application',
    'grant_applications',
    NEW.id,
    COALESCE(NULLIF(NEW.application_data->>'title', ''), 'Untitled Application'),
    grant_title,
    COALESCE(NEW.application_data, '{}'::jsonb),
    'grant_application_v1',
    '/grants/' || NEW.grant_id::text,
    NOW()
  )
  ON CONFLICT (source_table, source_id) DO NOTHING
  RETURNING id INTO receipt_id;

  IF receipt_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id,
      'submission_receipt',
      'Application received',
      'Your application to ' || COALESCE(grant_title, 'this grant') ||
        ' was submitted. A copy is saved in your dashboard.',
      '/dashboard/submissions/' || receipt_id::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grant_application_receipt ON grant_applications;
CREATE TRIGGER trg_grant_application_receipt
  AFTER INSERT OR UPDATE OF status ON grant_applications
  FOR EACH ROW EXECUTE FUNCTION log_grant_application_receipt();


CREATE OR REPLACE FUNCTION log_event_registration_receipt()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_id UUID;
  ev RECORD;
BEGIN
  SELECT e.title, e.start_date, e.registration_fields
    INTO ev
    FROM events e WHERE e.id = NEW.event_id;

  INSERT INTO submission_receipts (
    user_id, kind, source_table, source_id, title, subtitle,
    data, field_config, template_key, link, submitted_at
  )
  VALUES (
    NEW.user_id,
    'event_registration',
    'event_rsvps',
    NEW.id,
    COALESCE(ev.title, 'Event registration'),
    to_char(ev.start_date AT TIME ZONE 'UTC', 'FMMonth FMDD, YYYY'),
    COALESCE(NEW.registration_data, '{}'::jsonb),
    COALESCE(ev.registration_fields, '[]'::jsonb),
    'event_registration',
    '/events/' || NEW.event_id::text,
    NOW()
  )
  ON CONFLICT (source_table, source_id) DO NOTHING
  RETURNING id INTO receipt_id;

  IF receipt_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id,
      'submission_receipt',
      'Registration confirmed',
      'You registered for ' || COALESCE(ev.title, 'an event') ||
        '. A copy is saved in your dashboard.',
      '/dashboard/submissions/' || receipt_id::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_registration_receipt ON event_rsvps;
CREATE TRIGGER trg_event_registration_receipt
  AFTER INSERT ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION log_event_registration_receipt();


CREATE OR REPLACE FUNCTION log_grievance_receipt()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_id UUID;
  reported_name TEXT;
BEGIN
  SELECT p.display_name INTO reported_name
    FROM profiles p WHERE p.id = NEW.reported_user_id;

  INSERT INTO submission_receipts (
    user_id, kind, source_table, source_id, title, subtitle,
    data, template_key, link, submitted_at
  )
  VALUES (
    NEW.reporter_id,
    'grievance',
    'grievances',
    NEW.id,
    'Report: ' || NEW.category,
    CASE WHEN reported_name IS NOT NULL THEN 'Regarding ' || reported_name END,
    jsonb_build_object(
      'category', NEW.category,
      'description', NEW.description,
      'evidence_url', NEW.evidence_url,
      'context', NEW.context
    ),
    'grievance_v1',
    '/grievances/my-reports',
    NOW()
  )
  ON CONFLICT (source_table, source_id) DO NOTHING
  RETURNING id INTO receipt_id;

  IF receipt_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.reporter_id,
      'submission_receipt',
      'Report received',
      'Your report was submitted. A copy is saved in your dashboard.',
      '/dashboard/submissions/' || receipt_id::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grievance_receipt ON grievances;
CREATE TRIGGER trg_grievance_receipt
  AFTER INSERT ON grievances
  FOR EACH ROW EXECUTE FUNCTION log_grievance_receipt();

-- ============================================================
-- Keep the live application row matching its receipt: applicants may
-- only edit drafts. The explicit WITH CHECK is required — without it
-- Postgres reuses USING for the new row and the draft -> pending
-- submit would reject itself. Admin approve/reject uses the separate
-- admin policy from 012 and is unaffected.
-- ============================================================

DROP POLICY IF EXISTS "Users can update their own applications" ON grant_applications;
CREATE POLICY "Users can update their own applications"
  ON grant_applications FOR UPDATE
  USING (auth.uid() = user_id AND status = 'draft')
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Backfill existing submissions. No notifications for these.
-- ============================================================

INSERT INTO submission_receipts (
  user_id, kind, source_table, source_id, title, subtitle,
  data, template_key, link, submitted_at
)
SELECT
  a.user_id,
  'grant_application',
  'grant_applications',
  a.id,
  COALESCE(NULLIF(a.application_data->>'title', ''), 'Untitled Application'),
  g.title,
  COALESCE(a.application_data, '{}'::jsonb),
  'grant_application_v1',
  '/grants/' || a.grant_id::text,
  a.created_at
FROM grant_applications a
LEFT JOIN grants g ON g.id = a.grant_id
WHERE a.status <> 'draft'
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO submission_receipts (
  user_id, kind, source_table, source_id, title, subtitle,
  data, field_config, template_key, link, submitted_at
)
SELECT
  r.user_id,
  'event_registration',
  'event_rsvps',
  r.id,
  COALESCE(e.title, 'Event registration'),
  to_char(e.start_date AT TIME ZONE 'UTC', 'FMMonth FMDD, YYYY'),
  COALESCE(r.registration_data, '{}'::jsonb),
  COALESCE(e.registration_fields, '[]'::jsonb),
  'event_registration',
  '/events/' || r.event_id::text,
  r.created_at
FROM event_rsvps r
LEFT JOIN events e ON e.id = r.event_id
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO submission_receipts (
  user_id, kind, source_table, source_id, title, subtitle,
  data, template_key, link, submitted_at
)
SELECT
  gr.reporter_id,
  'grievance',
  'grievances',
  gr.id,
  'Report: ' || gr.category,
  CASE WHEN p.display_name IS NOT NULL THEN 'Regarding ' || p.display_name END,
  jsonb_build_object(
    'category', gr.category,
    'description', gr.description,
    'evidence_url', gr.evidence_url,
    'context', gr.context
  ),
  'grievance_v1',
  '/grievances/my-reports',
  gr.created_at
FROM grievances gr
LEFT JOIN profiles p ON p.id = gr.reported_user_id
ON CONFLICT (source_table, source_id) DO NOTHING;


-- ############################################################################
-- ## 052_snippets.sql
-- ############################################################################

-- ============================================================
-- Migration 052: Code Snippets & Snippet Shares
--
-- Brings the code sandbox to parity with whiteboards (019) and
-- documents (026). Before this, code lived only in localStorage
-- under `ktip_sandbox_${language}` — per-browser, unshareable.
--
-- Mirrors 026_documents.sql, with two corrections learned from it:
--   * `permission` ships in the initial table (whiteboards needed
--     a follow-up migration 020 to add it; documents still lack it).
--   * `status` ships too, so snippet shares are pending-by-default
--     from day one — see 053 for the same change to the other two.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled Snippet',
  language TEXT NOT NULL DEFAULT 'javascript'
    CHECK (language IN ('javascript','python','html','css','json','markdown')),
  content TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snippets_owner ON snippets(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS snippet_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view','edit')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(snippet_id, shared_with)
);

CREATE INDEX IF NOT EXISTS idx_snippet_shares_shared_with ON snippet_shares(shared_with, status);
CREATE INDEX IF NOT EXISTS idx_snippet_shares_snippet ON snippet_shares(snippet_id);

-- ============================================================
-- Row Level Security: snippets
-- ============================================================

ALTER TABLE snippets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own snippets" ON snippets;
CREATE POLICY "Users can view own snippets"
  ON snippets FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can create own snippets" ON snippets;
CREATE POLICY "Users can create own snippets"
  ON snippets FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own snippets" ON snippets;
CREATE POLICY "Users can update own snippets"
  ON snippets FOR UPDATE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own snippets" ON snippets;
CREATE POLICY "Users can delete own snippets"
  ON snippets FOR DELETE
  USING (auth.uid() = owner_id);

-- An invite only grants access once the recipient accepts it. A pending or
-- declined share is visible in their /invitations inbox (via snippet_shares)
-- but does not expose the snippet body.
DROP POLICY IF EXISTS "Shared users can view snippets" ON snippets;
CREATE POLICY "Shared users can view snippets"
  ON snippets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM snippet_shares
      WHERE snippet_shares.snippet_id = snippets.id
        AND snippet_shares.shared_with = auth.uid()
        AND snippet_shares.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "Shared editors can update snippets" ON snippets;
CREATE POLICY "Shared editors can update snippets"
  ON snippets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM snippet_shares
      WHERE snippet_shares.snippet_id = snippets.id
        AND snippet_shares.shared_with = auth.uid()
        AND snippet_shares.status = 'accepted'
        AND snippet_shares.permission = 'edit'
    )
  );

-- ============================================================
-- Row Level Security: snippet_shares
-- ============================================================

ALTER TABLE snippet_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view sent snippet shares" ON snippet_shares;
CREATE POLICY "Users can view sent snippet shares"
  ON snippet_shares FOR SELECT
  USING (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Users can view own snippet shares" ON snippet_shares;
CREATE POLICY "Users can view own snippet shares"
  ON snippet_shares FOR SELECT
  USING (auth.uid() = shared_with);

DROP POLICY IF EXISTS "Authenticated users can create snippet shares" ON snippet_shares;
CREATE POLICY "Authenticated users can create snippet shares"
  ON snippet_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Share creator can update snippet shares" ON snippet_shares;
CREATE POLICY "Share creator can update snippet shares"
  ON snippet_shares FOR UPDATE
  USING (auth.uid() = shared_by)
  WITH CHECK (auth.uid() = shared_by);

-- The recipient responds to the invite. The WITH CHECK keeps them on their own
-- row; restricting them to the `status` column needs a trigger, since RLS
-- cannot express "may change this column but not that one" — 053 installs
-- `guard_share_recipient_update()` across all three share tables.
DROP POLICY IF EXISTS "Recipient can respond to snippet share" ON snippet_shares;
CREATE POLICY "Recipient can respond to snippet share"
  ON snippet_shares FOR UPDATE
  USING (auth.uid() = shared_with)
  WITH CHECK (auth.uid() = shared_with);

DROP POLICY IF EXISTS "Users can manage own snippet shares" ON snippet_shares;
CREATE POLICY "Users can manage own snippet shares"
  ON snippet_shares FOR DELETE
  USING (auth.uid() = shared_by OR auth.uid() = shared_with);

-- ============================================================
-- updated_at trigger (reuses update_updated_at_column() from 001)
-- ============================================================

DROP TRIGGER IF EXISTS set_snippets_updated_at ON snippets;
CREATE TRIGGER set_snippets_updated_at
  BEFORE UPDATE ON snippets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ############################################################################
-- ## 053_collab_invites.sql
-- ############################################################################

-- ============================================================
-- Migration 053: Collaboration invites — pending-by-default shares
--
-- Sharing a whiteboard or document used to grant access the instant the row
-- was inserted; the recipient was told after the fact by a notification and
-- had no say. This turns every share into an invitation the recipient
-- accepts or declines from /invitations.
--
-- Also backfills `document_shares.permission`, which 026 never added even
-- though whiteboards (020) and snippets (052) both have it.
--
-- ORDER MATTERS: columns are added and existing rows backfilled to
-- 'accepted' BEFORE the SELECT policies start requiring it. Reversing this
-- would silently revoke every share already in the database.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------

ALTER TABLE whiteboard_shares
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','accepted','declined'));

ALTER TABLE document_shares
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','accepted','declined'));

ALTER TABLE document_shares
  ADD COLUMN IF NOT EXISTS permission TEXT NOT NULL DEFAULT 'view'
  CHECK (permission IN ('view','edit'));

-- ------------------------------------------------------------
-- 2. Backfill — everything that already existed was live access
-- ------------------------------------------------------------
-- Guarded on created_at so a re-run cannot resurrect invitations a
-- recipient has since declined, or silently accept ones still pending.

DO $$
DECLARE
  cutoff TIMESTAMPTZ := now();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '_collab_invite_backfill_done'
  ) THEN
    UPDATE whiteboard_shares SET status = 'accepted'
      WHERE status = 'pending' AND created_at < cutoff;
    UPDATE document_shares SET status = 'accepted'
      WHERE status = 'pending' AND created_at < cutoff;
    -- Marker table: a re-run of this migration must not re-accept rows.
    CREATE TABLE public._collab_invite_backfill_done (done BOOLEAN NOT NULL DEFAULT TRUE);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whiteboard_shares_pending
  ON whiteboard_shares(shared_with, status);
CREATE INDEX IF NOT EXISTS idx_document_shares_pending
  ON document_shares(shared_with, status);

-- ------------------------------------------------------------
-- 3. Column guard for the recipient's UPDATE
-- ------------------------------------------------------------
-- RLS can restrict which ROWS a recipient may update but not which COLUMNS.
-- Without this a recipient could accept an invite and, in the same statement,
-- promote themselves from 'view' to 'edit'.

CREATE OR REPLACE FUNCTION guard_share_recipient_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The share's owner may change anything; only the recipient is constrained.
  IF auth.uid() = OLD.shared_by THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.shared_with THEN
    IF NEW.permission IS DISTINCT FROM OLD.permission
       OR NEW.shared_with IS DISTINCT FROM OLD.shared_with
       OR NEW.shared_by   IS DISTINCT FROM OLD.shared_by THEN
      RAISE EXCEPTION 'Recipients may only change the status of a share';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_whiteboard_share_update ON whiteboard_shares;
CREATE TRIGGER guard_whiteboard_share_update
  BEFORE UPDATE ON whiteboard_shares
  FOR EACH ROW EXECUTE FUNCTION guard_share_recipient_update();

DROP TRIGGER IF EXISTS guard_document_share_update ON document_shares;
CREATE TRIGGER guard_document_share_update
  BEFORE UPDATE ON document_shares
  FOR EACH ROW EXECUTE FUNCTION guard_share_recipient_update();

DROP TRIGGER IF EXISTS guard_snippet_share_update ON snippet_shares;
CREATE TRIGGER guard_snippet_share_update
  BEFORE UPDATE ON snippet_shares
  FOR EACH ROW EXECUTE FUNCTION guard_share_recipient_update();

-- ------------------------------------------------------------
-- 4. Recipients may respond to their own invitations
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Recipient can respond to whiteboard share" ON whiteboard_shares;
CREATE POLICY "Recipient can respond to whiteboard share"
  ON whiteboard_shares FOR UPDATE
  USING (auth.uid() = shared_with)
  WITH CHECK (auth.uid() = shared_with);

DROP POLICY IF EXISTS "Recipient can respond to document share" ON document_shares;
CREATE POLICY "Recipient can respond to document share"
  ON document_shares FOR UPDATE
  USING (auth.uid() = shared_with)
  WITH CHECK (auth.uid() = shared_with);

-- 019/026 left the owner's UPDATE policy without a WITH CHECK, so an owner
-- could rewrite a row into one they no longer own. Restate both with one.
DROP POLICY IF EXISTS "Share creator can update shares" ON whiteboard_shares;
CREATE POLICY "Share creator can update shares"
  ON whiteboard_shares FOR UPDATE
  USING (auth.uid() = shared_by)
  WITH CHECK (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Share creator can update shares" ON document_shares;
CREATE POLICY "Share creator can update shares"
  ON document_shares FOR UPDATE
  USING (auth.uid() = shared_by)
  WITH CHECK (auth.uid() = shared_by);

-- A recipient may withdraw from a collaboration, not just the sender.
DROP POLICY IF EXISTS "Users can manage own shares" ON whiteboard_shares;
CREATE POLICY "Users can manage own shares"
  ON whiteboard_shares FOR DELETE
  USING (auth.uid() = shared_by OR auth.uid() = shared_with);

DROP POLICY IF EXISTS "Users can manage own shares" ON document_shares;
CREATE POLICY "Users can manage own shares"
  ON document_shares FOR DELETE
  USING (auth.uid() = shared_by OR auth.uid() = shared_with);

-- ------------------------------------------------------------
-- 5. Access requires an ACCEPTED invitation
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view shared whiteboards" ON whiteboards;
CREATE POLICY "Users can view shared whiteboards"
  ON whiteboards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_shares
      WHERE whiteboard_shares.whiteboard_id = whiteboards.id
        AND whiteboard_shares.shared_with = auth.uid()
        AND whiteboard_shares.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "Shared editors can update whiteboards" ON whiteboards;
CREATE POLICY "Shared editors can update whiteboards"
  ON whiteboards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_shares
      WHERE whiteboard_shares.whiteboard_id = whiteboards.id
        AND whiteboard_shares.shared_with = auth.uid()
        AND whiteboard_shares.status = 'accepted'
        AND whiteboard_shares.permission = 'edit'
    )
  );

DROP POLICY IF EXISTS "Shared users can view documents" ON documents;
CREATE POLICY "Shared users can view documents"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_shares.document_id = documents.id
        AND document_shares.shared_with = auth.uid()
        AND document_shares.status = 'accepted'
    )
  );

-- Documents gain shared-edit, matching whiteboards and snippets.
DROP POLICY IF EXISTS "Shared editors can update documents" ON documents;
CREATE POLICY "Shared editors can update documents"
  ON documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_shares.document_id = documents.id
        AND document_shares.shared_with = auth.uid()
        AND document_shares.status = 'accepted'
        AND document_shares.permission = 'edit'
    )
  );

NOTIFY pgrst, 'reload schema';


-- ############################################################################
-- ## 054_email_invites.sql
-- ############################################################################

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


COMMIT;
