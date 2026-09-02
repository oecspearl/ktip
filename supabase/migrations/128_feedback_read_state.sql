-- ============================================================
-- Migration 128: has anyone actually looked at this report?
--
-- The triage queue built by 037 and answered by 127 still has no notion of
-- attention. A report filed this morning and one sitting untouched since
-- August render identically, so the list gives no sense of what is new and
-- an admin working it has to remember where they got to.
--
-- Two columns, and a deliberate choice about whose read state it is:
--
--   READ STATE IS SHARED, NOT PER-ADMIN. One `read_at` on the row, set by
--   whoever opens the report first, and everybody's queue clears together.
--   That is the right answer for THIS table specifically — /admin/feedback is
--   one shared work queue, and the question worth answering is "has anyone
--   dealt with this yet", not "have I personally seen it". Per-viewer state
--   would need its own table keyed on (feedback_id, user_id), the way 086 does
--   it for conversation_participants.last_read_at, where the question really
--   is per-person because a thread is addressed to you.
--
--   Do not "fix" this into a per-user column later without moving it to that
--   second table — a bare read_at that only ONE admin's session writes would
--   mark the queue read for colleagues who never saw it.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS read_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN feedback.read_at IS
  'When an admin first opened this report. SHARED across the admin team, not per-viewer — see 128.';
COMMENT ON COLUMN feedback.read_by IS
  'Which admin opened it. Internal triage metadata; my_feedback() does not project it.';

-- Partial, because the only question ever asked of these columns is "what is
-- still unread" — a full index on read_at would be mostly dead entries for
-- rows nobody filters on.
CREATE INDEX IF NOT EXISTS idx_feedback_unread
  ON feedback(created_at DESC)
  WHERE read_at IS NULL;

-- ------------------------------------------------------------
-- What deliberately does NOT change
--
-- Policies: 127 already made this table admin-read and admin-write only, and
-- these are ordinary columns on it. Nothing to add.
--
-- my_feedback(): unchanged. Who read a report and when is triage metadata the
-- reporter is not owed — they are told what came of it (127's admin_reply),
-- which is the part that concerns them.
--
-- One side effect to know about: set_feedback_updated_at (037) fires on every
-- UPDATE, so merely OPENING a report now moves updated_at. That is precisely
-- why 127 gave the reply its own replied_at instead of leaning on updated_at,
-- and the same caution applies to anything read off updated_at in future.
-- Nothing in the UI does today.
-- ------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
