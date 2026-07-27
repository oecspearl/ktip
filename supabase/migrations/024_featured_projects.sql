-- Add is_featured column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- Index for quick featured project lookups
CREATE INDEX IF NOT EXISTS idx_projects_is_featured ON projects(is_featured) WHERE is_featured = true;
