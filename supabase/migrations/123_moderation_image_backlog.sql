-- Migration 123: Backlog for images the safety check could not read
--
-- api/moderate-image.ts fails open, for the same reasons the text check does:
-- a vendor outage must not stop members from sending a photograph, and a
-- fail-closed check is a denial of service waiting to be triggered by anyone
-- who can make the provider slow.
--
-- But failing open on an image is not the same as failing open on text. Text
-- still meets the deterministic word scan in the trigger; an image meets
-- nothing. Every check that times out is a picture that went out unexamined,
-- so the misses are recorded rather than forgotten, and the safety team can
-- sweep them.
--
-- Deliberately not a queue. There is no cron in this project (api/moderate.ts
-- says so in its own header), and inventing one here to drain a table would be
-- a second piece of infrastructure to operate. A list a person can look at is
-- honest about what it is.
--
-- Idempotent — safe to re-run. Requires 065 and 121.

CREATE TABLE IF NOT EXISTS moderation_image_backlog (
  bucket     TEXT NOT NULL,
  path       TEXT NOT NULL,
  user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, path)
);

CREATE INDEX IF NOT EXISTS idx_moderation_image_backlog_created
  ON moderation_image_backlog(created_at DESC);

COMMENT ON TABLE moderation_image_backlog IS
  'Images whose safety check did not complete — a timeout, a provider error, an unreadable object. The upload was allowed through, so this is the list of what went out unexamined.';

ALTER TABLE moderation_image_backlog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moderators can view the image backlog" ON moderation_image_backlog;
CREATE POLICY "Moderators can view the image backlog"
  ON moderation_image_backlog FOR SELECT
  USING (has_permission(auth.uid(), 'moderation:view'));

-- No write policy: written by the edge route under the service key only, the
-- same pattern moderation_log uses.

NOTIFY pgrst, 'reload schema';
