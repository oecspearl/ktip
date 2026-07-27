-- Migration 030: Admin Projects RLS Policies
-- The /admin/projects moderation page needs OECS admins to see ALL projects
-- (including private ones) and to update/delete any project (featured toggle,
-- moderation). Mirrors the admin policy pattern from migration 012.

DROP POLICY IF EXISTS "OECS admins can view all projects" ON projects;
CREATE POLICY "OECS admins can view all projects"
  ON projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

DROP POLICY IF EXISTS "OECS admins can update any project" ON projects;
CREATE POLICY "OECS admins can update any project"
  ON projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

DROP POLICY IF EXISTS "OECS admins can delete any project" ON projects;
CREATE POLICY "OECS admins can delete any project"
  ON projects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );
