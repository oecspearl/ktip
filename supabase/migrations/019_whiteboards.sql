-- ============================================================
-- Migration 019: Whiteboards & Whiteboard Shares
-- ============================================================

-- Whiteboards table
CREATE TABLE IF NOT EXISTS whiteboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled Whiteboard',
  snapshot JSONB,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_whiteboards_owner ON whiteboards(owner_id, updated_at DESC);

-- Enable RLS
ALTER TABLE whiteboards ENABLE ROW LEVEL SECURITY;

-- Owner can do everything with their whiteboards
CREATE POLICY "Users can view own whiteboards"
  ON whiteboards FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create whiteboards"
  ON whiteboards FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own whiteboards"
  ON whiteboards FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own whiteboards"
  ON whiteboards FOR DELETE
  USING (auth.uid() = owner_id);

-- Updated_at trigger
CREATE TRIGGER set_whiteboards_updated_at
  BEFORE UPDATE ON whiteboards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Whiteboard shares table
CREATE TABLE IF NOT EXISTS whiteboard_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whiteboard_id UUID NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(whiteboard_id, shared_with)
);

-- Indexes
CREATE INDEX idx_whiteboard_shares_shared_with ON whiteboard_shares(shared_with);
CREATE INDEX idx_whiteboard_shares_whiteboard ON whiteboard_shares(whiteboard_id);

-- Enable RLS
ALTER TABLE whiteboard_shares ENABLE ROW LEVEL SECURITY;

-- Users can view whiteboards shared with them
CREATE POLICY "Users can view shared whiteboards"
  ON whiteboards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_shares
      WHERE whiteboard_shares.whiteboard_id = whiteboards.id
      AND whiteboard_shares.shared_with = auth.uid()
    )
  );

-- Share creator can view and delete their shares (no circular ref back to whiteboards)
CREATE POLICY "Users can view sent shares"
  ON whiteboard_shares FOR SELECT
  USING (auth.uid() = shared_by);

CREATE POLICY "Users can manage own shares"
  ON whiteboard_shares FOR DELETE
  USING (auth.uid() = shared_by);

CREATE POLICY "Share creator can update shares"
  ON whiteboard_shares FOR UPDATE
  USING (auth.uid() = shared_by);

-- Users can view shares for whiteboards shared with them
CREATE POLICY "Users can view own shares"
  ON whiteboard_shares FOR SELECT
  USING (auth.uid() = shared_with);

-- Authenticated users can create shares
CREATE POLICY "Authenticated users can create shares"
  ON whiteboard_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = shared_by);
