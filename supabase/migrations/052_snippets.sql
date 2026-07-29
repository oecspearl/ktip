-- ============================================================
-- Migration 052: Code Snippets & Snippet Shares
--
-- Brings the code sandbox to parity with whiteboards (019) and
-- documents (026). Before this, code lived only in localStorage
-- under `ktip_sandbox_${language}` — per-browser, unshareable.
--
-- Mirrors 026_documents.sql, with two corrections learned from it:
--   * `permission` ships in the initial table (whiteboards needed
--     a follow-up migration 020 to add it; documents still lack it).
--   * `status` ships too, so snippet shares are pending-by-default
--     from day one — see 053 for the same change to the other two.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled Snippet',
  language TEXT NOT NULL DEFAULT 'javascript'
    CHECK (language IN ('javascript','python','html','css','json','markdown')),
  content TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snippets_owner ON snippets(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS snippet_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view','edit')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(snippet_id, shared_with)
);

CREATE INDEX IF NOT EXISTS idx_snippet_shares_shared_with ON snippet_shares(shared_with, status);
CREATE INDEX IF NOT EXISTS idx_snippet_shares_snippet ON snippet_shares(snippet_id);

-- ============================================================
-- Row Level Security: snippets
-- ============================================================

ALTER TABLE snippets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own snippets" ON snippets;
CREATE POLICY "Users can view own snippets"
  ON snippets FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can create own snippets" ON snippets;
CREATE POLICY "Users can create own snippets"
  ON snippets FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own snippets" ON snippets;
CREATE POLICY "Users can update own snippets"
  ON snippets FOR UPDATE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own snippets" ON snippets;
CREATE POLICY "Users can delete own snippets"
  ON snippets FOR DELETE
  USING (auth.uid() = owner_id);

-- An invite only grants access once the recipient accepts it. A pending or
-- declined share is visible in their /invitations inbox (via snippet_shares)
-- but does not expose the snippet body.
DROP POLICY IF EXISTS "Shared users can view snippets" ON snippets;
CREATE POLICY "Shared users can view snippets"
  ON snippets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM snippet_shares
      WHERE snippet_shares.snippet_id = snippets.id
        AND snippet_shares.shared_with = auth.uid()
        AND snippet_shares.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "Shared editors can update snippets" ON snippets;
CREATE POLICY "Shared editors can update snippets"
  ON snippets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM snippet_shares
      WHERE snippet_shares.snippet_id = snippets.id
        AND snippet_shares.shared_with = auth.uid()
        AND snippet_shares.status = 'accepted'
        AND snippet_shares.permission = 'edit'
    )
  );

-- ============================================================
-- Row Level Security: snippet_shares
-- ============================================================

ALTER TABLE snippet_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view sent snippet shares" ON snippet_shares;
CREATE POLICY "Users can view sent snippet shares"
  ON snippet_shares FOR SELECT
  USING (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Users can view own snippet shares" ON snippet_shares;
CREATE POLICY "Users can view own snippet shares"
  ON snippet_shares FOR SELECT
  USING (auth.uid() = shared_with);

DROP POLICY IF EXISTS "Authenticated users can create snippet shares" ON snippet_shares;
CREATE POLICY "Authenticated users can create snippet shares"
  ON snippet_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Share creator can update snippet shares" ON snippet_shares;
CREATE POLICY "Share creator can update snippet shares"
  ON snippet_shares FOR UPDATE
  USING (auth.uid() = shared_by)
  WITH CHECK (auth.uid() = shared_by);

-- The recipient responds to the invite. The WITH CHECK keeps them on their own
-- row; restricting them to the `status` column needs a trigger, since RLS
-- cannot express "may change this column but not that one" — 053 installs
-- `guard_share_recipient_update()` across all three share tables.
DROP POLICY IF EXISTS "Recipient can respond to snippet share" ON snippet_shares;
CREATE POLICY "Recipient can respond to snippet share"
  ON snippet_shares FOR UPDATE
  USING (auth.uid() = shared_with)
  WITH CHECK (auth.uid() = shared_with);

DROP POLICY IF EXISTS "Users can manage own snippet shares" ON snippet_shares;
CREATE POLICY "Users can manage own snippet shares"
  ON snippet_shares FOR DELETE
  USING (auth.uid() = shared_by OR auth.uid() = shared_with);

-- ============================================================
-- updated_at trigger (reuses update_updated_at_column() from 001)
-- ============================================================

DROP TRIGGER IF EXISTS set_snippets_updated_at ON snippets;
CREATE TRIGGER set_snippets_updated_at
  BEFORE UPDATE ON snippets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
