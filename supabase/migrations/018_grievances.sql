-- ============================================================
-- Migration 018: Grievance / User Report System
-- ============================================================

CREATE TABLE IF NOT EXISTS grievances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_url TEXT,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX idx_grievances_reporter ON grievances(reporter_id, created_at DESC);
CREATE INDEX idx_grievances_reported_user ON grievances(reported_user_id);
CREATE INDEX idx_grievances_status ON grievances(status);
CREATE INDEX idx_grievances_category ON grievances(category);

-- Enable RLS
ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;

-- Users can view their own submitted grievances
CREATE POLICY "Users can view own grievances"
  ON grievances FOR SELECT
  USING (auth.uid() = reporter_id);

-- Authenticated users can create grievances (cannot report themselves)
CREATE POLICY "Authenticated users can submit grievances"
  ON grievances FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND auth.uid() != reported_user_id
  );

-- OECS admin can view and manage ALL grievances
CREATE POLICY "OECS admin can manage all grievances"
  ON grievances FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

-- Updated_at trigger
CREATE TRIGGER set_grievances_updated_at
  BEFORE UPDATE ON grievances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
