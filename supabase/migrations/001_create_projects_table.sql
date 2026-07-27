-- Projects Table Migration
-- This creates the projects table with all necessary columns and Row Level Security policies

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('technology', 'healthcare', 'education', 'agriculture', 'environment', 'other')),
  phase TEXT NOT NULL CHECK (phase IN ('concept', 'prototype', 'funding', 'launch')) DEFAULT 'concept',
  hashtags TEXT[] DEFAULT ARRAY[]::TEXT[],
  image_url TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
CREATE INDEX IF NOT EXISTS idx_projects_phase ON projects(phase);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_public ON projects(is_public) WHERE is_public = TRUE;

-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Public projects are viewable by everyone
CREATE POLICY "Public projects are viewable by everyone"
  ON projects FOR SELECT
  USING (is_public = TRUE OR owner_id = auth.uid());

-- RLS Policy: Authenticated users can create projects
CREATE POLICY "Authenticated users can create projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- RLS Policy: Users can update their own projects
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = owner_id);

-- RLS Policy: Users can delete their own projects
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = owner_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on project updates
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create likes table for project likes
CREATE TABLE IF NOT EXISTS project_likes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_likes_project ON project_likes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_likes_user ON project_likes(user_id);

-- Enable RLS on project_likes
ALTER TABLE project_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_likes
CREATE POLICY "Anyone can view likes"
  ON project_likes FOR SELECT
  USING (TRUE);

CREATE POLICY "Authenticated users can like projects"
  ON project_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own likes"
  ON project_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Create comments table for project comments
CREATE TABLE IF NOT EXISTS project_comments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_comments_project ON project_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_comments_user ON project_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_project_comments_created_at ON project_comments(created_at DESC);

-- Enable RLS on project_comments
ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_comments
CREATE POLICY "Comments on public projects are viewable"
  ON project_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE id = project_id
      AND (is_public = TRUE OR owner_id = auth.uid())
    )
  );

CREATE POLICY "Authenticated users can comment"
  ON project_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE id = project_id
      AND (is_public = TRUE OR owner_id = auth.uid())
    )
  );

CREATE POLICY "Users can update their own comments"
  ON project_comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON project_comments FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for comment updates
DROP TRIGGER IF EXISTS update_project_comments_updated_at ON project_comments;
CREATE TRIGGER update_project_comments_updated_at
  BEFORE UPDATE ON project_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get project like count
CREATE OR REPLACE FUNCTION get_project_like_count(project_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM project_likes WHERE project_id = project_uuid;
$$ LANGUAGE SQL STABLE;

-- Function to get project comment count
CREATE OR REPLACE FUNCTION get_project_comment_count(project_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM project_comments WHERE project_id = project_uuid;
$$ LANGUAGE SQL STABLE;

-- Function to check if user liked a project
CREATE OR REPLACE FUNCTION has_user_liked_project(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM project_likes
    WHERE project_id = project_uuid AND user_id = user_uuid
  );
$$ LANGUAGE SQL STABLE;
