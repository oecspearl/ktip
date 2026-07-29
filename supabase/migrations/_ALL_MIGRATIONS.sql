-- ============================================================
-- OECS KTIP - COMBINED MIGRATIONS
-- Generated from supabase/migrations/ (65 files)
-- Paste this whole file into the Supabase SQL Editor and Run.
--
-- Safe to re-run: CREATE TABLE/INDEX/EXTENSION use IF NOT EXISTS,
-- policies and triggers are dropped before being recreated,
-- functions use CREATE OR REPLACE.
-- ============================================================


-- ============================================================
-- 000_create_profiles_table.sql
-- ============================================================

-- ============================================================
-- Migration 000: Profiles Table
-- Creates the profiles table linked to Supabase Auth users
-- Must run BEFORE all other migrations
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  country TEXT,
  roles TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON profiles(display_name);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (TRUE);

CREATE POLICY "Users can create their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create profile on signup via trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, roles)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IS NOT NULL
      THEN ARRAY[NEW.raw_user_meta_data->>'role']
      ELSE ARRAY[]::TEXT[]
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 001_create_projects_table.sql
-- ============================================================

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

-- ============================================================
-- 002_create_events_table.sql
-- ============================================================

-- Events Table Migration
-- This creates the events table and event_rsvps table with Row Level Security

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('hackathon', 'workshop', 'meetup', 'conference', 'demo_day')),
  location TEXT,
  is_virtual BOOLEAN DEFAULT FALSE,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  capacity INTEGER CHECK (capacity > 0),
  image_url TEXT,
  organizer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_virtual ON events(is_virtual);

-- Enable RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for events
CREATE POLICY "Anyone can view events"
  ON events FOR SELECT
  USING (TRUE);

CREATE POLICY "Authenticated users can create events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Organizers can update their events"
  ON events FOR UPDATE
  USING (auth.uid() = organizer_id);

CREATE POLICY "Organizers can delete their events"
  ON events FOR DELETE
  USING (auth.uid() = organizer_id);

-- Create event_rsvps table
CREATE TABLE IF NOT EXISTS event_rsvps (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

-- Create indexes for RSVPs
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user ON event_rsvps(user_id);

-- Enable RLS on event_rsvps
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for event_rsvps
CREATE POLICY "Anyone can view RSVPs"
  ON event_rsvps FOR SELECT
  USING (TRUE);

CREATE POLICY "Authenticated users can RSVP to events"
  ON event_rsvps FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM events
      WHERE id = event_id
      AND organizer_id = auth.uid()
    )
  );

CREATE POLICY "Users can cancel their own RSVPs"
  ON event_rsvps FOR DELETE
  USING (auth.uid() = user_id);

-- Function to check if event is full
CREATE OR REPLACE FUNCTION is_event_full(event_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  event_capacity INTEGER;
  rsvp_count INTEGER;
BEGIN
  -- Get event capacity
  SELECT capacity INTO event_capacity
  FROM events
  WHERE id = event_uuid;

  -- If no capacity limit, event is not full
  IF event_capacity IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Count RSVPs
  SELECT COUNT(*) INTO rsvp_count
  FROM event_rsvps
  WHERE event_id = event_uuid;

  -- Check if full
  RETURN rsvp_count >= event_capacity;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get RSVP count for an event
CREATE OR REPLACE FUNCTION get_event_rsvp_count(event_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM event_rsvps WHERE event_id = event_uuid;
$$ LANGUAGE SQL STABLE;

-- Function to check if user has RSVPd to an event
CREATE OR REPLACE FUNCTION has_user_rsvpd(event_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM event_rsvps
    WHERE event_id = event_uuid AND user_id = user_uuid
  );
$$ LANGUAGE SQL STABLE;

-- Trigger to prevent RSVP if event is full
CREATE OR REPLACE FUNCTION check_event_capacity()
RETURNS TRIGGER AS $$
BEGIN
  IF is_event_full(NEW.event_id) THEN
    RAISE EXCEPTION 'Event is full';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_event_capacity_trigger ON event_rsvps;
CREATE TRIGGER check_event_capacity_trigger
  BEFORE INSERT ON event_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION check_event_capacity();

-- ============================================================
-- 003_create_grants_table.sql
-- ============================================================

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

-- ============================================================
-- 004_create_messages_table.sql
-- ============================================================

-- ============================================================
-- Migration 004: Messaging System
-- Creates conversations, conversation_participants, and messages tables
-- ============================================================

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create conversation_participants junction table
CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation
  ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user
  ON conversation_participants(user_id);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Conversations: users can only see conversations they participate in
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = conversations.id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Conversation participants
CREATE POLICY "Users can view participants of own conversations"
  ON conversation_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can add participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Messages: users can view/send in own conversations
CREATE POLICY "Users can view messages in own conversations"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages to own conversations"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own messages"
  ON messages FOR DELETE
  USING (auth.uid() = sender_id);

-- ============================================================
-- Triggers and Functions
-- ============================================================

-- Update conversation.updated_at when a new message is inserted
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversation_on_message_trigger ON messages;
CREATE TRIGGER update_conversation_on_message_trigger
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- Find existing conversation between two users
CREATE OR REPLACE FUNCTION find_conversation_between(user1 UUID, user2 UUID)
RETURNS UUID AS $$
  SELECT cp1.conversation_id
  FROM conversation_participants cp1
  JOIN conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = user1
    AND cp2.user_id = user2
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- Enable Realtime for messages
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================================
-- 005_create_forums_table.sql
-- ============================================================

-- ============================================================
-- Migration 005: Forums System
-- Creates forum_boards, forum_posts, and forum_replies tables
-- ============================================================

-- Create forum_boards table
CREATE TABLE IF NOT EXISTS forum_boards (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forum_boards_slug ON forum_boards(slug);

-- Create forum_posts table
CREATE TABLE IF NOT EXISTS forum_posts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES forum_boards(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forum_posts_board ON forum_posts(board_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author ON forum_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created_at ON forum_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_pinned ON forum_posts(is_pinned) WHERE is_pinned = TRUE;

-- Create forum_replies table
CREATE TABLE IF NOT EXISTS forum_replies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forum_replies_post ON forum_replies(post_id);
CREATE INDEX IF NOT EXISTS idx_forum_replies_author ON forum_replies(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_replies_created_at ON forum_replies(created_at DESC);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE forum_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;

-- Forum boards are publicly readable
CREATE POLICY "Anyone can view forum boards"
  ON forum_boards FOR SELECT USING (TRUE);

-- Forum posts
CREATE POLICY "Anyone can view posts"
  ON forum_posts FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can create posts"
  ON forum_posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update own posts"
  ON forum_posts FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own posts"
  ON forum_posts FOR DELETE
  USING (auth.uid() = author_id);

-- Forum replies
CREATE POLICY "Anyone can view replies"
  ON forum_replies FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can create replies"
  ON forum_replies FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update own replies"
  ON forum_replies FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own replies"
  ON forum_replies FOR DELETE
  USING (auth.uid() = author_id);

-- ============================================================
-- Triggers (reuses update_updated_at_column from migration 001)
-- ============================================================

DROP TRIGGER IF EXISTS update_forum_posts_updated_at ON forum_posts;
CREATE TRIGGER update_forum_posts_updated_at
  BEFORE UPDATE ON forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_forum_replies_updated_at ON forum_replies;
CREATE TRIGGER update_forum_replies_updated_at
  BEFORE UPDATE ON forum_replies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Helper Functions
-- ============================================================

CREATE OR REPLACE FUNCTION get_board_post_count(board_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM forum_posts WHERE board_id = board_uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_post_reply_count(post_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM forum_replies WHERE post_id = post_uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_board_latest_post(board_uuid UUID)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
  SELECT MAX(created_at) FROM forum_posts WHERE board_id = board_uuid;
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- Seed Default Forum Boards
-- ============================================================

INSERT INTO forum_boards (name, description, slug, icon, sort_order) VALUES
  ('General Discussion', 'Open discussion about Caribbean innovation and technology', 'general', 'MessageSquare', 1),
  ('Project Showcase', 'Share and discuss your projects with the community', 'showcase', 'FolderKanban', 2),
  ('Funding & Grants', 'Discuss funding opportunities and grant applications', 'funding', 'DollarSign', 3),
  ('Mentorship', 'Find mentors and share knowledge', 'mentorship', 'Users', 4),
  ('Events & Meetups', 'Coordinate and discuss upcoming events', 'events', 'Calendar', 5),
  ('Technical Help', 'Ask technical questions and get help from the community', 'tech-help', 'HelpCircle', 6)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 006_create_avatars_storage.sql
-- ============================================================

-- ============================================================
-- Storage: All Buckets (idempotent — safe to re-run)
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- Creates public buckets for avatars, project images, and event images
-- ============================================================


-- ============================================================
-- 1. AVATARS BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );


-- ============================================================
-- 2. PROJECT IMAGES BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-images',
  'project-images',
  TRUE,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view project images" ON storage.objects;
CREATE POLICY "Anyone can view project images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-images');

DROP POLICY IF EXISTS "Users can upload project images" ON storage.objects;
CREATE POLICY "Users can upload project images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users can update project images" ON storage.objects;
CREATE POLICY "Users can update project images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users can delete project images" ON storage.objects;
CREATE POLICY "Users can delete project images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );


-- ============================================================
-- 3. EVENT IMAGES BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  TRUE,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view event images" ON storage.objects;
CREATE POLICY "Anyone can view event images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-images');

DROP POLICY IF EXISTS "Users can upload event images" ON storage.objects;
CREATE POLICY "Users can upload event images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users can update event images" ON storage.objects;
CREATE POLICY "Users can update event images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'event-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users can delete event images" ON storage.objects;
CREATE POLICY "Users can delete event images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );


-- ============================================================
-- Done! All storage buckets are ready.
--
-- Upload path formats:
--   avatars:        {userId}/avatar.{ext}
--   project-images: {userId}/{projectId}.{ext}
--   event-images:   {userId}/{eventId}.{ext}
--
-- Public URL pattern:
--   {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
-- ============================================================

-- ============================================================
-- 007_admin_events_system.sql
-- ============================================================

-- Admin Events Management System Migration
-- Adds event lifecycle (status), enhanced RSVP tracking, event updates, and event articles

-- ============================================================
-- 1. Add status column to events table
-- ============================================================
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'cancelled', 'completed'));

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

-- Update RLS: public sees published/completed/cancelled; organizers see own drafts; OECS sees all
DROP POLICY IF EXISTS "Anyone can view events" ON events;

CREATE POLICY "Public can view non-draft events"
  ON events FOR SELECT
  USING (
    status IN ('published', 'completed', 'cancelled')
    OR auth.uid() = organizer_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

-- OECS admins can update ANY event (not just their own)
CREATE POLICY "OECS admins can update any event"
  ON events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

-- OECS admins can delete any event
CREATE POLICY "OECS admins can delete any event"
  ON events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- 2. Add status column to event_rsvps table
-- ============================================================
ALTER TABLE event_rsvps
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'waitlisted', 'cancelled', 'checked_in'));

CREATE INDEX IF NOT EXISTS idx_event_rsvps_status ON event_rsvps(status);

-- Organizers and admins can update RSVP status (e.g., check-in, waitlist)
CREATE POLICY "Organizers and admins can update RSVPs"
  ON event_rsvps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- 3. Create event_updates table
-- ============================================================
CREATE TABLE IF NOT EXISTS event_updates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  update_type TEXT NOT NULL DEFAULT 'announcement'
    CHECK (update_type IN ('announcement', 'schedule_change', 'reminder')),
  is_published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_updates_event ON event_updates(event_id);

ALTER TABLE event_updates ENABLE ROW LEVEL SECURITY;

-- Anyone can see published updates
CREATE POLICY "Public can view published event updates"
  ON event_updates FOR SELECT
  USING (
    is_published = TRUE
    OR auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

-- Organizers and admins can create updates
CREATE POLICY "Organizers and admins can create event updates"
  ON event_updates FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND (
      EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid())
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    )
  );

-- Organizers and admins can edit updates
CREATE POLICY "Organizers and admins can update event updates"
  ON event_updates FOR UPDATE
  USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- Organizers and admins can delete updates
CREATE POLICY "Organizers and admins can delete event updates"
  ON event_updates FOR DELETE
  USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- ============================================================
-- 4. Create event_articles table
-- ============================================================
CREATE TABLE IF NOT EXISTS event_articles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  article_type TEXT NOT NULL DEFAULT 'recap'
    CHECK (article_type IN ('recap', 'resources', 'summary', 'blog')),
  is_published BOOLEAN DEFAULT FALSE,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_articles_event ON event_articles(event_id);

ALTER TABLE event_articles ENABLE ROW LEVEL SECURITY;

-- Public can view published articles
CREATE POLICY "Public can view published event articles"
  ON event_articles FOR SELECT
  USING (
    is_published = TRUE
    OR auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- Organizers and admins can create articles
CREATE POLICY "Organizers and admins can create event articles"
  ON event_articles FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND (
      EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid())
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    )
  );

-- Organizers and admins can edit articles
CREATE POLICY "Organizers and admins can update event articles"
  ON event_articles FOR UPDATE
  USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- Organizers and admins can delete articles
CREATE POLICY "Organizers and admins can delete event articles"
  ON event_articles FOR DELETE
  USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- ============================================================
-- 5. Update is_event_full to only count confirmed + checked_in
-- ============================================================
CREATE OR REPLACE FUNCTION is_event_full(event_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  event_capacity INTEGER;
  rsvp_count INTEGER;
BEGIN
  SELECT capacity INTO event_capacity
  FROM events
  WHERE id = event_uuid;

  IF event_capacity IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*) INTO rsvp_count
  FROM event_rsvps
  WHERE event_id = event_uuid
  AND status IN ('confirmed', 'checked_in');

  RETURN rsvp_count >= event_capacity;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update RSVP count to only count confirmed + checked_in
CREATE OR REPLACE FUNCTION get_event_rsvp_count(event_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM event_rsvps
  WHERE event_id = event_uuid
  AND status IN ('confirmed', 'checked_in');
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- 008_event_registration_forms.sql
-- ============================================================

-- Migration 008: Add custom registration form fields to events and registration data to RSVPs
-- This enables admins to build custom registration forms per event

-- Add JSONB column for custom registration field definitions on events
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_fields JSONB DEFAULT '[]'::jsonb;

-- Add JSONB column for storing attendee registration responses on RSVPs
ALTER TABLE event_rsvps ADD COLUMN IF NOT EXISTS registration_data JSONB DEFAULT '{}'::jsonb;

-- Comment for documentation
COMMENT ON COLUMN events.registration_fields IS 'JSON array of RegistrationFieldConfig objects defining the custom registration form';
COMMENT ON COLUMN event_rsvps.registration_data IS 'JSON object of field_id -> value pairs from registration form submission';

-- ============================================================
-- 009_event_page_sections.sql
-- ============================================================

-- Migration 009: Event Page Sections (Page Builder)
-- Allows admins to add rich content sections (About, FAQ, Venue, Sponsors, Custom) to event pages

CREATE TABLE event_page_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL CHECK (section_type IN ('about', 'faq', 'venue', 'sponsors', 'custom')),
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_page_sections_event ON event_page_sections(event_id, sort_order);

-- RLS
ALTER TABLE event_page_sections ENABLE ROW LEVEL SECURITY;

-- Public can read visible sections of published events
CREATE POLICY "Anyone can view visible sections of published events"
  ON event_page_sections FOR SELECT
  USING (
    is_visible = true
    AND EXISTS (
      SELECT 1 FROM events WHERE events.id = event_page_sections.event_id AND events.status = 'published'
    )
  );

-- Organizers can manage their own event sections
CREATE POLICY "Organizers can manage their event sections"
  ON event_page_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events WHERE events.id = event_page_sections.event_id AND events.organizer_id = auth.uid()
    )
  );

-- OECS admins can manage all event sections
CREATE POLICY "OECS admins can manage all event sections"
  ON event_page_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND 'oecs' = ANY(profiles.roles)
    )
  );

COMMENT ON TABLE event_page_sections IS 'Rich content sections for event pages (about, FAQ, venue, sponsors, custom)';
COMMENT ON COLUMN event_page_sections.content IS 'JSON content varies by section_type: about/custom={body}, faq={items:[{question,answer}]}, venue={name,address,map_url,directions}, sponsors={items:[{name,logo_url,website}]}';

-- ============================================================
-- 010_event_schedule_speakers.sql
-- ============================================================

-- Migration 010: Event Schedule and Speakers
-- Enables event agenda management with time slots and speaker profiles

-- Event Speakers
CREATE TABLE event_speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  bio TEXT,
  photo_url TEXT,
  website TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_speakers_event ON event_speakers(event_id);

-- Event Schedule Items
CREATE TABLE event_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  location TEXT,
  speaker_id UUID REFERENCES event_speakers(id) ON DELETE SET NULL,
  schedule_type TEXT NOT NULL DEFAULT 'session' CHECK (schedule_type IN ('session', 'break', 'keynote', 'workshop', 'networking', 'other')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_schedule_event ON event_schedule(event_id, start_time);

-- RLS for speakers
ALTER TABLE event_speakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view speakers of published events"
  ON event_speakers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events WHERE events.id = event_speakers.event_id AND events.status = 'published'
    )
  );

CREATE POLICY "Organizers can manage their event speakers"
  ON event_speakers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events WHERE events.id = event_speakers.event_id AND events.organizer_id = auth.uid()
    )
  );

CREATE POLICY "OECS admins can manage all speakers"
  ON event_speakers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND 'oecs' = ANY(profiles.roles)
    )
  );

-- RLS for schedule
ALTER TABLE event_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view schedule of published events"
  ON event_schedule FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events WHERE events.id = event_schedule.event_id AND events.status = 'published'
    )
  );

CREATE POLICY "Organizers can manage their event schedule"
  ON event_schedule FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events WHERE events.id = event_schedule.event_id AND events.organizer_id = auth.uid()
    )
  );

CREATE POLICY "OECS admins can manage all schedules"
  ON event_schedule FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND 'oecs' = ANY(profiles.roles)
    )
  );

COMMENT ON TABLE event_speakers IS 'Speaker profiles for events';
COMMENT ON TABLE event_schedule IS 'Schedule/agenda items for events with optional speaker references';

-- ============================================================
-- 011_fix_event_default_status.sql
-- ============================================================

-- Migration 011: Fix event default status
-- Events should be created as drafts so admins can set them up before publishing

ALTER TABLE events ALTER COLUMN status SET DEFAULT 'draft';

-- ============================================================
-- 012_admin_dashboard_policies.sql
-- ============================================================

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

-- ============================================================
-- 013_climate_action_tags.sql
-- ============================================================

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

-- ============================================================
-- 014_member_directory.sql
-- ============================================================

-- Migration 014: Member Directory
-- Adds skills to profiles and indexes for directory search
-- Supports the PAD requirement for networking and knowledge exchange

-- Add skills column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Index for skills search (GIN index for array containment queries)
CREATE INDEX IF NOT EXISTS idx_profiles_skills ON profiles USING GIN (skills);

-- Index for country filtering
CREATE INDEX IF NOT EXISTS idx_profiles_country ON profiles(country);

-- ============================================================
-- 015_resource_library.sql
-- ============================================================

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

-- ============================================================
-- 016_analytics_functions.sql
-- ============================================================

-- Analytics RPC functions for admin dashboard

-- Get user count by role
CREATE OR REPLACE FUNCTION get_users_by_role()
RETURNS TABLE(role TEXT, count BIGINT) AS $$
  SELECT unnest(roles) as role, COUNT(*) as count
  FROM profiles
  GROUP BY role
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE;

-- Get user count by country
CREATE OR REPLACE FUNCTION get_users_by_country()
RETURNS TABLE(country TEXT, count BIGINT) AS $$
  SELECT COALESCE(country, 'Unknown') as country, COUNT(*) as count
  FROM profiles
  GROUP BY country
  ORDER BY count DESC
  LIMIT 15;
$$ LANGUAGE sql STABLE;

-- Get projects by category
CREATE OR REPLACE FUNCTION get_projects_by_category()
RETURNS TABLE(category TEXT, count BIGINT) AS $$
  SELECT COALESCE(category, 'uncategorized') as category, COUNT(*) as count
  FROM projects
  GROUP BY category
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE;

-- Get projects by phase
CREATE OR REPLACE FUNCTION get_projects_by_phase()
RETURNS TABLE(phase TEXT, count BIGINT) AS $$
  SELECT phase, COUNT(*) as count
  FROM projects
  GROUP BY phase
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE;

-- Get grant application pipeline
CREATE OR REPLACE FUNCTION get_grant_application_pipeline()
RETURNS TABLE(status TEXT, count BIGINT) AS $$
  SELECT status, COUNT(*) as count
  FROM grant_applications
  GROUP BY status
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE;

-- Get monthly user growth
CREATE OR REPLACE FUNCTION get_user_growth(start_date TIMESTAMP DEFAULT NOW() - INTERVAL '12 months', end_date TIMESTAMP DEFAULT NOW())
RETURNS TABLE(month TEXT, count BIGINT) AS $$
  SELECT
    TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') as month,
    COUNT(*) as count
  FROM profiles
  WHERE created_at >= start_date AND created_at <= end_date
  GROUP BY date_trunc('month', created_at)
  ORDER BY month ASC;
$$ LANGUAGE sql STABLE;

-- Get events by type
CREATE OR REPLACE FUNCTION get_events_by_type()
RETURNS TABLE(event_type TEXT, count BIGINT) AS $$
  SELECT event_type, COUNT(*) as count
  FROM events
  GROUP BY event_type
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- 017_notifications.sql
-- ============================================================

-- ============================================================
-- Migration 017: Notifications System
-- ============================================================

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient queries (unread first, newest first)
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Authenticated users can insert notifications (sender creates for recipient)
CREATE POLICY "Authenticated users can create notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ============================================================
-- 018_grievances.sql
-- ============================================================

-- ============================================================
-- Migration 018: Grievance / User Report System
-- ============================================================

CREATE TABLE IF NOT EXISTS grievances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_url TEXT,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX idx_grievances_reporter ON grievances(reporter_id, created_at DESC);
CREATE INDEX idx_grievances_reported_user ON grievances(reported_user_id);
CREATE INDEX idx_grievances_status ON grievances(status);
CREATE INDEX idx_grievances_category ON grievances(category);

-- Enable RLS
ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;

-- Users can view their own submitted grievances
CREATE POLICY "Users can view own grievances"
  ON grievances FOR SELECT
  USING (auth.uid() = reporter_id);

-- Authenticated users can create grievances (cannot report themselves)
CREATE POLICY "Authenticated users can submit grievances"
  ON grievances FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND auth.uid() != reported_user_id
  );

-- OECS admin can view and manage ALL grievances
CREATE POLICY "OECS admin can manage all grievances"
  ON grievances FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND 'oecs' = ANY(roles)
    )
  );

-- Updated_at trigger
CREATE TRIGGER set_grievances_updated_at
  BEFORE UPDATE ON grievances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 019_whiteboards.sql
-- ============================================================

-- ============================================================
-- Migration 019: Whiteboards & Whiteboard Shares
-- ============================================================

-- Whiteboards table
CREATE TABLE IF NOT EXISTS whiteboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled Whiteboard',
  snapshot JSONB,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_whiteboards_owner ON whiteboards(owner_id, updated_at DESC);

-- Enable RLS
ALTER TABLE whiteboards ENABLE ROW LEVEL SECURITY;

-- Owner can do everything with their whiteboards
CREATE POLICY "Users can view own whiteboards"
  ON whiteboards FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create whiteboards"
  ON whiteboards FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own whiteboards"
  ON whiteboards FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own whiteboards"
  ON whiteboards FOR DELETE
  USING (auth.uid() = owner_id);

-- Updated_at trigger
CREATE TRIGGER set_whiteboards_updated_at
  BEFORE UPDATE ON whiteboards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Whiteboard shares table
CREATE TABLE IF NOT EXISTS whiteboard_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whiteboard_id UUID NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(whiteboard_id, shared_with)
);

-- Indexes
CREATE INDEX idx_whiteboard_shares_shared_with ON whiteboard_shares(shared_with);
CREATE INDEX idx_whiteboard_shares_whiteboard ON whiteboard_shares(whiteboard_id);

-- Enable RLS
ALTER TABLE whiteboard_shares ENABLE ROW LEVEL SECURITY;

-- Users can view whiteboards shared with them
CREATE POLICY "Users can view shared whiteboards"
  ON whiteboards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_shares
      WHERE whiteboard_shares.whiteboard_id = whiteboards.id
      AND whiteboard_shares.shared_with = auth.uid()
    )
  );

-- Share creator can view and delete their shares (no circular ref back to whiteboards)
CREATE POLICY "Users can view sent shares"
  ON whiteboard_shares FOR SELECT
  USING (auth.uid() = shared_by);

CREATE POLICY "Users can manage own shares"
  ON whiteboard_shares FOR DELETE
  USING (auth.uid() = shared_by);

CREATE POLICY "Share creator can update shares"
  ON whiteboard_shares FOR UPDATE
  USING (auth.uid() = shared_by);

-- Users can view shares for whiteboards shared with them
CREATE POLICY "Users can view own shares"
  ON whiteboard_shares FOR SELECT
  USING (auth.uid() = shared_with);

-- Authenticated users can create shares
CREATE POLICY "Authenticated users can create shares"
  ON whiteboard_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = shared_by);

-- ============================================================
-- 020_whiteboard_permissions.sql
-- ============================================================

-- ============================================================
-- Migration 020: Add permission column to whiteboard_shares
-- Allows owners to grant 'view' or 'edit' access
-- ============================================================

-- Add permission column (default 'view' for backward compatibility)
ALTER TABLE whiteboard_shares
  ADD COLUMN IF NOT EXISTS permission TEXT NOT NULL DEFAULT 'view'
  CHECK (permission IN ('view', 'edit'));

-- Allow shared users with 'edit' permission to update whiteboards
CREATE POLICY "Shared editors can update whiteboards"
  ON whiteboards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_shares
      WHERE whiteboard_shares.whiteboard_id = whiteboards.id
      AND whiteboard_shares.shared_with = auth.uid()
      AND whiteboard_shares.permission = 'edit'
    )
  );

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 021_preregistrations.sql
-- ============================================================

-- ============================================================
-- Migration 021: Pre-Registration Applications
-- Stores pre-launch registration requests for admin review
-- ============================================================

CREATE TABLE IF NOT EXISTS preregistrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  country TEXT,
  bio TEXT,
  organization TEXT,
  role TEXT NOT NULL CHECK (role IN ('student', 'mentor', 'investor', 'entrepreneur', 'private_sector')),
  skills TEXT[] DEFAULT '{}',
  linkedin_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'info_requested')),
  admin_notes TEXT,
  info_request_message TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_preregistrations_status ON preregistrations(status, created_at DESC);
CREATE INDEX idx_preregistrations_email ON preregistrations(email);

-- Updated_at trigger
CREATE TRIGGER set_preregistrations_updated_at
  BEFORE UPDATE ON preregistrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE preregistrations ENABLE ROW LEVEL SECURITY;

-- OECS admins can view and manage all pre-registrations
CREATE POLICY "Admins can view all preregistrations"
  ON preregistrations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.roles @> ARRAY['oecs']::text[]
    )
  );

CREATE POLICY "Admins can update preregistrations"
  ON preregistrations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.roles @> ARRAY['oecs']::text[]
    )
  );

CREATE POLICY "Admins can delete preregistrations"
  ON preregistrations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.roles @> ARRAY['oecs']::text[]
    )
  );

-- Anyone (including anonymous) can insert a pre-registration
CREATE POLICY "Anyone can submit preregistration"
  ON preregistrations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 022_analytics.sql
-- ============================================================

-- ============================================================
-- Migration 022: Analytics Events
-- Tracks page views, feature usage, funnels, and conversions
-- ============================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'page_view', 'feature_use', 'funnel_step', 'click', 'conversion'
  )),
  event_name TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  page_path TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_analytics_events_created ON analytics_events(created_at DESC);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type, created_at DESC);
CREATE INDEX idx_analytics_events_session ON analytics_events(session_id, created_at);
CREATE INDEX idx_analytics_events_user ON analytics_events(user_id, created_at DESC);
CREATE INDEX idx_analytics_events_name ON analytics_events(event_name, created_at DESC);
CREATE INDEX idx_analytics_events_path ON analytics_events(page_path, created_at DESC);

-- RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous visitors) can insert events
CREATE POLICY "Anyone can insert analytics events"
  ON analytics_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only OECS admins can read analytics
CREATE POLICY "Admins can view analytics"
  ON analytics_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.roles @> ARRAY['oecs']::text[]
    )
  );

-- Only OECS admins can delete (cleanup old data)
CREATE POLICY "Admins can delete analytics"
  ON analytics_events FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.roles @> ARRAY['oecs']::text[]
    )
  );

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 023_uat_responses.sql
-- ============================================================

-- UAT Feedback Responses table (v2)
-- Refactored: focuses on usefulness & user experience
-- Fully anonymous survey — no authentication required

DROP TABLE IF EXISTS uat_responses;

CREATE TABLE uat_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Section 1: Usefulness & Value (Q1-Q5)
  q1_usefulness text NOT NULL CHECK (q1_usefulness IN ('very_useful', 'somewhat', 'not_very', 'not_at_all')),
  q2_valuable_features text[] NOT NULL DEFAULT '{}',       -- multi-select array
  q3_connect_innovators text NOT NULL CHECK (q3_connect_innovators IN ('yes', 'somewhat', 'no')),
  q4_discover_opportunities text NOT NULL CHECK (q4_discover_opportunities IN ('yes', 'somewhat', 'no')),
  q5_recommend_rating int NOT NULL CHECK (q5_recommend_rating BETWEEN 1 AND 5),

  -- Section 2: User Experience (Q6-Q10)
  q6_ease_of_navigation text NOT NULL CHECK (q6_ease_of_navigation IN ('very_easy', 'easy', 'neutral', 'difficult', 'very_difficult')),
  q7_professional text NOT NULL CHECK (q7_professional IN ('yes', 'somewhat', 'no')),
  q8_overall_experience text NOT NULL CHECK (q8_overall_experience IN ('excellent', 'good', 'average', 'poor', 'very_poor')),
  q9_issues boolean NOT NULL,
  q9_issues_detail text,
  q10_performance text NOT NULL CHECK (q10_performance IN ('fast', 'acceptable', 'slow')),

  -- Section 3: Open Feedback (Q11-Q12)
  q11_improvements text,
  q12_comments text,

  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_uat_responses_created_at ON uat_responses(created_at DESC);

ALTER TABLE uat_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit UAT responses"
  ON uat_responses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read UAT responses"
  ON uat_responses
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 024_featured_projects.sql
-- ============================================================

-- Add is_featured column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- Index for quick featured project lookups
CREATE INDEX IF NOT EXISTS idx_projects_is_featured ON projects(is_featured) WHERE is_featured = true;

-- ============================================================
-- 025_proposals.sql
-- ============================================================

-- ============================================================
-- Migration 025: Proposals
-- Creates the proposals table backing the Proposal Wizard
-- (src/hooks/useProposals.ts, src/hooks/useShareProposal.ts,
--  src/pages/proposals/SharedProposalPage.tsx)
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('funding', 'project', 'research', 'business')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  proposal_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step INTEGER NOT NULL DEFAULT 0,
  share_token UUID,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- share_token is generated client-side via crypto.randomUUID() (useShareProposal.ts)
-- and looked up with .eq('share_token', t).single() — must be unique.
-- Multiple NULLs are allowed under a UNIQUE constraint (unshared proposals).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposals_share_token_key'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_share_token_key UNIQUE (share_token);
  END IF;
END $$;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_proposals_user ON proposals(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_share_token ON proposals(share_token) WHERE share_token IS NOT NULL;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Owner: full CRUD
DROP POLICY IF EXISTS "Users can view own proposals" ON proposals;
CREATE POLICY "Users can view own proposals"
  ON proposals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own proposals" ON proposals;
CREATE POLICY "Users can create own proposals"
  ON proposals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own proposals" ON proposals;
CREATE POLICY "Users can update own proposals"
  ON proposals FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own proposals" ON proposals;
CREATE POLICY "Users can delete own proposals"
  ON proposals FOR DELETE
  USING (auth.uid() = user_id);

-- Public: unauthenticated visitors can read a proposal once it has been
-- shared (share_token set). SharedProposalPage.tsx / useSharedProposal()
-- queries `select('*').eq('share_token', t).single()` with no auth
-- required, so the row must be readable by the anon role.
DROP POLICY IF EXISTS "Anyone can view shared proposals" ON proposals;
CREATE POLICY "Anyone can view shared proposals"
  ON proposals FOR SELECT
  USING (share_token IS NOT NULL);

-- ============================================================
-- updated_at trigger (reuses update_updated_at_column() from 001)
-- ============================================================

DROP TRIGGER IF EXISTS set_proposals_updated_at ON proposals;
CREATE TRIGGER set_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 026_documents.sql
-- ============================================================

-- ============================================================
-- Migration 026: Documents & Document Shares
-- Creates the documents + document_shares tables backing the
-- collaborative editor (src/hooks/useDocuments.ts,
-- src/components/collaboration/editor/ShareDocumentModal.tsx)
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled Document',
  content TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id, updated_at DESC);

-- document_shares mirrors whiteboard_shares (019_whiteboards.sql).
-- ShareDocumentModal.tsx upserts { document_id, shared_with, shared_by }
-- with onConflict: 'document_id,shared_with' and no permission/level
-- column — sharing is read-only in the current app code.
CREATE TABLE IF NOT EXISTS document_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, shared_with)
);

CREATE INDEX IF NOT EXISTS idx_document_shares_shared_with ON document_shares(shared_with);
CREATE INDEX IF NOT EXISTS idx_document_shares_document ON document_shares(document_id);

-- ============================================================
-- Row Level Security: documents
-- ============================================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own documents" ON documents;
CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can create own documents" ON documents;
CREATE POLICY "Users can create own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own documents" ON documents;
CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own documents" ON documents;
CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid() = owner_id);

-- Shared users: read-only access (useSharedDocuments() in useDocuments.ts
-- looks up document_shares.shared_with = auth.uid(), then selects the
-- documents by id). No shared-edit policy is added — the app never
-- writes to `documents` on behalf of a shared (non-owner) user.
DROP POLICY IF EXISTS "Shared users can view documents" ON documents;
CREATE POLICY "Shared users can view documents"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_shares.document_id = documents.id
      AND document_shares.shared_with = auth.uid()
    )
  );

-- ============================================================
-- Row Level Security: document_shares
-- ============================================================

ALTER TABLE document_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view sent shares" ON document_shares;
CREATE POLICY "Users can view sent shares"
  ON document_shares FOR SELECT
  USING (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Users can view own shares" ON document_shares;
CREATE POLICY "Users can view own shares"
  ON document_shares FOR SELECT
  USING (auth.uid() = shared_with);

DROP POLICY IF EXISTS "Authenticated users can create shares" ON document_shares;
CREATE POLICY "Authenticated users can create shares"
  ON document_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = shared_by);

-- ShareDocumentModal.tsx upserts on conflict (document_id, shared_with),
-- which requires UPDATE privileges on the conflicting row.
DROP POLICY IF EXISTS "Share creator can update shares" ON document_shares;
CREATE POLICY "Share creator can update shares"
  ON document_shares FOR UPDATE
  USING (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Users can manage own shares" ON document_shares;
CREATE POLICY "Users can manage own shares"
  ON document_shares FOR DELETE
  USING (auth.uid() = shared_by);

-- ============================================================
-- updated_at trigger (reuses update_updated_at_column() from 001)
-- ============================================================

DROP TRIGGER IF EXISTS set_documents_updated_at ON documents;
CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 027_storage_buckets.sql
-- ============================================================

-- ============================================================
-- Migration 027: Storage — event-assets & document-images buckets
-- Creates buckets referenced in code that were never provisioned
-- in 006_create_avatars_storage.sql:
--   - 'event-assets'    src/pages/admin/events/AdminEventSpeakersTab.tsx
--                       (via src/components/ui/ImageUpload.tsx, path
--                       "speakers/{speakerId}/photo.{ext}")
--   - 'document-images' src/components/collaboration/editor/ImageModal.tsx
--                       (path "documents/{timestamp}-{rand}.{ext}")
-- Neither upload path is namespaced under the uploader's auth.uid(), so
-- (unlike the avatars/project-images/event-images policies in 006) write
-- access cannot be scoped by storage.foldername() == auth.uid(). Policies
-- below scope by role instead.
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. EVENT-ASSETS BUCKET (admin-managed: speaker photos, etc.)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-assets',
  'event-assets',
  TRUE,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view event assets" ON storage.objects;
CREATE POLICY "Anyone can view event assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-assets');

-- AdminEventSpeakersTab.tsx is an OECS-admin-only screen; require the
-- 'oecs' role (same admin check used in 012_admin_dashboard_policies.sql).
DROP POLICY IF EXISTS "OECS admins can upload event assets" ON storage.objects;
CREATE POLICY "OECS admins can upload event assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-assets'
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

DROP POLICY IF EXISTS "OECS admins can update event assets" ON storage.objects;
CREATE POLICY "OECS admins can update event assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'event-assets'
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

DROP POLICY IF EXISTS "OECS admins can delete event assets" ON storage.objects;
CREATE POLICY "OECS admins can delete event assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-assets'
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- 2. DOCUMENT-IMAGES BUCKET (inline images in the doc editor)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-images',
  'document-images',
  TRUE,
  10485760, -- 10MB limit (matches ImageModal.tsx's client-side check)
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view document images" ON storage.objects;
CREATE POLICY "Anyone can view document images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'document-images');

-- Any authenticated user can insert inline images (mirrors who can create
-- documents — ImageModal.tsx is reachable by any signed-in editor user).
DROP POLICY IF EXISTS "Authenticated users can upload document images" ON storage.objects;
CREATE POLICY "Authenticated users can upload document images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'document-images'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Authenticated users can update document images" ON storage.objects;
CREATE POLICY "Authenticated users can update document images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'document-images'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Authenticated users can delete document images" ON storage.objects;
CREATE POLICY "Authenticated users can delete document images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'document-images'
    AND auth.uid() IS NOT NULL
  );

-- ============================================================
-- 028_profiles_delete.sql
-- ============================================================

-- ============================================================
-- Migration 028: Profiles DELETE policy
-- 000_create_profiles_table.sql only ever granted SELECT/INSERT/UPDATE
-- on `profiles` — there is no DELETE policy, so
-- AuthContext.tsx's deleteAccount() (`supabase.from('profiles').delete()
-- .eq('id', user.id)`) silently deletes 0 rows under RLS (no error is
-- raised by PostgREST; the row simply isn't visible to delete).
-- Idempotent — safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "Users can delete their own profile" ON profiles;
CREATE POLICY "Users can delete their own profile"
  ON profiles FOR DELETE
  USING (auth.uid() = id);

-- NOTE: This only fixes the `profiles` row deletion. AuthContext.deleteAccount()
-- calls supabase.auth.signOut() afterward but never deletes the underlying
-- auth.users row — the Supabase client has no privilege to do that (auth
-- admin operations require the service_role key, which must never ship to
-- the browser). The auth.users row — and anything still FK'd to
-- profiles(id) that isn't ON DELETE CASCADE — will remain orphaned.
-- Deleting the auth.users record requires either:
--   (a) a Supabase Edge Function (using the service role key) that calls
--       supabase.auth.admin.deleteUser(userId), invoked from the client
--       via supabase.functions.invoke(...), or
--   (b) a scheduled/manual admin cleanup job.
-- No such function is created here — src changes and edge functions are
-- out of scope for this migration.

-- ============================================================
-- 029_conversations_update.sql
-- ============================================================

-- ============================================================
-- Migration 029: Conversations UPDATE policy + SECURITY DEFINER trigger
-- 004_create_messages_table.sql enabled RLS on `conversations` with only
-- SELECT and INSERT policies. Its update_conversation_on_message() trigger
-- (fired AFTER INSERT ON messages) runs `UPDATE conversations SET
-- updated_at = NOW() WHERE id = NEW.conversation_id`. Trigger functions
-- default to SECURITY INVOKER, so that UPDATE is subject to RLS as the
-- sending user — and with no UPDATE policy on `conversations`, the update
-- matches zero rows. Conversation list ordering
-- (`useConversations()` -> `.order('updated_at', ...)`) then never
-- reflects the latest message. Fix both the missing policy and make the
-- trigger function SECURITY DEFINER so it isn't dependent on the policy
-- (belt-and-suspenders — either fix alone resolves the bug).
-- Idempotent — safe to re-run.
-- ============================================================

-- Explicit UPDATE policy: either participant may bump their own conversation.
DROP POLICY IF EXISTS "Participants can update own conversations" ON conversations;
CREATE POLICY "Participants can update own conversations"
  ON conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_participants.conversation_id = conversations.id
      AND conversation_participants.user_id = auth.uid()
    )
  );

-- Recreate the trigger function as SECURITY DEFINER so the updated_at
-- bump succeeds regardless of the invoking participant's row-level
-- visibility into `conversations` (matches the SECURITY DEFINER pattern
-- used by handle_new_user() in 000_create_profiles_table.sql).
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversation_on_message_trigger ON messages;
CREATE TRIGGER update_conversation_on_message_trigger
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- ============================================================
-- 030_admin_projects_policies.sql
-- ============================================================

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

-- ============================================================
-- 031_project_members.sql
-- ============================================================

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

-- ============================================================
-- 032_project_engagement.sql
-- ============================================================

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

-- ============================================================
-- 033_connections.sql
-- ============================================================

-- ============================================================
-- Migration 033: Networking & Connections
-- Mutual (request -> accept) connection model between users.
-- An ordered-pair unique index prevents a reverse-direction
-- duplicate (A->B blocks B->A).
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_pair
  ON connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS idx_connections_requester ON connections(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_addressee ON connections(addressee_id, status);

DROP TRIGGER IF EXISTS set_connections_updated_at ON connections;
CREATE TRIGGER set_connections_updated_at
  BEFORE UPDATE ON connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Only the two parties can see the relationship
DROP POLICY IF EXISTS "Parties can view own connections" ON connections;
CREATE POLICY "Parties can view own connections"
  ON connections FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Only the requester can create a request
DROP POLICY IF EXISTS "Users can send connection requests" ON connections;
CREATE POLICY "Users can send connection requests"
  ON connections FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Only the addressee can accept/decline
DROP POLICY IF EXISTS "Addressee can respond to requests" ON connections;
CREATE POLICY "Addressee can respond to requests"
  ON connections FOR UPDATE
  USING (auth.uid() = addressee_id);

-- Either party can cancel a request / remove the connection
DROP POLICY IF EXISTS "Parties can remove connections" ON connections;
CREATE POLICY "Parties can remove connections"
  ON connections FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- ============================================================
-- 034_group_messaging.sql
-- ============================================================

-- ============================================================
-- Migration 034: Group Messaging + Messaging RLS hardening
-- 1. Adds conversation name / is_group / created_by and a
--    participant role (admin | member).
-- 2. Fixes security holes from 004:
--    - participants INSERT allowed ANY authenticated user to add
--      anyone to any conversation -> now restricted to self,
--      the conversation creator, or a group admin.
--    - adds the missing participants DELETE policy (leave /
--      admin-remove).
--    - replaces the self-referencing participants SELECT policy
--      with a SECURITY DEFINER helper (recursion guard).
--    - find_conversation_between matched group conversations
--      containing both users -> now restricted to 1-to-1.
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member'));

-- ============================================================
-- SECURITY DEFINER helpers (bypass RLS -> no policy recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION is_conversation_participant(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION is_conversation_admin(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_conversation_creator(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations
    WHERE id = p_conversation_id AND created_by = p_user_id
  );
$$;

-- ============================================================
-- conversations policies
-- ============================================================

-- Include creator so the creator can operate on the conversation
-- between creating it and inserting their own participant row.
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (
    is_conversation_participant(id, auth.uid())
    OR created_by = auth.uid()
  );

-- Creator must stamp themselves on new conversations
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

-- Rename etc.: group admins (or creator); 1-to-1 participants keep
-- the updated_at bump path via the SECURITY DEFINER trigger from 029.
DROP POLICY IF EXISTS "Participants can update own conversations" ON conversations;
CREATE POLICY "Participants can update own conversations"
  ON conversations FOR UPDATE
  USING (
    is_conversation_admin(id, auth.uid())
    OR created_by = auth.uid()
    OR (is_group = FALSE AND is_conversation_participant(id, auth.uid()))
  );

-- ============================================================
-- conversation_participants policies
-- ============================================================

DROP POLICY IF EXISTS "Users can view participants of own conversations" ON conversation_participants;
CREATE POLICY "Users can view participants of own conversations"
  ON conversation_participants FOR SELECT
  USING (is_conversation_participant(conversation_id, auth.uid()));

-- FIX: was WITH CHECK (auth.uid() IS NOT NULL) — anyone could add
-- anyone to any conversation. Now: add yourself, or the creator /
-- a group admin adds others.
DROP POLICY IF EXISTS "Authenticated users can add participants" ON conversation_participants;
CREATE POLICY "Authenticated users can add participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR is_conversation_creator(conversation_id, auth.uid())
    OR is_conversation_admin(conversation_id, auth.uid())
  );

-- Role changes (promote/demote): admins and creator only
DROP POLICY IF EXISTS "Admins can update participants" ON conversation_participants;
CREATE POLICY "Admins can update participants"
  ON conversation_participants FOR UPDATE
  USING (
    is_conversation_admin(conversation_id, auth.uid())
    OR is_conversation_creator(conversation_id, auth.uid())
  );

-- FIX: no DELETE policy existed. Members can leave; admins/creator can remove.
DROP POLICY IF EXISTS "Members can leave and admins can remove" ON conversation_participants;
CREATE POLICY "Members can leave and admins can remove"
  ON conversation_participants FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_conversation_admin(conversation_id, auth.uid())
    OR is_conversation_creator(conversation_id, auth.uid())
  );

-- ============================================================
-- FIX: find_conversation_between matched any conversation that
-- happened to contain both users (including groups). Restrict to
-- non-group conversations with exactly two participants.
-- ============================================================
CREATE OR REPLACE FUNCTION find_conversation_between(user1 UUID, user2 UUID)
RETURNS UUID AS $$
  SELECT cp1.conversation_id
  FROM conversation_participants cp1
  JOIN conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  JOIN conversations c
    ON c.id = cp1.conversation_id
  WHERE cp1.user_id = user1
    AND cp2.user_id = user2
    AND c.is_group = FALSE
    AND (
      SELECT COUNT(*) FROM conversation_participants cp3
      WHERE cp3.conversation_id = cp1.conversation_id
    ) = 2
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 035_verification.sql
-- ============================================================

-- ============================================================
-- Migration 035: Identity Verification Workflow
-- verification_requests table + the platform's first PRIVATE
-- storage bucket (verification-documents). Admin approval flips
-- profiles.is_verified via the existing admin update path.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS verification_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  document_paths TEXT[] NOT NULL DEFAULT '{}',
  user_note TEXT,
  admin_note TEXT,
  reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_requests_user ON verification_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests(status, created_at DESC);

-- One open request per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_one_pending
  ON verification_requests(user_id) WHERE status = 'pending';

DROP TRIGGER IF EXISTS set_verification_requests_updated_at ON verification_requests;
CREATE TRIGGER set_verification_requests_updated_at
  BEFORE UPDATE ON verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own verification requests" ON verification_requests;
CREATE POLICY "Users can view own verification requests"
  ON verification_requests FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Users can submit verification requests" ON verification_requests;
CREATE POLICY "Users can submit verification requests"
  ON verification_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can review verification requests" ON verification_requests;
CREATE POLICY "Admins can review verification requests"
  ON verification_requests FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- ============================================================
-- PRIVATE bucket for identity documents (PDF + images).
-- public = FALSE: reads require signed URLs / authorized download.
-- Path convention: {userId}/{filename}
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-documents',
  'verification-documents',
  FALSE,
  10485760, -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own verification documents" ON storage.objects;
CREATE POLICY "Users can upload own verification documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'verification-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users and admins can view verification documents" ON storage.objects;
CREATE POLICY "Users and admins can view verification documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'verification-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    )
  );

DROP POLICY IF EXISTS "Users can delete own verification documents" ON storage.objects;
CREATE POLICY "Users can delete own verification documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- ============================================================
-- 036_notification_preferences.sql
-- ============================================================

-- ============================================================
-- Migration 036: Notification Preferences + notification hardening
-- 1. notification_preferences table (per-user category toggles;
--    replaces the localStorage-only 'ktip_preferences' blob).
-- 2. Enforcement at the DB layer: a BEFORE INSERT trigger on
--    notifications silently drops rows whose category the
--    recipient has switched off — enforced no matter who inserts.
-- 3. FIX security hole from 017: INSERT policy was
--    WITH CHECK (true), letting any user spam notifications at
--    any user. Direct inserts are now removed in favour of a
--    send_notification() RPC (SECURITY DEFINER) with basic
--    validation. All client call sites use the RPC.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email BOOLEAN NOT NULL DEFAULT TRUE,
  messages BOOLEAN NOT NULL DEFAULT TRUE,
  events BOOLEAN NOT NULL DEFAULT TRUE,
  projects BOOLEAN NOT NULL DEFAULT TRUE,
  forums BOOLEAN NOT NULL DEFAULT TRUE,
  collaboration BOOLEAN NOT NULL DEFAULT TRUE,
  connections BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER set_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
CREATE POLICY "Users can view own preferences"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own preferences" ON notification_preferences;
CREATE POLICY "Users can create own preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own preferences" ON notification_preferences;
CREATE POLICY "Users can update own preferences"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- Enforcement trigger: category is derived from notification.type.
-- No preferences row (or unknown type) = allow. Returning NULL
-- silently drops the insert — correct for fire-and-forget senders.
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  category_enabled BOOLEAN;
BEGIN
  SELECT CASE
    WHEN NEW.type IN ('video_invite', 'whiteboard_share', 'document_share') THEN collaboration
    WHEN NEW.type IN ('project_invite', 'project_update', 'project_follow') THEN projects
    WHEN NEW.type IN ('connection_request', 'connection_accepted') THEN connections
    WHEN NEW.type IN ('message') THEN messages
    WHEN NEW.type IN ('event_reminder', 'event_update') THEN events
    WHEN NEW.type IN ('forum_reply') THEN forums
    ELSE TRUE
  END
  INTO category_enabled
  FROM notification_preferences
  WHERE user_id = NEW.user_id;

  IF category_enabled = FALSE THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_notification_prefs ON notifications;
CREATE TRIGGER check_notification_prefs
  BEFORE INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION enforce_notification_preferences();

-- ============================================================
-- Replace open direct inserts with a validated RPC.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON notifications;

CREATE OR REPLACE FUNCTION send_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_user_id = auth.uid() THEN
    RETURN; -- no self-notifications
  END IF;
  IF length(coalesce(p_title, '')) = 0 OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'invalid title';
  END IF;
  IF length(coalesce(p_body, '')) > 1000 OR length(coalesce(p_link, '')) > 500 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (p_user_id, coalesce(p_type, 'general'), p_title, p_body, p_link);
END;
$$;

-- ============================================================
-- 037_feedback.sql
-- ============================================================

-- ============================================================
-- Migration 037: General User Feedback Channel
-- Lightweight always-available feedback (distinct from the UAT
-- survey and the grievance system). Modeled on grievances:
-- user-scoped rows + OECS admin triage.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('bug', 'feature_request', 'general', 'content')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'resolved', 'dismissed')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);

DROP TRIGGER IF EXISTS set_feedback_updated_at ON feedback;
CREATE TRIGGER set_feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Authenticated users submit as themselves (or anonymously with NULL)
DROP POLICY IF EXISTS "Authenticated users can submit feedback" ON feedback;
CREATE POLICY "Authenticated users can submit feedback"
  ON feedback FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Users see their own submissions; admins see all
DROP POLICY IF EXISTS "Users can view own feedback" ON feedback;
CREATE POLICY "Users can view own feedback"
  ON feedback FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- Admin triage (status / admin_note)
DROP POLICY IF EXISTS "Admins can update feedback" ON feedback;
CREATE POLICY "Admins can update feedback"
  ON feedback FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- ============================================================
-- 038_integrations.sql
-- ============================================================

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

-- ============================================================
-- 039_badges.sql
-- ============================================================

-- ============================================================
-- Migration 039: Achievement Badges
-- badges (definitions) + user_badges (awards). Awards happen only
-- through SECURITY DEFINER trigger functions — there is no client
-- INSERT path, so badges cannot be self-awarded. Award inserts a
-- notification (type 'badge_awarded') which flows through the
-- notification-preferences trigger from 036.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'award',
  color TEXT NOT NULL DEFAULT 'ocean',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id, awarded_at DESC);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Definitions and awards are public; no client writes on either
-- (awards go through SECURITY DEFINER functions only).
DROP POLICY IF EXISTS "Badges are viewable by everyone" ON badges;
CREATE POLICY "Badges are viewable by everyone"
  ON badges FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "User badges are viewable by everyone" ON user_badges;
CREATE POLICY "User badges are viewable by everyone"
  ON user_badges FOR SELECT
  USING (TRUE);

-- ============================================================
-- Badge definitions
-- ============================================================
INSERT INTO badges (slug, name, description, icon, color) VALUES
  ('first_project',    'Innovator',       'Created your first project', 'rocket', 'ocean'),
  ('popular_project',  'Crowd Favourite', 'One of your projects reached 25 likes', 'heart', 'tropical'),
  ('first_connection', 'Networker',       'Made your first connection', 'users', 'ocean'),
  ('community_voice',  'Community Voice', 'Posted 10 times in the forums', 'message-square', 'sand'),
  ('verified_member',  'Verified Member', 'Completed identity verification', 'shield-check', 'tropical'),
  ('event_goer',       'Event Goer',      'RSVP''d to your first event', 'calendar', 'sand')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Award helper: idempotent; notifies on first award only.
-- ============================================================
CREATE OR REPLACE FUNCTION award_badge(p_user_id UUID, p_slug TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badge badges%ROWTYPE;
  v_inserted UUID;
BEGIN
  SELECT * INTO v_badge FROM badges WHERE slug = p_slug;
  IF v_badge.id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO user_badges (user_id, badge_id)
  VALUES (p_user_id, v_badge.id)
  ON CONFLICT (user_id, badge_id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      p_user_id,
      'badge_awarded',
      'Achievement unlocked: ' || v_badge.name,
      v_badge.description,
      '/profile/me'
    );
  END IF;
END;
$$;

-- ============================================================
-- Awarding triggers
-- ============================================================

-- first_project
CREATE OR REPLACE FUNCTION badge_on_project_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM award_badge(NEW.owner_id, 'first_project');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS badge_on_project_insert ON projects;
CREATE TRIGGER badge_on_project_insert
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION badge_on_project_insert();

-- popular_project (25 likes -> owner)
CREATE OR REPLACE FUNCTION badge_on_project_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner UUID;
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM project_likes WHERE project_id = NEW.project_id;
  IF v_count >= 25 THEN
    SELECT owner_id INTO v_owner FROM projects WHERE id = NEW.project_id;
    IF v_owner IS NOT NULL THEN
      PERFORM award_badge(v_owner, 'popular_project');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS badge_on_project_like ON project_likes;
CREATE TRIGGER badge_on_project_like
  AFTER INSERT ON project_likes
  FOR EACH ROW EXECUTE FUNCTION badge_on_project_like();

-- first_connection (both parties, on acceptance)
CREATE OR REPLACE FUNCTION badge_on_connection_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    PERFORM award_badge(NEW.requester_id, 'first_connection');
    PERFORM award_badge(NEW.addressee_id, 'first_connection');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS badge_on_connection_accepted ON connections;
CREATE TRIGGER badge_on_connection_accepted
  AFTER UPDATE ON connections
  FOR EACH ROW EXECUTE FUNCTION badge_on_connection_accepted();

-- community_voice (10 forum posts + replies combined)
CREATE OR REPLACE FUNCTION badge_on_forum_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM forum_posts WHERE author_id = NEW.author_id)
    + (SELECT COUNT(*) FROM forum_replies WHERE author_id = NEW.author_id)
  INTO v_count;
  IF v_count >= 10 THEN
    PERFORM award_badge(NEW.author_id, 'community_voice');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS badge_on_forum_post ON forum_posts;
CREATE TRIGGER badge_on_forum_post
  AFTER INSERT ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION badge_on_forum_activity();
DROP TRIGGER IF EXISTS badge_on_forum_reply ON forum_replies;
CREATE TRIGGER badge_on_forum_reply
  AFTER INSERT ON forum_replies
  FOR EACH ROW EXECUTE FUNCTION badge_on_forum_activity();

-- verified_member
CREATE OR REPLACE FUNCTION badge_on_profile_verified()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_verified = TRUE AND coalesce(OLD.is_verified, FALSE) = FALSE THEN
    PERFORM award_badge(NEW.id, 'verified_member');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS badge_on_profile_verified ON profiles;
CREATE TRIGGER badge_on_profile_verified
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION badge_on_profile_verified();

-- event_goer
CREATE OR REPLACE FUNCTION badge_on_event_rsvp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM award_badge(NEW.user_id, 'event_goer');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS badge_on_event_rsvp ON event_rsvps;
CREATE TRIGGER badge_on_event_rsvp
  AFTER INSERT ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION badge_on_event_rsvp();

-- ============================================================
-- Backfill: award already-earned badges without notifications
-- ============================================================
INSERT INTO user_badges (user_id, badge_id)
SELECT DISTINCT p.owner_id, b.id
FROM projects p, badges b
WHERE b.slug = 'first_project'
ON CONFLICT (user_id, badge_id) DO NOTHING;

INSERT INTO user_badges (user_id, badge_id)
SELECT DISTINCT p.owner_id, b.id
FROM projects p
JOIN (
  SELECT project_id FROM project_likes GROUP BY project_id HAVING COUNT(*) >= 25
) pop ON pop.project_id = p.id,
badges b
WHERE b.slug = 'popular_project'
ON CONFLICT (user_id, badge_id) DO NOTHING;

INSERT INTO user_badges (user_id, badge_id)
SELECT author_id, b.id
FROM (
  SELECT author_id FROM (
    SELECT author_id FROM forum_posts
    UNION ALL
    SELECT author_id FROM forum_replies
  ) fa GROUP BY author_id HAVING COUNT(*) >= 10
) authors, badges b
WHERE b.slug = 'community_voice'
ON CONFLICT (user_id, badge_id) DO NOTHING;

INSERT INTO user_badges (user_id, badge_id)
SELECT pr.id, b.id
FROM profiles pr, badges b
WHERE pr.is_verified = TRUE AND b.slug = 'verified_member'
ON CONFLICT (user_id, badge_id) DO NOTHING;

INSERT INTO user_badges (user_id, badge_id)
SELECT DISTINCT r.user_id, b.id
FROM event_rsvps r, badges b
WHERE b.slug = 'event_goer'
ON CONFLICT (user_id, badge_id) DO NOTHING;

-- ============================================================
-- 040_security_fixes.sql
-- ============================================================

-- ============================================================
-- Migration 040: Security fixes
-- uat_responses SELECT was open to ALL authenticated users —
-- survey responses (free-text feedback) should be admin-only.
-- (The messaging INSERT/DELETE holes are fixed in 034; the open
-- notifications INSERT policy is replaced by send_notification()
-- in 036.)
-- Idempotent — safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can read UAT responses" ON uat_responses;
CREATE POLICY "Admins can read UAT responses"
  ON uat_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- ============================================================
-- 041_expand_profile_fields.sql
-- ============================================================

-- ============================================================
-- Migration 041: Expand Profile Fields
-- Adds organization, industry, interests, open_to columns to
-- profiles; seeds them from signup metadata via handle_new_user;
-- adds 'faculty' role to preregistrations CHECK constraint.
-- Idempotent -- safe to re-run.
-- ============================================================

-- New profile columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS open_to TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Indexes for future directory filtering (mirrors idx_profiles_skills from 014)
CREATE INDEX IF NOT EXISTS idx_profiles_interests ON profiles USING GIN (interests);
CREATE INDEX IF NOT EXISTS idx_profiles_open_to ON profiles USING GIN (open_to);

-- Seed all profile fields collected by the signup wizard from
-- auth metadata (email confirmation means no session exists at
-- signup time, so the trigger is the only write path).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, display_name, roles, bio, country, organization, industry,
    skills, interests, open_to
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IS NOT NULL
      THEN ARRAY[NEW.raw_user_meta_data->>'role']
      ELSE ARRAY[]::TEXT[]
    END,
    NEW.raw_user_meta_data->>'bio',
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'organization',
    NEW.raw_user_meta_data->>'industry',
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'skills') AS x),
      ARRAY[]::TEXT[]
    ),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'interests') AS x),
      ARRAY[]::TEXT[]
    ),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'open_to') AS x),
      ARRAY[]::TEXT[]
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Allow 'faculty' role in preregistrations
ALTER TABLE preregistrations DROP CONSTRAINT IF EXISTS preregistrations_role_check;
ALTER TABLE preregistrations ADD CONSTRAINT preregistrations_role_check
  CHECK (role IN ('student', 'mentor', 'investor', 'entrepreneur', 'private_sector', 'faculty'));

-- ============================================================
-- 042_hero_summaries.sql
-- ============================================================

-- 042: Short summary field for the Discover hero
-- Optional one-liner shown in the homepage hero; falls back to description when null.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE grants ADD COLUMN IF NOT EXISTS summary TEXT;

-- ============================================================
-- 043_entity_details.sql
-- ============================================================

-- 043: Flexible "Additional Details" metadata (groups + label/value items)
-- Ordered JSONB array; an entry with "items" is a group, an entry with "value" is a flat item.

ALTER TABLE grants ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '[]'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '[]'::jsonb;

-- ============================================================
-- 044_oauth_profile_metadata.sql
-- ============================================================

-- ============================================================
-- Migration 044: OAuth Profile Metadata
-- Updates handle_new_user() to seed profiles from OAuth provider
-- metadata (Google/Microsoft) in addition to signup-wizard keys.
-- Google supplies: full_name, name, picture, avatar_url, email.
-- Also guards against duplicate inserts (ON CONFLICT DO NOTHING)
-- so client-side fallback creation never races the trigger.
-- Idempotent -- safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, display_name, avatar_url, roles, bio, country, organization, industry,
    skills, interests, open_to
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.email
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IS NOT NULL
      THEN ARRAY[NEW.raw_user_meta_data->>'role']
      ELSE ARRAY[]::TEXT[]
    END,
    NEW.raw_user_meta_data->>'bio',
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'organization',
    NEW.raw_user_meta_data->>'industry',
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'skills') AS x),
      ARRAY[]::TEXT[]
    ),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'interests') AS x),
      ARRAY[]::TEXT[]
    ),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'open_to') AS x),
      ARRAY[]::TEXT[]
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 045_grant_application_wizard.sql
-- ============================================================

-- Grant application wizard: draft support, resume step, RLS fix, drop proposals feature

-- 1. Allow 'draft' status on grant_applications
ALTER TABLE grant_applications DROP CONSTRAINT IF EXISTS grant_applications_status_check;
ALTER TABLE grant_applications ADD CONSTRAINT grant_applications_status_check
  CHECK (status IN ('draft', 'pending', 'under_review', 'approved', 'rejected'));

-- 2. Track wizard progress for draft resume
ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS current_step INTEGER NOT NULL DEFAULT 0;

-- 3. Replace INSERT policy: the original NOT EXISTS subquery referenced
-- grant_applications against itself (grant_id = grant_applications.grant_id is
-- always true for any existing row), blocking a user's application to a second
-- grant. UNIQUE(grant_id, user_id) already enforces one application per grant.
DROP POLICY IF EXISTS "Users can create applications" ON grant_applications;
CREATE POLICY "Users can create applications"
  ON grant_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 4. Exclude drafts from the public application count
CREATE OR REPLACE FUNCTION get_grant_application_count(grant_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM grant_applications
  WHERE grant_id = grant_uuid AND status <> 'draft';
$$ LANGUAGE SQL STABLE;

-- 5. Remove standalone proposals feature
DROP TABLE IF EXISTS proposals CASCADE;

-- ============================================================
-- 046_progress_history.sql
-- ============================================================

-- 046: Progress history for grant applications and projects.
-- Powers the dashboard timeline: every status/phase change is logged with a
-- timestamp so applicants and project owners can see how things move along.

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS grant_application_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES grant_applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'under_review', 'approved', 'rejected')),
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ga_events_app ON grant_application_events(application_id, created_at);

CREATE TABLE IF NOT EXISTS project_phase_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('concept', 'prototype', 'funding', 'launch')),
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_events_project ON project_phase_events(project_id, created_at);

-- ============================================================
-- RLS: read-only history. Writes happen exclusively via triggers,
-- so there are deliberately no INSERT/UPDATE/DELETE policies.
-- ============================================================

ALTER TABLE grant_application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phase_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own application events" ON grant_application_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM grant_applications a
      WHERE a.id = application_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all application events" ON grant_application_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

CREATE POLICY "Users can view own project phase events" ON project_phase_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all project phase events" ON project_phase_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- Triggers. SECURITY DEFINER is required: the event tables have no
-- INSERT policy, so without it the history insert would fail under
-- the acting user's RLS (breaking admin approve/reject entirely).
-- ============================================================

CREATE OR REPLACE FUNCTION log_grant_application_status()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO grant_application_events (application_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ga_status_history ON grant_applications;
CREATE TRIGGER trg_ga_status_history
  AFTER INSERT OR UPDATE OF status ON grant_applications
  FOR EACH ROW EXECUTE FUNCTION log_grant_application_status();

CREATE OR REPLACE FUNCTION log_project_phase()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.phase IS DISTINCT FROM NEW.phase THEN
    INSERT INTO project_phase_events (project_id, phase, changed_by)
    VALUES (NEW.id, NEW.phase, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_phase_history ON projects;
CREATE TRIGGER trg_project_phase_history
  AFTER INSERT OR UPDATE OF phase ON projects
  FOR EACH ROW EXECUTE FUNCTION log_project_phase();

-- ============================================================
-- Backfill existing rows. Two-row heuristic: the initial state at
-- created_at, plus the current state at updated_at when it differs,
-- so already-decided items don't render as instant decisions.
-- ============================================================

INSERT INTO grant_application_events (application_id, status, created_at)
SELECT id, CASE WHEN status = 'draft' THEN 'draft' ELSE 'pending' END, created_at
FROM grant_applications;

INSERT INTO grant_application_events (application_id, status, created_at)
SELECT id, status, updated_at
FROM grant_applications
WHERE status NOT IN ('draft', 'pending');

INSERT INTO project_phase_events (project_id, phase, created_at)
SELECT id, 'concept', created_at
FROM projects;

INSERT INTO project_phase_events (project_id, phase, created_at)
SELECT id, phase, updated_at
FROM projects
WHERE phase <> 'concept';

-- ============================================================
-- 047_user_badges_badge_index.sql
-- ============================================================

-- Directory badge filter: 039's only index is (user_id, awarded_at) — the
-- "find members holding badge X" lookup needs the reverse direction.
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id, user_id);

-- ============================================================
-- 048_entity_documents.sql
-- ============================================================

-- ============================================================
-- Migration 048: Entity Document Library
-- Uploadable documents attached to grants and projects, each with
-- a Google-Drive style visibility setting, a per-document ACL, a
-- request-access workflow, a scraped markdown twin, and AI field
-- proposals that are reviewed before they touch the entity.
--
-- Storage: private bucket `entity-documents`, path convention
--   {ownerId}/{entityType}/{entityId}/{ts}_{fileName}
-- (first path segment is the uid, same as verification-documents
-- in migration 035, so the upload policy is identical).
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS entity_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grant', 'project')),
  entity_id UUID NOT NULL,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'restricted'
    CHECK (visibility IN ('private', 'restricted', 'members', 'public')),
  -- Scraped twin of the uploaded file, kept in two shapes:
  --   content_html — what the WYSIWYG editor reads and writes
  --   markdown     — plain text derived from it; what the AI and search read
  content_html TEXT,
  markdown TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'processing', 'done', 'failed', 'unsupported')),
  extraction_error TEXT,
  -- AI field proposals: { "<column>": { "value": ..., "confidence": 0-1, "evidence": "..." } }
  -- Proposals only. Applying them to the parent row is an explicit user action.
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_documents_entity
  ON entity_documents(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_documents_owner
  ON entity_documents(owner_id, created_at DESC);

DROP TRIGGER IF EXISTS set_entity_documents_updated_at ON entity_documents;
CREATE TRIGGER set_entity_documents_updated_at
  BEFORE UPDATE ON entity_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Explicit grants: who the owner has shared this document with
CREATE TABLE IF NOT EXISTS document_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES entity_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_document_access_document ON document_access(document_id);
CREATE INDEX IF NOT EXISTS idx_document_access_user ON document_access(user_id);

-- "Request access" — the Drive-style knock on the door
CREATE TABLE IF NOT EXISTS document_access_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES entity_documents(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  granted_role TEXT CHECK (granted_role IN ('viewer', 'editor')),
  decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_access_requests_document
  ON document_access_requests(document_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_access_requests_requester
  ON document_access_requests(requester_id, created_at DESC);

-- One open request per (document, requester)
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_access_requests_one_pending
  ON document_access_requests(document_id, requester_id) WHERE status = 'pending';

-- ============================================================
-- Helpers: SECURITY DEFINER so policies can cross-reference the
-- ACL tables without recursing (same reason as is_project_member
-- in migration 031).
-- ============================================================

-- 'owner' | 'editor' | 'viewer' | NULL, most privileged wins.
CREATE OR REPLACE FUNCTION doc_access_role(p_document_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_visibility TEXT;
  v_role TEXT;
BEGIN
  SELECT owner_id, visibility INTO v_owner_id, v_visibility
  FROM entity_documents WHERE id = p_document_id;

  IF v_owner_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id = v_owner_id THEN
    RETURN 'owner';
  END IF;

  -- OECS admins administer every document
  IF p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND 'oecs' = ANY(roles)
  ) THEN
    RETURN 'owner';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM document_access
    WHERE document_id = p_document_id AND user_id = p_user_id;
    IF v_role IS NOT NULL THEN
      RETURN v_role;
    END IF;
  END IF;

  IF v_visibility = 'public' THEN
    RETURN 'viewer';
  END IF;

  IF v_visibility = 'members' AND p_user_id IS NOT NULL THEN
    RETURN 'viewer';
  END IF;

  -- 'private' and 'restricted' need an explicit grant
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION can_view_document(p_document_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT doc_access_role(p_document_id, p_user_id) IS NOT NULL;
$$;

-- ============================================================
-- RLS: entity_documents
-- ============================================================
ALTER TABLE entity_documents ENABLE ROW LEVEL SECURITY;

-- Full rows (including the scraped content) only for those with access.
-- Metadata for everyone else comes from get_entity_documents() below.
DROP POLICY IF EXISTS "Documents are viewable by those with access" ON entity_documents;
CREATE POLICY "Documents are viewable by those with access"
  ON entity_documents FOR SELECT
  USING (can_view_document(id, auth.uid()));

DROP POLICY IF EXISTS "Members can upload documents" ON entity_documents;
CREATE POLICY "Members can upload documents"
  ON entity_documents FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owner and editors can update documents" ON entity_documents;
CREATE POLICY "Owner and editors can update documents"
  ON entity_documents FOR UPDATE
  USING (doc_access_role(id, auth.uid()) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Owner can delete documents" ON entity_documents;
CREATE POLICY "Owner can delete documents"
  ON entity_documents FOR DELETE
  USING (doc_access_role(id, auth.uid()) = 'owner');

-- An UPDATE policy gates the row, not the columns — without this an editor
-- could widen a document's visibility, hand it to someone else, or repoint it
-- at a different file. Those columns stay owner-only.
CREATE OR REPLACE FUNCTION enforce_document_owner_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF doc_access_role(OLD.id, auth.uid()) = 'owner' THEN
    RETURN NEW;
  END IF;

  IF NEW.visibility IS DISTINCT FROM OLD.visibility
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
    RAISE EXCEPTION 'Only the document owner can change who it belongs to or who can see it';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_entity_documents_owner_columns ON entity_documents;
CREATE TRIGGER enforce_entity_documents_owner_columns
  BEFORE UPDATE ON entity_documents
  FOR EACH ROW
  EXECUTE FUNCTION enforce_document_owner_columns();

-- ============================================================
-- RLS: document_access
-- ============================================================
ALTER TABLE document_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Grants are visible to the owner and the grantee" ON document_access;
CREATE POLICY "Grants are visible to the owner and the grantee"
  ON document_access FOR SELECT
  USING (
    user_id = auth.uid()
    OR doc_access_role(document_id, auth.uid()) = 'owner'
  );

DROP POLICY IF EXISTS "Owner can share a document" ON document_access;
CREATE POLICY "Owner can share a document"
  ON document_access FOR INSERT
  WITH CHECK (doc_access_role(document_id, auth.uid()) = 'owner');

DROP POLICY IF EXISTS "Owner can change a grantee role" ON document_access;
CREATE POLICY "Owner can change a grantee role"
  ON document_access FOR UPDATE
  USING (doc_access_role(document_id, auth.uid()) = 'owner');

DROP POLICY IF EXISTS "Owner can revoke and grantees can leave" ON document_access;
CREATE POLICY "Owner can revoke and grantees can leave"
  ON document_access FOR DELETE
  USING (
    user_id = auth.uid()
    OR doc_access_role(document_id, auth.uid()) = 'owner'
  );

-- ============================================================
-- RLS: document_access_requests
-- ============================================================
ALTER TABLE document_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Requests visible to requester and document owner" ON document_access_requests;
CREATE POLICY "Requests visible to requester and document owner"
  ON document_access_requests FOR SELECT
  USING (
    requester_id = auth.uid()
    OR doc_access_role(document_id, auth.uid()) = 'owner'
  );

DROP POLICY IF EXISTS "Members can request access" ON document_access_requests;
CREATE POLICY "Members can request access"
  ON document_access_requests FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND status = 'pending'
    -- no point requesting what you already have
    AND doc_access_role(document_id, auth.uid()) IS NULL
  );

DROP POLICY IF EXISTS "Owner can decide access requests" ON document_access_requests;
CREATE POLICY "Owner can decide access requests"
  ON document_access_requests FOR UPDATE
  USING (doc_access_role(document_id, auth.uid()) = 'owner');

DROP POLICY IF EXISTS "Requester can withdraw a request" ON document_access_requests;
CREATE POLICY "Requester can withdraw a request"
  ON document_access_requests FOR DELETE
  USING (
    requester_id = auth.uid()
    OR doc_access_role(document_id, auth.uid()) = 'owner'
  );

-- ============================================================
-- Discovery RPC
-- A restricted document must be *visible but not readable* — you
-- can see it exists and ask for access, but not read it. Row-level
-- RLS cannot express that, so listing goes through this function:
-- it returns metadata for every document on the entity, omits the
-- scraped content entirely, and nulls storage_path when the caller
-- has no access (no signed URL without a path).
-- ============================================================
-- The RPC bypasses RLS, so it has to re-check the parent itself: a private
-- project's documents must not be listable by anyone who knows the project id.
CREATE OR REPLACE FUNCTION can_view_document_parent(p_entity_type TEXT, p_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE p_entity_type
    WHEN 'grant' THEN EXISTS (
      SELECT 1 FROM grants g
      WHERE g.id = p_entity_id
        AND (g.is_active = TRUE OR auth.uid() IS NOT NULL)
    )
    WHEN 'project' THEN EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_entity_id
        AND (
          p.is_public = TRUE
          OR p.owner_id = auth.uid()
          OR is_project_member(p.id, auth.uid())
        )
    )
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION get_entity_documents(p_entity_type TEXT, p_entity_id UUID)
RETURNS TABLE (
  id UUID,
  entity_type TEXT,
  entity_id UUID,
  owner_id UUID,
  owner_name TEXT,
  owner_avatar_url TEXT,
  title TEXT,
  description TEXT,
  storage_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  visibility TEXT,
  has_content BOOLEAN,
  extraction_status TEXT,
  extraction_error TEXT,
  extracted_field_count INTEGER,
  my_role TEXT,
  pending_request BOOLEAN,
  open_request_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    d.id,
    d.entity_type,
    d.entity_id,
    d.owner_id,
    p.display_name,
    p.avatar_url,
    d.title,
    d.description,
    CASE WHEN doc_access_role(d.id, auth.uid()) IS NULL THEN NULL ELSE d.storage_path END,
    d.file_name,
    d.mime_type,
    d.file_size,
    d.visibility,
    (d.content_html IS NOT NULL AND length(d.content_html) > 0),
    d.extraction_status,
    CASE WHEN doc_access_role(d.id, auth.uid()) IS NULL THEN NULL ELSE d.extraction_error END,
    (SELECT count(*)::INTEGER FROM jsonb_object_keys(d.extracted_fields)),
    doc_access_role(d.id, auth.uid()),
    EXISTS (
      SELECT 1 FROM document_access_requests r
      WHERE r.document_id = d.id AND r.requester_id = auth.uid() AND r.status = 'pending'
    ),
    CASE
      WHEN doc_access_role(d.id, auth.uid()) = 'owner' THEN (
        SELECT count(*)::INTEGER FROM document_access_requests r
        WHERE r.document_id = d.id AND r.status = 'pending'
      )
      ELSE 0
    END,
    d.created_at,
    d.updated_at
  FROM entity_documents d
  LEFT JOIN profiles p ON p.id = d.owner_id
  WHERE d.entity_type = p_entity_type
    AND d.entity_id = p_entity_id
    AND can_view_document_parent(p_entity_type, p_entity_id)
    -- A private document is invisible to everyone but those with access.
    -- Anything else at least announces itself so access can be requested.
    AND (d.visibility <> 'private' OR doc_access_role(d.id, auth.uid()) IS NOT NULL)
  ORDER BY d.created_at DESC;
$$;

-- ============================================================
-- Approving a request grants access and closes the request in one
-- step, so the client cannot leave the two out of sync.
-- ============================================================
CREATE OR REPLACE FUNCTION decide_document_access_request(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_role TEXT DEFAULT 'viewer'
)
RETURNS document_access_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request document_access_requests;
BEGIN
  SELECT * INTO v_request FROM document_access_requests WHERE id = p_request_id;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF doc_access_role(v_request.document_id, auth.uid()) <> 'owner' THEN
    RAISE EXCEPTION 'Only the document owner can decide access requests';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request has already been decided';
  END IF;

  IF p_approve THEN
    IF p_role NOT IN ('viewer', 'editor') THEN
      RAISE EXCEPTION 'Invalid role';
    END IF;

    INSERT INTO document_access (document_id, user_id, role, granted_by)
    VALUES (v_request.document_id, v_request.requester_id, p_role, auth.uid())
    ON CONFLICT (document_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE document_access_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
      granted_role = CASE WHEN p_approve THEN p_role ELSE NULL END,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

-- ============================================================
-- PRIVATE bucket for uploaded documents.
-- Path convention: {ownerId}/{entityType}/{entityId}/{ts}_{fileName}
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'entity-documents',
  'entity-documents',
  FALSE,
  26214400, -- 25MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/markdown',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload own entity documents" ON storage.objects;
CREATE POLICY "Users can upload own entity documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'entity-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Entity documents readable by those with access" ON storage.objects;
CREATE POLICY "Entity documents readable by those with access"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'entity-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR EXISTS (
        SELECT 1 FROM entity_documents d
        WHERE d.storage_path = storage.objects.name
          AND can_view_document(d.id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete own entity documents" ON storage.objects;
CREATE POLICY "Users can delete own entity documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'entity-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    )
  );

-- ============================================================
-- 049_connection_count_visibility.sql
-- ============================================================

-- ============================================================
-- Migration 049: Connection count + visibility control
-- 1. profiles.connection_count_visibility — who may see how many
--    connections a member has ('public' | 'connections' | 'private').
-- 2. get_connection_count(uuid) — single-profile count, returns
--    NULL when the viewer is not allowed to see it.
-- 3. get_connection_counts(uuid[]) — batch variant for the member
--    directory (one round trip instead of N).
-- The connections table's RLS only lets the two parties read a row,
-- so counting another member's connections is impossible from the
-- client. These SECURITY DEFINER functions are the only read path
-- and they enforce the visibility setting themselves.
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS connection_count_visibility TEXT NOT NULL DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_connection_count_visibility_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_connection_count_visibility_check
      CHECK (connection_count_visibility IN ('public', 'connections', 'private'));
  END IF;
END $$;

-- ============================================================
-- Visibility gate. Own profile always visible; 'connections'
-- requires an accepted connection between viewer and target.
-- ============================================================
CREATE OR REPLACE FUNCTION can_view_connection_count(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visibility TEXT;
  v_viewer UUID := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  IF v_viewer = p_user_id THEN
    RETURN TRUE;
  END IF;

  SELECT connection_count_visibility INTO v_visibility
  FROM profiles WHERE id = p_user_id;

  IF v_visibility IS NULL OR v_visibility = 'private' THEN
    RETURN FALSE;
  END IF;
  IF v_visibility = 'public' THEN
    RETURN TRUE;
  END IF;

  -- 'connections' — mutually connected viewers only
  IF v_viewer IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM connections c
    WHERE c.status = 'accepted'
      AND (
        (c.requester_id = v_viewer AND c.addressee_id = p_user_id) OR
        (c.requester_id = p_user_id AND c.addressee_id = v_viewer)
      )
  );
END;
$$;

-- ============================================================
-- Single count. NULL = hidden from this viewer (distinct from 0).
-- ============================================================
CREATE OR REPLACE FUNCTION get_connection_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT can_view_connection_count(p_user_id) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_count
  FROM connections c
  WHERE c.status = 'accepted'
    AND (c.requester_id = p_user_id OR c.addressee_id = p_user_id);

  RETURN v_count;
END;
$$;

-- ============================================================
-- Batch count for the directory. Hidden users are omitted from
-- the result set rather than returned as NULL.
-- ============================================================
CREATE OR REPLACE FUNCTION get_connection_counts(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, connection_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  IF array_length(p_user_ids, 1) > 200 THEN
    RAISE EXCEPTION 'too many ids';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    (
      SELECT count(*)::INTEGER FROM connections c
      WHERE c.status = 'accepted'
        AND (c.requester_id = p.id OR c.addressee_id = p.id)
    )
  FROM profiles p
  WHERE p.id = ANY(p_user_ids)
    AND can_view_connection_count(p.id);
END;
$$;

REVOKE ALL ON FUNCTION can_view_connection_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_connection_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_connection_counts(UUID[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_connection_count(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_connection_counts(UUID[]) TO anon, authenticated;

-- ============================================================
-- 050_summaries_and_tags.sql
-- ============================================================

-- 050: Short summary one-liners + a tag vocabulary for resources, integrations,
-- events and projects.
--
-- Brings the remaining content entities in line with grants, which have had a
-- `summary` since 042_hero_summaries.sql. Tags follow the array pattern
-- established by 015_resource_library.sql (TEXT[] + GIN index).
--
-- Projects deliberately keep their existing `hashtags` column as the tag field
-- (001_create_projects_table.sql) — a second free-form array on the same table
-- would be ambiguous at every read site.
--
-- Idempotent: safe to re-run.

-- === Summary =================================================================
ALTER TABLE resources    ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS summary TEXT;
-- events and projects already got `summary` in 042 — these are no-ops, kept so
-- this file states the full end state.
ALTER TABLE events       ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE projects     ADD COLUMN IF NOT EXISTS summary TEXT;

-- === Tags ====================================================================
-- resources.tags exists (015) and projects.hashtags exists (001).
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE events       ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_integrations_tags ON integrations USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_events_tags       ON events       USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_projects_hashtags ON projects     USING GIN (hashtags);
-- idx_resources_tags already created in 015.

-- === Free-text search over tags ==============================================
-- `ilike` cannot be applied to a text[] column — PostgREST would emit
-- `"tags" ILIKE '%x%'` and Postgres raises 42883. A function taking the table's
-- composite type is exposed by PostgREST as a virtual, filterable column, so
-- `tags_text.ilike.%x%` can sit inside the same .or(...) as title/description.
-- Computed fields are not returned by `select('*')`, so this costs no payload.
CREATE OR REPLACE FUNCTION public.tags_text(resources) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.tags, ' ') $$;

CREATE OR REPLACE FUNCTION public.tags_text(integrations) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.tags, ' ') $$;

CREATE OR REPLACE FUNCTION public.tags_text(events) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.tags, ' ') $$;

CREATE OR REPLACE FUNCTION public.tags_text(projects) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.hashtags, ' ') $$;

GRANT EXECUTE ON FUNCTION public.tags_text(resources)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tags_text(integrations) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tags_text(events)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tags_text(projects)     TO anon, authenticated;

-- PostgREST caches the schema; without this the new computed fields are
-- invisible and every filter referencing them returns 400.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 051_submission_receipts.sql
-- ============================================================

-- 051: Submission receipts — applicants keep an immutable copy of what they sent.
--
-- Every grant application, event registration and grievance report writes one
-- receipt row holding a frozen snapshot of the answers, plus the field labels
-- needed to render them later. Receipts are written exclusively by triggers
-- (same trigger-only + read-only-RLS pattern as grant_application_events in 046),
-- so the client cannot skip, forge or backdate one.

-- ============================================================
-- Table
-- ============================================================

CREATE TABLE IF NOT EXISTS submission_receipts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('grant_application', 'event_registration', 'grievance')),
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_config JSONB,
  template_key TEXT,
  link TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_receipts_user
  ON submission_receipts(user_id, submitted_at DESC);

COMMENT ON COLUMN submission_receipts.data IS 'Frozen snapshot of the submitted answers';
COMMENT ON COLUMN submission_receipts.field_config IS 'Frozen field definitions (events.registration_fields) so labels survive later form edits';
COMMENT ON COLUMN submission_receipts.template_key IS 'Tells the renderer which label source to use';

-- ============================================================
-- RLS: read-only. Writes happen exclusively via triggers, so there
-- are deliberately no INSERT/UPDATE/DELETE policies.
-- ============================================================

ALTER TABLE submission_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own receipts" ON submission_receipts;
CREATE POLICY "Users can view own receipts" ON submission_receipts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all receipts" ON submission_receipts;
CREATE POLICY "Admins can view all receipts" ON submission_receipts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- Triggers. SECURITY DEFINER is required: submission_receipts has no
-- INSERT policy, and the notifications insert must bypass
-- send_notification()'s no-self-notification rule (a receipt IS a
-- self-notification). The check_notification_prefs BEFORE INSERT
-- trigger still applies; type 'submission_receipt' is uncategorised
-- there, so it always delivers.
-- ============================================================

CREATE OR REPLACE FUNCTION log_grant_application_receipt()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_id UUID;
  grant_title TEXT;
BEGIN
  -- Only on the draft -> submitted transition (or a row created already submitted)
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  SELECT g.title INTO grant_title FROM grants g WHERE g.id = NEW.grant_id;

  INSERT INTO submission_receipts (
    user_id, kind, source_table, source_id, title, subtitle,
    data, template_key, link, submitted_at
  )
  VALUES (
    NEW.user_id,
    'grant_application',
    'grant_applications',
    NEW.id,
    COALESCE(NULLIF(NEW.application_data->>'title', ''), 'Untitled Application'),
    grant_title,
    COALESCE(NEW.application_data, '{}'::jsonb),
    'grant_application_v1',
    '/grants/' || NEW.grant_id::text,
    NOW()
  )
  ON CONFLICT (source_table, source_id) DO NOTHING
  RETURNING id INTO receipt_id;

  IF receipt_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id,
      'submission_receipt',
      'Application received',
      'Your application to ' || COALESCE(grant_title, 'this grant') ||
        ' was submitted. A copy is saved in your dashboard.',
      '/dashboard/submissions/' || receipt_id::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grant_application_receipt ON grant_applications;
CREATE TRIGGER trg_grant_application_receipt
  AFTER INSERT OR UPDATE OF status ON grant_applications
  FOR EACH ROW EXECUTE FUNCTION log_grant_application_receipt();


CREATE OR REPLACE FUNCTION log_event_registration_receipt()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_id UUID;
  ev RECORD;
BEGIN
  SELECT e.title, e.start_date, e.registration_fields
    INTO ev
    FROM events e WHERE e.id = NEW.event_id;

  INSERT INTO submission_receipts (
    user_id, kind, source_table, source_id, title, subtitle,
    data, field_config, template_key, link, submitted_at
  )
  VALUES (
    NEW.user_id,
    'event_registration',
    'event_rsvps',
    NEW.id,
    COALESCE(ev.title, 'Event registration'),
    to_char(ev.start_date AT TIME ZONE 'UTC', 'FMMonth FMDD, YYYY'),
    COALESCE(NEW.registration_data, '{}'::jsonb),
    COALESCE(ev.registration_fields, '[]'::jsonb),
    'event_registration',
    '/events/' || NEW.event_id::text,
    NOW()
  )
  ON CONFLICT (source_table, source_id) DO NOTHING
  RETURNING id INTO receipt_id;

  IF receipt_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id,
      'submission_receipt',
      'Registration confirmed',
      'You registered for ' || COALESCE(ev.title, 'an event') ||
        '. A copy is saved in your dashboard.',
      '/dashboard/submissions/' || receipt_id::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_registration_receipt ON event_rsvps;
CREATE TRIGGER trg_event_registration_receipt
  AFTER INSERT ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION log_event_registration_receipt();


CREATE OR REPLACE FUNCTION log_grievance_receipt()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_id UUID;
  reported_name TEXT;
BEGIN
  SELECT p.display_name INTO reported_name
    FROM profiles p WHERE p.id = NEW.reported_user_id;

  INSERT INTO submission_receipts (
    user_id, kind, source_table, source_id, title, subtitle,
    data, template_key, link, submitted_at
  )
  VALUES (
    NEW.reporter_id,
    'grievance',
    'grievances',
    NEW.id,
    'Report: ' || NEW.category,
    CASE WHEN reported_name IS NOT NULL THEN 'Regarding ' || reported_name END,
    jsonb_build_object(
      'category', NEW.category,
      'description', NEW.description,
      'evidence_url', NEW.evidence_url,
      'context', NEW.context
    ),
    'grievance_v1',
    '/grievances/my-reports',
    NOW()
  )
  ON CONFLICT (source_table, source_id) DO NOTHING
  RETURNING id INTO receipt_id;

  IF receipt_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.reporter_id,
      'submission_receipt',
      'Report received',
      'Your report was submitted. A copy is saved in your dashboard.',
      '/dashboard/submissions/' || receipt_id::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grievance_receipt ON grievances;
CREATE TRIGGER trg_grievance_receipt
  AFTER INSERT ON grievances
  FOR EACH ROW EXECUTE FUNCTION log_grievance_receipt();

-- ============================================================
-- Keep the live application row matching its receipt: applicants may
-- only edit drafts. The explicit WITH CHECK is required — without it
-- Postgres reuses USING for the new row and the draft -> pending
-- submit would reject itself. Admin approve/reject uses the separate
-- admin policy from 012 and is unaffected.
-- ============================================================

DROP POLICY IF EXISTS "Users can update their own applications" ON grant_applications;
CREATE POLICY "Users can update their own applications"
  ON grant_applications FOR UPDATE
  USING (auth.uid() = user_id AND status = 'draft')
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Backfill existing submissions. No notifications for these.
-- ============================================================

INSERT INTO submission_receipts (
  user_id, kind, source_table, source_id, title, subtitle,
  data, template_key, link, submitted_at
)
SELECT
  a.user_id,
  'grant_application',
  'grant_applications',
  a.id,
  COALESCE(NULLIF(a.application_data->>'title', ''), 'Untitled Application'),
  g.title,
  COALESCE(a.application_data, '{}'::jsonb),
  'grant_application_v1',
  '/grants/' || a.grant_id::text,
  a.created_at
FROM grant_applications a
LEFT JOIN grants g ON g.id = a.grant_id
WHERE a.status <> 'draft'
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO submission_receipts (
  user_id, kind, source_table, source_id, title, subtitle,
  data, field_config, template_key, link, submitted_at
)
SELECT
  r.user_id,
  'event_registration',
  'event_rsvps',
  r.id,
  COALESCE(e.title, 'Event registration'),
  to_char(e.start_date AT TIME ZONE 'UTC', 'FMMonth FMDD, YYYY'),
  COALESCE(r.registration_data, '{}'::jsonb),
  COALESCE(e.registration_fields, '[]'::jsonb),
  'event_registration',
  '/events/' || r.event_id::text,
  r.created_at
FROM event_rsvps r
LEFT JOIN events e ON e.id = r.event_id
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO submission_receipts (
  user_id, kind, source_table, source_id, title, subtitle,
  data, template_key, link, submitted_at
)
SELECT
  gr.reporter_id,
  'grievance',
  'grievances',
  gr.id,
  'Report: ' || gr.category,
  CASE WHEN p.display_name IS NOT NULL THEN 'Regarding ' || p.display_name END,
  jsonb_build_object(
    'category', gr.category,
    'description', gr.description,
    'evidence_url', gr.evidence_url,
    'context', gr.context
  ),
  'grievance_v1',
  '/grievances/my-reports',
  gr.created_at
FROM grievances gr
LEFT JOIN profiles p ON p.id = gr.reported_user_id
ON CONFLICT (source_table, source_id) DO NOTHING;

-- ============================================================
-- 052_snippets.sql
-- ============================================================

-- ============================================================
-- Migration 052: Code Snippets & Snippet Shares
--
-- Brings the code sandbox to parity with whiteboards (019) and
-- documents (026). Before this, code lived only in localStorage
-- under `ktip_sandbox_${language}` — per-browser, unshareable.
--
-- Mirrors 026_documents.sql, with two corrections learned from it:
--   * `permission` ships in the initial table (whiteboards needed
--     a follow-up migration 020 to add it; documents still lack it).
--   * `status` ships too, so snippet shares are pending-by-default
--     from day one — see 053 for the same change to the other two.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled Snippet',
  language TEXT NOT NULL DEFAULT 'javascript'
    CHECK (language IN ('javascript','python','html','css','json','markdown')),
  content TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snippets_owner ON snippets(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS snippet_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view','edit')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(snippet_id, shared_with)
);

CREATE INDEX IF NOT EXISTS idx_snippet_shares_shared_with ON snippet_shares(shared_with, status);
CREATE INDEX IF NOT EXISTS idx_snippet_shares_snippet ON snippet_shares(snippet_id);

-- ============================================================
-- Row Level Security: snippets
-- ============================================================

ALTER TABLE snippets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own snippets" ON snippets;
CREATE POLICY "Users can view own snippets"
  ON snippets FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can create own snippets" ON snippets;
CREATE POLICY "Users can create own snippets"
  ON snippets FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own snippets" ON snippets;
CREATE POLICY "Users can update own snippets"
  ON snippets FOR UPDATE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own snippets" ON snippets;
CREATE POLICY "Users can delete own snippets"
  ON snippets FOR DELETE
  USING (auth.uid() = owner_id);

-- An invite only grants access once the recipient accepts it. A pending or
-- declined share is visible in their /invitations inbox (via snippet_shares)
-- but does not expose the snippet body.
DROP POLICY IF EXISTS "Shared users can view snippets" ON snippets;
CREATE POLICY "Shared users can view snippets"
  ON snippets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM snippet_shares
      WHERE snippet_shares.snippet_id = snippets.id
        AND snippet_shares.shared_with = auth.uid()
        AND snippet_shares.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "Shared editors can update snippets" ON snippets;
CREATE POLICY "Shared editors can update snippets"
  ON snippets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM snippet_shares
      WHERE snippet_shares.snippet_id = snippets.id
        AND snippet_shares.shared_with = auth.uid()
        AND snippet_shares.status = 'accepted'
        AND snippet_shares.permission = 'edit'
    )
  );

-- ============================================================
-- Row Level Security: snippet_shares
-- ============================================================

ALTER TABLE snippet_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view sent snippet shares" ON snippet_shares;
CREATE POLICY "Users can view sent snippet shares"
  ON snippet_shares FOR SELECT
  USING (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Users can view own snippet shares" ON snippet_shares;
CREATE POLICY "Users can view own snippet shares"
  ON snippet_shares FOR SELECT
  USING (auth.uid() = shared_with);

DROP POLICY IF EXISTS "Authenticated users can create snippet shares" ON snippet_shares;
CREATE POLICY "Authenticated users can create snippet shares"
  ON snippet_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Share creator can update snippet shares" ON snippet_shares;
CREATE POLICY "Share creator can update snippet shares"
  ON snippet_shares FOR UPDATE
  USING (auth.uid() = shared_by)
  WITH CHECK (auth.uid() = shared_by);

-- The recipient responds to the invite. The WITH CHECK keeps them on their own
-- row; restricting them to the `status` column needs a trigger, since RLS
-- cannot express "may change this column but not that one" — 053 installs
-- `guard_share_recipient_update()` across all three share tables.
DROP POLICY IF EXISTS "Recipient can respond to snippet share" ON snippet_shares;
CREATE POLICY "Recipient can respond to snippet share"
  ON snippet_shares FOR UPDATE
  USING (auth.uid() = shared_with)
  WITH CHECK (auth.uid() = shared_with);

DROP POLICY IF EXISTS "Users can manage own snippet shares" ON snippet_shares;
CREATE POLICY "Users can manage own snippet shares"
  ON snippet_shares FOR DELETE
  USING (auth.uid() = shared_by OR auth.uid() = shared_with);

-- ============================================================
-- updated_at trigger (reuses update_updated_at_column() from 001)
-- ============================================================

DROP TRIGGER IF EXISTS set_snippets_updated_at ON snippets;
CREATE TRIGGER set_snippets_updated_at
  BEFORE UPDATE ON snippets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 053_collab_invites.sql
-- ============================================================

-- ============================================================
-- Migration 053: Collaboration invites — pending-by-default shares
--
-- Sharing a whiteboard or document used to grant access the instant the row
-- was inserted; the recipient was told after the fact by a notification and
-- had no say. This turns every share into an invitation the recipient
-- accepts or declines from /invitations.
--
-- Also backfills `document_shares.permission`, which 026 never added even
-- though whiteboards (020) and snippets (052) both have it.
--
-- ORDER MATTERS: columns are added and existing rows backfilled to
-- 'accepted' BEFORE the SELECT policies start requiring it. Reversing this
-- would silently revoke every share already in the database.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------

ALTER TABLE whiteboard_shares
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','accepted','declined'));

ALTER TABLE document_shares
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','accepted','declined'));

ALTER TABLE document_shares
  ADD COLUMN IF NOT EXISTS permission TEXT NOT NULL DEFAULT 'view'
  CHECK (permission IN ('view','edit'));

-- ------------------------------------------------------------
-- 2. Backfill — everything that already existed was live access
-- ------------------------------------------------------------
-- Guarded on created_at so a re-run cannot resurrect invitations a
-- recipient has since declined, or silently accept ones still pending.

DO $$
DECLARE
  cutoff TIMESTAMPTZ := now();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '_collab_invite_backfill_done'
  ) THEN
    UPDATE whiteboard_shares SET status = 'accepted'
      WHERE status = 'pending' AND created_at < cutoff;
    UPDATE document_shares SET status = 'accepted'
      WHERE status = 'pending' AND created_at < cutoff;
    -- Marker table: a re-run of this migration must not re-accept rows.
    CREATE TABLE public._collab_invite_backfill_done (done BOOLEAN NOT NULL DEFAULT TRUE);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whiteboard_shares_pending
  ON whiteboard_shares(shared_with, status);
CREATE INDEX IF NOT EXISTS idx_document_shares_pending
  ON document_shares(shared_with, status);

-- ------------------------------------------------------------
-- 3. Column guard for the recipient's UPDATE
-- ------------------------------------------------------------
-- RLS can restrict which ROWS a recipient may update but not which COLUMNS.
-- Without this a recipient could accept an invite and, in the same statement,
-- promote themselves from 'view' to 'edit'.

CREATE OR REPLACE FUNCTION guard_share_recipient_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The share's owner may change anything; only the recipient is constrained.
  IF auth.uid() = OLD.shared_by THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.shared_with THEN
    IF NEW.permission IS DISTINCT FROM OLD.permission
       OR NEW.shared_with IS DISTINCT FROM OLD.shared_with
       OR NEW.shared_by   IS DISTINCT FROM OLD.shared_by THEN
      RAISE EXCEPTION 'Recipients may only change the status of a share';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_whiteboard_share_update ON whiteboard_shares;
CREATE TRIGGER guard_whiteboard_share_update
  BEFORE UPDATE ON whiteboard_shares
  FOR EACH ROW EXECUTE FUNCTION guard_share_recipient_update();

DROP TRIGGER IF EXISTS guard_document_share_update ON document_shares;
CREATE TRIGGER guard_document_share_update
  BEFORE UPDATE ON document_shares
  FOR EACH ROW EXECUTE FUNCTION guard_share_recipient_update();

DROP TRIGGER IF EXISTS guard_snippet_share_update ON snippet_shares;
CREATE TRIGGER guard_snippet_share_update
  BEFORE UPDATE ON snippet_shares
  FOR EACH ROW EXECUTE FUNCTION guard_share_recipient_update();

-- ------------------------------------------------------------
-- 4. Recipients may respond to their own invitations
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Recipient can respond to whiteboard share" ON whiteboard_shares;
CREATE POLICY "Recipient can respond to whiteboard share"
  ON whiteboard_shares FOR UPDATE
  USING (auth.uid() = shared_with)
  WITH CHECK (auth.uid() = shared_with);

DROP POLICY IF EXISTS "Recipient can respond to document share" ON document_shares;
CREATE POLICY "Recipient can respond to document share"
  ON document_shares FOR UPDATE
  USING (auth.uid() = shared_with)
  WITH CHECK (auth.uid() = shared_with);

-- 019/026 left the owner's UPDATE policy without a WITH CHECK, so an owner
-- could rewrite a row into one they no longer own. Restate both with one.
DROP POLICY IF EXISTS "Share creator can update shares" ON whiteboard_shares;
CREATE POLICY "Share creator can update shares"
  ON whiteboard_shares FOR UPDATE
  USING (auth.uid() = shared_by)
  WITH CHECK (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Share creator can update shares" ON document_shares;
CREATE POLICY "Share creator can update shares"
  ON document_shares FOR UPDATE
  USING (auth.uid() = shared_by)
  WITH CHECK (auth.uid() = shared_by);

-- A recipient may withdraw from a collaboration, not just the sender.
DROP POLICY IF EXISTS "Users can manage own shares" ON whiteboard_shares;
CREATE POLICY "Users can manage own shares"
  ON whiteboard_shares FOR DELETE
  USING (auth.uid() = shared_by OR auth.uid() = shared_with);

DROP POLICY IF EXISTS "Users can manage own shares" ON document_shares;
CREATE POLICY "Users can manage own shares"
  ON document_shares FOR DELETE
  USING (auth.uid() = shared_by OR auth.uid() = shared_with);

-- ------------------------------------------------------------
-- 5. Access requires an ACCEPTED invitation
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view shared whiteboards" ON whiteboards;
CREATE POLICY "Users can view shared whiteboards"
  ON whiteboards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_shares
      WHERE whiteboard_shares.whiteboard_id = whiteboards.id
        AND whiteboard_shares.shared_with = auth.uid()
        AND whiteboard_shares.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "Shared editors can update whiteboards" ON whiteboards;
CREATE POLICY "Shared editors can update whiteboards"
  ON whiteboards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_shares
      WHERE whiteboard_shares.whiteboard_id = whiteboards.id
        AND whiteboard_shares.shared_with = auth.uid()
        AND whiteboard_shares.status = 'accepted'
        AND whiteboard_shares.permission = 'edit'
    )
  );

DROP POLICY IF EXISTS "Shared users can view documents" ON documents;
CREATE POLICY "Shared users can view documents"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_shares.document_id = documents.id
        AND document_shares.shared_with = auth.uid()
        AND document_shares.status = 'accepted'
    )
  );

-- Documents gain shared-edit, matching whiteboards and snippets.
DROP POLICY IF EXISTS "Shared editors can update documents" ON documents;
CREATE POLICY "Shared editors can update documents"
  ON documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_shares.document_id = documents.id
        AND document_shares.shared_with = auth.uid()
        AND document_shares.status = 'accepted'
        AND document_shares.permission = 'edit'
    )
  );

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 054_email_invites.sql
-- ============================================================

-- ============================================================
-- Migration 054: Email invitations
--
-- Every invite path before this required the recipient to already have a
-- KTIP account, discoverable by display-name search. This adds token-based
-- invitations addressed to an email, so a partner who has never signed up
-- can be brought straight into a whiteboard, document or snippet.
--
-- Tokens are minted server-side by api/invite/send.ts (service role) and
-- redeemed through a SECURITY DEFINER RPC. The table itself is never
-- readable by token from the client — knowing a token must not be enough to
-- read who else was invited.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL DEFAULT 'platform'
    CHECK (resource_type IN ('whiteboard','document','snippet','platform')),
  resource_id UUID,
  resource_title TEXT,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view','edit')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days',
  accepted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A 'platform' invite carries no resource; every other kind must.
  CONSTRAINT email_invites_resource_present
    CHECK ((resource_type = 'platform') = (resource_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_email_invites_inviter
  ON email_invites(invited_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_invites_email
  ON email_invites(lower(email), status);

-- ------------------------------------------------------------
-- RLS — the inviter sees and revokes their own invites. Nobody reads
-- by token; redemption goes through redeem_email_invite() below.
-- ------------------------------------------------------------

ALTER TABLE email_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inviter can view own invites" ON email_invites;
CREATE POLICY "Inviter can view own invites"
  ON email_invites FOR SELECT
  USING (auth.uid() = invited_by);

DROP POLICY IF EXISTS "Inviter can revoke own invites" ON email_invites;
CREATE POLICY "Inviter can revoke own invites"
  ON email_invites FOR UPDATE
  USING (auth.uid() = invited_by)
  WITH CHECK (auth.uid() = invited_by);

DROP POLICY IF EXISTS "Inviter can delete own invites" ON email_invites;
CREATE POLICY "Inviter can delete own invites"
  ON email_invites FOR DELETE
  USING (auth.uid() = invited_by);

-- No INSERT policy: rows are created only by api/invite/send.ts using the
-- service role, which bypasses RLS. A client cannot mint its own token.

-- ------------------------------------------------------------
-- Redemption
-- ------------------------------------------------------------
-- Returns a JSON envelope rather than raising, so the /join page can tell
-- "expired" apart from "wrong account" and say something useful.

CREATE OR REPLACE FUNCTION redeem_email_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv        email_invites%ROWTYPE;
  caller     UUID := auth.uid();
  caller_mail TEXT := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
  IF caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO inv FROM email_invites WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF inv.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;

  IF inv.expires_at < now() THEN
    UPDATE email_invites SET status = 'expired' WHERE id = inv.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  -- The token is addressed to one mailbox. Forwarding it does not transfer it.
  IF caller_mail <> lower(inv.email) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_account',
                              'email', inv.email);
  END IF;

  -- Already redeemed by this same person: idempotent, just send them onward.
  IF inv.status = 'accepted' AND inv.accepted_by = caller THEN
    RETURN jsonb_build_object('ok', true, 'resource_type', inv.resource_type,
                              'resource_id', inv.resource_id);
  END IF;

  IF inv.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_used');
  END IF;

  -- The invitee explicitly followed the link, so the share lands accepted —
  -- there is nothing left to confirm in /invitations.
  IF inv.resource_type = 'whiteboard' THEN
    INSERT INTO whiteboard_shares (whiteboard_id, shared_with, shared_by, permission, status)
    VALUES (inv.resource_id, caller, inv.invited_by, inv.permission, 'accepted')
    ON CONFLICT (whiteboard_id, shared_with)
    DO UPDATE SET status = 'accepted', permission = EXCLUDED.permission;

  ELSIF inv.resource_type = 'document' THEN
    INSERT INTO document_shares (document_id, shared_with, shared_by, permission, status)
    VALUES (inv.resource_id, caller, inv.invited_by, inv.permission, 'accepted')
    ON CONFLICT (document_id, shared_with)
    DO UPDATE SET status = 'accepted', permission = EXCLUDED.permission;

  ELSIF inv.resource_type = 'snippet' THEN
    INSERT INTO snippet_shares (snippet_id, shared_with, shared_by, permission, status)
    VALUES (inv.resource_id, caller, inv.invited_by, inv.permission, 'accepted')
    ON CONFLICT (snippet_id, shared_with)
    DO UPDATE SET status = 'accepted', permission = EXCLUDED.permission;
  END IF;

  UPDATE email_invites
     SET status = 'accepted', accepted_by = caller, accepted_at = now()
   WHERE id = inv.id;

  -- Tell the inviter their invite landed. Bypasses send_notification()'s
  -- self-notify guard deliberately: auth.uid() here is the invitee.
  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    inv.invited_by,
    'invite_accepted',
    'Invitation accepted',
    coalesce(inv.email, 'Someone') || ' accepted your invitation'
      || CASE WHEN inv.resource_title IS NULL THEN '' ELSE ' to "' || inv.resource_title || '"' END,
    '/invitations'
  );

  RETURN jsonb_build_object('ok', true, 'resource_type', inv.resource_type,
                            'resource_id', inv.resource_id);
END;
$$;

REVOKE ALL ON FUNCTION redeem_email_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_email_invite(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- Email -> user lookup, for api/invite/send.ts
-- ------------------------------------------------------------
-- Lets the invite endpoint tell "already a member" from "needs an account",
-- so an existing user is never emailed a signup link.
--
-- This is an email-enumeration oracle, so it is granted to service_role ONLY.
-- Never grant it to `authenticated` or `anon`.

CREATE OR REPLACE FUNCTION get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_user_id_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_user_id_by_email(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_id_by_email(TEXT) TO service_role;

-- ------------------------------------------------------------
-- Register the new notification types
-- ------------------------------------------------------------
-- 036's type -> category map falls through to TRUE for unknown types, so any
-- type missing here bypasses the user's preferences entirely. Restated in
-- full with the invite types folded into 'collaboration'.

CREATE OR REPLACE FUNCTION enforce_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  category_enabled BOOLEAN;
BEGIN
  SELECT CASE
    WHEN NEW.type IN ('video_invite', 'whiteboard_share', 'document_share',
                      'snippet_share', 'collab_invite', 'invite_accepted',
                      'document_access_request', 'document_access_result') THEN collaboration
    WHEN NEW.type IN ('project_invite', 'project_update', 'project_follow') THEN projects
    WHEN NEW.type IN ('connection_request', 'connection_accepted') THEN connections
    WHEN NEW.type IN ('message') THEN messages
    WHEN NEW.type IN ('event_reminder', 'event_update') THEN events
    WHEN NEW.type IN ('forum_reply') THEN forums
    ELSE TRUE
  END
  INTO category_enabled
  FROM notification_preferences
  WHERE user_id = NEW.user_id;

  IF category_enabled = FALSE THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 055_personalization.sql
-- ============================================================

-- ============================================================
-- Migration 055: Personalization settings + topic taxonomy
--
-- 1. user_personalization — the row behind Settings › Personalization:
--    a master switch, per-signal-group opt-outs, and the explicit
--    picks the member makes.
--
--    The picks are stored in the *content* vocabulary (real stored
--    tags, the shared project/resource category enum, and the
--    resource/event/grant type enums) rather than in the profile
--    suggestion vocabulary, so they can be compared to content rows
--    with `&&` instead of guessed at.
--
-- 2. topic_aliases + normalize_topic() + expand_topics() — the bridge
--    across the three disjoint vocabularies already in
--    src/lib/constants.ts: INTEREST_SUGGESTIONS ("AgriTech"),
--    SKILL_SUGGESTIONS ("Agriculture Technology") and INDUSTRIES
--    ("Agriculture & Agri-processing") all mean the content tag
--    "agriculture", and nothing in the codebase knows that.
--
--    Deliberately DATA, not code: an OECS admin retunes the mapping
--    with an INSERT or UPDATE, no deploy. And it only ever runs on
--    the *user* side of a comparison — content tags are never
--    rewritten, so there is no backfill and no sync obligation.
--
-- No scoring here; 061 adds that. Applying this file alone changes
-- nothing any existing screen renders.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_personalization (
  user_id              UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  -- Master switch. When false the ranker returns nothing and every
  -- surface falls back to its existing server-side ordering.
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,

  -- Per-signal-group opt-outs, so a member can keep personalization
  -- on while excluding, say, their browsing behaviour.
  use_profile_signals  BOOLEAN NOT NULL DEFAULT TRUE,
  use_behavior_signals BOOLEAN NOT NULL DEFAULT TRUE,
  use_badge_signals    BOOLEAN NOT NULL DEFAULT TRUE,

  climate_focus        BOOLEAN NOT NULL DEFAULT FALSE,

  -- Real stored tags: 'agriculture', 'blue economy', 'funding'.
  topics        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- projects.category and resources.category share one enum, so a
  -- single array covers both: 'technology' | 'healthcare' |
  -- 'education' | 'agriculture' | 'environment' | 'climate_action' |
  -- 'business' | 'other'
  categories    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Namespaced, because 'education' is BOTH a resource category and a
  -- grant type: 'resource:guide', 'event:workshop', 'grant:startup'.
  content_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_personalization_topics_len
    CHECK (coalesce(array_length(topics, 1), 0) <= 40),
  CONSTRAINT user_personalization_categories_len
    CHECK (coalesce(array_length(categories, 1), 0) <= 20),
  CONSTRAINT user_personalization_types_len
    CHECK (coalesce(array_length(content_types, 1), 0) <= 30)
);

CREATE INDEX IF NOT EXISTS idx_user_personalization_topics
  ON user_personalization USING GIN (topics);

DROP TRIGGER IF EXISTS set_user_personalization_updated_at ON user_personalization;
CREATE TRIGGER set_user_personalization_updated_at
  BEFORE UPDATE ON user_personalization
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_personalization ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own personalization" ON user_personalization;
CREATE POLICY "Users can view own personalization"
  ON user_personalization FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own personalization" ON user_personalization;
CREATE POLICY "Users can create own personalization"
  ON user_personalization FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own personalization" ON user_personalization;
CREATE POLICY "Users can update own personalization"
  ON user_personalization FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- "Reset personalization" in Settings deletes the row rather than
-- writing empty arrays, so the defaults live in exactly one place:
-- the column definitions above.
DROP POLICY IF EXISTS "Users can delete own personalization" ON user_personalization;
CREATE POLICY "Users can delete own personalization"
  ON user_personalization FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- Topic normalisation
-- ============================================================

-- Folds the punctuation differences between the vocabularies:
--   'UX/UI Design'                  -> 'ux ui design'
--   'Policy & Governance'           -> 'policy governance'
--   'Agriculture & Agri-processing' -> 'agriculture agri processing'
--   'climate_action'                -> 'climate action'
-- IMMUTABLE so it can be used in index expressions later if needed.
CREATE OR REPLACE FUNCTION normalize_topic(p_value TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(lower(btrim(coalesce(p_value, ''))), '[&/,._#-]+', ' ', 'g'),
      '\s+', ' ', 'g'
    ), '')
$$;

-- ============================================================
-- Alias dictionary
--
-- Composite PK rather than `alias` alone: one interest legitimately
-- fans out to several content tags ("Climate Adaptation" is climate
-- AND environment), and collapsing that to a single canonical would
-- throw away the broader match.
-- ============================================================

CREATE TABLE IF NOT EXISTS topic_aliases (
  alias      TEXT NOT NULL,   -- already normalized, i.e. normalize_topic() applied
  canonical  TEXT NOT NULL,   -- a real content tag or category value
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (alias, canonical)
);

CREATE INDEX IF NOT EXISTS idx_topic_aliases_canonical ON topic_aliases (canonical);

ALTER TABLE topic_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Topic aliases readable by everyone" ON topic_aliases;
CREATE POLICY "Topic aliases readable by everyone"
  ON topic_aliases FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "OECS admins manage topic aliases" ON topic_aliases;
CREATE POLICY "OECS admins manage topic aliases"
  ON topic_aliases FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.roles @> ARRAY['oecs']::text[]
    )
  );

-- Seed: every INTEREST_SUGGESTIONS / SKILL_SUGGESTIONS / INDUSTRIES
-- value with a plausible equivalent in CONTENT_TAG_SUGGESTIONS,
-- PROJECT_CATEGORIES or RESOURCE_CATEGORY_LABELS. Aliases are written
-- pre-normalized so the lookup is a plain equality join.
INSERT INTO topic_aliases (alias, canonical) VALUES
  -- --- interests -------------------------------------------------
  ('agritech',                        'agriculture'),
  ('climate adaptation',              'climate'),
  ('climate adaptation',              'environment'),
  ('digital transformation',          'technology'),
  ('youth entrepreneurship',          'startup'),
  ('sustainable tourism',             'tourism'),
  ('sustainable tourism',             'environment'),
  ('blue economy',                    'blue economy'),
  ('blue economy',                    'environment'),
  ('renewable energy',                'renewable energy'),
  ('renewable energy',                'environment'),
  ('social innovation',               'community'),
  ('social innovation',               'policy'),
  ('artificial intelligence',         'technology'),
  ('artificial intelligence',         'data'),
  ('circular economy',                'environment'),
  ('food security',                   'agriculture'),
  ('health innovation',               'healthtech'),
  ('health innovation',               'healthcare'),
  ('creative industries',             'creative industries'),
  ('financial inclusion',             'fintech'),
  ('smart cities',                    'technology'),
  ('ocean conservation',              'blue economy'),
  ('ocean conservation',              'environment'),

  -- --- skills ----------------------------------------------------
  ('software development',            'technology'),
  ('software development',            'open source'),
  ('data science',                    'data'),
  ('data science',                    'technology'),
  ('ux ui design',                    'technology'),
  ('project management',              'business'),
  ('marketing',                       'business'),
  ('finance',                         'fintech'),
  ('finance',                         'funding'),
  ('agriculture technology',          'agriculture'),
  ('marine conservation',             'blue economy'),
  ('climate resilience',              'climate'),
  ('education technology',            'education'),
  ('healthcare innovation',           'healthtech'),
  ('healthcare innovation',           'healthcare'),
  ('tourism innovation',              'tourism'),
  ('business strategy',               'business'),
  ('community development',           'community'),
  ('policy governance',               'policy'),
  ('creative arts',                   'creative industries'),
  ('supply chain',                    'business'),
  ('water management',                'environment'),
  ('disaster preparedness',           'climate'),

  -- --- industries ------------------------------------------------
  ('agriculture agri processing',     'agriculture'),
  ('tourism hospitality',             'tourism'),
  ('ict digital services',            'technology'),
  ('blue economy fisheries',          'blue economy'),
  ('health wellness',                 'healthcare'),
  ('education training',              'education'),
  ('financial services',              'fintech'),
  ('manufacturing',                   'business'),
  ('climate resilience environment',  'climate'),
  ('climate resilience environment',  'environment'),
  ('transport logistics',             'business'),

  -- --- category enum <-> tag reconciliation ----------------------
  -- resources.category = 'climate_action' normalizes to
  -- 'climate action'; the tag corpus spells it 'climate'.
  ('climate action',                  'climate'),
  ('climate',                         'climate action')
ON CONFLICT (alias, canonical) DO NOTHING;

-- Expand a raw list (profile interests/skills/industry, or the
-- member's own topic picks) into the canonical content vocabulary.
-- Always keeps the normalized original, so an exact tag match still
-- works for anything the dictionary has never heard of.
CREATE OR REPLACE FUNCTION expand_topics(p_values TEXT[])
RETURNS TEXT[]
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT s.t), ARRAY[]::TEXT[])
  FROM (
    SELECT normalize_topic(v) AS t
      FROM unnest(coalesce(p_values, ARRAY[]::TEXT[])) v
    UNION
    SELECT normalize_topic(a.canonical)
      FROM unnest(coalesce(p_values, ARRAY[]::TEXT[])) v
      JOIN topic_aliases a ON a.alias = normalize_topic(v)
  ) s
  WHERE s.t IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION normalize_topic(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION expand_topics(TEXT[])  TO anon, authenticated;

-- PostgREST caches the schema; without this the new table is invisible.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 056_email_aliases.sql
-- ============================================================

-- ============================================================
-- Migration 056: Secondary email addresses (login aliases)
--
-- If a member's primary inbox is shut off — a work address after they leave a
-- job, a lapsed domain — their account becomes unreachable: no password reset
-- arrives, and changing the address needs a working session first. This adds
-- ONE verified backup address per account that can also sign in and recover.
--
-- Supabase Auth allows exactly one email per user for password login, so the
-- second address cannot live in auth.users. It lives here, and api/auth/*
-- resolves it to the primary under the service role BEFORE authenticating.
-- That resolution is an email-enumeration oracle — strictly worse than
-- get_user_id_by_email() in 054, because it also yields the primary address —
-- so resolve_email_alias() is granted to service_role ONLY. Never grant it to
-- anon or authenticated.
--
-- NOTE: an alias is an IDENTIFIER, not a CREDENTIAL. Both addresses resolve to
-- one auth.users row and therefore one password hash, so changing or resetting
-- the password already covers both. Do not add a "revoke aliases on password
-- change" rule — it would be meaningless.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- Aliases
-- ------------------------------------------------------------
-- TEXT, not CITEXT: the only extension this project installs is uuid-ossp, and
-- on Supabase citext lands in the `extensions` schema — its operators would not
-- resolve inside the SECURITY DEFINER functions below, which pin
-- `SET search_path = public`. Store lowercased and index on lower(email).

CREATE TABLE IF NOT EXISTS user_email_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE is what enforces "exactly one alias per account".
  -- FK to auth.users: api/delete-account.ts removes that row, so this cascades.
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  verification_token TEXT,
  token_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  send_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_email_aliases_lowercase CHECK (email = lower(email)),
  CONSTRAINT user_email_aliases_shape
    CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND length(email) <= 254),
  -- A verified alias holds no live token.
  CONSTRAINT user_email_aliases_token_state
    CHECK (verified_at IS NULL OR verification_token IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_email_aliases_email
  ON user_email_aliases (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_email_aliases_token
  ON user_email_aliases (verification_token) WHERE verification_token IS NOT NULL;

-- ------------------------------------------------------------
-- RLS — the owner reads and removes their own alias. Nothing else.
-- ------------------------------------------------------------

ALTER TABLE user_email_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view own alias" ON user_email_aliases;
CREATE POLICY "Owner can view own alias"
  ON user_email_aliases FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner can remove own alias" ON user_email_aliases;
CREATE POLICY "Owner can remove own alias"
  ON user_email_aliases FOR DELETE
  USING (auth.uid() = user_id);

-- No INSERT and no UPDATE policy: rows are minted and mutated only by
-- api/auth/* under the service role, mirroring email_invites (054).
--
-- RLS is column-blind, so the owner CAN read their own verification_token.
-- That only lets them verify their own alias, so the risk is nil — but the
-- client hook still selects an explicit column list so the token never enters
-- browser memory in normal operation.

-- ------------------------------------------------------------
-- Rate limiting
-- ------------------------------------------------------------
-- api/auth/login-alias.ts and reset-alias.ts are UNAUTHENTICATED, so the
-- per-caller limiter in api/invite/send.ts (which keys off caller.id) cannot
-- work. Edge functions are stateless, so the counter has to live here.
--
-- Worse: those routes reach GoTrue from Vercel's egress IPs, so GoTrue's own
-- per-IP limiter sees one shared client and offers no protection. This table
-- is the ONLY limiter on those routes.

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket TEXT PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated
  ON auth_rate_limits (updated_at);

ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;
-- Deliberately zero policies. With RLS on and no policy, anon and authenticated
-- see nothing at all; only the service role (which bypasses RLS) touches it.
-- Buckets store a SHA-256 of the email, never the address itself, so this table
-- can never become a harvestable list of probed addresses.

CREATE OR REPLACE FUNCTION consume_auth_rate_limit(
  p_bucket TEXT,
  p_window_seconds INT,
  p_limit INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r auth_rate_limits%ROWTYPE;
BEGIN
  -- ON CONFLICT DO UPDATE takes a row lock, so two concurrent edge invocations
  -- cannot both act on a stale count.
  INSERT INTO auth_rate_limits (bucket, attempts, window_start, updated_at)
  VALUES (p_bucket, 1, now(), now())
  ON CONFLICT (bucket) DO UPDATE SET
    attempts = CASE
      WHEN auth_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
      THEN 1
      ELSE auth_rate_limits.attempts + 1
    END,
    window_start = CASE
      WHEN auth_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
      THEN now()
      ELSE auth_rate_limits.window_start
    END,
    updated_at = now()
  RETURNING * INTO r;

  -- Opportunistic housekeeping; this project has no pg_cron.
  IF random() < 0.01 THEN
    DELETE FROM auth_rate_limits WHERE updated_at < now() - interval '2 days';
  END IF;

  RETURN jsonb_build_object(
    'allowed', r.attempts <= p_limit,
    'retry_after', GREATEST(0, ceil(extract(epoch FROM
      (r.window_start + make_interval(secs => p_window_seconds) - now()))))::int
  );
END;
$$;

REVOKE ALL ON FUNCTION consume_auth_rate_limit(TEXT, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_auth_rate_limit(TEXT, INT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_auth_rate_limit(TEXT, INT, INT) TO service_role;

-- ------------------------------------------------------------
-- Alias -> primary resolution
-- ------------------------------------------------------------
-- An email-enumeration oracle that also discloses the primary address.
-- service_role ONLY — see the header note.
--
-- `primary_conflict` is the authoritative guard for the one invariant a CHECK
-- cannot express: "an alias is never also somebody's auth.users email". It is
-- re-evaluated on EVERY login and reset, so a signup that lands on an existing
-- alias silently wins and the alias stops working, which is the right
-- precedence.

CREATE OR REPLACE FUNCTION resolve_email_alias(p_email TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'user_id', a.user_id,
    'verified', a.verified_at IS NOT NULL,
    'primary_email', u.email,
    'primary_conflict', EXISTS (
      SELECT 1 FROM auth.users c WHERE lower(c.email) = lower(p_email)
    )
  )
  FROM user_email_aliases a
  JOIN auth.users u ON u.id = a.user_id
  WHERE lower(a.email) = lower(p_email)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_email_alias(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_email_alias(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_email_alias(TEXT) TO service_role;

-- ------------------------------------------------------------
-- Token redemption
-- ------------------------------------------------------------
-- JSON envelope rather than raising, so the verify page can tell "expired"
-- apart from "already used" — same convention as redeem_email_invite (054).
--
-- Called only by api/auth/verify-alias.ts. Unlike redeem_email_invite it does
-- NOT bind to auth.jwt()->>'email': possession of the token already proves
-- control of the alias mailbox, and account ownership was proven by the Bearer
-- token back at add-alias. There is no signed-in caller to bind to, because the
-- link is usually opened on whatever device holds the mailbox.

CREATE OR REPLACE FUNCTION verify_email_alias(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a user_email_aliases%ROWTYPE;
BEGIN
  SELECT * INTO a FROM user_email_aliases WHERE verification_token = p_token;

  IF NOT FOUND THEN
    -- Also the "already used" case: a consumed token is nulled, not stored.
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF a.token_expires_at IS NULL OR a.token_expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  -- Re-check the cross-schema invariant at the moment the row becomes
  -- login-capable. Closes the check-to-insert race in add-alias: somebody may
  -- have signed up with this address during the 24h token window.
  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(a.email)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_taken');
  END IF;

  UPDATE user_email_aliases
     SET verified_at = now(),
         verification_token = NULL,
         token_expires_at = NULL,
         updated_at = now()
   WHERE id = a.id;

  RETURN jsonb_build_object('ok', true, 'email', a.email);
END;
$$;

REVOKE ALL ON FUNCTION verify_email_alias(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION verify_email_alias(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_email_alias(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 058_employers.sql
-- ============================================================

-- ============================================================
-- Migration 058: Employers — a real employer entity
--
-- Until now "employer" was two unrelated things: the string 'private_sector'
-- inside profiles.roles, and profiles.organization — a free-text company name
-- typed at signup (041). Neither is an entity. Two people at the same company
-- produce two unlinked rows with two spellings, and nothing anywhere asserts
-- the company exists.
--
-- profiles.is_verified does NOT close that gap. It is person-level identity
-- KYC (035): an admin looked at someone's ID document — or just flipped the
-- toggle in the admin dashboard. It says nothing about their employer being a
-- real, registered business.
--
-- This migration adds that missing entity, with employer-scoped verification,
-- because api/partner/v1/employers.ts ships these rows to an external platform
-- and "verified" has to mean something there.
--
-- Address is a HIERARCHY rather than one free-text field: countries.code is the
-- stable root, and administrative_area -> locality -> address_line* hang off it.
-- profiles.country stays free text; this table does not inherit that mistake.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- Countries — the root of the address hierarchy
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS countries (
  code CHAR(2) PRIMARY KEY,
  name TEXT NOT NULL,
  is_oecs_member BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 100,
  CONSTRAINT countries_code_uppercase CHECK (code = upper(code))
);

-- OECS members and associate members first (sort_order 10), then the countries
-- most likely to appear in the diaspora / partner set. Extend as needed — the
-- admin form reads this table, so an unseeded country simply cannot be picked.
INSERT INTO countries (code, name, is_oecs_member, sort_order) VALUES
  ('AG', 'Antigua and Barbuda', TRUE, 10),
  ('DM', 'Dominica', TRUE, 10),
  ('GD', 'Grenada', TRUE, 10),
  ('KN', 'Saint Kitts and Nevis', TRUE, 10),
  ('LC', 'Saint Lucia', TRUE, 10),
  ('VC', 'Saint Vincent and the Grenadines', TRUE, 10),
  ('AI', 'Anguilla', TRUE, 10),
  ('MS', 'Montserrat', TRUE, 10),
  ('VG', 'British Virgin Islands', TRUE, 10),
  ('MQ', 'Martinique', TRUE, 10),
  ('GP', 'Guadeloupe', TRUE, 10),
  ('BB', 'Barbados', FALSE, 50),
  ('TT', 'Trinidad and Tobago', FALSE, 50),
  ('JM', 'Jamaica', FALSE, 50),
  ('GY', 'Guyana', FALSE, 50),
  ('BS', 'Bahamas', FALSE, 50),
  ('BZ', 'Belize', FALSE, 50),
  ('SR', 'Suriname', FALSE, 50),
  ('HT', 'Haiti', FALSE, 50),
  ('DO', 'Dominican Republic', FALSE, 50),
  ('US', 'United States', FALSE, 100),
  ('CA', 'Canada', FALSE, 100),
  ('GB', 'United Kingdom', FALSE, 100),
  ('FR', 'France', FALSE, 100),
  ('DE', 'Germany', FALSE, 100),
  ('NL', 'Netherlands', FALSE, 100),
  ('IN', 'India', FALSE, 100),
  ('CN', 'China', FALSE, 100),
  ('BR', 'Brazil', FALSE, 100),
  ('ZA', 'South Africa', FALSE, 100),
  ('AU', 'Australia', FALSE, 100)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Countries are viewable by everyone" ON countries;
CREATE POLICY "Countries are viewable by everyone"
  ON countries FOR SELECT
  USING (TRUE);

-- No INSERT/UPDATE/DELETE policies: this is reference data, seeded by migration
-- and edited by the service role only.

-- ------------------------------------------------------------
-- Employers
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable, human-readable external identifier. The partner keys off `id`, but
  -- slug survives a re-import if we ever have to rebuild rows.
  slug TEXT NOT NULL UNIQUE,

  legal_name TEXT NOT NULL,
  trading_name TEXT,
  industry TEXT,
  website_url TEXT,
  logo_url TEXT,
  description TEXT,

  -- Address hierarchy, coarse -> fine.
  country_code CHAR(2) NOT NULL REFERENCES countries(code) ON UPDATE CASCADE,
  administrative_area TEXT,   -- parish / state / province / region
  locality TEXT,              -- city / town / village
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,

  -- Contact. Stored lowercased so the uniqueness/lookup story matches
  -- user_email_aliases (056); same reason for TEXT over CITEXT.
  contact_email TEXT NOT NULL,
  contact_email_verified_at TIMESTAMPTZ,
  contact_phone TEXT,

  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected', 'revoked')),
  verification_method TEXT
    CHECK (verification_method IN ('document_review', 'registry_lookup', 'manual_attestation')),
  registration_number TEXT,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- INTERNAL reviewer commentary. Never exported. See src/lib/partner-payload.ts.
  verification_note TEXT,
  -- INTERNAL paths into the private verification-documents bucket (035).
  -- Never exported — the partner receives a COUNT, never a path or signed URL.
  document_paths TEXT[] NOT NULL DEFAULT '{}',
  -- Generated so the feed can report how much evidence exists WITHOUT ever
  -- selecting document_paths. Deriving the count in the mapper would mean
  -- pulling the paths into the edge function first, one typo away from a leak.
  document_count INT GENERATED ALWAYS AS (COALESCE(array_length(document_paths, 1), 0)) STORED,

  -- Consent gate for the outbound feed. Verified is not the same as
  -- willing-to-be-shared, and contact_email is real PII.
  share_externally BOOLEAN NOT NULL DEFAULT FALSE,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT employers_contact_email_lowercase CHECK (contact_email = lower(contact_email)),
  CONSTRAINT employers_contact_email_shape
    CHECK (contact_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND length(contact_email) <= 254),
  CONSTRAINT employers_slug_shape CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  -- A verified row must record HOW and WHEN. Prevents the "someone toggled a
  -- boolean" state that profiles.is_verified allows today.
  CONSTRAINT employers_verified_has_evidence
    CHECK (
      verification_status <> 'verified'
      OR (verified_at IS NOT NULL AND verification_method IS NOT NULL)
    )
);

-- One company per name per country. This is the duplicate-spelling problem that
-- free-text profiles.organization cannot solve.
CREATE UNIQUE INDEX IF NOT EXISTS ux_employers_name_country
  ON employers (lower(legal_name), country_code);

-- Feed cursor: ordered by (updated_at, id), filtered on status + share flag.
CREATE INDEX IF NOT EXISTS idx_employers_feed
  ON employers (updated_at, id)
  WHERE verification_status = 'verified' AND share_externally = TRUE;

CREATE INDEX IF NOT EXISTS idx_employers_status
  ON employers (verification_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_employers_country
  ON employers (country_code, lower(legal_name));

DROP TRIGGER IF EXISTS set_employers_updated_at ON employers;
CREATE TRIGGER set_employers_updated_at
  BEFORE UPDATE ON employers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- Employer members — links people to a company
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employer_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'recruiter'
    CHECK (role IN ('owner', 'admin', 'recruiter')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_employer_members_user ON employer_members (user_id);

-- ------------------------------------------------------------
-- Verification audit trail
-- ------------------------------------------------------------
-- The platform has no audit_log table. For a status that decides whether a row
-- is shipped to a third party, "who changed it, from what, to what, when" has
-- to be recorded — otherwise a mistaken verification is untraceable.

CREATE TABLE IF NOT EXISTS employer_verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  method TEXT,
  note TEXT,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employer_verification_events_employer
  ON employer_verification_events (employer_id, created_at DESC);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

ALTER TABLE employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_verification_events ENABLE ROW LEVEL SECURITY;

-- Verified employers are public, matching the directory's existing posture.
-- Unverified/rejected/revoked rows are visible only to their own members and
-- to OECS admins — a rejected application is not public information.
--
-- NOTE: RLS is column-blind, so a member reading their own row also reads
-- verification_note and document_paths. The outbound feed does not rely on RLS
-- for that boundary; it runs under the service role and selects an explicit
-- column list (see src/lib/partner-payload.ts).
DROP POLICY IF EXISTS "Verified employers are viewable by everyone" ON employers;
CREATE POLICY "Verified employers are viewable by everyone"
  ON employers FOR SELECT
  USING (
    verification_status = 'verified'
    OR EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = employers.id AND m.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can create employers" ON employers;
CREATE POLICY "Admins can create employers"
  ON employers FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can update employers" ON employers;
CREATE POLICY "Admins can update employers"
  ON employers FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can delete employers" ON employers;
CREATE POLICY "Admins can delete employers"
  ON employers FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- Deliberately NO member-facing UPDATE policy. If employers could edit their
-- own row, they could edit it after verification — and the feed would ship
-- attacker-controlled data under a verified badge. Self-service editing, when
-- it arrives, must reset verification_status; that belongs in an RPC, not a
-- blanket policy.

DROP POLICY IF EXISTS "Members and admins can view employer members" ON employer_members;
CREATE POLICY "Members and admins can view employer members"
  ON employer_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = employer_members.employer_id AND m.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can manage employer members" ON employer_members;
CREATE POLICY "Admins can manage employer members"
  ON employer_members FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can view verification events" ON employer_verification_events;
CREATE POLICY "Admins can view verification events"
  ON employer_verification_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- No INSERT/UPDATE/DELETE policies on the audit table. Rows are written only by
-- set_employer_verification() below, which is SECURITY DEFINER. An audit trail
-- an actor can rewrite is not an audit trail.

-- ------------------------------------------------------------
-- Verification transition
-- ------------------------------------------------------------
-- One statement, one transaction. src/hooks/useVerification.ts approves a
-- request and flips profiles.is_verified in two unguarded round-trips — a
-- failure between them leaves the two disagreeing. This does not repeat that.

CREATE OR REPLACE FUNCTION set_employer_verification(
  p_employer_id UUID,
  p_status TEXT,
  p_method TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_registration_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_from TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the role check has to be explicit here.
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_actor AND 'oecs' = ANY(roles)) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_status NOT IN ('unverified', 'pending', 'verified', 'rejected', 'revoked') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_status');
  END IF;

  IF p_status = 'verified' AND p_method IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'method_required');
  END IF;

  SELECT verification_status INTO v_from FROM employers WHERE id = p_employer_id FOR UPDATE;
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  UPDATE employers SET
    verification_status = p_status,
    verification_method = CASE WHEN p_status = 'verified' THEN p_method ELSE verification_method END,
    registration_number = COALESCE(p_registration_number, registration_number),
    verification_note   = COALESCE(p_note, verification_note),
    verified_at = CASE WHEN p_status = 'verified' THEN v_now ELSE verified_at END,
    verified_by = CASE WHEN p_status = 'verified' THEN v_actor ELSE verified_by END,
    -- Losing verified status also withdraws the row from the outbound feed.
    -- Leaving share_externally on would be a silent no-op today and a leak the
    -- moment the feed's filter changes.
    share_externally = CASE WHEN p_status = 'verified' THEN share_externally ELSE FALSE END,
    updated_at = v_now
  WHERE id = p_employer_id;

  INSERT INTO employer_verification_events (employer_id, from_status, to_status, method, note, actor_id)
  VALUES (p_employer_id, v_from, p_status, p_method, p_note, v_actor);

  RETURN jsonb_build_object('ok', TRUE, 'from_status', v_from, 'to_status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION set_employer_verification(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_employer_verification(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION set_employer_verification(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- No backfill from profiles.organization.
-- ------------------------------------------------------------
-- It is tempting to seed this table from the free-text company names already in
-- profiles. Don't. Those strings are self-reported, unnormalised, and carry no
-- verification whatsoever; auto-creating rows would fill the source table of an
-- outbound feed with unchecked data one admin click away from being shipped.
-- Employers are curated in the admin UI and linked via employer_members.

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 059_partner_api.sql
-- ============================================================

-- ============================================================
-- Migration 059: Partner API — machine authentication + access log
--
-- Every existing /api route authenticates a HUMAN: Bearer JWT -> auth.getUser()
-- -> profiles.roles.includes('oecs'). There is no way for another SYSTEM to
-- call us. api/partner/v1/employers.ts needs exactly that, so this introduces
-- the pattern rather than bending the human one.
--
-- Static API keys, hashed at rest. The plaintext key exists for the length of
-- one HTTP response at issuance and is never stored, logged, or recoverable —
-- a leaked database dump yields SHA-256 digests, not working credentials.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- API clients
-- ------------------------------------------------------------
-- Key format: ktip_<12-char prefix>_<43-char base64url secret>
--
-- The prefix is stored in the clear and is what we look up by. Without it,
-- authentication would mean scanning every row and hashing per candidate; with
-- it, the lookup is a single index hit and the prefix doubles as the display
-- label in the admin UI ("ktip_a1b2c3d4e5f6…").

CREATE TABLE IF NOT EXISTS api_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  -- e.g. {'employers:read'}. Scopes are checked at authentication time, so a
  -- key minted for one feed cannot read a future one.
  scopes TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT api_clients_prefix_shape CHECK (key_prefix ~ '^ktip_[a-z0-9]{12}$'),
  CONSTRAINT api_clients_hash_shape CHECK (key_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_api_clients_active
  ON api_clients (created_at DESC) WHERE revoked_at IS NULL;

ALTER TABLE api_clients ENABLE ROW LEVEL SECURITY;
-- Deliberately zero policies, the same posture as auth_rate_limits (056). With
-- RLS on and no policy, anon and authenticated see nothing at all; only the
-- service role touches this table. A key hash is not something a signed-in user
-- should ever be able to SELECT, however narrow the policy.

-- ------------------------------------------------------------
-- Access log
-- ------------------------------------------------------------
-- This codebase has no audit trail anywhere. For an endpoint whose entire
-- purpose is handing member PII to a third party, "who pulled what, and when"
-- is the difference between answering a data-protection question and guessing.

CREATE TABLE IF NOT EXISTS api_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES api_clients(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  status INT NOT NULL,
  record_count INT NOT NULL DEFAULT 0,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_access_log_client
  ON api_access_log (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_access_log_created
  ON api_access_log (created_at DESC);

ALTER TABLE api_access_log ENABLE ROW LEVEL SECURITY;
-- Zero policies, service role only — same reasoning. Reads happen in the SQL
-- editor or via a future admin endpoint, never from the browser.

-- ------------------------------------------------------------
-- Authentication
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION authenticate_api_client(
  p_prefix TEXT,
  p_hash TEXT,
  p_scope TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c api_clients%ROWTYPE;
BEGIN
  SELECT * INTO c FROM api_clients WHERE key_prefix = p_prefix;

  -- One uniform failure for unknown prefix, wrong secret, revoked key, and
  -- missing scope. Distinguishing them would tell a prober which of their
  -- guesses was a real client, and whether a key they hold has merely lost a
  -- scope rather than been revoked outright.
  IF c.id IS NULL
     OR c.revoked_at IS NOT NULL
     OR c.key_hash <> p_hash
     OR NOT (p_scope = ANY(c.scopes))
  THEN
    RETURN jsonb_build_object('ok', FALSE);
  END IF;

  UPDATE api_clients SET last_used_at = now() WHERE id = c.id;

  RETURN jsonb_build_object('ok', TRUE, 'client_id', c.id, 'name', c.name);
END;
$$;

REVOKE ALL ON FUNCTION authenticate_api_client(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION authenticate_api_client(TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION authenticate_api_client(TEXT, TEXT, TEXT) TO service_role;
-- service_role ONLY, for the same reason resolve_email_alias() is (056): the
-- function reveals whether a given prefix/hash pair is live. Never grant it to
-- anon or authenticated.

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 060_grants_tags.sql
-- ============================================================

-- ============================================================
-- Migration 060: grants.tags
--
-- Grants were left out of 050_summaries_and_tags.sql and are now the
-- only content entity with no tag vocabulary. Everything tag-driven
-- therefore skips them: the filter chips, useTagVocabulary, and — once
-- 061 lands — the personalization ranker, which would be left scoring
-- grants on grant_type and deadline alone. That is the highest-value
-- content on the platform, so it is the worst place to have the
-- weakest signal.
--
-- Mirrors 050 exactly: TEXT[] + GIN + a tags_text() computed column so
-- `tags_text.ilike.%x%` can sit inside the same .or(...) group as
-- title/description/eligibility.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE grants ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_grants_tags ON grants USING GIN (tags);

CREATE OR REPLACE FUNCTION public.tags_text(grants) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.tags, ' ') $$;

GRANT EXECUTE ON FUNCTION public.tags_text(grants) TO anon, authenticated;

-- Bootstrap a starting vocabulary from what is already known about each
-- grant, so the column is not dead on arrival and the chips have
-- something to show on day one. Both statements are guarded so a re-run
-- never clobbers tags an admin has curated since.
UPDATE grants
   SET tags = ARRAY['climate']
 WHERE is_climate_action = TRUE
   AND coalesce(array_length(tags, 1), 0) = 0;

UPDATE grants
   SET tags = array_append(coalesce(tags, ARRAY[]::TEXT[]), grant_type)
 WHERE grant_type IS NOT NULL
   AND NOT (grant_type = ANY(coalesce(tags, ARRAY[]::TEXT[])));

-- PostgREST caches the schema; without this `tags` and the computed
-- `tags_text` are invisible and every filter referencing them returns 400.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 061_personalization_scoring.sql
-- ============================================================

-- ============================================================
-- Migration 061: Cross-entity content index + the personalization ranker
--
-- Ranking runs here rather than in the browser because the behaviour
-- signals it reads (likes, follows, RSVPs, applications) are RLS-scoped
-- to their owner and the badge tables are trigger-written. Pulling them
-- client-side would be six extra round trips per page load and would
-- still put a member's engagement history into a shared query cache.
--
-- Two entry points, one formula:
--   rank_content(p_entity, p_ids)  scores rows a list page has ALREADY
--                                  fetched and filtered. The existing
--                                  PostgREST filter chains never move
--                                  into SQL, so there is exactly one
--                                  implementation of "what is on this
--                                  page" and one of "how good is it".
--   get_personalized_feed(...)     a standalone normalized union for the
--                                  Dashboard / Discover rail, where
--                                  there are no user filters to respect.
--
-- SECURITY DEFINER because content_index and the behaviour tables are
-- read across RLS boundaries. NEITHER function takes a user id — both
-- derive the caller from auth.uid() — so neither can be turned into a
-- "read anyone's activity" oracle.
--
-- Requires 055 (user_personalization, expand_topics) and 060 (grants.tags).
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- Normalized view over the four content entities
--
-- Visibility is baked into each branch. The view is a classic
-- (non-security_invoker) view owned by the migration role and is
-- revoked from clients, so it exists only as an internal building block
-- for the two functions below and never becomes a PostgREST endpoint.
--
-- Consequence worth knowing: private projects shared with their
-- project_members are excluded from ranking. A members-aware branch
-- would need a correlated subquery per row, which is not worth it for a
-- soft ordering nudge.
-- ============================================================

DROP VIEW IF EXISTS content_index;
CREATE VIEW content_index AS
  SELECT 'project'::TEXT                       AS entity,
         p.id,
         p.title,
         p.summary,
         coalesce(p.hashtags, ARRAY[]::TEXT[]) AS tags,
         p.category::TEXT                      AS category,
         NULL::TEXT                            AS type_key,
         coalesce(p.is_climate_action, FALSE)  AS is_climate_action,
         coalesce(p.is_featured, FALSE)        AS is_featured,
         p.created_at,
         NULL::TIMESTAMPTZ                     AS occurs_at,
         NULL::TIMESTAMPTZ                     AS deadline_at,
         p.owner_id,
         coalesce(p.view_count, 0)::NUMERIC    AS popularity
    FROM projects p
   WHERE p.is_public

  UNION ALL

  SELECT 'resource'::TEXT,
         r.id,
         r.title,
         r.summary,
         coalesce(r.tags, ARRAY[]::TEXT[]),
         r.category::TEXT,
         r.resource_type::TEXT,
         coalesce(r.is_climate_action, FALSE),
         FALSE,
         r.created_at,
         NULL::TIMESTAMPTZ,
         NULL::TIMESTAMPTZ,
         r.author_id,
         0::NUMERIC
    FROM resources r
   WHERE r.is_published

  UNION ALL

  SELECT 'event'::TEXT,
         e.id,
         e.title,
         e.summary,
         coalesce(e.tags, ARRAY[]::TEXT[]),
         NULL::TEXT,
         e.event_type::TEXT,
         coalesce(e.is_climate_action, FALSE),
         FALSE,
         e.created_at,
         e.start_date,
         NULL::TIMESTAMPTZ,
         e.organizer_id,
         0::NUMERIC
    FROM events e
   WHERE e.status <> 'draft'

  UNION ALL

  SELECT 'grant'::TEXT,
         g.id,
         g.title,
         g.summary,
         coalesce(g.tags, ARRAY[]::TEXT[]),
         NULL::TEXT,
         g.grant_type::TEXT,
         coalesce(g.is_climate_action, FALSE),
         FALSE,
         g.created_at,
         NULL::TIMESTAMPTZ,
         g.deadline,
         NULL::UUID,
         0::NUMERIC
    FROM grants g
   WHERE g.is_active;

REVOKE ALL ON content_index FROM anon, authenticated;

-- ============================================================
-- The signal bag
--
-- Everything known about the caller, resolved ONCE per statement rather
-- than once per row. Returns NULL when personalization is off, which is
-- the single switch every caller checks.
-- ============================================================

CREATE OR REPLACE FUNCTION personalization_bag(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref       user_personalization%ROWTYPE;
  v_prof       profiles%ROWTYPE;
  v_eng_cats   TEXT[] := ARRAY[]::TEXT[];
  v_eng_tags   TEXT[] := ARRAY[]::TEXT[];
  v_eng_owners UUID[] := ARRAY[]::UUID[];
  v_seen       UUID[] := ARRAY[]::UUID[];
  v_badges     TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_user IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_pref FROM user_personalization WHERE user_id = p_user;

  IF NOT FOUND THEN
    -- Never opened Settings: personalization is on with no explicit
    -- picks, so the score collapses to recency + urgency — i.e. very
    -- close to the ordering the page already had.
    v_pref.enabled              := TRUE;
    v_pref.use_profile_signals  := TRUE;
    v_pref.use_behavior_signals := TRUE;
    v_pref.use_badge_signals    := TRUE;
    v_pref.climate_focus        := FALSE;
    v_pref.topics               := ARRAY[]::TEXT[];
    v_pref.categories           := ARRAY[]::TEXT[];
    v_pref.content_types        := ARRAY[]::TEXT[];
  END IF;

  IF v_pref.enabled IS DISTINCT FROM TRUE THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_prof FROM profiles WHERE id = p_user;

  IF v_pref.use_behavior_signals THEN
    WITH engaged AS (
      SELECT ci.category, ci.tags, ci.owner_id, ci.id
        FROM content_index ci
       WHERE ci.id IN (
                 SELECT project_id FROM project_likes      WHERE user_id = p_user
           UNION SELECT project_id FROM project_follows    WHERE user_id = p_user
           UNION SELECT id         FROM projects           WHERE owner_id = p_user
           UNION SELECT event_id   FROM event_rsvps        WHERE user_id = p_user
           UNION SELECT grant_id   FROM grant_applications WHERE user_id = p_user
       )
    ),
    agg AS (
      SELECT
        coalesce(array_agg(DISTINCT normalize_topic(e.category))
                 FILTER (WHERE e.category IS NOT NULL), ARRAY[]::TEXT[]) AS cats,
        coalesce(array_agg(DISTINCT e.owner_id)
                 FILTER (WHERE e.owner_id IS NOT NULL), ARRAY[]::UUID[]) AS owners,
        coalesce(array_agg(DISTINCT e.id), ARRAY[]::UUID[])              AS ids
      FROM engaged e
    ),
    tag_agg AS (
      SELECT coalesce(array_agg(DISTINCT normalize_topic(t))
                      FILTER (WHERE normalize_topic(t) IS NOT NULL),
                      ARRAY[]::TEXT[]) AS tags
      FROM engaged e, unnest(e.tags) t
    )
    SELECT agg.cats, tag_agg.tags, agg.owners, agg.ids
      INTO v_eng_cats, v_eng_tags, v_eng_owners, v_seen
      FROM agg, tag_agg;
  END IF;

  IF v_pref.use_badge_signals THEN
    SELECT coalesce(array_agg(b.slug), ARRAY[]::TEXT[]) INTO v_badges
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id = p_user;
  END IF;

  RETURN jsonb_build_object(
    'topics',        to_jsonb(expand_topics(v_pref.topics)),
    'categories',    to_jsonb(coalesce(v_pref.categories, ARRAY[]::TEXT[])),
    'content_types', to_jsonb(coalesce(v_pref.content_types, ARRAY[]::TEXT[])),
    'climate',       coalesce(v_pref.climate_focus, FALSE),
    'country',       normalize_topic(v_prof.country),
    'roles',         to_jsonb(coalesce(v_prof.roles, ARRAY[]::TEXT[])),
    'verified',      coalesce(v_prof.is_verified, FALSE),
    'profile_topics',
      CASE WHEN v_pref.use_profile_signals THEN
        to_jsonb(expand_topics(
          coalesce(v_prof.interests, ARRAY[]::TEXT[]) ||
          coalesce(v_prof.skills,    ARRAY[]::TEXT[]) ||
          CASE WHEN v_prof.industry IS NULL
               THEN ARRAY[]::TEXT[]
               ELSE ARRAY[v_prof.industry] END))
      ELSE '[]'::JSONB END,
    'engaged_categories', to_jsonb(v_eng_cats),
    'engaged_topics',     to_jsonb(v_eng_tags),
    'engaged_owners',     to_jsonb(v_eng_owners),
    'seen',               to_jsonb(v_seen),
    'badges',             to_jsonb(v_badges)
  );
END;
$$;

-- ============================================================
-- The formula
--
-- Emits an array of {code, label, w} contributions. The caller derives
-- BOTH the score (sum of w) and the "why this matched" chip (the
-- positive contributions) from this one array, so the explanation on a
-- card can never disagree with the ordering that produced it.
--
-- Rough envelope: personal terms reach ~185, context terms ~78. A
-- perfect topic + category match on a six-month-old item still outranks
-- an untargeted grant closing tomorrow, while a partially matched grant
-- closing tomorrow outranks a stale near-perfect match. Retuning is one
-- CREATE OR REPLACE with no client deploy.
-- ============================================================

CREATE OR REPLACE FUNCTION personalization_contributions(
  p_bag         JSONB,
  p_entity      TEXT,
  p_id          UUID,
  p_tags        TEXT[],
  p_category    TEXT,
  p_type_key    TEXT,
  p_climate     BOOLEAN,
  p_featured    BOOLEAN,
  p_created_at  TIMESTAMPTZ,
  p_occurs_at   TIMESTAMPTZ,
  p_deadline_at TIMESTAMPTZ,
  p_owner_id    UUID,
  p_popularity  NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  c         JSONB  := '[]'::JSONB;
  v_topics  TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'topics', '[]'::JSONB)));
  v_ptopics TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'profile_topics', '[]'::JSONB)));
  v_cats    TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'categories', '[]'::JSONB)));
  v_types   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'content_types', '[]'::JSONB)));
  v_ecats   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'engaged_categories', '[]'::JSONB)));
  v_etags   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'engaged_topics', '[]'::JSONB)));
  v_badges  TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'badges', '[]'::JSONB)));
  v_roles   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'roles', '[]'::JSONB)));
  v_seen    JSONB  := coalesce(p_bag->'seen', '[]'::JSONB);
  v_owners  JSONB  := coalesce(p_bag->'engaged_owners', '[]'::JSONB);
  v_surface TEXT[];   -- the row's tags + category, normalized
  v_ns_type TEXT;     -- 'resource:guide', 'event:workshop', …
  v_hit     TEXT[];
  v_n       INT;
  v_days    NUMERIC;
BEGIN
  v_surface := ARRAY(
    SELECT DISTINCT normalize_topic(t)
      FROM unnest(
             coalesce(p_tags, ARRAY[]::TEXT[]) ||
             CASE WHEN p_category IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[p_category] END
           ) t
     WHERE normalize_topic(t) IS NOT NULL);

  v_ns_type := CASE WHEN p_type_key IS NULL THEN NULL ELSE p_entity || ':' || p_type_key END;

  -- ===== Explicit picks — the member literally chose these ==========
  v_hit := ARRAY(SELECT DISTINCT x FROM unnest(v_surface) x WHERE x = ANY(v_topics));
  v_n := least(coalesce(array_length(v_hit, 1), 0), 3);
  IF v_n > 0 THEN
    c := c || jsonb_build_object(
      'code', 'topic', 'w', 25 * v_n,
      'label', 'Matches your topics: ' || array_to_string(v_hit[1:v_n], ', '));
  END IF;

  IF p_category IS NOT NULL AND p_category = ANY(v_cats) THEN
    c := c || jsonb_build_object('code', 'category', 'w', 30, 'label', 'In a category you follow');
  END IF;

  IF v_ns_type IS NOT NULL AND v_ns_type = ANY(v_types) THEN
    c := c || jsonb_build_object('code', 'type', 'w', 20, 'label', 'A content type you asked for');
  END IF;

  IF coalesce((p_bag->>'climate')::BOOLEAN, FALSE) AND p_climate THEN
    c := c || jsonb_build_object('code', 'climate', 'w', 15, 'label', 'Climate action');
  END IF;

  -- ===== Profile fields — inferred, so roughly half weight ==========
  v_hit := ARRAY(
    SELECT DISTINCT x FROM unnest(v_surface) x
     WHERE x = ANY(v_ptopics) AND NOT (x = ANY(v_topics)));
  v_n := least(coalesce(array_length(v_hit, 1), 0), 3);
  IF v_n > 0 THEN
    c := c || jsonb_build_object(
      'code', 'profile', 'w', 12 * v_n,
      'label', 'Related to your profile: ' || array_to_string(v_hit[1:v_n], ', '));
  END IF;

  -- Role affinity: which entity a role tends to want. Small, never negative.
  IF ('investor' = ANY(v_roles) OR 'entrepreneur' = ANY(v_roles))
     AND p_entity IN ('grant', 'project') THEN
    c := c || jsonb_build_object('code', 'role', 'w', 8, 'label', 'Relevant to your role');
  ELSIF ('student' = ANY(v_roles) OR 'faculty' = ANY(v_roles))
     AND p_entity IN ('resource', 'event') THEN
    c := c || jsonb_build_object('code', 'role', 'w', 8, 'label', 'Relevant to your role');
  ELSIF 'mentor' = ANY(v_roles) AND p_entity = 'project' THEN
    c := c || jsonb_build_object('code', 'role', 'w', 8, 'label', 'Relevant to your role');
  END IF;

  -- ===== Behaviour =================================================
  IF p_owner_id IS NOT NULL AND v_owners ? p_owner_id::TEXT THEN
    c := c || jsonb_build_object(
      'code', 'author', 'w', 18, 'label', 'By someone whose work you follow');
  END IF;

  IF p_category IS NOT NULL AND normalize_topic(p_category) = ANY(v_ecats) THEN
    c := c || jsonb_build_object(
      'code', 'engaged_category', 'w', 10, 'label', 'Like things you have saved');
  END IF;

  v_hit := ARRAY(SELECT DISTINCT x FROM unnest(v_surface) x WHERE x = ANY(v_etags));
  v_n := least(coalesce(array_length(v_hit, 1), 0), 2);
  IF v_n > 0 THEN
    c := c || jsonb_build_object(
      'code', 'engaged_topic', 'w', 8 * v_n, 'label', 'Similar to what you engage with');
  END IF;

  -- Already liked / RSVP'd / applied for. Demoted, never removed —
  -- "rank, never hide" applies to your own history too.
  IF v_seen ? p_id::TEXT THEN
    c := c || jsonb_build_object(
      'code', 'seen', 'w', -40, 'label', 'You have already seen this');
  END IF;

  -- ===== Badges — nudges toward the next useful step ================
  IF NOT ('first_project' = ANY(v_badges))
     AND p_entity = 'resource'
     AND (p_type_key IN ('guide', 'template') OR 'getting started' = ANY(v_surface)) THEN
    c := c || jsonb_build_object(
      'code', 'badge_starter', 'w', 14, 'label', 'A good starting point for your first project');
  END IF;

  IF NOT ('first_connection' = ANY(v_badges))
     AND p_entity = 'event'
     AND p_type_key IN ('meetup', 'conference') THEN
    c := c || jsonb_build_object(
      'code', 'badge_connect', 'w', 10, 'label', 'A good place to meet people');
  END IF;

  IF NOT ('event_goer' = ANY(v_badges))
     AND p_entity = 'event'
     AND p_occurs_at > now() THEN
    c := c || jsonb_build_object(
      'code', 'badge_event', 'w', 8, 'label', 'Your first event is coming up');
  END IF;

  IF coalesce((p_bag->>'verified')::BOOLEAN, FALSE) AND p_entity = 'grant' THEN
    c := c || jsonb_build_object(
      'code', 'badge_verified', 'w', 12, 'label', 'You are verified — you can apply');
  END IF;

  IF 'popular_project' = ANY(v_badges) AND p_entity = 'grant' THEN
    c := c || jsonb_build_object(
      'code', 'badge_traction', 'w', 10, 'label', 'Your project has traction — worth funding');
  END IF;

  -- ===== Context — recency, urgency, popularity =====================
  -- Capped well below the personal terms so a strong topic match still
  -- beats pure novelty, but large enough that an expiring grant can
  -- never be buried under a stale perfect match.
  v_days := extract(epoch FROM (now() - p_created_at)) / 86400.0;
  IF v_days IS NOT NULL AND v_days >= 0 THEN
    c := c || jsonb_build_object(
      'code', 'recency', 'w', round((20 * exp(-v_days / 30.0))::NUMERIC, 2),
      'label', 'Recently added');
  END IF;

  IF p_deadline_at IS NOT NULL THEN
    v_days := extract(epoch FROM (p_deadline_at - now())) / 86400.0;
    IF v_days < 0 THEN
      c := c || jsonb_build_object('code', 'expired', 'w', -60, 'label', 'Deadline has passed');
    ELSIF v_days <= 45 THEN
      c := c || jsonb_build_object(
        'code', 'deadline',
        'w', round((35 * (1 - v_days / 45.0) + CASE WHEN v_days <= 14 THEN 25 ELSE 0 END)::NUMERIC, 2),
        'label', 'Closing in ' || greatest(round(v_days)::INT, 0) || ' days');
    END IF;
  END IF;

  IF p_occurs_at IS NOT NULL THEN
    v_days := extract(epoch FROM (p_occurs_at - now())) / 86400.0;
    IF v_days < -1 THEN
      c := c || jsonb_build_object('code', 'past', 'w', -60, 'label', 'Already happened');
    ELSIF v_days <= 30 THEN
      c := c || jsonb_build_object(
        'code', 'soon',
        'w', round((30 * (1 - greatest(v_days, 0) / 30.0))::NUMERIC, 2),
        'label', 'Happening soon');
    END IF;
  END IF;

  IF p_popularity > 0 THEN
    c := c || jsonb_build_object(
      'code', 'popular', 'w', least(round((6 * ln(1 + p_popularity))::NUMERIC, 2), 18),
      'label', 'Popular right now');
  END IF;

  IF p_featured THEN
    c := c || jsonb_build_object('code', 'featured', 'w', 15, 'label', 'Featured by OECS');
  END IF;

  RETURN c;
END;
$$;

-- ============================================================
-- Entry point 1: score rows a list page has already fetched
-- ============================================================

CREATE OR REPLACE FUNCTION rank_content(p_entity TEXT, p_ids UUID[])
RETURNS TABLE (id UUID, score NUMERIC, reasons JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bag JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF p_ids IS NULL OR coalesce(array_length(p_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF array_length(p_ids, 1) > 300 THEN
    RAISE EXCEPTION 'rank_content: at most 300 ids per call';
  END IF;

  IF p_entity IS NULL OR p_entity NOT IN ('project', 'resource', 'event', 'grant') THEN
    RAISE EXCEPTION 'rank_content: unknown entity %', p_entity;
  END IF;

  v_bag := personalization_bag(auth.uid());

  -- Personalization off. Returning nothing makes the caller keep the
  -- server ordering it already has, which is the degradation guarantee.
  IF v_bag IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ci.id, s.score, s.reasons
    FROM content_index ci
   CROSS JOIN LATERAL (
     SELECT coalesce(sum((e->>'w')::NUMERIC), 0) AS score,
            coalesce(
              jsonb_agg(e ORDER BY (e->>'w')::NUMERIC DESC)
                FILTER (WHERE (e->>'w')::NUMERIC > 0),
              '[]'::JSONB) AS reasons
       FROM jsonb_array_elements(
              personalization_contributions(
                v_bag, ci.entity, ci.id, ci.tags, ci.category, ci.type_key,
                ci.is_climate_action, ci.is_featured, ci.created_at,
                ci.occurs_at, ci.deadline_at, ci.owner_id, ci.popularity)) e
   ) s
   WHERE ci.entity = p_entity
     AND ci.id = ANY(p_ids);
END;
$$;

-- ============================================================
-- Entry point 2: the cross-entity rail for Dashboard / Discover
-- ============================================================

CREATE OR REPLACE FUNCTION get_personalized_feed(
  p_limit    INT    DEFAULT 12,
  p_entities TEXT[] DEFAULT ARRAY['project', 'resource', 'event', 'grant']
) RETURNS TABLE (
  entity      TEXT,
  id          UUID,
  title       TEXT,
  summary     TEXT,
  category    TEXT,
  type_key    TEXT,
  tags        TEXT[],
  occurs_at   TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  score       NUMERIC,
  reasons     JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bag   JSONB;
  v_limit INT := least(greatest(coalesce(p_limit, 12), 1), 50);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  v_bag := personalization_bag(auth.uid());

  IF v_bag IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ci.entity, ci.id, ci.title, ci.summary, ci.category, ci.type_key,
         ci.tags, ci.occurs_at, ci.deadline_at, s.score, s.reasons
    FROM content_index ci
   CROSS JOIN LATERAL (
     SELECT coalesce(sum((e->>'w')::NUMERIC), 0) AS score,
            coalesce(
              jsonb_agg(e ORDER BY (e->>'w')::NUMERIC DESC)
                FILTER (WHERE (e->>'w')::NUMERIC > 0),
              '[]'::JSONB) AS reasons
       FROM jsonb_array_elements(
              personalization_contributions(
                v_bag, ci.entity, ci.id, ci.tags, ci.category, ci.type_key,
                ci.is_climate_action, ci.is_featured, ci.created_at,
                ci.occurs_at, ci.deadline_at, ci.owner_id, ci.popularity)) e
   ) s
   WHERE ci.entity = ANY(coalesce(p_entities, ARRAY['project', 'resource', 'event', 'grant']))
     -- A rail is a "what next" surface, so unlike the list pages it does
     -- drop things that have already happened.
     AND (ci.occurs_at   IS NULL OR ci.occurs_at   > now() - INTERVAL '1 day')
     AND (ci.deadline_at IS NULL OR ci.deadline_at > now())
     AND (ci.created_at > now() - INTERVAL '18 months'
          OR ci.occurs_at IS NOT NULL
          OR ci.deadline_at IS NOT NULL)
   ORDER BY s.score DESC, ci.created_at DESC, ci.id
   LIMIT v_limit;
END;
$$;

-- The bag and the formula are internal building blocks; only the two
-- entry points, which resolve the caller from auth.uid(), are callable.
REVOKE ALL ON FUNCTION personalization_bag(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION personalization_contributions(
  JSONB, TEXT, UUID, TEXT[], TEXT, TEXT, BOOLEAN, BOOLEAN,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, UUID, NUMERIC) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION rank_content(TEXT, UUID[])            TO authenticated;
GRANT EXECUTE ON FUNCTION get_personalized_feed(INT, TEXT[])    TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 062_event_challenge.sql
-- ============================================================

-- Migration 062: Event challenge brief
--
-- Some events (hackathons, demo days, innovation challenges) are not just
-- "show up" — attendees are given a goal to accomplish. The brief is a set of
-- objectives, constraints, deliverables and judging criteria.
--
-- These live as typed ROWS, not as a JSONB blob in events.details, because a
-- later phase attaches submissions and judge scores to individual criteria
-- ("this entry met objective 2", "judge scored 8/10 on criterion 3"). Nothing
-- can reference an item inside a JSONB array.
--
-- One table for all four kinds: same shape, same editor, one enum column.

-- ============================================================
-- 1. Flag + deadline on events
-- ============================================================

-- No new event_type: a hackathon may or may not run a formal challenge, and a
-- workshop may. The flag is what turns the brief on, not the type.
ALTER TABLE events ADD COLUMN IF NOT EXISTS has_challenge BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS submission_deadline TIMESTAMPTZ;

COMMENT ON COLUMN events.has_challenge IS 'Event sets a goal attendees must accomplish; enables the challenge brief';
COMMENT ON COLUMN events.submission_deadline IS 'When entries close; independent of end_date (judging may run past it)';

-- ============================================================
-- 2. The brief
-- ============================================================

CREATE TABLE IF NOT EXISTS event_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('objective', 'constraint', 'deliverable', 'judging_criterion')),
  title TEXT NOT NULL,
  description TEXT,
  -- objective/constraint/deliverable: must an entry satisfy this to qualify?
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  -- judging_criterion only: relative share of the total score.
  weight NUMERIC(5,2) CHECK (weight IS NULL OR weight >= 0),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_criteria_event ON event_criteria(event_id, kind, sort_order);

COMMENT ON TABLE event_criteria IS 'Challenge brief for an event: objectives, constraints, deliverables and judging criteria';
COMMENT ON COLUMN event_criteria.is_required IS 'Hard rule vs guidance; ignored for judging_criterion';
COMMENT ON COLUMN event_criteria.weight IS 'Judging criteria only — relative weight, normalised at scoring time';

-- ============================================================
-- 3. RLS — same shape as event_page_sections / event_speakers
-- ============================================================

ALTER TABLE event_criteria ENABLE ROW LEVEL SECURITY;

-- Non-draft, not just published: the brief stays readable after an event
-- completes, so past winners' entries still make sense.
DROP POLICY IF EXISTS "Anyone can view criteria of non-draft events" ON event_criteria;
CREATE POLICY "Anyone can view criteria of non-draft events"
  ON event_criteria FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_criteria.event_id
        AND events.status <> 'draft'
    )
  );

DROP POLICY IF EXISTS "Organizers can manage their event criteria" ON event_criteria;
CREATE POLICY "Organizers can manage their event criteria"
  ON event_criteria FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_criteria.event_id
        AND events.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "OECS admins can manage all event criteria" ON event_criteria;
CREATE POLICY "OECS admins can manage all event criteria"
  ON event_criteria FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND 'oecs' = ANY(profiles.roles)
    )
  );

-- ============================================================
-- 4. updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION touch_event_criteria()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_event_criteria_trigger ON event_criteria;
CREATE TRIGGER touch_event_criteria_trigger
  BEFORE UPDATE ON event_criteria
  FOR EACH ROW
  EXECUTE FUNCTION touch_event_criteria();

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 063_rbac_permissions.sql
-- ============================================================

-- Migration 063: Role-based access control
--
-- Until now the entire authorization model was one boolean: 'oecs' = ANY(roles).
-- That expression appears inline in ~60 policies, so it could not be changed
-- without touching every one of them, and it could not express anything other
-- than "admin / not admin" — there was no way to say "students may read grants
-- but not apply for them".
--
-- This migration introduces a permission layer *above* profiles.roles without
-- replacing it. profiles.roles stays the identity source of truth; the new
-- role_permissions table maps roles to permission keys, and has_permission()
-- is the single predicate new policies call. The legacy 'oecs' slug is aliased
-- onto 'super_admin' rather than renamed, so every existing policy keeps
-- working untouched.
--
-- Two things are deliberately NOT toggleable:
--   1. Child-safety permissions. has_permission() denies them to students
--      before it reads the matrix, so neither the admin UI nor a direct UPDATE
--      on role_permissions can grant a student unmonitored messaging or the
--      ability to apply for funding independently.
--   2. profiles.roles itself. Until now "Users can update their own profile"
--      had a USING clause and no WITH CHECK, and the settings form already
--      submitted the roles column — every user could make themselves an admin.
--      That is closed here.
--
-- Idempotent — safe to re-run. Re-running does NOT clobber admin edits to the
-- matrix; only reset_role_permissions() restores defaults.

-- ============================================================
-- 1. Role catalog
-- ============================================================

CREATE TABLE IF NOT EXISTS role_definitions (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('admin', 'organization', 'individual')),
  description TEXT,
  -- System roles cannot be deleted from the admin UI.
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  -- May a user add this to themselves during onboarding?
  is_self_assignable BOOLEAN NOT NULL DEFAULT FALSE,
  -- Granted only after institution / chamber / admin review.
  requires_verification BOOLEAN NOT NULL DEFAULT FALSE,
  -- Legacy slug that resolves to another role. Self-reference, so no FK.
  alias_of TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO role_definitions (slug, label, tier, description, is_self_assignable, requires_verification, alias_of, sort_order) VALUES
  ('super_admin', 'Super Admin', 'admin', 'OECS Secretariat. System-wide management, global policy, audit logs, suspensions.', FALSE, TRUE, NULL, 10),
  ('safety_admin', 'Safety Admin', 'admin', 'Content moderator. Owns flagged-content queues, automated moderation logs and escalations.', FALSE, TRUE, NULL, 20),
  ('oecs', 'OECS Admin (legacy)', 'admin', 'Legacy admin slug. Resolves to Super Admin.', FALSE, TRUE, 'super_admin', 25),
  ('investor', 'Investor / Funding Agency', 'organization', 'Posts grant opportunities, views vetted projects, connects with regional innovators.', TRUE, FALSE, NULL, 30),
  ('sme', 'Verified SME', 'organization', 'Business account vetted by its National Chamber of Commerce.', FALSE, TRUE, NULL, 40),
  ('private_sector', 'Private Sector', 'organization', 'Unverified business account. Gains SME capabilities once a Chamber verifies it.', TRUE, FALSE, NULL, 50),
  ('educational_partner', 'Educational Partner', 'organization', 'School or university. Manages domain verification, approves student accounts, oversees submissions.', FALSE, TRUE, NULL, 60),
  ('chamber_admin', 'Chamber of Commerce', 'organization', 'Country-level vetting authority that verifies and onboards local SMEs.', FALSE, TRUE, NULL, 70),
  ('entrepreneur', 'Entrepreneur', 'individual', 'Builds and launches innovations, applies for grants.', TRUE, FALSE, NULL, 80),
  ('faculty', 'Faculty', 'individual', 'Academic staff. May sponsor student grant applications and supervise student channels.', FALSE, TRUE, NULL, 90),
  ('researcher', 'Researcher', 'individual', 'Conducts and publishes research, collaborates on projects.', TRUE, FALSE, NULL, 100),
  ('mentor', 'Mentor', 'individual', 'Guides and supports innovators.', TRUE, FALSE, NULL, 110),
  ('student', 'Student (school-verified)', 'individual', 'Verified via an approved institutional email domain. Read-only on grants, no unmonitored direct messaging.', FALSE, TRUE, NULL, 120)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  tier = EXCLUDED.tier,
  description = EXCLUDED.description,
  is_self_assignable = EXCLUDED.is_self_assignable,
  requires_verification = EXCLUDED.requires_verification,
  alias_of = EXCLUDED.alias_of,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 2. Permission catalog
-- ============================================================

CREATE TABLE IF NOT EXISTS permission_definitions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  -- Child-safety permission: denied to students in has_permission() itself,
  -- before the matrix is consulted. The admin UI renders these cells locked.
  is_safeguard BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO permission_definitions (key, label, description, category, is_safeguard, sort_order) VALUES
  ('org:manage', 'Manage platform', 'Global settings, policy and system configuration.', 'platform', FALSE, 10),
  ('members:manage', 'Manage members', 'Create, edit, suspend and delete user accounts.', 'platform', FALSE, 20),
  ('role:manage', 'Manage roles & permissions', 'Assign roles and edit the permission matrix.', 'platform', FALSE, 30),
  ('audit:view', 'View audit logs', 'Read permission-change and moderation audit trails.', 'platform', FALSE, 40),
  ('moderation:view', 'View moderation queue', 'See reported and auto-flagged content, including quarantined items.', 'moderation', TRUE, 50),
  ('moderation:action', 'Action moderation items', 'Quarantine, restore or remove content and issue warnings.', 'moderation', TRUE, 60),
  ('moderation:escalate', 'Escalate & suspend', 'Suspend accounts and escalate to safety admins and school administrators.', 'moderation', TRUE, 70),
  ('grant:view', 'View grants', 'Browse public grant opportunities.', 'grants', FALSE, 80),
  ('grant:apply', 'Apply for grants', 'Submit grant applications. Students are denied — they must be sponsored.', 'grants', TRUE, 90),
  ('grant:sponsor', 'Sponsor student applications', 'Act as the faculty or school sponsor on a student application.', 'grants', TRUE, 100),
  ('grant:post', 'Post grant opportunities', 'Publish funding calls to the platform.', 'grants', FALSE, 110),
  ('grant:manage_funds', 'Manage funds', 'Administer disbursement and award records. Never available to students.', 'grants', TRUE, 120),
  ('project:create', 'Create projects', 'Publish a new project.', 'projects', FALSE, 130),
  ('project:manage', 'Manage own projects', 'Edit, archive and manage collaborators on owned projects.', 'projects', FALSE, 140),
  ('forum:post', 'Create forum posts', 'Start discussions on forum boards.', 'community', FALSE, 150),
  ('forum:comment', 'Reply & comment', 'Reply to forum posts and comment on projects.', 'community', FALSE, 160),
  ('mentorship:offer', 'Offer mentorship', 'Appear in mentor discovery and accept mentorship requests.', 'community', FALSE, 170),
  ('dm:initiate', 'Start direct messages', 'Open a 1-to-1 conversation. Denied to students — they use supervised channels only.', 'messaging', TRUE, 180),
  ('dm:receive', 'Receive messages', 'Participate in conversations they have been added to.', 'messaging', FALSE, 190),
  ('dm:supervise', 'Supervise student channels', 'Counts as the designated educator that makes a student channel monitored.', 'messaging', TRUE, 200),
  ('sme:verify', 'Verify SMEs', 'Chamber of Commerce review of corporate registry data; issues Verified SME status.', 'verification', FALSE, 210),
  ('institution:verify', 'Verify institutions', 'Approve schools and chambers, and the email domains they own.', 'verification', FALSE, 220),
  ('institution:approve_students', 'Approve student accounts', 'Approve students registering on the institution''s verified email domain.', 'verification', TRUE, 230)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_safeguard = EXCLUDED.is_safeguard,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 3. The matrix
-- ============================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  role_slug TEXT NOT NULL REFERENCES role_definitions(slug) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permission_definitions(key) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_slug, permission_key)
);

-- has_permission() reads by (role, key) on every policy evaluation.
CREATE INDEX IF NOT EXISTS idx_role_permissions_lookup
  ON role_permissions (role_slug, permission_key) WHERE allowed;

-- Append-only audit of every toggle. Written by trigger only; see the
-- zero-write-policy pattern used by employer_verification_events (058).
CREATE TABLE IF NOT EXISTS role_permission_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_slug TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  from_allowed BOOLEAN,
  to_allowed BOOLEAN NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_permission_events_created
  ON role_permission_events (created_at DESC);

-- ============================================================
-- 4. Default matrix
-- ============================================================

-- Kept as a function rather than a one-time INSERT so "Reset to defaults" in
-- the admin UI and the seed below share exactly one definition. Mirrors
-- DEFAULT_ROLE_PERMISSIONS in src/lib/permissions.ts.
CREATE OR REPLACE FUNCTION default_role_permissions()
RETURNS TABLE (role_slug TEXT, permission_key TEXT)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  -- Super Admin holds everything, including permissions added later.
  SELECT 'super_admin'::TEXT, pd.key FROM permission_definitions pd
  UNION ALL
  SELECT * FROM (VALUES
    ('safety_admin', 'audit:view'),
    ('safety_admin', 'moderation:view'),
    ('safety_admin', 'moderation:action'),
    ('safety_admin', 'moderation:escalate'),
    ('safety_admin', 'grant:view'),
    ('safety_admin', 'forum:post'),
    ('safety_admin', 'forum:comment'),
    ('safety_admin', 'dm:initiate'),
    ('safety_admin', 'dm:receive'),
    ('safety_admin', 'dm:supervise'),

    ('investor', 'grant:view'),
    ('investor', 'grant:post'),
    ('investor', 'grant:manage_funds'),
    ('investor', 'forum:post'),
    ('investor', 'forum:comment'),
    ('investor', 'mentorship:offer'),
    ('investor', 'dm:initiate'),
    ('investor', 'dm:receive'),

    ('sme', 'grant:view'),
    ('sme', 'grant:apply'),
    ('sme', 'project:create'),
    ('sme', 'project:manage'),
    ('sme', 'forum:post'),
    ('sme', 'forum:comment'),
    ('sme', 'mentorship:offer'),
    ('sme', 'dm:initiate'),
    ('sme', 'dm:receive'),

    ('private_sector', 'grant:view'),
    ('private_sector', 'project:create'),
    ('private_sector', 'project:manage'),
    ('private_sector', 'forum:post'),
    ('private_sector', 'forum:comment'),
    ('private_sector', 'dm:initiate'),
    ('private_sector', 'dm:receive'),

    ('educational_partner', 'institution:approve_students'),
    ('educational_partner', 'grant:view'),
    ('educational_partner', 'grant:apply'),
    ('educational_partner', 'grant:sponsor'),
    ('educational_partner', 'project:create'),
    ('educational_partner', 'project:manage'),
    ('educational_partner', 'forum:post'),
    ('educational_partner', 'forum:comment'),
    ('educational_partner', 'dm:initiate'),
    ('educational_partner', 'dm:receive'),
    ('educational_partner', 'dm:supervise'),

    ('chamber_admin', 'sme:verify'),
    ('chamber_admin', 'grant:view'),
    ('chamber_admin', 'forum:post'),
    ('chamber_admin', 'forum:comment'),
    ('chamber_admin', 'dm:initiate'),
    ('chamber_admin', 'dm:receive'),

    ('entrepreneur', 'grant:view'),
    ('entrepreneur', 'grant:apply'),
    ('entrepreneur', 'project:create'),
    ('entrepreneur', 'project:manage'),
    ('entrepreneur', 'forum:post'),
    ('entrepreneur', 'forum:comment'),
    ('entrepreneur', 'dm:initiate'),
    ('entrepreneur', 'dm:receive'),

    ('faculty', 'institution:approve_students'),
    ('faculty', 'grant:view'),
    ('faculty', 'grant:apply'),
    ('faculty', 'grant:sponsor'),
    ('faculty', 'project:create'),
    ('faculty', 'project:manage'),
    ('faculty', 'forum:post'),
    ('faculty', 'forum:comment'),
    ('faculty', 'mentorship:offer'),
    ('faculty', 'dm:initiate'),
    ('faculty', 'dm:receive'),
    ('faculty', 'dm:supervise'),

    ('researcher', 'grant:view'),
    ('researcher', 'grant:apply'),
    ('researcher', 'project:create'),
    ('researcher', 'project:manage'),
    ('researcher', 'forum:post'),
    ('researcher', 'forum:comment'),
    ('researcher', 'dm:initiate'),
    ('researcher', 'dm:receive'),

    ('mentor', 'grant:view'),
    ('mentor', 'project:create'),
    ('mentor', 'project:manage'),
    ('mentor', 'forum:post'),
    ('mentor', 'forum:comment'),
    ('mentor', 'mentorship:offer'),
    ('mentor', 'dm:initiate'),
    ('mentor', 'dm:receive'),

    -- Read-only on grants, receives messages but never initiates.
    ('student', 'grant:view'),
    ('student', 'project:create'),
    ('student', 'project:manage'),
    ('student', 'forum:post'),
    ('student', 'forum:comment'),
    ('student', 'dm:receive')
  ) AS t(role_slug, permission_key);
$$;

-- Seed every (role, permission) pair so the matrix UI has a row for each cell.
-- ON CONFLICT DO NOTHING: re-running the migration never overwrites an edit.
INSERT INTO role_permissions (role_slug, permission_key, allowed)
SELECT rd.slug,
       pd.key,
       EXISTS (SELECT 1 FROM default_role_permissions() d WHERE d.role_slug = rd.slug AND d.permission_key = pd.key)
FROM role_definitions rd
CROSS JOIN permission_definitions pd
WHERE rd.alias_of IS NULL
ON CONFLICT (role_slug, permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION reset_role_permissions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_count INTEGER;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the check has to be explicit here.
  IF NOT has_permission(v_actor, 'role:manage') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE role_permissions rp
  SET allowed = (
        SELECT EXISTS (
          SELECT 1 FROM default_role_permissions() d
          WHERE d.role_slug = rp.role_slug AND d.permission_key = rp.permission_key
        )
      ),
      updated_by = v_actor,
      updated_at = now()
  WHERE rp.allowed IS DISTINCT FROM (
        SELECT EXISTS (
          SELECT 1 FROM default_role_permissions() d
          WHERE d.role_slug = rp.role_slug AND d.permission_key = rp.permission_key
        )
      );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION reset_role_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_role_permissions() TO authenticated;

-- ============================================================
-- 5. Profile columns: active context + suspension
-- ============================================================

-- Multi-role users operate in one context at a time. NULL means "all roles",
-- which is the pre-existing behaviour, so no backfill is needed.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_role TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_roles ON profiles USING GIN (roles);

-- ============================================================
-- 6. Predicates
-- ============================================================

-- Resolve legacy slugs onto their modern equivalent. 'oecs' -> 'super_admin'.
CREATE OR REPLACE FUNCTION expand_roles(p_roles TEXT[])
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT slug FROM (
      SELECT unnest(p_roles) AS slug
      UNION
      SELECT rd.alias_of FROM role_definitions rd
      WHERE rd.slug = ANY(p_roles) AND rd.alias_of IS NOT NULL
    ) s
    WHERE slug IS NOT NULL
  ), ARRAY[]::TEXT[]);
$$;

CREATE OR REPLACE FUNCTION is_suspended(p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_suspended AND (p.suspended_until IS NULL OR p.suspended_until > now())
     FROM profiles p WHERE p.id = p_user),
    FALSE
  );
$$;

-- The helper 012_admin_dashboard_policies.sql documented in a comment but
-- never created. New policies use this; the ~60 legacy inline EXISTS clauses
-- are intentionally left alone.
CREATE OR REPLACE FUNCTION is_platform_admin(p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = p_user AND 'super_admin' = ANY(expand_roles(p.roles))
  );
$$;

-- The single authorization predicate. Order matters:
--   1. no user            -> deny
--   2. suspended          -> deny everything
--   3. safeguard denial   -> deny, regardless of what the matrix says
--   4. matrix lookup
CREATE OR REPLACE FUNCTION has_permission(p_user UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles TEXT[];
BEGIN
  IF p_user IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT expand_roles(p.roles) INTO v_roles FROM profiles p WHERE p.id = p_user;

  IF v_roles IS NULL OR array_length(v_roles, 1) IS NULL THEN
    RETURN FALSE;
  END IF;

  IF is_suspended(p_user) THEN
    RETURN FALSE;
  END IF;

  -- Safeguarding. Hard-coded on purpose: this must survive an admin toggling
  -- the matrix, a bad seed, and a direct UPDATE on role_permissions. A student
  -- who also holds an adult role is still treated as a student.
  IF 'student' = ANY(v_roles) AND p_permission IN (
    'dm:initiate',
    'grant:apply',
    'grant:manage_funds',
    'moderation:action',
    'moderation:escalate'
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_slug = ANY(v_roles)
      AND rp.permission_key = p_permission
      AND rp.allowed
  );
END;
$$;

-- Same check, narrowed to the user's active operating context. Used where
-- switching roles should genuinely change what is available rather than
-- unioning every role the account holds.
CREATE OR REPLACE FUNCTION has_permission_as(p_user UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active TEXT;
BEGIN
  SELECT p.active_role INTO v_active FROM profiles p WHERE p.id = p_user;

  -- No active context selected: fall back to the union of all held roles.
  IF v_active IS NULL THEN
    RETURN has_permission(p_user, p_permission);
  END IF;

  -- Never widen: the active context can only be a subset of what is held.
  IF NOT has_permission(p_user, p_permission) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_slug = ANY(expand_roles(ARRAY[v_active]))
      AND rp.permission_key = p_permission
      AND rp.allowed
  );
END;
$$;

-- Client bootstrap: one round trip for the whole capability set.
CREATE OR REPLACE FUNCTION get_my_permissions()
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT pd.key FROM permission_definitions pd
    WHERE has_permission(auth.uid(), pd.key)
    ORDER BY pd.sort_order
  ), ARRAY[]::TEXT[]);
$$;

REVOKE ALL ON FUNCTION get_my_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_permissions() TO authenticated;

-- ============================================================
-- 7. Close the privilege-escalation hole on profiles
-- ============================================================

-- Migration 000 created this policy with USING and no WITH CHECK, and
-- ProfileSettingsTab submitted the roles column on an ordinary save, so any
-- user could write 'oecs' to themselves. WITH CHECK alone is not enough —
-- it only re-asserts row ownership — so the column guard is a trigger.
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Trusted server-side paths (institution approval, chamber verification)
-- legitimately grant roles while auth.uid() is still the calling user. They
-- set this transaction-local flag rather than being granted a blanket bypass.
CREATE OR REPLACE FUNCTION guard_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_added TEXT[];
  v_illegal TEXT[];
BEGIN
  -- service_role has no JWT subject; trusted RPCs opt in explicitly.
  IF v_actor IS NULL OR current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  IF is_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
     OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
     OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
    RAISE EXCEPTION 'suspension state can only be changed by a platform admin';
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'verification state can only be changed by a platform admin';
  END IF;

  -- Only newly ADDED roles are validated. Removing a role from yourself is
  -- always allowed, and existing rows are never re-checked — which is what
  -- keeps accounts that already hold faculty/student slugs editable.
  IF NEW.roles IS DISTINCT FROM OLD.roles THEN
    v_added := ARRAY(
      SELECT unnest(COALESCE(NEW.roles, ARRAY[]::TEXT[]))
      EXCEPT
      SELECT unnest(COALESCE(OLD.roles, ARRAY[]::TEXT[]))
    );

    SELECT ARRAY_AGG(slug) INTO v_illegal
    FROM unnest(v_added) AS slug
    WHERE NOT EXISTS (
      SELECT 1 FROM role_definitions rd
      WHERE rd.slug = slug AND rd.is_self_assignable
    );

    IF v_illegal IS NOT NULL AND array_length(v_illegal, 1) > 0 THEN
      RAISE EXCEPTION 'role(s) % require verification or an administrator', array_to_string(v_illegal, ', ');
    END IF;
  END IF;

  -- The active context must be a role the account actually holds.
  IF NEW.active_role IS NOT NULL AND NOT (NEW.active_role = ANY(COALESCE(NEW.roles, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION 'active_role % is not held by this account', NEW.active_role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_privileged_columns_trigger ON profiles;
CREATE TRIGGER guard_profile_privileged_columns_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profile_privileged_columns();

-- Signup metadata is unvalidated user input (see handle_new_user in 044), so
-- the same rule applies at INSERT: a self-assignable role or nothing.
CREATE OR REPLACE FUNCTION guard_profile_insert_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.roles := COALESCE(ARRAY(
    SELECT slug FROM unnest(COALESCE(NEW.roles, ARRAY[]::TEXT[])) AS slug
    WHERE EXISTS (
      SELECT 1 FROM role_definitions rd WHERE rd.slug = slug AND rd.is_self_assignable
    )
  ), ARRAY[]::TEXT[]);

  NEW.is_verified := FALSE;
  NEW.is_suspended := FALSE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_insert_roles_trigger ON profiles;
CREATE TRIGGER guard_profile_insert_roles_trigger
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profile_insert_roles();

-- Admin-side role assignment. Goes through a function so the audit story is
-- one code path rather than a bare UPDATE from the browser.
CREATE OR REPLACE FUNCTION set_user_roles(p_user UUID, p_roles TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_unknown TEXT[];
BEGIN
  IF NOT has_permission(v_actor, 'role:manage') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  SELECT ARRAY_AGG(slug) INTO v_unknown
  FROM unnest(COALESCE(p_roles, ARRAY[]::TEXT[])) AS slug
  WHERE NOT EXISTS (SELECT 1 FROM role_definitions rd WHERE rd.slug = slug);

  IF v_unknown IS NOT NULL AND array_length(v_unknown, 1) > 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unknown_role', 'roles', v_unknown);
  END IF;

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);

  UPDATE profiles
  SET roles = COALESCE(p_roles, ARRAY[]::TEXT[]),
      active_role = CASE
        WHEN active_role = ANY(COALESCE(p_roles, ARRAY[]::TEXT[])) THEN active_role
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_user;

  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION set_user_roles(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_user_roles(UUID, TEXT[]) TO authenticated;

-- Account suspension, used by the moderation engine in 065 and by admins.
CREATE OR REPLACE FUNCTION set_user_suspension(
  p_user UUID,
  p_suspended BOOLEAN,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF NOT has_permission(v_actor, 'moderation:escalate') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);

  UPDATE profiles
  SET is_suspended = p_suspended,
      suspended_until = CASE WHEN p_suspended THEN p_until ELSE NULL END,
      suspension_reason = CASE WHEN p_suspended THEN p_reason ELSE NULL END,
      updated_at = now()
  WHERE id = p_user;

  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION set_user_suspension(UUID, BOOLEAN, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_user_suspension(UUID, BOOLEAN, TIMESTAMPTZ, TEXT) TO authenticated;

-- ============================================================
-- 8. Audit trail
-- ============================================================

-- UPDATE only. A BEFORE INSERT trigger fires before ON CONFLICT is evaluated,
-- so auditing inserts would write an event for every skipped seed row each time
-- this migration is re-run — an audit log full of changes that never happened.
CREATE OR REPLACE FUNCTION log_role_permission_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.allowed IS NOT DISTINCT FROM OLD.allowed THEN
    RETURN NEW;
  END IF;

  INSERT INTO role_permission_events (role_slug, permission_key, from_allowed, to_allowed, actor_id)
  VALUES (NEW.role_slug, NEW.permission_key, OLD.allowed, NEW.allowed, auth.uid());

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_role_permission_change_trigger ON role_permissions;
CREATE TRIGGER log_role_permission_change_trigger
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION log_role_permission_change();

-- ============================================================
-- 9. RLS
-- ============================================================

ALTER TABLE role_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permission_events ENABLE ROW LEVEL SECURITY;

-- The catalog is public: the UI labels roles on member cards for signed-out
-- visitors too. Only the matrix and the audit trail are restricted.
DROP POLICY IF EXISTS "Anyone can view role definitions" ON role_definitions;
CREATE POLICY "Anyone can view role definitions"
  ON role_definitions FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Anyone can view permission definitions" ON permission_definitions;
CREATE POLICY "Anyone can view permission definitions"
  ON permission_definitions FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Authenticated users can view the matrix" ON role_permissions;
CREATE POLICY "Authenticated users can view the matrix"
  ON role_permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Permission managers can edit the matrix" ON role_permissions;
CREATE POLICY "Permission managers can edit the matrix"
  ON role_permissions FOR UPDATE
  USING (has_permission(auth.uid(), 'role:manage'))
  WITH CHECK (has_permission(auth.uid(), 'role:manage'));

DROP POLICY IF EXISTS "Auditors can view permission history" ON role_permission_events;
CREATE POLICY "Auditors can view permission history"
  ON role_permission_events FOR SELECT
  USING (has_permission(auth.uid(), 'audit:view'));

-- No INSERT/UPDATE/DELETE policies on role_permission_events: it is written
-- only by log_role_permission_change(), which is SECURITY DEFINER.

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 064_institutions_safeguarding_chamber.sql
-- ============================================================

-- Migration 064: Institutions, student safeguarding, Chamber of Commerce
--
-- Three problems this closes, all of them currently wide open:
--
--   1. Anyone can message anyone. conversation_participants lets the creator
--      add any user, and nothing in the messaging policies reads a role. A
--      platform that hosts school-verified minors cannot ship that.
--   2. Anyone can submit a grant application. The gate is
--      WITH CHECK (auth.uid() = user_id) and nothing else, so a student can
--      apply for and be awarded funding with no institutional sponsor.
--   3. "Student" and "SME" are unverified self-declared strings. There is no
--      record of which school owns dsc.edu.dm, and no country-level authority
--      that vets a business.
--
-- Institutions are one table for schools, universities, TVETs and chambers:
-- they differ only in what their membership means, and a chamber's country is
-- the same column as a school's country. institution_members therefore doubles
-- as the chamber-admin mapping.
--
-- Employers are NOT rebuilt. 058 already models a verified company with an
-- append-only verification event log; the chamber is a second review authority
-- writing into the same tables, not a parallel universe.
--
-- Note on enforcement points: `messages` is in the supabase_realtime
-- publication, so a rule applied after insert has already reached the
-- recipient's socket. All messaging rules here are WITH CHECK predicates.
--
-- Idempotent — safe to re-run. Requires 063.

-- ============================================================
-- 1. Institutions
-- ============================================================

CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('school', 'university', 'tvet', 'chamber')),
  country_code CHAR(2) NOT NULL REFERENCES countries(code),
  -- Domains this institution owns. A student email must match one of these
  -- AND the institution must be verified before the student role is granted.
  email_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  contact_email TEXT CHECK (contact_email IS NULL OR contact_email = lower(contact_email)),
  website_url TEXT,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  review_note TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Same rule as employers_verified_has_evidence (058): a verified record must
  -- name who verified it and when.
  CONSTRAINT institutions_verified_has_evidence CHECK (
    status <> 'verified' OR (verified_at IS NOT NULL AND verified_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_institutions_country ON institutions(country_code);
CREATE INDEX IF NOT EXISTS idx_institutions_kind_status ON institutions(kind, status);
CREATE INDEX IF NOT EXISTS idx_institutions_domains ON institutions USING GIN (email_domains);

CREATE TABLE IF NOT EXISTS institution_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'educator', 'student')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_institution_members_user ON institution_members(user_id);
CREATE INDEX IF NOT EXISTS idx_institution_members_pending
  ON institution_members(institution_id) WHERE status = 'pending';

-- Minor-safety record. Only the birth YEAR is stored: enough to decide minor
-- status for COPPA/GDPR handling, without holding a full date of birth for a
-- child. is_minor is derived, so it cannot drift from the year it came from.
CREATE TABLE IF NOT EXISTS student_safeguarding (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  verified_domain TEXT,
  sponsor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  birth_year INTEGER CHECK (birth_year IS NULL OR (birth_year > 1900 AND birth_year <= EXTRACT(YEAR FROM now()))),
  guardian_consent_at TIMESTAMPTZ,
  guardian_consent_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Not a GENERATED column: the expression depends on the current year, and
-- generated columns must be immutable. Maintained on write instead, and
-- recomputed whenever the row is touched.
ALTER TABLE student_safeguarding ADD COLUMN IF NOT EXISTS is_minor BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION derive_student_minor_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_minor := NEW.birth_year IS NOT NULL
    AND (EXTRACT(YEAR FROM now())::INTEGER - NEW.birth_year) < 18;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS derive_student_minor_status_trigger ON student_safeguarding;
CREATE TRIGGER derive_student_minor_status_trigger
  BEFORE INSERT OR UPDATE ON student_safeguarding
  FOR EACH ROW
  EXECUTE FUNCTION derive_student_minor_status();

-- ============================================================
-- 2. Institution membership helpers
-- ============================================================

CREATE OR REPLACE FUNCTION is_institution_admin(p_institution UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM institution_members im
    WHERE im.institution_id = p_institution
      AND im.user_id = p_user
      AND im.status = 'approved'
      AND im.role IN ('admin', 'educator')
  );
$$;

-- A chamber admin's authority is bounded by the country of the chamber they
-- belong to. Returns the set of ISO codes this user may act on.
CREATE OR REPLACE FUNCTION chamber_countries(p_user UUID)
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT i.country_code
    FROM institution_members im
    JOIN institutions i ON i.id = im.institution_id
    WHERE im.user_id = p_user
      AND im.status = 'approved'
      AND im.role IN ('admin', 'educator')
      AND i.kind = 'chamber'
      AND i.status = 'verified'
  ), ARRAY[]::TEXT[]);
$$;

-- Self-serve: a user asks to be recognised as a student of the institution
-- that owns their email domain. Grants nothing on its own — an educator still
-- has to approve, which is what actually assigns the student role.
CREATE OR REPLACE FUNCTION request_student_verification()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_email TEXT;
  v_domain TEXT;
  v_institution UUID;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_user;
  IF v_email IS NULL OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_email');
  END IF;

  v_domain := split_part(v_email, '@', 2);

  SELECT i.id INTO v_institution
  FROM institutions i
  WHERE i.status = 'verified'
    AND i.kind <> 'chamber'
    AND v_domain = ANY(i.email_domains)
  LIMIT 1;

  IF v_institution IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'domain_not_recognised', 'domain', v_domain);
  END IF;

  INSERT INTO institution_members (institution_id, user_id, role, status)
  VALUES (v_institution, v_user, 'student', 'pending')
  ON CONFLICT (institution_id, user_id) DO UPDATE
    SET status = CASE WHEN institution_members.status = 'rejected' THEN 'pending' ELSE institution_members.status END;

  INSERT INTO student_safeguarding (user_id, institution_id, verified_domain)
  VALUES (v_user, v_institution, v_domain)
  ON CONFLICT (user_id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        verified_domain = EXCLUDED.verified_domain,
        updated_at = now();

  RETURN jsonb_build_object('ok', TRUE, 'institution_id', v_institution, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION request_student_verification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_student_verification() TO authenticated;

-- Educator approval. This is the only path that grants the student role, which
-- is why it opts into the profile guard bypass from 063 rather than the caller
-- being able to write profiles.roles directly.
CREATE OR REPLACE FUNCTION review_institution_member(
  p_member UUID,
  p_approve BOOLEAN,
  p_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_institution UUID;
  v_user UUID;
  v_role TEXT;
  v_kind TEXT;
  v_grant TEXT;
BEGIN
  SELECT im.institution_id, im.user_id, COALESCE(p_role, im.role), i.kind
    INTO v_institution, v_user, v_role, v_kind
  FROM institution_members im
  JOIN institutions i ON i.id = im.institution_id
  WHERE im.id = p_member;

  IF v_institution IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF NOT (is_institution_admin(v_institution, v_actor) OR has_permission(v_actor, 'institution:verify')) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF v_role = 'student' AND NOT has_permission(v_actor, 'institution:approve_students')
     AND NOT is_institution_admin(v_institution, v_actor) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  UPDATE institution_members
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      role = v_role,
      approved_by = v_actor,
      approved_at = CASE WHEN p_approve THEN now() ELSE NULL END
  WHERE id = p_member;

  IF p_approve THEN
    v_grant := CASE
      WHEN v_kind = 'chamber' THEN 'chamber_admin'
      WHEN v_role = 'student' THEN 'student'
      WHEN v_role = 'admin' THEN 'educational_partner'
      ELSE 'faculty'
    END;

    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET roles = CASE WHEN v_grant = ANY(roles) THEN roles ELSE array_append(roles, v_grant) END,
        updated_at = now()
    WHERE id = v_user;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

    PERFORM send_notification(
      v_user,
      'institution_membership',
      'Institution membership approved',
      'Your account has been approved and now has the ' || v_grant || ' role.',
      '/settings'
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'granted_role', v_grant);
END;
$$;

REVOKE ALL ON FUNCTION review_institution_member(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_institution_member(UUID, BOOLEAN, TEXT) TO authenticated;

-- ============================================================
-- 3. Chamber of Commerce SME verification
-- ============================================================

ALTER TABLE employers ADD COLUMN IF NOT EXISTS chamber_institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;
ALTER TABLE employers ADD COLUMN IF NOT EXISTS chamber_reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE employers ADD COLUMN IF NOT EXISTS chamber_reviewed_at TIMESTAMPTZ;

-- 058 fixed the method vocabulary before chambers existed.
ALTER TABLE employers DROP CONSTRAINT IF EXISTS employers_verification_method_check;
ALTER TABLE employers ADD CONSTRAINT employers_verification_method_check
  CHECK (verification_method IS NULL OR verification_method IN (
    'document_review', 'registry_lookup', 'manual_attestation', 'chamber_attestation'
  ));

-- Mirrors set_employer_verification (058) but scoped: the caller must be an
-- approved admin of a verified chamber in the SAME country as the employer.
CREATE OR REPLACE FUNCTION set_employer_verification_by_chamber(
  p_employer UUID,
  p_status TEXT,
  p_registration_number TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_country CHAR(2);
  v_from TEXT;
  v_chamber UUID;
  v_owner UUID;
BEGIN
  IF NOT has_permission(v_actor, 'sme:verify') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_status NOT IN ('pending', 'verified', 'rejected', 'revoked') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_status');
  END IF;

  SELECT e.country_code, e.verification_status, e.created_by
    INTO v_country, v_from, v_owner
  FROM employers e WHERE e.id = p_employer;

  IF v_country IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF NOT (v_country = ANY(chamber_countries(v_actor))) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'wrong_country', 'country', v_country);
  END IF;

  SELECT i.id INTO v_chamber
  FROM institution_members im
  JOIN institutions i ON i.id = im.institution_id
  WHERE im.user_id = v_actor AND im.status = 'approved'
    AND i.kind = 'chamber' AND i.status = 'verified' AND i.country_code = v_country
  LIMIT 1;

  UPDATE employers
  SET verification_status = p_status,
      verification_method = CASE WHEN p_status = 'verified' THEN 'chamber_attestation' ELSE verification_method END,
      registration_number = COALESCE(p_registration_number, registration_number),
      verified_at = CASE WHEN p_status = 'verified' THEN now() ELSE NULL END,
      verified_by = CASE WHEN p_status = 'verified' THEN v_actor ELSE NULL END,
      verification_note = COALESCE(p_note, verification_note),
      chamber_institution_id = v_chamber,
      chamber_reviewed_by = v_actor,
      chamber_reviewed_at = now(),
      updated_at = now()
  WHERE id = p_employer;

  INSERT INTO employer_verification_events (employer_id, from_status, to_status, method, note, actor_id)
  VALUES (p_employer, v_from, p_status, 'chamber_attestation', p_note, v_actor);

  -- A verified company promotes its owner to the SME role, which is what
  -- unlocks posting industry projects and private-sector grants.
  IF p_status = 'verified' AND v_owner IS NOT NULL THEN
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET roles = CASE WHEN 'sme' = ANY(roles) THEN roles ELSE array_append(roles, 'sme') END,
        updated_at = now()
    WHERE id = v_owner;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

    PERFORM send_notification(
      v_owner,
      'employer_verified',
      'Your business is verified',
      'Your National Chamber of Commerce has verified your business. SME features are now available.',
      '/settings'
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION set_employer_verification_by_chamber(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_employer_verification_by_chamber(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- 058 let only platform admins create an employer, because there was no
-- reviewer other than the Secretariat. Chambers are that reviewer, so a
-- business can now register itself — unverified, and unable to edit itself
-- afterwards (058 deliberately has no member-facing UPDATE policy, and that
-- stays true: an employer that could edit its own row post-verification would
-- put attacker-controlled data behind a verified badge).
DROP POLICY IF EXISTS "Businesses can register themselves" ON employers;
CREATE POLICY "Businesses can register themselves"
  ON employers FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND verification_status = 'pending'
    AND verified_at IS NULL
    AND verified_by IS NULL
  );

DROP POLICY IF EXISTS "Registrants and chambers can view employers" ON employers;
CREATE POLICY "Registrants and chambers can view employers"
  ON employers FOR SELECT
  USING (
    created_by = auth.uid()
    OR (has_permission(auth.uid(), 'sme:verify') AND country_code = ANY(chamber_countries(auth.uid())))
  );

DROP POLICY IF EXISTS "Chambers can view verification events" ON employer_verification_events;
CREATE POLICY "Chambers can view verification events"
  ON employer_verification_events FOR SELECT
  USING (
    has_permission(auth.uid(), 'sme:verify')
    AND EXISTS (
      SELECT 1 FROM employers e
      WHERE e.id = employer_verification_events.employer_id
        AND e.country_code = ANY(chamber_countries(auth.uid()))
    )
  );

-- ============================================================
-- 4. Messaging safeguards
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_supervised BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION conversation_has_student(p_conversation UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants cp
    JOIN profiles p ON p.id = cp.user_id
    WHERE cp.conversation_id = p_conversation AND 'student' = ANY(p.roles)
  );
$$;

CREATE OR REPLACE FUNCTION conversation_has_supervisor(p_conversation UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = p_conversation
      AND has_permission(cp.user_id, 'dm:supervise')
  );
$$;

-- The rule: a thread containing a student must be a group thread with at
-- least one designated educator in it. That makes unmonitored 1-on-1 contact
-- between an adult and a minor unrepresentable rather than merely discouraged.
CREATE OR REPLACE FUNCTION can_message(p_sender UUID, p_conversation UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_group BOOLEAN;
BEGIN
  IF p_sender IS NULL OR p_conversation IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT is_conversation_participant(p_conversation, p_sender) THEN
    RETURN FALSE;
  END IF;

  IF NOT has_permission(p_sender, 'dm:receive') THEN
    RETURN FALSE;
  END IF;

  IF NOT conversation_has_student(p_conversation) THEN
    RETURN TRUE;
  END IF;

  SELECT c.is_group INTO v_is_group FROM conversations c WHERE c.id = p_conversation;

  RETURN COALESCE(v_is_group, FALSE) AND conversation_has_supervisor(p_conversation);
END;
$$;

-- Keeps conversations.is_supervised in step with who is actually in the room,
-- so the UI can label a channel without recomputing the predicate per render.
CREATE OR REPLACE FUNCTION refresh_conversation_supervision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation UUID := COALESCE(NEW.conversation_id, OLD.conversation_id);
BEGIN
  UPDATE conversations
  SET is_supervised = conversation_has_supervisor(v_conversation),
      updated_at = now()
  WHERE id = v_conversation;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS refresh_conversation_supervision_trigger ON conversation_participants;
CREATE TRIGGER refresh_conversation_supervision_trigger
  AFTER INSERT OR DELETE ON conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION refresh_conversation_supervision();

DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND has_permission(auth.uid(), 'dm:initiate')
  );

-- Blocks a 1-to-1 thread from ever containing a student, in either insert
-- order: the student cannot be added to a direct thread, and nobody can be
-- added to a direct thread that already holds one.
DROP POLICY IF EXISTS "Authenticated users can add participants" ON conversation_participants;
CREATE POLICY "Authenticated users can add participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    (
      user_id = auth.uid()
      OR is_conversation_creator(conversation_id, auth.uid())
      OR is_conversation_admin(conversation_id, auth.uid())
    )
    AND (
      EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.is_group)
      OR (
        NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = conversation_participants.user_id AND 'student' = ANY(p.roles))
        AND NOT conversation_has_student(conversation_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can send messages to own conversations" ON messages;
CREATE POLICY "Users can send messages to own conversations"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND can_message(auth.uid(), conversation_id)
  );

-- ============================================================
-- 5. Grant application safeguards
-- ============================================================

ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS sponsor_approved_at TIMESTAMPTZ;
ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS sponsor_note TEXT;

CREATE INDEX IF NOT EXISTS idx_grant_applications_sponsor
  ON grant_applications(sponsor_id) WHERE sponsor_id IS NOT NULL;

-- Drafting is allowed to anyone who can see grants, so a student can prepare
-- an application; only leaving 'draft' requires the right to apply. Students
-- never hold grant:apply (063 denies it in has_permission), so for them the
-- only route out of draft is an accepted faculty sponsor.
CREATE OR REPLACE FUNCTION enforce_grant_application_sponsor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_student BOOLEAN;
BEGIN
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT 'student' = ANY(p.roles) INTO v_is_student FROM profiles p WHERE p.id = NEW.user_id;

  IF COALESCE(v_is_student, FALSE) THEN
    IF NEW.sponsor_id IS NULL THEN
      RAISE EXCEPTION 'a student application requires a faculty or school sponsor';
    END IF;
    IF NEW.sponsor_approved_at IS NULL THEN
      RAISE EXCEPTION 'the nominated sponsor has not accepted this application yet';
    END IF;
    IF NOT has_permission(NEW.sponsor_id, 'grant:sponsor') THEN
      RAISE EXCEPTION 'the nominated sponsor is not permitted to sponsor applications';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT has_permission(NEW.user_id, 'grant:apply') THEN
    RAISE EXCEPTION 'this account is not permitted to submit grant applications';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_grant_application_sponsor_trigger ON grant_applications;
CREATE TRIGGER enforce_grant_application_sponsor_trigger
  BEFORE INSERT OR UPDATE ON grant_applications
  FOR EACH ROW
  EXECUTE FUNCTION enforce_grant_application_sponsor();

DROP POLICY IF EXISTS "Users can create applications" ON grant_applications;
CREATE POLICY "Users can create applications"
  ON grant_applications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      has_permission(auth.uid(), 'grant:apply')
      OR (status = 'draft' AND has_permission(auth.uid(), 'grant:view'))
    )
  );

DROP POLICY IF EXISTS "Users can update their own applications" ON grant_applications;
CREATE POLICY "Users can update their own applications"
  ON grant_applications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      has_permission(auth.uid(), 'grant:apply')
      OR status = 'draft'
      OR sponsor_approved_at IS NOT NULL
    )
  );

-- The sponsor's side of the handshake. A student nominates; the sponsor
-- accepts here. Without this the student could name any faculty member and
-- submit in their name.
CREATE OR REPLACE FUNCTION review_grant_sponsorship(
  p_application UUID,
  p_accept BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_sponsor UUID;
  v_applicant UUID;
BEGIN
  SELECT ga.sponsor_id, ga.user_id INTO v_sponsor, v_applicant
  FROM grant_applications ga WHERE ga.id = p_application;

  IF v_sponsor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF v_sponsor <> v_actor OR NOT has_permission(v_actor, 'grant:sponsor') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  UPDATE grant_applications
  SET sponsor_approved_at = CASE WHEN p_accept THEN now() ELSE NULL END,
      sponsor_id = CASE WHEN p_accept THEN sponsor_id ELSE NULL END,
      sponsor_note = p_note,
      updated_at = now()
  WHERE id = p_application;

  PERFORM send_notification(
    v_applicant,
    'grant_sponsorship',
    CASE WHEN p_accept THEN 'Sponsor accepted' ELSE 'Sponsor declined' END,
    COALESCE(p_note, CASE WHEN p_accept
      THEN 'Your sponsor accepted. You can now submit this application.'
      ELSE 'Your nominated sponsor declined this application.' END),
    '/grants/my-applications'
  );

  RETURN jsonb_build_object('ok', TRUE, 'accepted', p_accept);
END;
$$;

REVOKE ALL ON FUNCTION review_grant_sponsorship(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_grant_sponsorship(UUID, BOOLEAN, TEXT) TO authenticated;

-- A sponsor has to be able to read what they are being asked to vouch for.
DROP POLICY IF EXISTS "Sponsors can view applications naming them" ON grant_applications;
CREATE POLICY "Sponsors can view applications naming them"
  ON grant_applications FOR SELECT
  USING (sponsor_id = auth.uid());

-- ============================================================
-- 6. Permission gates on content creation
-- ============================================================

-- has_permission() already returns FALSE for a suspended account, so these
-- double as the suspension gate.

DROP POLICY IF EXISTS "Authenticated users can create posts" ON forum_posts;
CREATE POLICY "Authenticated users can create posts"
  ON forum_posts FOR INSERT
  WITH CHECK (auth.uid() = author_id AND has_permission(auth.uid(), 'forum:post'));

DROP POLICY IF EXISTS "Authenticated users can create replies" ON forum_replies;
CREATE POLICY "Authenticated users can create replies"
  ON forum_replies FOR INSERT
  WITH CHECK (auth.uid() = author_id AND has_permission(auth.uid(), 'forum:comment'));

DROP POLICY IF EXISTS "Authenticated users can comment" ON project_comments;
CREATE POLICY "Authenticated users can comment"
  ON project_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND has_permission(auth.uid(), 'forum:comment')
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE id = project_id
      AND (is_public = TRUE OR owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create projects" ON projects;
CREATE POLICY "Authenticated users can create projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id AND has_permission(auth.uid(), 'project:create'));

-- 003 left grants writable by ANY authenticated user, including UPDATE and
-- DELETE of rows they did not create, with a comment deferring the fix. The
-- grant:post permission is that fix.
DROP POLICY IF EXISTS "Authenticated users can create grants" ON grants;
CREATE POLICY "Authenticated users can create grants"
  ON grants FOR INSERT
  WITH CHECK (has_permission(auth.uid(), 'grant:post'));

DROP POLICY IF EXISTS "Users can update grants they created" ON grants;
CREATE POLICY "Users can update grants they created"
  ON grants FOR UPDATE
  USING (has_permission(auth.uid(), 'grant:post'));

DROP POLICY IF EXISTS "Users can delete grants they created" ON grants;
CREATE POLICY "Users can delete grants they created"
  ON grants FOR DELETE
  USING (has_permission(auth.uid(), 'grant:post'));

-- ============================================================
-- 7. RLS
-- ============================================================

ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_safeguarding ENABLE ROW LEVEL SECURITY;

-- Verified institutions are public: the signup screen has to tell a student
-- whether their school is recognised before they try.
DROP POLICY IF EXISTS "Verified institutions are public" ON institutions;
CREATE POLICY "Verified institutions are public"
  ON institutions FOR SELECT
  USING (
    status = 'verified'
    OR created_by = auth.uid()
    OR has_permission(auth.uid(), 'institution:verify')
  );

DROP POLICY IF EXISTS "Authenticated users can register an institution" ON institutions;
CREATE POLICY "Authenticated users can register an institution"
  ON institutions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Institution verifiers can review" ON institutions;
CREATE POLICY "Institution verifiers can review"
  ON institutions FOR UPDATE
  USING (has_permission(auth.uid(), 'institution:verify') OR is_institution_admin(id, auth.uid()))
  WITH CHECK (has_permission(auth.uid(), 'institution:verify') OR is_institution_admin(id, auth.uid()));

DROP POLICY IF EXISTS "Members can view their institution roster" ON institution_members;
CREATE POLICY "Members can view their institution roster"
  ON institution_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_institution_admin(institution_id, auth.uid())
    OR has_permission(auth.uid(), 'institution:verify')
  );

DROP POLICY IF EXISTS "Users can request membership" ON institution_members;
CREATE POLICY "Users can request membership"
  ON institution_members FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Institution admins can manage the roster" ON institution_members;
CREATE POLICY "Institution admins can manage the roster"
  ON institution_members FOR UPDATE
  USING (is_institution_admin(institution_id, auth.uid()) OR has_permission(auth.uid(), 'institution:verify'));

-- Safeguarding records describe a minor. Readable by the student, their
-- institution's staff, and safety admins — nobody else, including other
-- platform admins without the moderation permission.
DROP POLICY IF EXISTS "Safeguarding records are restricted" ON student_safeguarding;
CREATE POLICY "Safeguarding records are restricted"
  ON student_safeguarding FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_institution_admin(institution_id, auth.uid())
    OR has_permission(auth.uid(), 'moderation:view')
  );

DROP POLICY IF EXISTS "Students can maintain their own safeguarding record" ON student_safeguarding;
CREATE POLICY "Students can maintain their own safeguarding record"
  ON student_safeguarding FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 065_moderation.sql
-- ============================================================

-- Migration 065: Content reporting and automated moderation
--
-- What exists today: grievances (018), which reports a PERSON. There is no way
-- to report a post, a reply, a comment or a message, and no way to hide one —
-- forum_posts has is_pinned and nothing else, and its SELECT policy is
-- USING (TRUE), so content is world-readable the instant it is written.
--
-- Two design points worth stating up front.
--
-- Enforcement is at INSERT, not after. `messages` is in the supabase_realtime
-- publication (004): the client is subscribed to INSERT events, so a row that
-- is written and then hidden has already been delivered to the recipient's
-- open socket. Anything that must never be seen has to be classified before
-- the row lands, which is why scan_content() is a deterministic BEFORE INSERT
-- trigger rather than a call out to a model. api/moderate.ts adds an LLM
-- second opinion afterwards, for triage only — it never gates delivery.
--
-- The SELECT policies here REPLACE the permissive ones. RLS ORs policies
-- together, so adding a status-aware policy alongside USING (TRUE) would hide
-- nothing at all.
--
-- Idempotent — safe to re-run. Requires 063 and 064.

-- ============================================================
-- 1. Content status
-- ============================================================

ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE forum_posts DROP CONSTRAINT IF EXISTS forum_posts_status_check;
ALTER TABLE forum_posts ADD CONSTRAINT forum_posts_status_check
  CHECK (status IN ('active', 'quarantined', 'removed'));
ALTER TABLE forum_replies DROP CONSTRAINT IF EXISTS forum_replies_status_check;
ALTER TABLE forum_replies ADD CONSTRAINT forum_replies_status_check
  CHECK (status IN ('active', 'quarantined', 'removed'));
ALTER TABLE project_comments DROP CONSTRAINT IF EXISTS project_comments_status_check;
ALTER TABLE project_comments ADD CONSTRAINT project_comments_status_check
  CHECK (status IN ('active', 'quarantined', 'removed'));
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE messages ADD CONSTRAINT messages_status_check
  CHECK (status IN ('active', 'quarantined', 'removed'));

ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS moderation_severity TEXT;
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS moderation_severity TEXT;
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS moderation_severity TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS moderation_severity TEXT;

ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_forum_posts_status ON forum_posts(status) WHERE status <> 'active';
CREATE INDEX IF NOT EXISTS idx_forum_replies_status ON forum_replies(status) WHERE status <> 'active';
CREATE INDEX IF NOT EXISTS idx_project_comments_status ON project_comments(status) WHERE status <> 'active';
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status) WHERE status <> 'active';

-- ============================================================
-- 2. Configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS moderation_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- N distinct reporters within X minutes auto-quarantines the target.
  report_threshold INTEGER NOT NULL DEFAULT 3 CHECK (report_threshold > 0),
  report_window_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (report_window_minutes > 0),
  auto_quarantine_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  low_action TEXT NOT NULL DEFAULT 'warned',
  medium_action TEXT NOT NULL DEFAULT 'quarantined',
  high_action TEXT NOT NULL DEFAULT 'suspended',
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO moderation_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Term list. country_code scopes a regional slur to the one member state where
-- it is a slur, so a word that is innocuous in Dominica is not flagged there
-- because it is offensive elsewhere.
CREATE TABLE IF NOT EXISTS moderation_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'term' CHECK (kind IN ('term', 'regex')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  category TEXT CHECK (category IS NULL OR category IN (
    'hate_harassment', 'bullying', 'nsfw', 'spam_scam', 'grooming_risk', 'pii_leak'
  )),
  country_code CHAR(2) REFERENCES countries(code),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expression index rather than a table constraint: a global rule and a
-- country-scoped rule may share a pattern, but two global ones may not.
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_terms_unique
  ON moderation_terms (pattern, COALESCE(country_code, 'ZZ'));

CREATE INDEX IF NOT EXISTS idx_moderation_terms_active ON moderation_terms(severity) WHERE is_active;

-- Seed: PII and grooming patterns only. Slur lists are intentionally NOT
-- shipped in source control — they are regional, they change, and they belong
-- to the safety team. Admins add them from /admin/moderation.
INSERT INTO moderation_terms (pattern, kind, severity, category, note) VALUES
  ('(\+?\d[\d\s().-]{7,}\d)', 'regex', 'medium', 'pii_leak', 'Phone number'),
  ('([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'regex', 'low', 'pii_leak', 'Email address'),
  ('(\d{1,5}\s+[A-Za-z0-9.\s]{3,40}\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr))', 'regex', 'medium', 'pii_leak', 'Street address'),
  ('((instagram|snapchat|tiktok|telegram|whatsapp|wa\.me)\.?(com)?/[A-Za-z0-9_.]+)', 'regex', 'medium', 'pii_leak', 'Personal social link'),
  ('(don''?t tell (your |any)?(parents|mum|mom|dad|teacher))', 'regex', 'high', 'grooming_risk', 'Secrecy request'),
  ('(keep this (a )?secret between us)', 'regex', 'high', 'grooming_risk', 'Secrecy request'),
  ('(how old are you|what''?s your age).{0,40}(send|pic|photo|alone)', 'regex', 'high', 'grooming_risk', 'Age probing plus solicitation'),
  ('(meet me|come over).{0,30}(alone|without)', 'regex', 'high', 'grooming_risk', 'Isolation request')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. Reports
-- ============================================================

CREATE TABLE IF NOT EXISTS content_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'forum_post', 'forum_reply', 'project', 'project_comment', 'message', 'profile', 'grant'
  )),
  target_id UUID NOT NULL,
  target_author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'hate_harassment', 'bullying', 'nsfw', 'spam_scam', 'grooming_risk', 'pii_leak'
  )),
  detail TEXT,
  -- Frozen at report time so triage survives the author editing or deleting.
  content_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  severity TEXT CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high')),
  admin_notes TEXT,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One report per person per item: the auto-quarantine threshold counts
  -- reporters, so it must not be gameable by one user filing repeatedly.
  UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_content_reports_target ON content_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_open ON content_reports(created_at DESC) WHERE status = 'open';

-- Append-only. Written by SECURITY DEFINER functions only — no write policies,
-- the pattern 059 uses for api_access_log.
CREATE TABLE IF NOT EXISTS moderation_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('system', 'admin', 'reporter')),
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_type TEXT,
  target_id UUID,
  severity TEXT CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high')),
  action TEXT NOT NULL CHECK (action IN (
    'flagged', 'warned', 'quarantined', 'restored', 'removed', 'suspended', 'escalated'
  )),
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_log_created ON moderation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_log_user ON moderation_log(user_id);

-- ============================================================
-- 4. Scanner
-- ============================================================

CREATE OR REPLACE FUNCTION scan_content(p_text TEXT, p_country CHAR(2) DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_matches JSONB := '[]'::JSONB;
  v_rank INTEGER := 0;  -- 0 none, 1 low, 2 medium, 3 high
  v_hit BOOLEAN;
BEGIN
  IF p_text IS NULL OR length(btrim(p_text)) = 0 THEN
    RETURN jsonb_build_object('severity', NULL, 'matches', v_matches);
  END IF;

  -- Ordered high-first so matches[0] names the worst rule, which is what the
  -- quarantine record uses as its category.

  FOR v_rule IN
    SELECT id, pattern, kind, severity, category
    FROM moderation_terms
    WHERE is_active
      AND (country_code IS NULL OR country_code = p_country)
    ORDER BY CASE severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC
  LOOP
    IF v_rule.kind = 'regex' THEN
      v_hit := p_text ~* v_rule.pattern;
    ELSE
      -- Word-boundary match so "class" does not trip a rule for "ass".
      v_hit := p_text ~* ('\m' || regexp_replace(v_rule.pattern, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M');
    END IF;

    IF v_hit THEN
      v_matches := v_matches || jsonb_build_object(
        'rule_id', v_rule.id,
        'severity', v_rule.severity,
        'category', v_rule.category
      );

      -- Highest severity across all matched rules wins.
      v_rank := GREATEST(v_rank, CASE v_rule.severity
        WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'severity', CASE v_rank WHEN 3 THEN 'high' WHEN 2 THEN 'medium' WHEN 1 THEN 'low' ELSE NULL END,
    'matches', v_matches
  );
END;
$$;

REVOKE ALL ON FUNCTION scan_content(TEXT, CHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION scan_content(TEXT, CHAR) TO authenticated;

-- ============================================================
-- 5. Insert-time moderation
-- ============================================================

-- One trigger for all four content tables. The column holding the text and
-- the column holding the author differ per table, so both are passed as
-- trigger arguments rather than branching on TG_TABLE_NAME.
--   TG_ARGV[0] = text column, TG_ARGV[1] = author column
CREATE OR REPLACE FUNCTION moderate_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text TEXT;
  v_author UUID;
  v_country CHAR(2);
  v_scan JSONB;
  v_severity TEXT;
  v_settings moderation_settings%ROWTYPE;
  v_row JSONB := to_jsonb(NEW);
  v_target TEXT;
BEGIN
  v_text := v_row ->> TG_ARGV[0];
  v_author := (v_row ->> TG_ARGV[1])::UUID;

  -- content_reports.target_type is singular; TG_TABLE_NAME is the plural table.
  v_target := CASE TG_TABLE_NAME
    WHEN 'forum_posts' THEN 'forum_post'
    WHEN 'forum_replies' THEN 'forum_reply'
    WHEN 'project_comments' THEN 'project_comment'
    WHEN 'messages' THEN 'message'
    ELSE TG_TABLE_NAME
  END;

  SELECT * INTO v_settings FROM moderation_settings WHERE id = 1;

  SELECT upper(left(COALESCE(p.country, ''), 2)) INTO v_country FROM profiles p WHERE p.id = v_author;

  v_scan := scan_content(v_text, NULLIF(v_country, ''));
  v_severity := v_scan ->> 'severity';

  IF v_severity IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.moderation_severity := v_severity;

  IF v_severity = 'low' THEN
    INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
    VALUES ('system', v_author, v_target, NEW.id, 'low', 'flagged', v_scan);

    PERFORM send_notification(
      v_author,
      'moderation_warning',
      'Community guidelines reminder',
      'Something you posted was flagged by our automated filter. Please review the community guidelines.',
      '/help'
    );

    RETURN NEW;
  END IF;

  -- medium and high are both withheld from view immediately.
  NEW.status := 'quarantined';
  NEW.quarantined_at := now();

  INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
  VALUES ('system', v_author, v_target, NEW.id, v_severity, 'quarantined', v_scan);

  -- Enters the same queue a human report would, so moderators triage one list.
  -- reporter_id = author is what marks the row as machine-generated.
  INSERT INTO content_reports (reporter_id, target_type, target_id, target_author_id, category, detail, content_snapshot, severity, status)
  VALUES (
    v_author,
    v_target,
    NEW.id,
    v_author,
    COALESCE((v_scan -> 'matches' -> 0 ->> 'category'), 'hate_harassment'),
    'Automatically flagged by the content filter.',
    left(v_text, 2000),
    v_severity,
    'open'
  )
  ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING;

  IF v_severity = 'high' THEN
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET is_suspended = TRUE,
        suspension_reason = 'Automated safety escalation pending review',
        updated_at = now()
    WHERE id = v_author;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

    INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
    VALUES ('system', v_author, v_target, NEW.id, 'high', 'suspended', v_scan);

    PERFORM escalate_to_safety(v_author, v_target, NEW.id, v_severity);
  END IF;

  RETURN NEW;
END;
$$;

-- High-severity events reach the safety team AND, when the author is a
-- school-verified student, the staff of their institution. That second hop is
-- the safeguarding requirement — a school has to know.
CREATE OR REPLACE FUNCTION escalate_to_safety(
  p_user UUID,
  p_target_type TEXT,
  p_target_id UUID,
  p_severity TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin RECORD;
BEGIN
  FOR v_admin IN
    SELECT p.id FROM profiles p
    WHERE has_permission(p.id, 'moderation:escalate') AND p.id <> p_user
  LOOP
    PERFORM send_notification(
      v_admin.id,
      'moderation_escalation',
      'High-severity content flagged',
      'Automated moderation quarantined a ' || p_target_type || ' and suspended the author pending review.',
      '/admin/moderation'
    );
  END LOOP;

  FOR v_admin IN
    SELECT im.user_id FROM institution_members im
    JOIN student_safeguarding ss ON ss.institution_id = im.institution_id
    WHERE ss.user_id = p_user
      AND im.status = 'approved'
      AND im.role IN ('admin', 'educator')
  LOOP
    PERFORM send_notification(
      v_admin.user_id,
      'moderation_escalation',
      'Safety escalation for one of your students',
      'A student registered to your institution triggered a high-severity safety flag. The safety team has been notified.',
      '/institutions'
    );
  END LOOP;

  INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action)
  VALUES ('system', p_user, p_target_type, p_target_id, p_severity, 'escalated');
END;
$$;

DROP TRIGGER IF EXISTS moderate_forum_posts_trigger ON forum_posts;
CREATE TRIGGER moderate_forum_posts_trigger
  BEFORE INSERT ON forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'author_id');

DROP TRIGGER IF EXISTS moderate_forum_replies_trigger ON forum_replies;
CREATE TRIGGER moderate_forum_replies_trigger
  BEFORE INSERT ON forum_replies
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'author_id');

DROP TRIGGER IF EXISTS moderate_project_comments_trigger ON project_comments;
CREATE TRIGGER moderate_project_comments_trigger
  BEFORE INSERT ON project_comments
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'user_id');

DROP TRIGGER IF EXISTS moderate_messages_trigger ON messages;
CREATE TRIGGER moderate_messages_trigger
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'sender_id');

-- ============================================================
-- 6. Report-driven auto-quarantine
-- ============================================================

CREATE OR REPLACE FUNCTION set_content_status(
  p_target_type TEXT,
  p_target_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_target_type = 'forum_post' OR p_target_type = 'forum_posts' THEN
    UPDATE forum_posts SET status = p_status,
      quarantined_at = CASE WHEN p_status = 'quarantined' THEN now() ELSE NULL END
      WHERE id = p_target_id;
  ELSIF p_target_type = 'forum_reply' OR p_target_type = 'forum_replies' THEN
    UPDATE forum_replies SET status = p_status,
      quarantined_at = CASE WHEN p_status = 'quarantined' THEN now() ELSE NULL END
      WHERE id = p_target_id;
  ELSIF p_target_type = 'project_comment' OR p_target_type = 'project_comments' THEN
    UPDATE project_comments SET status = p_status,
      quarantined_at = CASE WHEN p_status = 'quarantined' THEN now() ELSE NULL END
      WHERE id = p_target_id;
  ELSIF p_target_type = 'message' OR p_target_type = 'messages' THEN
    UPDATE messages SET status = p_status,
      quarantined_at = CASE WHEN p_status = 'quarantined' THEN now() ELSE NULL END
      WHERE id = p_target_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION apply_report_threshold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings moderation_settings%ROWTYPE;
  v_count INTEGER;
BEGIN
  SELECT * INTO v_settings FROM moderation_settings WHERE id = 1;

  IF NOT v_settings.auto_quarantine_enabled THEN
    RETURN NEW;
  END IF;

  -- Distinct reporters, not distinct reports: the UNIQUE constraint on
  -- (reporter, target) already makes those the same thing, but counting
  -- reporters states the intent.
  SELECT COUNT(DISTINCT cr.reporter_id) INTO v_count
  FROM content_reports cr
  WHERE cr.target_type = NEW.target_type
    AND cr.target_id = NEW.target_id
    AND cr.created_at > now() - make_interval(mins => v_settings.report_window_minutes);

  IF v_count >= v_settings.report_threshold THEN
    PERFORM set_content_status(NEW.target_type, NEW.target_id, 'quarantined');

    INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
    VALUES ('reporter', NEW.target_author_id, NEW.target_type, NEW.target_id, NEW.severity, 'quarantined',
            jsonb_build_object('reports', v_count, 'threshold', v_settings.report_threshold));

    IF NEW.category = 'grooming_risk' AND NEW.target_author_id IS NOT NULL THEN
      PERFORM escalate_to_safety(NEW.target_author_id, NEW.target_type, NEW.target_id, 'high');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_report_threshold_trigger ON content_reports;
CREATE TRIGGER apply_report_threshold_trigger
  AFTER INSERT ON content_reports
  FOR EACH ROW
  EXECUTE FUNCTION apply_report_threshold();

-- Admin action from the moderation queue.
CREATE OR REPLACE FUNCTION moderate_report(
  p_report UUID,
  p_action TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_report content_reports%ROWTYPE;
BEGIN
  IF NOT has_permission(v_actor, 'moderation:action') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_action NOT IN ('restore', 'quarantine', 'remove', 'dismiss') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_action');
  END IF;

  SELECT * INTO v_report FROM content_reports WHERE id = p_report;
  IF v_report.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF p_action = 'restore' THEN
    PERFORM set_content_status(v_report.target_type, v_report.target_id, 'active');
  ELSIF p_action = 'quarantine' THEN
    PERFORM set_content_status(v_report.target_type, v_report.target_id, 'quarantined');
  ELSIF p_action = 'remove' THEN
    PERFORM set_content_status(v_report.target_type, v_report.target_id, 'removed');
  END IF;

  UPDATE content_reports
  SET status = CASE WHEN p_action = 'dismiss' THEN 'dismissed' ELSE 'actioned' END,
      admin_notes = COALESCE(p_notes, admin_notes),
      resolved_by = v_actor,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_report;

  INSERT INTO moderation_log (actor_kind, actor_id, user_id, target_type, target_id, severity, action, detail)
  VALUES ('admin', v_actor, v_report.target_author_id, v_report.target_type, v_report.target_id, v_report.severity,
          CASE p_action
            WHEN 'restore' THEN 'restored'
            WHEN 'quarantine' THEN 'quarantined'
            WHEN 'remove' THEN 'removed'
            ELSE 'flagged'
          END,
          jsonb_build_object('report_id', p_report, 'notes', p_notes));

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION moderate_report(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION moderate_report(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 7. Visibility — these REPLACE the permissive policies
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view posts" ON forum_posts;
CREATE POLICY "Anyone can view posts"
  ON forum_posts FOR SELECT
  USING (
    status = 'active'
    OR author_id = auth.uid()
    OR has_permission(auth.uid(), 'moderation:view')
  );

DROP POLICY IF EXISTS "Anyone can view replies" ON forum_replies;
CREATE POLICY "Anyone can view replies"
  ON forum_replies FOR SELECT
  USING (
    status = 'active'
    OR author_id = auth.uid()
    OR has_permission(auth.uid(), 'moderation:view')
  );

DROP POLICY IF EXISTS "Comments on public projects are viewable" ON project_comments;
CREATE POLICY "Comments on public projects are viewable"
  ON project_comments FOR SELECT
  USING (
    (status = 'active' OR user_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'))
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE id = project_id
      AND (is_public = TRUE OR owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view messages in own conversations" ON messages;
CREATE POLICY "Users can view messages in own conversations"
  ON messages FOR SELECT
  USING (
    (status = 'active' OR sender_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'))
    AND EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
      AND user_id = auth.uid()
    )
  );

-- Counts have to agree with what the policies show, the same way 045 patched
-- get_grant_application_count to stop counting drafts.
CREATE OR REPLACE FUNCTION get_board_post_count(board_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM forum_posts WHERE board_id = board_uuid AND status = 'active';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_post_reply_count(post_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM forum_replies WHERE post_id = post_uuid AND status = 'active';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_board_latest_post(board_uuid UUID)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
  SELECT MAX(created_at) FROM forum_posts WHERE board_id = board_uuid AND status = 'active';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_project_comment_count(project_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM project_comments WHERE project_id = project_uuid AND status = 'active';
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- 8. Queue
-- ============================================================

-- security_invoker: the view must be filtered by the caller's RLS on
-- content_reports, not by the (superuser) view owner's.
CREATE OR REPLACE VIEW moderation_queue WITH (security_invoker = true) AS
SELECT
  cr.id,
  CASE WHEN cr.reporter_id = cr.target_author_id THEN 'automated' ELSE 'report' END AS source,
  cr.target_type,
  cr.target_id,
  cr.target_author_id,
  cr.category,
  cr.severity,
  cr.status,
  cr.content_snapshot,
  cr.created_at,
  (SELECT COUNT(*)::INTEGER FROM content_reports x
   WHERE x.target_type = cr.target_type AND x.target_id = cr.target_id) AS report_count
FROM content_reports cr;

-- ============================================================
-- 9. RLS
-- ============================================================

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own reports" ON content_reports;
CREATE POLICY "Users can view their own reports"
  ON content_reports FOR SELECT
  USING (reporter_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'));

DROP POLICY IF EXISTS "Authenticated users can report content" ON content_reports;
CREATE POLICY "Authenticated users can report content"
  ON content_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND status = 'open');

DROP POLICY IF EXISTS "Moderators can triage reports" ON content_reports;
CREATE POLICY "Moderators can triage reports"
  ON content_reports FOR UPDATE
  USING (has_permission(auth.uid(), 'moderation:action'));

-- The term list is a map of what the filter looks for. Restricted to
-- moderators so it cannot be read for evasion.
DROP POLICY IF EXISTS "Moderators can view terms" ON moderation_terms;
CREATE POLICY "Moderators can view terms"
  ON moderation_terms FOR SELECT
  USING (has_permission(auth.uid(), 'moderation:view'));

DROP POLICY IF EXISTS "Moderators can manage terms" ON moderation_terms;
CREATE POLICY "Moderators can manage terms"
  ON moderation_terms FOR ALL
  USING (has_permission(auth.uid(), 'moderation:action'))
  WITH CHECK (has_permission(auth.uid(), 'moderation:action'));

DROP POLICY IF EXISTS "Moderators can view settings" ON moderation_settings;
CREATE POLICY "Moderators can view settings"
  ON moderation_settings FOR SELECT
  USING (has_permission(auth.uid(), 'moderation:view'));

DROP POLICY IF EXISTS "Moderators can change settings" ON moderation_settings;
CREATE POLICY "Moderators can change settings"
  ON moderation_settings FOR UPDATE
  USING (has_permission(auth.uid(), 'moderation:action'))
  WITH CHECK (has_permission(auth.uid(), 'moderation:action'));

DROP POLICY IF EXISTS "Auditors can view the moderation log" ON moderation_log;
CREATE POLICY "Auditors can view the moderation log"
  ON moderation_log FOR SELECT
  USING (has_permission(auth.uid(), 'audit:view') OR has_permission(auth.uid(), 'moderation:view'));

-- No write policies on moderation_log: it is written only by the SECURITY
-- DEFINER functions above.

NOTIFY pgrst, 'reload schema';
