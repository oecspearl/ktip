-- ============================================================
-- Migration 127: closing the loop on a feedback report
--
-- 037 built a one-way inbox. An admin sets a status and writes a note, and the
-- person who filed the report is told nothing — they find out a bug was fixed
-- by hitting the page again and noticing. This adds the reply half.
--
-- Two things happen here, and only the first is the new feature:
--
--   1. `admin_reply` — a member-facing note, separate from `admin_note`.
--      Separate because the two have opposite audiences: one is triage
--      shorthand between admins ("dupe of the 093 thing"), the other is
--      written to be read by the reporter. One column serving both would mean
--      every internal note is published by accident.
--
--   2. `admin_note` stops being readable by the reporter. RLS is row-level, so
--      the SELECT policy (037, restated by 090) hands the reporter the whole
--      row with its `auth.uid() = user_id` arm, internal notes included. Nobody
--      noticed because nothing rendered them — but the API answered, and this
--      migration is about to start writing a column whose entire meaning is
--      "this one IS for them". The split has to be real before it is relied on.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The reply
--
-- replied_at is its own column rather than leaning on updated_at: the trigger
-- moves updated_at on every triage touch, so it cannot answer "when were they
-- last told something".
-- ------------------------------------------------------------

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS admin_reply TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS replied_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN feedback.admin_note IS
  'Internal triage note. Never leaves the admin console — my_feedback() does not project it.';
COMMENT ON COLUMN feedback.admin_reply IS
  'The reply shown to the reporter in Settings, Feedback. Written to be read by them.';
COMMENT ON COLUMN feedback.replied_at IS
  'When the current reply was sent. Distinct from updated_at, which moves on any triage edit.';
COMMENT ON COLUMN feedback.replied_by IS
  'The admin who sent the current reply. Internal — not projected to the reporter.';

-- ------------------------------------------------------------
-- 2. The table becomes admin-read-only
--
-- 090 already moved both policies onto is_platform_admin(), the predicate the
-- other ~65 admin policies ask (widened to the admin seat by 124). That stays.
-- The one change is that the reporter's `auth.uid() = user_id` arm is GONE
-- from SELECT. Their own reports come back through my_feedback() below, which
-- is the only way to keep admin_note internal — a column cannot be hidden by
-- a row policy.
--
-- UPDATE is restated unchanged so this file is the whole picture of who may
-- touch the table, rather than a diff against 090.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own feedback" ON feedback;
DROP POLICY IF EXISTS "Admins can view feedback" ON feedback;
CREATE POLICY "Admins can view feedback"
  ON feedback FOR SELECT
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update feedback" ON feedback;
CREATE POLICY "Admins can update feedback"
  ON feedback FOR UPDATE
  USING (is_platform_admin(auth.uid()));

-- ------------------------------------------------------------
-- 3. What the reporter gets back
--
-- SECURITY DEFINER so it can read past the admin-only SELECT policy, and
-- narrowed by hand to the columns a reporter may see. Absent on purpose:
-- admin_note and replied_by (internal), and screenshot_path (a storage key the
-- member has no use for — the file is theirs, but the triage view is not).
--
-- Returns nothing rather than raising when there is no session: an anonymous
-- report has no owner, and a signed-out caller asking for "my feedback" has an
-- empty answer, not an error.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION my_feedback()
RETURNS TABLE (
  id UUID,
  category TEXT,
  subject TEXT,
  message TEXT,
  status TEXT,
  rating SMALLINT,
  page_path TEXT,
  admin_reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.category, f.subject, f.message, f.status, f.rating, f.page_path,
         f.admin_reply, f.replied_at, f.created_at
  FROM feedback f
  WHERE auth.uid() IS NOT NULL
    AND f.user_id = auth.uid()
  ORDER BY f.created_at DESC;
$$;

COMMENT ON FUNCTION my_feedback() IS
  'A member''s own reports, minus the internal columns. The reporter has no direct SELECT on feedback.';

REVOKE ALL ON FUNCTION my_feedback() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_feedback() TO authenticated;

-- ------------------------------------------------------------
-- 4. A note for whoever next audits enforce_notification_preferences()
--
-- 'feedback_reply' has no column in notification_preferences and falls through
-- that function's CASE to ELSE TRUE. That is correct and deliberate, for the
-- same reason 112 gives for grant_application_result: an answer to a report you
-- filed yourself is not a subscription. Do not "fix" it by mapping it onto a
-- category — the mute would silence the only reply the reporter ever gets.
--
-- The email half answers to notification_preferences.email, which is checked in
-- api/feedback/reply-notify.ts rather than here.
-- ------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
