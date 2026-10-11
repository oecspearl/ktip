-- ============================================================================
-- 171_section_notices_and_event_entry.sql — the forum and messaging notices,
-- and consent collected when a member enters a competition
-- ============================================================================
-- 1. member_notice_acks
--
-- The Forums and the Messages panel now open with a short notice the first
-- time a member enters them: the Community Guidelines and the Safeguarding
-- rules that govern what is said there. "I understand" writes one row here and
-- the notice is not shown again.
--
-- Not user_consents. Both documents are in the account bundle, which every
-- member accepted at sign-up, so record_consent would be a no-op
-- (ON CONFLICT DO NOTHING) and could not answer "has this member seen the
-- forum notice". This is a reminder of terms already agreed, not a new
-- agreement, and keeping it out of the consent register keeps that register
-- an honest list of acceptances.
--
-- `signature` is the set of document versions the notice summarised, written
-- by the client (e.g. 'acceptable-use@1,safeguarding@1'). When either document
-- is revised the signature changes, no row matches, and the notice shows once
-- more. Nothing here is evidence of anything, so a client-supplied value is
-- fine; the RLS only stops a member writing rows for someone else.
--
-- 2. 'event_entry' consent context
--
-- The Competition IP terms say they apply the first time a member enters a
-- hackathon or submits a solution. Submitting was gated ('event_solution');
-- registering as a participant was not. The registration button now asks for
-- the competition bundle first, and the acceptance is recorded under its own
-- context so Settings can say "when entering a competition".
--
-- Mirrors ConsentContext in src/hooks/useAgreementGate.ts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS member_notice_acks (
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notice_key      TEXT NOT NULL CHECK (notice_key IN ('forums', 'messaging')),
  signature       TEXT NOT NULL CHECK (length(signature) BETWEEN 1 AND 200),
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notice_key, signature)
);

ALTER TABLE member_notice_acks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their own notice acks" ON member_notice_acks;
CREATE POLICY "Members read their own notice acks" ON member_notice_acks
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Members record their own notice acks" ON member_notice_acks;
CREATE POLICY "Members record their own notice acks" ON member_notice_acks
  FOR INSERT WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT ON member_notice_acks TO authenticated;

ALTER TABLE user_consents DROP CONSTRAINT IF EXISTS user_consents_context_check;
ALTER TABLE user_consents ADD CONSTRAINT user_consents_context_check
  CHECK (context IN (
    'signup', 'onboarding', 'reconsent', 'settings',
    'project', 'event', 'forum_post', 'cv_publish', 'org_publish',
    'event_solution', 'grant_application',
    'grant_post',
    'resource_submit',
    'event_entry'
  ));
