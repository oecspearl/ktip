-- ============================================================
-- Migration 033: Networking & Connections
-- Mutual (request -> accept) connection model between users.
-- An ordered-pair unique index prevents a reverse-direction
-- duplicate (A->B blocks B->A).
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_pair
  ON connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS idx_connections_requester ON connections(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_addressee ON connections(addressee_id, status);

DROP TRIGGER IF EXISTS set_connections_updated_at ON connections;
CREATE TRIGGER set_connections_updated_at
  BEFORE UPDATE ON connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Only the two parties can see the relationship
DROP POLICY IF EXISTS "Parties can view own connections" ON connections;
CREATE POLICY "Parties can view own connections"
  ON connections FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Only the requester can create a request
DROP POLICY IF EXISTS "Users can send connection requests" ON connections;
CREATE POLICY "Users can send connection requests"
  ON connections FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Only the addressee can accept/decline
DROP POLICY IF EXISTS "Addressee can respond to requests" ON connections;
CREATE POLICY "Addressee can respond to requests"
  ON connections FOR UPDATE
  USING (auth.uid() = addressee_id);

-- Either party can cancel a request / remove the connection
DROP POLICY IF EXISTS "Parties can remove connections" ON connections;
CREATE POLICY "Parties can remove connections"
  ON connections FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
