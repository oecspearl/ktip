-- ============================================================
-- Migration 038: Integration Directory
-- Admin-curated public directory of external tools / services /
-- partner platforms. Same content model as resources: published
-- rows are public, admins have full CRUD.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'productivity' CHECK (category IN ('funding', 'productivity', 'government', 'education', 'developer', 'other')),
  logo_url TEXT,
  website_url TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integrations_published ON integrations(is_published, category, sort_order);

DROP TRIGGER IF EXISTS set_integrations_updated_at ON integrations;
CREATE TRIGGER set_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Published integrations are public (anon + authenticated); admins see all
DROP POLICY IF EXISTS "Published integrations are viewable by everyone" ON integrations;
CREATE POLICY "Published integrations are viewable by everyone"
  ON integrations FOR SELECT
  USING (
    is_published = TRUE
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can create integrations" ON integrations;
CREATE POLICY "Admins can create integrations"
  ON integrations FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can update integrations" ON integrations;
CREATE POLICY "Admins can update integrations"
  ON integrations FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can delete integrations" ON integrations;
CREATE POLICY "Admins can delete integrations"
  ON integrations FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );
