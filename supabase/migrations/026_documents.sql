-- ============================================================
-- Migration 026: Documents & Document Shares
-- Creates the documents + document_shares tables backing the
-- collaborative editor (src/hooks/useDocuments.ts,
-- src/components/collaboration/editor/ShareDocumentModal.tsx)
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled Document',
  content TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id, updated_at DESC);

-- document_shares mirrors whiteboard_shares (019_whiteboards.sql).
-- ShareDocumentModal.tsx upserts { document_id, shared_with, shared_by }
-- with onConflict: 'document_id,shared_with' and no permission/level
-- column — sharing is read-only in the current app code.
CREATE TABLE IF NOT EXISTS document_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, shared_with)
);

CREATE INDEX IF NOT EXISTS idx_document_shares_shared_with ON document_shares(shared_with);
CREATE INDEX IF NOT EXISTS idx_document_shares_document ON document_shares(document_id);

-- ============================================================
-- Row Level Security: documents
-- ============================================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own documents" ON documents;
CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can create own documents" ON documents;
CREATE POLICY "Users can create own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own documents" ON documents;
CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own documents" ON documents;
CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid() = owner_id);

-- Shared users: read-only access (useSharedDocuments() in useDocuments.ts
-- looks up document_shares.shared_with = auth.uid(), then selects the
-- documents by id). No shared-edit policy is added — the app never
-- writes to `documents` on behalf of a shared (non-owner) user.
DROP POLICY IF EXISTS "Shared users can view documents" ON documents;
CREATE POLICY "Shared users can view documents"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_shares.document_id = documents.id
      AND document_shares.shared_with = auth.uid()
    )
  );

-- ============================================================
-- Row Level Security: document_shares
-- ============================================================

ALTER TABLE document_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view sent shares" ON document_shares;
CREATE POLICY "Users can view sent shares"
  ON document_shares FOR SELECT
  USING (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Users can view own shares" ON document_shares;
CREATE POLICY "Users can view own shares"
  ON document_shares FOR SELECT
  USING (auth.uid() = shared_with);

DROP POLICY IF EXISTS "Authenticated users can create shares" ON document_shares;
CREATE POLICY "Authenticated users can create shares"
  ON document_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = shared_by);

-- ShareDocumentModal.tsx upserts on conflict (document_id, shared_with),
-- which requires UPDATE privileges on the conflicting row.
DROP POLICY IF EXISTS "Share creator can update shares" ON document_shares;
CREATE POLICY "Share creator can update shares"
  ON document_shares FOR UPDATE
  USING (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Users can manage own shares" ON document_shares;
CREATE POLICY "Users can manage own shares"
  ON document_shares FOR DELETE
  USING (auth.uid() = shared_by);

-- ============================================================
-- updated_at trigger (reuses update_updated_at_column() from 001)
-- ============================================================

DROP TRIGGER IF EXISTS set_documents_updated_at ON documents;
CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
