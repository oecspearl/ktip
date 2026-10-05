-- ============================================================================
-- 157_project_video_url.sql — an optional video link on a project
-- ============================================================================
-- Grant applications have taken a video link since the wizard shipped (a key
-- in grant_applications.application_data, no column). Projects had nowhere to
-- put one, so a team with a Loom walkthrough or a demo on Drive pasted it into
-- the description, where it rendered as plain text nobody clicked.
--
-- video_url holds the link as the member pasted it. The app turns it into an
-- embed at render time (src/lib/video-embed.ts) and only ever builds the
-- iframe src from a parsed ID, never from this value directly.
--
-- The CHECK is deliberately generic: http(s) and a length cap. Which hosts
-- count as a video source (Loom, Google Drive, YouTube, Vimeo) is decided in
-- one TypeScript module shared by the project form and the grant wizard. A
-- copy of that list here would drift, and the grant side lives in jsonb where
-- no column constraint can reach it anyway.
--
-- No RLS change: the projects policies are row-level with no column list.
-- The moderation trigger (122) scans title and description only.
-- Idempotent — safe to re-run.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_video_url_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_video_url_check
  CHECK (video_url IS NULL OR (video_url ~* '^https?://' AND char_length(video_url) <= 500));

COMMENT ON COLUMN public.projects.video_url IS
  'Optional pitch or demo video link (Loom, Google Drive, YouTube, Vimeo). Host allowlist enforced client-side in src/lib/video-embed.ts.';
