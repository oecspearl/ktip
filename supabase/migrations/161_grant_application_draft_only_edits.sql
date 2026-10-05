-- ============================================================================
-- 161_grant_application_draft_only_edits.sql — an applicant edits drafts only
-- ============================================================================
-- The applicant UPDATE policy (111) checked the row's owner and nothing else in
-- USING, so it allowed an update to an application in any status. The wizard's
-- autosave upserts with status = 'draft' every few seconds, and the client can
-- only cancel a save that has not started yet. A save already in flight when
-- the member pressed Submit could land after the submit and turn the
-- application back into a draft. It stayed visible to the applicant as
-- submitted until reload, and was invisible to reviewers, who read
-- status <> 'draft'.
--
-- The client now waits for an in-flight save before submitting. This makes the
-- server refuse the reversal whatever the client does: an applicant may UPDATE
-- only a row that is still a draft. Every applicant-side write targets a draft:
-- the autosave, the explicit draft save, sponsor nomination (which has to
-- precede submission, see 064) and the draft -> pending submit itself (USING
-- sees the old row, which is still a draft).
--
-- Reviewer and admin updates go through their own policies (116) and are
-- unchanged. WITH CHECK is 111's, unchanged.
--
-- For an upsert, ON CONFLICT DO UPDATE against a row this USING rejects raises
-- 42501 instead of silently doing nothing. The wizard reports that as a failed
-- save, which is correct: there is nothing left to save.
-- ============================================================================

DROP POLICY IF EXISTS "Users can update their own applications" ON grant_applications;
CREATE POLICY "Users can update their own applications"
  ON grant_applications FOR UPDATE
  USING (auth.uid() = user_id AND status = 'draft')
  WITH CHECK (
    auth.uid() = user_id
    AND (
      has_permission(auth.uid(), 'grant:apply')
      OR status = 'draft'
      OR sponsor_approved_at IS NOT NULL
    )
    AND (status = 'draft' OR can_engage_with_grant(grant_id, auth.uid()))
  );
