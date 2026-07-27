-- ============================================================
-- Migration 037: General User Feedback Channel
-- Lightweight always-available feedback (distinct from the UAT
-- survey and the grievance system). Modeled on grievances:
-- user-scoped rows + OECS admin triage.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('bug', 'feature_request', 'general', 'content')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'resolved', 'dismissed')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);

DROP TRIGGER IF EXISTS set_feedback_updated_at ON feedback;
CREATE TRIGGER set_feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Authenticated users submit as themselves (or anonymously with NULL)
DROP POLICY IF EXISTS "Authenticated users can submit feedback" ON feedback;
CREATE POLICY "Authenticated users can submit feedback"
  ON feedback FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Users see their own submissions; admins see all
DROP POLICY IF EXISTS "Users can view own feedback" ON feedback;
CREATE POLICY "Users can view own feedback"
  ON feedback FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- Admin triage (status / admin_note)
DROP POLICY IF EXISTS "Admins can update feedback" ON feedback;
CREATE POLICY "Admins can update feedback"
  ON feedback FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );
