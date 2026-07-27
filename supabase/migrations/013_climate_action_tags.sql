-- Migration 013: Climate Action Tags
-- Adds is_climate_action boolean to projects, events, and grants
-- Supports the PAD requirement for climate change solutions focus

-- Add column to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_climate_action BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_projects_climate ON projects(is_climate_action) WHERE is_climate_action = TRUE;

-- Add column to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_climate_action BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_events_climate ON events(is_climate_action) WHERE is_climate_action = TRUE;

-- Add column to grants
ALTER TABLE grants ADD COLUMN IF NOT EXISTS is_climate_action BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_grants_climate ON grants(is_climate_action) WHERE is_climate_action = TRUE;
