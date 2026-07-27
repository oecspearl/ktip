-- ============================================================
-- Migration 025: Proposals
-- Creates the proposals table backing the Proposal Wizard
-- (src/hooks/useProposals.ts, src/hooks/useShareProposal.ts,
--  src/pages/proposals/SharedProposalPage.tsx)
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('funding', 'project', 'research', 'business')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  proposal_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step INTEGER NOT NULL DEFAULT 0,
  share_token UUID,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- share_token is generated client-side via crypto.randomUUID() (useShareProposal.ts)
-- and looked up with .eq('share_token', t).single() — must be unique.
-- Multiple NULLs are allowed under a UNIQUE constraint (unshared proposals).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposals_share_token_key'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_share_token_key UNIQUE (share_token);
  END IF;
END $$;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_proposals_user ON proposals(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_share_token ON proposals(share_token) WHERE share_token IS NOT NULL;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Owner: full CRUD
DROP POLICY IF EXISTS "Users can view own proposals" ON proposals;
CREATE POLICY "Users can view own proposals"
  ON proposals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own proposals" ON proposals;
CREATE POLICY "Users can create own proposals"
  ON proposals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own proposals" ON proposals;
CREATE POLICY "Users can update own proposals"
  ON proposals FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own proposals" ON proposals;
CREATE POLICY "Users can delete own proposals"
  ON proposals FOR DELETE
  USING (auth.uid() = user_id);

-- Public: unauthenticated visitors can read a proposal once it has been
-- shared (share_token set). SharedProposalPage.tsx / useSharedProposal()
-- queries `select('*').eq('share_token', t).single()` with no auth
-- required, so the row must be readable by the anon role.
DROP POLICY IF EXISTS "Anyone can view shared proposals" ON proposals;
CREATE POLICY "Anyone can view shared proposals"
  ON proposals FOR SELECT
  USING (share_token IS NOT NULL);

-- ============================================================
-- updated_at trigger (reuses update_updated_at_column() from 001)
-- ============================================================

DROP TRIGGER IF EXISTS set_proposals_updated_at ON proposals;
CREATE TRIGGER set_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
