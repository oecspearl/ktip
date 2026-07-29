-- ============================================================
-- Migration 053: Collaboration invites — pending-by-default shares
--
-- Sharing a whiteboard or document used to grant access the instant the row
-- was inserted; the recipient was told after the fact by a notification and
-- had no say. This turns every share into an invitation the recipient
-- accepts or declines from /invitations.
--
-- Also backfills `document_shares.permission`, which 026 never added even
-- though whiteboards (020) and snippets (052) both have it.
--
-- ORDER MATTERS: columns are added and existing rows backfilled to
-- 'accepted' BEFORE the SELECT policies start requiring it. Reversing this
-- would silently revoke every share already in the database.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------

ALTER TABLE whiteboard_shares
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','accepted','declined'));

ALTER TABLE document_shares
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','accepted','declined'));

ALTER TABLE document_shares
  ADD COLUMN IF NOT EXISTS permission TEXT NOT NULL DEFAULT 'view'
  CHECK (permission IN ('view','edit'));

-- ------------------------------------------------------------
-- 2. Backfill — everything that already existed was live access
-- ------------------------------------------------------------
-- Guarded on created_at so a re-run cannot resurrect invitations a
-- recipient has since declined, or silently accept ones still pending.

DO $$
DECLARE
  cutoff TIMESTAMPTZ := now();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '_collab_invite_backfill_done'
  ) THEN
    UPDATE whiteboard_shares SET status = 'accepted'
      WHERE status = 'pending' AND created_at < cutoff;
    UPDATE document_shares SET status = 'accepted'
      WHERE status = 'pending' AND created_at < cutoff;
    -- Marker table: a re-run of this migration must not re-accept rows.
    CREATE TABLE public._collab_invite_backfill_done (done BOOLEAN NOT NULL DEFAULT TRUE);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whiteboard_shares_pending
  ON whiteboard_shares(shared_with, status);
CREATE INDEX IF NOT EXISTS idx_document_shares_pending
  ON document_shares(shared_with, status);

-- ------------------------------------------------------------
-- 3. Column guard for the recipient's UPDATE
-- ------------------------------------------------------------
-- RLS can restrict which ROWS a recipient may update but not which COLUMNS.
-- Without this a recipient could accept an invite and, in the same statement,
-- promote themselves from 'view' to 'edit'.

CREATE OR REPLACE FUNCTION guard_share_recipient_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The share's owner may change anything; only the recipient is constrained.
  IF auth.uid() = OLD.shared_by THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.shared_with THEN
    IF NEW.permission IS DISTINCT FROM OLD.permission
       OR NEW.shared_with IS DISTINCT FROM OLD.shared_with
       OR NEW.shared_by   IS DISTINCT FROM OLD.shared_by THEN
      RAISE EXCEPTION 'Recipients may only change the status of a share';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_whiteboard_share_update ON whiteboard_shares;
CREATE TRIGGER guard_whiteboard_share_update
  BEFORE UPDATE ON whiteboard_shares
  FOR EACH ROW EXECUTE FUNCTION guard_share_recipient_update();

DROP TRIGGER IF EXISTS guard_document_share_update ON document_shares;
CREATE TRIGGER guard_document_share_update
  BEFORE UPDATE ON document_shares
  FOR EACH ROW EXECUTE FUNCTION guard_share_recipient_update();

DROP TRIGGER IF EXISTS guard_snippet_share_update ON snippet_shares;
CREATE TRIGGER guard_snippet_share_update
  BEFORE UPDATE ON snippet_shares
  FOR EACH ROW EXECUTE FUNCTION guard_share_recipient_update();

-- ------------------------------------------------------------
-- 4. Recipients may respond to their own invitations
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Recipient can respond to whiteboard share" ON whiteboard_shares;
CREATE POLICY "Recipient can respond to whiteboard share"
  ON whiteboard_shares FOR UPDATE
  USING (auth.uid() = shared_with)
  WITH CHECK (auth.uid() = shared_with);

DROP POLICY IF EXISTS "Recipient can respond to document share" ON document_shares;
CREATE POLICY "Recipient can respond to document share"
  ON document_shares FOR UPDATE
  USING (auth.uid() = shared_with)
  WITH CHECK (auth.uid() = shared_with);

-- 019/026 left the owner's UPDATE policy without a WITH CHECK, so an owner
-- could rewrite a row into one they no longer own. Restate both with one.
DROP POLICY IF EXISTS "Share creator can update shares" ON whiteboard_shares;
CREATE POLICY "Share creator can update shares"
  ON whiteboard_shares FOR UPDATE
  USING (auth.uid() = shared_by)
  WITH CHECK (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Share creator can update shares" ON document_shares;
CREATE POLICY "Share creator can update shares"
  ON document_shares FOR UPDATE
  USING (auth.uid() = shared_by)
  WITH CHECK (auth.uid() = shared_by);

-- A recipient may withdraw from a collaboration, not just the sender.
DROP POLICY IF EXISTS "Users can manage own shares" ON whiteboard_shares;
CREATE POLICY "Users can manage own shares"
  ON whiteboard_shares FOR DELETE
  USING (auth.uid() = shared_by OR auth.uid() = shared_with);

DROP POLICY IF EXISTS "Users can manage own shares" ON document_shares;
CREATE POLICY "Users can manage own shares"
  ON document_shares FOR DELETE
  USING (auth.uid() = shared_by OR auth.uid() = shared_with);

-- ------------------------------------------------------------
-- 5. Access requires an ACCEPTED invitation
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view shared whiteboards" ON whiteboards;
CREATE POLICY "Users can view shared whiteboards"
  ON whiteboards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_shares
      WHERE whiteboard_shares.whiteboard_id = whiteboards.id
        AND whiteboard_shares.shared_with = auth.uid()
        AND whiteboard_shares.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "Shared editors can update whiteboards" ON whiteboards;
CREATE POLICY "Shared editors can update whiteboards"
  ON whiteboards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_shares
      WHERE whiteboard_shares.whiteboard_id = whiteboards.id
        AND whiteboard_shares.shared_with = auth.uid()
        AND whiteboard_shares.status = 'accepted'
        AND whiteboard_shares.permission = 'edit'
    )
  );

DROP POLICY IF EXISTS "Shared users can view documents" ON documents;
CREATE POLICY "Shared users can view documents"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_shares.document_id = documents.id
        AND document_shares.shared_with = auth.uid()
        AND document_shares.status = 'accepted'
    )
  );

-- Documents gain shared-edit, matching whiteboards and snippets.
DROP POLICY IF EXISTS "Shared editors can update documents" ON documents;
CREATE POLICY "Shared editors can update documents"
  ON documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_shares.document_id = documents.id
        AND document_shares.shared_with = auth.uid()
        AND document_shares.status = 'accepted'
        AND document_shares.permission = 'edit'
    )
  );

NOTIFY pgrst, 'reload schema';
