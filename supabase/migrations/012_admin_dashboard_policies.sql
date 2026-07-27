-- Migration 012: Admin Dashboard RLS Policies
-- Adds OECS admin policies for profiles, grants, grant_applications, forums

-- ============================================================
-- Helper: OECS admin check expression
-- EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
-- ============================================================

-- ============================================================
-- Profiles: Allow admins to update any profile (role/verification management)
-- ============================================================

CREATE POLICY "OECS admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- Grants: Tighten existing permissive policies to admin-only
-- ============================================================

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Authenticated users can create grants" ON grants;
DROP POLICY IF EXISTS "Users can update grants they created" ON grants;
DROP POLICY IF EXISTS "Users can delete grants they created" ON grants;

-- Replace with OECS-only policies
CREATE POLICY "OECS admins can create grants"
  ON grants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

CREATE POLICY "OECS admins can update grants"
  ON grants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

CREATE POLICY "OECS admins can delete grants"
  ON grants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- Grant Applications: Admin can view all & update status
-- ============================================================

CREATE POLICY "OECS admins can view all applications"
  ON grant_applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

CREATE POLICY "OECS admins can update any application"
  ON grant_applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- Forum Posts: Admin can pin/delete any post
-- ============================================================

CREATE POLICY "OECS admins can update any post"
  ON forum_posts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

CREATE POLICY "OECS admins can delete any post"
  ON forum_posts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- Forum Replies: Admin can delete any reply
-- ============================================================

CREATE POLICY "OECS admins can delete any reply"
  ON forum_replies FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );
