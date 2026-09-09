-- ============================================================
-- Migration 144: document-images — the uploader owns the object
--
-- 027 created the bucket with UPDATE and DELETE open to every authenticated
-- user on every object, because the upload path at the time was
-- "documents/{timestamp}-{rand}.{ext}" and carried no owner to scope on. It
-- said so in its own header and scoped the other bucket (event-assets) by
-- role instead; document-images got no such narrowing, and nothing since has
-- touched it. Any member could wipe or swap every inline image in every
-- collaborative document on the platform.
--
-- The client now uploads to "{auth.uid()}/{timestamp}-{rand}.{ext}"
-- (src/lib/storage-upload.ts), the same shape avatars and project-images
-- have used since 006, so the policies can read the owner out of the path.
--
-- Objects already under "documents/" keep their public URLs — SELECT is
-- unchanged — but from here only a platform admin may replace or remove
-- them. Nobody else could prove they owned one anyway.
--
-- Idempotent — safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can upload document images" ON storage.objects;
CREATE POLICY "Authenticated users can upload document images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'document-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated users can update document images" ON storage.objects;
CREATE POLICY "Owners and admins can update document images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'document-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR is_platform_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can delete document images" ON storage.objects;
CREATE POLICY "Owners and admins can delete document images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'document-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR is_platform_admin(auth.uid())
    )
  );
