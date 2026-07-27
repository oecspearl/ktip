-- ============================================================
-- Migration 035: Identity Verification Workflow
-- verification_requests table + the platform's first PRIVATE
-- storage bucket (verification-documents). Admin approval flips
-- profiles.is_verified via the existing admin update path.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS verification_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  document_paths TEXT[] NOT NULL DEFAULT '{}',
  user_note TEXT,
  admin_note TEXT,
  reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_requests_user ON verification_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests(status, created_at DESC);

-- One open request per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_one_pending
  ON verification_requests(user_id) WHERE status = 'pending';

DROP TRIGGER IF EXISTS set_verification_requests_updated_at ON verification_requests;
CREATE TRIGGER set_verification_requests_updated_at
  BEFORE UPDATE ON verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own verification requests" ON verification_requests;
CREATE POLICY "Users can view own verification requests"
  ON verification_requests FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Users can submit verification requests" ON verification_requests;
CREATE POLICY "Users can submit verification requests"
  ON verification_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can review verification requests" ON verification_requests;
CREATE POLICY "Admins can review verification requests"
  ON verification_requests FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- ============================================================
-- PRIVATE bucket for identity documents (PDF + images).
-- public = FALSE: reads require signed URLs / authorized download.
-- Path convention: {userId}/{filename}
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-documents',
  'verification-documents',
  FALSE,
  10485760, -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own verification documents" ON storage.objects;
CREATE POLICY "Users can upload own verification documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'verification-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users and admins can view verification documents" ON storage.objects;
CREATE POLICY "Users and admins can view verification documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'verification-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    )
  );

DROP POLICY IF EXISTS "Users can delete own verification documents" ON storage.objects;
CREATE POLICY "Users can delete own verification documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );
