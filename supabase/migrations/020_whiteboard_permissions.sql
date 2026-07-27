-- ============================================================
-- Migration 020: Add permission column to whiteboard_shares
-- Allows owners to grant 'view' or 'edit' access
-- ============================================================

-- Add permission column (default 'view' for backward compatibility)
ALTER TABLE whiteboard_shares
  ADD COLUMN IF NOT EXISTS permission TEXT NOT NULL DEFAULT 'view'
  CHECK (permission IN ('view', 'edit'));

-- Allow shared users with 'edit' permission to update whiteboards
CREATE POLICY "Shared editors can update whiteboards"
  ON whiteboards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_shares
      WHERE whiteboard_shares.whiteboard_id = whiteboards.id
      AND whiteboard_shares.shared_with = auth.uid()
      AND whiteboard_shares.permission = 'edit'
    )
  );

NOTIFY pgrst, 'reload schema';
