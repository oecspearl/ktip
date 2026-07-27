-- ============================================================
-- Migration 021: Pre-Registration Applications
-- Stores pre-launch registration requests for admin review
-- ============================================================

CREATE TABLE IF NOT EXISTS preregistrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  country TEXT,
  bio TEXT,
  organization TEXT,
  role TEXT NOT NULL CHECK (role IN ('student', 'mentor', 'investor', 'entrepreneur', 'private_sector')),
  skills TEXT[] DEFAULT '{}',
  linkedin_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'info_requested')),
  admin_notes TEXT,
  info_request_message TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_preregistrations_status ON preregistrations(status, created_at DESC);
CREATE INDEX idx_preregistrations_email ON preregistrations(email);

-- Updated_at trigger
CREATE TRIGGER set_preregistrations_updated_at
  BEFORE UPDATE ON preregistrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE preregistrations ENABLE ROW LEVEL SECURITY;

-- OECS admins can view and manage all pre-registrations
CREATE POLICY "Admins can view all preregistrations"
  ON preregistrations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.roles @> ARRAY['oecs']::text[]
    )
  );

CREATE POLICY "Admins can update preregistrations"
  ON preregistrations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.roles @> ARRAY['oecs']::text[]
    )
  );

CREATE POLICY "Admins can delete preregistrations"
  ON preregistrations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.roles @> ARRAY['oecs']::text[]
    )
  );

-- Anyone (including anonymous) can insert a pre-registration
CREATE POLICY "Anyone can submit preregistration"
  ON preregistrations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
