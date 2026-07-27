-- ============================================================
-- Migration 040: Security fixes
-- uat_responses SELECT was open to ALL authenticated users —
-- survey responses (free-text feedback) should be admin-only.
-- (The messaging INSERT/DELETE holes are fixed in 034; the open
-- notifications INSERT policy is replaced by send_notification()
-- in 036.)
-- Idempotent — safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can read UAT responses" ON uat_responses;
CREATE POLICY "Admins can read UAT responses"
  ON uat_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );
