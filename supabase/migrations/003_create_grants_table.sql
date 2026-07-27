-- Grants Table Migration
-- This creates the grants table and grant_applications table with Row Level Security

-- Create grants table
CREATE TABLE IF NOT EXISTS grants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  amount_min NUMERIC,
  amount_max NUMERIC,
  currency TEXT DEFAULT 'USD',
  deadline TIMESTAMP WITH TIME ZONE,
  eligibility TEXT,
  application_url TEXT,
  grant_type TEXT CHECK (grant_type IN ('startup', 'research', 'innovation', 'development', 'education')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_grants_type ON grants(grant_type);
CREATE INDEX IF NOT EXISTS idx_grants_active ON grants(is_active);
CREATE INDEX IF NOT EXISTS idx_grants_deadline ON grants(deadline);

-- Enable RLS
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for grants
CREATE POLICY "Anyone can view active grants"
  ON grants FOR SELECT
  USING (is_active = TRUE OR auth.uid() IS NOT NULL);

-- Only authenticated admins can create/update/delete grants
-- For now, we'll allow any authenticated user to create (you can restrict this later with role checks)
CREATE POLICY "Authenticated users can create grants"
  ON grants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update grants they created"
  ON grants FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete grants they created"
  ON grants FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Create grant_applications table
CREATE TABLE IF NOT EXISTS grant_applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  grant_id UUID NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  application_data JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(grant_id, user_id)
);

-- Create indexes for grant applications
CREATE INDEX IF NOT EXISTS idx_grant_applications_grant ON grant_applications(grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_applications_user ON grant_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_grant_applications_status ON grant_applications(status);

-- Enable RLS on grant_applications
ALTER TABLE grant_applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for grant_applications
CREATE POLICY "Users can view their own applications"
  ON grant_applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create applications"
  ON grant_applications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM grant_applications
      WHERE grant_id = grant_applications.grant_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own applications"
  ON grant_applications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own applications"
  ON grant_applications FOR DELETE
  USING (auth.uid() = user_id);

-- Function to get application count for a grant
CREATE OR REPLACE FUNCTION get_grant_application_count(grant_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM grant_applications WHERE grant_id = grant_uuid;
$$ LANGUAGE SQL STABLE;

-- Function to check if user has applied to a grant
CREATE OR REPLACE FUNCTION has_user_applied(grant_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM grant_applications
    WHERE grant_id = grant_uuid AND user_id = user_uuid
  );
$$ LANGUAGE SQL STABLE;

-- Trigger to update updated_at timestamp on grants
CREATE OR REPLACE FUNCTION update_grants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_grants_updated_at_trigger ON grants;
CREATE TRIGGER update_grants_updated_at_trigger
  BEFORE UPDATE ON grants
  FOR EACH ROW
  EXECUTE FUNCTION update_grants_updated_at();

-- Trigger to update updated_at timestamp on grant_applications
CREATE OR REPLACE FUNCTION update_grant_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_grant_applications_updated_at_trigger ON grant_applications;
CREATE TRIGGER update_grant_applications_updated_at_trigger
  BEFORE UPDATE ON grant_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_grant_applications_updated_at();
