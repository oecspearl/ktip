-- ============================================================
-- Migration 031: Project Team Members
-- Adds project_members table (membership + invite flow in one),
-- a SECURITY DEFINER membership helper (avoids RLS recursion),
-- and extends projects policies so accepted members can view
-- private projects and editors can update them.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id, status);

DROP TRIGGER IF EXISTS set_project_members_updated_at ON project_members;
CREATE TRIGGER set_project_members_updated_at
  BEFORE UPDATE ON project_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Helper: SECURITY DEFINER membership check.
-- Policies on projects reference project_members and policies on
-- project_members reference project_members — going through this
-- function (which bypasses RLS) prevents infinite policy recursion.
-- p_min_role 'viewer' matches any accepted member; 'editor'
-- requires the editor role.
-- ============================================================
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID, p_user_id UUID, p_min_role TEXT DEFAULT 'viewer')
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = p_user_id
      AND status = 'accepted'
      AND (p_min_role = 'viewer' OR role = 'editor')
  );
$$;

CREATE OR REPLACE FUNCTION is_project_owner(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND owner_id = p_user_id
  );
$$;

-- ============================================================
-- RLS: project_members
-- ============================================================
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- Owner, the member themself, or any accepted member can see the team
DROP POLICY IF EXISTS "Team is visible to owner and members" ON project_members;
CREATE POLICY "Team is visible to owner and members"
  ON project_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_project_owner(project_id, auth.uid())
    OR is_project_member(project_id, auth.uid())
  );

-- Only the project owner can invite (insert) members
DROP POLICY IF EXISTS "Owner can invite members" ON project_members;
CREATE POLICY "Owner can invite members"
  ON project_members FOR INSERT
  WITH CHECK (
    is_project_owner(project_id, auth.uid())
    AND user_id <> auth.uid()
    AND invited_by = auth.uid()
  );

-- Invitee can accept/decline; owner can change roles
DROP POLICY IF EXISTS "Invitee or owner can update membership" ON project_members;
CREATE POLICY "Invitee or owner can update membership"
  ON project_members FOR UPDATE
  USING (
    user_id = auth.uid()
    OR is_project_owner(project_id, auth.uid())
  );

-- Owner can remove members; members can leave
DROP POLICY IF EXISTS "Owner can remove members and members can leave" ON project_members;
CREATE POLICY "Owner can remove members and members can leave"
  ON project_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_project_owner(project_id, auth.uid())
  );

-- ============================================================
-- Extend projects policies to the team
-- ============================================================

-- Accepted members can view private projects they belong to
DROP POLICY IF EXISTS "Public projects are viewable by everyone" ON projects;
CREATE POLICY "Public projects are viewable by everyone"
  ON projects FOR SELECT
  USING (
    is_public = TRUE
    OR owner_id = auth.uid()
    OR is_project_member(id, auth.uid())
  );

-- Editors can update projects they belong to
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (
    auth.uid() = owner_id
    OR is_project_member(id, auth.uid(), 'editor')
  );
