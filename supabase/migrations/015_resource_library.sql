-- Resource Library
-- Knowledge base with articles, guides, case studies, success stories

CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  resource_type TEXT NOT NULL DEFAULT 'article',
  category TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_published BOOLEAN DEFAULT FALSE,
  download_url TEXT,
  thumbnail_url TEXT,
  is_climate_action BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
CREATE INDEX IF NOT EXISTS idx_resources_published ON resources(is_published) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_resources_tags ON resources USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_resources_climate ON resources(is_climate_action) WHERE is_climate_action = TRUE;

-- RLS
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

-- Public can read published resources
CREATE POLICY "Anyone can view published resources"
  ON resources FOR SELECT
  USING (is_published = TRUE);

-- OECS admin can manage all resources
CREATE POLICY "OECS admin can manage resources"
  ON resources FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

-- Authors can view their own unpublished resources
CREATE POLICY "Authors can view own resources"
  ON resources FOR SELECT
  USING (author_id = auth.uid());
