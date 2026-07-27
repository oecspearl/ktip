-- ============================================================
-- KTIP — Complete database schema
-- Combined from migrations 000-030. Paste into the Supabase
-- SQL editor of a FRESH project and run once.
-- ============================================================


-- ============================================================
-- migrations/000_create_profiles_table.sql
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
-- migrations/001_create_projects_table.sql
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
  summary TEXT,
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
-- migrations/002_create_events_table.sql
-- ============================================================
-- Events Table Migration
-- This creates the events table and event_rsvps table with Row Level Security

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  summary TEXT,
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
-- migrations/003_create_grants_table.sql
-- ============================================================
-- Grants Table Migration
-- This creates the grants table and grant_applications table with Row Level Security

-- Create grants table
CREATE TABLE IF NOT EXISTS grants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  summary TEXT,
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
-- migrations/004_create_messages_table.sql
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
-- migrations/005_create_forums_table.sql
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
-- migrations/006_create_avatars_storage.sql
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
-- migrations/007_admin_events_system.sql
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
-- migrations/008_event_registration_forms.sql
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
-- migrations/009_event_page_sections.sql
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
-- migrations/010_event_schedule_speakers.sql
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
-- migrations/011_fix_event_default_status.sql
-- ============================================================
-- Migration 011: Fix event default status
-- Events should be created as drafts so admins can set them up before publishing

ALTER TABLE events ALTER COLUMN status SET DEFAULT 'draft';


-- ============================================================
-- migrations/012_admin_dashboard_policies.sql
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
-- migrations/013_climate_action_tags.sql
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
-- migrations/014_member_directory.sql
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
-- migrations/015_resource_library.sql
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
-- migrations/016_analytics_functions.sql
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
-- migrations/017_notifications.sql
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
-- migrations/018_grievances.sql
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
-- migrations/019_whiteboards.sql
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
-- migrations/020_whiteboard_permissions.sql
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
-- migrations/021_preregistrations.sql
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
-- migrations/022_analytics.sql
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
-- migrations/023_uat_responses.sql
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
-- migrations/024_featured_projects.sql
-- ============================================================
-- Add is_featured column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- Index for quick featured project lookups
CREATE INDEX IF NOT EXISTS idx_projects_is_featured ON projects(is_featured) WHERE is_featured = true;


-- ============================================================
-- migrations/025_proposals.sql
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
-- migrations/026_documents.sql
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
-- migrations/027_storage_buckets.sql
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
-- migrations/028_profiles_delete.sql
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
-- migrations/029_conversations_update.sql
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
-- migrations/030_admin_projects_policies.sql
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

