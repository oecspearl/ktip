-- ============================================================
-- Migration 032: Project Engagement — Follows + View Tracking
-- project_follows mirrors project_likes; view tracking is a
-- counter column bumped through a SECURITY DEFINER RPC so
-- viewers don't need UPDATE rights on projects.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS project_follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_follows_project ON project_follows(project_id);
CREATE INDEX IF NOT EXISTS idx_project_follows_user ON project_follows(user_id);

ALTER TABLE project_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view follows" ON project_follows;
CREATE POLICY "Anyone can view follows"
  ON project_follows FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Authenticated users can follow projects" ON project_follows;
CREATE POLICY "Authenticated users can follow projects"
  ON project_follows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unfollow projects" ON project_follows;
CREATE POLICY "Users can unfollow projects"
  ON project_follows FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- View tracking
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_project_view(p_project_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE projects SET view_count = view_count + 1 WHERE id = p_project_id;
$$;
