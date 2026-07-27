-- ============================================================
-- Migration 027: Storage — event-assets & document-images buckets
-- Creates buckets referenced in code that were never provisioned
-- in 006_create_avatars_storage.sql:
--   - 'event-assets'    src/pages/admin/events/AdminEventSpeakersTab.tsx
--                       (via src/components/ui/ImageUpload.tsx, path
--                       "speakers/{speakerId}/photo.{ext}")
--   - 'document-images' src/components/collaboration/editor/ImageModal.tsx
--                       (path "documents/{timestamp}-{rand}.{ext}")
-- Neither upload path is namespaced under the uploader's auth.uid(), so
-- (unlike the avatars/project-images/event-images policies in 006) write
-- access cannot be scoped by storage.foldername() == auth.uid(). Policies
-- below scope by role instead.
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. EVENT-ASSETS BUCKET (admin-managed: speaker photos, etc.)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-assets',
  'event-assets',
  TRUE,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view event assets" ON storage.objects;
CREATE POLICY "Anyone can view event assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-assets');

-- AdminEventSpeakersTab.tsx is an OECS-admin-only screen; require the
-- 'oecs' role (same admin check used in 012_admin_dashboard_policies.sql).
DROP POLICY IF EXISTS "OECS admins can upload event assets" ON storage.objects;
CREATE POLICY "OECS admins can upload event assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-assets'
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

DROP POLICY IF EXISTS "OECS admins can update event assets" ON storage.objects;
CREATE POLICY "OECS admins can update event assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'event-assets'
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

DROP POLICY IF EXISTS "OECS admins can delete event assets" ON storage.objects;
CREATE POLICY "OECS admins can delete event assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-assets'
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- 2. DOCUMENT-IMAGES BUCKET (inline images in the doc editor)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-images',
  'document-images',
  TRUE,
  10485760, -- 10MB limit (matches ImageModal.tsx's client-side check)
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view document images" ON storage.objects;
CREATE POLICY "Anyone can view document images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'document-images');

-- Any authenticated user can insert inline images (mirrors who can create
-- documents — ImageModal.tsx is reachable by any signed-in editor user).
DROP POLICY IF EXISTS "Authenticated users can upload document images" ON storage.objects;
CREATE POLICY "Authenticated users can upload document images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'document-images'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Authenticated users can update document images" ON storage.objects;
CREATE POLICY "Authenticated users can update document images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'document-images'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Authenticated users can delete document images" ON storage.objects;
CREATE POLICY "Authenticated users can delete document images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'document-images'
    AND auth.uid() IS NOT NULL
  );
