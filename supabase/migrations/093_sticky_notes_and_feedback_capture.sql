-- ============================================================
-- Migration 093: Sticky notes, and feedback you can show rather than describe
--
-- Two additions behind the floating action button.
--
-- A sticky note is a private scratchpad the member drops anywhere on the page
-- and keeps while they navigate. It is its own table rather than a column on
-- profiles because there are many per person, each with its own position, and
-- they are written to constantly — a JSON blob on profiles would make every
-- drag a rewrite of the whole profile row.
--
-- Positions are stored as viewport *fractions*, not pixels: the same note has
-- to land in the same relative spot on a laptop and on a phone.
--
-- The feedback half extends 037 rather than replacing it. A report gains the
-- page it came from and an annotated screenshot, and the category list gains
-- 'praise' so the channel carries good news as well as bugs — a channel that
-- only accepts complaints under-reports how the site is actually doing.
--
-- Note on numbering: 091 was used twice (account_age, venue_room_sections).
-- 092 is the highest applied migration; this is 093.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Sticky notes
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sticky_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'sun'
    CHECK (color IN ('sun', 'tropical', 'ocean', 'red', 'sand')),
  -- 0..1 fractions of the viewport, clamped client-side so a note can never be
  -- dragged fully off-screen and become unreachable.
  x REAL NOT NULL DEFAULT 0.5 CHECK (x >= 0 AND x <= 1),
  y REAL NOT NULL DEFAULT 0.5 CHECK (y >= 0 AND y <= 1),
  collapsed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sticky_notes_user ON sticky_notes(user_id, created_at DESC);

COMMENT ON TABLE sticky_notes IS
  'Private per-member scratchpad notes pinned over the site; positions are viewport fractions, not pixels.';
COMMENT ON COLUMN sticky_notes.x IS 'Left edge as a fraction of viewport width (0..1).';
COMMENT ON COLUMN sticky_notes.y IS 'Top edge as a fraction of viewport height (0..1).';

DROP TRIGGER IF EXISTS set_sticky_notes_updated_at ON sticky_notes;
CREATE TRIGGER set_sticky_notes_updated_at
  BEFORE UPDATE ON sticky_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 2. Notes are private — to admins too
--
-- Nothing here is a moderation surface: a note is the member talking to
-- themselves, and no role has a reason to read it.
-- ------------------------------------------------------------

ALTER TABLE sticky_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their own notes" ON sticky_notes;
CREATE POLICY "Members read their own notes"
  ON sticky_notes FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Members create their own notes" ON sticky_notes;
CREATE POLICY "Members create their own notes"
  ON sticky_notes FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members edit their own notes" ON sticky_notes;
CREATE POLICY "Members edit their own notes"
  ON sticky_notes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members delete their own notes" ON sticky_notes;
CREATE POLICY "Members delete their own notes"
  ON sticky_notes FOR DELETE
  USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 3. Feedback gains a rating, a page, and a screenshot
-- ------------------------------------------------------------

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS rating SMALLINT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS page_path TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS screenshot_path TEXT;

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_rating_check;
ALTER TABLE feedback
  ADD CONSTRAINT feedback_rating_check
  CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

-- Widened from 037: 'praise' joins the four original categories. Existing rows
-- all still satisfy the new list, so no backfill is needed.
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_category_check;
ALTER TABLE feedback
  ADD CONSTRAINT feedback_category_check
  CHECK (category IN ('bug', 'feature_request', 'general', 'content', 'praise'));

COMMENT ON COLUMN feedback.rating IS '1-5 stars, optional; the review half of the channel.';
COMMENT ON COLUMN feedback.page_path IS 'Route the report was filed from, captured automatically.';
COMMENT ON COLUMN feedback.screenshot_path IS
  'Object key in the private feedback-screenshots bucket; the annotated PNG.';

-- Signed-out visitors hit the same bugs as members and are the least likely to
-- come back and report them later. 023 already lets anon write uat_responses;
-- this is the same trade, with user_id pinned NULL so an anonymous row can
-- never be attributed to someone.
DROP POLICY IF EXISTS "Anonymous visitors can submit feedback" ON feedback;
CREATE POLICY "Anonymous visitors can submit feedback"
  ON feedback FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

-- ------------------------------------------------------------
-- 4. Where the screenshots live
--
-- Private bucket: a screenshot is whatever happened to be on the reporter's
-- screen, which routinely includes another member's name or a draft they have
-- not published. Admins read it through a signed URL from the triage page.
-- ------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-screenshots',
  'feedback-screenshots',
  FALSE,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- uid-namespaced keys ({uid}/{ts}-{rand}.png), guarded the way 048 guards
-- entity-documents. Anonymous reports carry no screenshot — there is no anon
-- folder to write into, and giving anon a write path here would be an open
-- upload endpoint.
DROP POLICY IF EXISTS "Users can upload own feedback screenshots" ON storage.objects;
CREATE POLICY "Users can upload own feedback screenshots"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'feedback-screenshots'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Feedback screenshots readable by reporter and admins" ON storage.objects;
CREATE POLICY "Feedback screenshots readable by reporter and admins"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'feedback-screenshots'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR is_oecs_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can replace own feedback screenshots" ON storage.objects;
CREATE POLICY "Users can replace own feedback screenshots"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- Admins delete too: a screenshot outlives the triage it was filed for, and
-- clearing a resolved report should be able to clear its blob.
DROP POLICY IF EXISTS "Users and admins can delete feedback screenshots" ON storage.objects;
CREATE POLICY "Users and admins can delete feedback screenshots"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'feedback-screenshots'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR is_oecs_admin(auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
