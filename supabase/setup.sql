-- ============================================================
-- KTIP Complete Database Setup
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This sets up ALL tables, indexes, RLS policies, triggers, and seed data
-- ============================================================

-- ============================================================
-- 0. Profiles Table (linked to Supabase Auth)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON profiles(display_name);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT USING (TRUE);

CREATE POLICY "Users can create their own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
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
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 1. Projects, Likes, Comments
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
CREATE INDEX IF NOT EXISTS idx_projects_phase ON projects(phase);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_public ON projects(is_public) WHERE is_public = TRUE;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public projects are viewable by everyone"
  ON projects FOR SELECT USING (is_public = TRUE OR owner_id = auth.uid());

CREATE POLICY "Authenticated users can create projects"
  ON projects FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE USING (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Project Likes
CREATE TABLE IF NOT EXISTS project_likes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_likes_project ON project_likes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_likes_user ON project_likes(user_id);

ALTER TABLE project_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view likes"
  ON project_likes FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can like projects"
  ON project_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own likes"
  ON project_likes FOR DELETE USING (auth.uid() = user_id);

-- Project Comments
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

ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments on public projects are viewable"
  ON project_comments FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects WHERE id = project_id AND (is_public = TRUE OR owner_id = auth.uid())));

CREATE POLICY "Authenticated users can comment"
  ON project_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM projects WHERE id = project_id AND (is_public = TRUE OR owner_id = auth.uid())));

CREATE POLICY "Users can update their own comments"
  ON project_comments FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON project_comments FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_project_comments_updated_at ON project_comments;
CREATE TRIGGER update_project_comments_updated_at
  BEFORE UPDATE ON project_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Project helper functions
CREATE OR REPLACE FUNCTION get_project_like_count(project_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM project_likes WHERE project_id = project_uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_project_comment_count(project_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM project_comments WHERE project_id = project_uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION has_user_liked_project(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM project_likes WHERE project_id = project_uuid AND user_id = user_uuid);
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- 2. Events and RSVPs
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_virtual ON events(is_virtual);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view events"
  ON events FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can create events"
  ON events FOR INSERT WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Organizers can update their events"
  ON events FOR UPDATE USING (auth.uid() = organizer_id);

CREATE POLICY "Organizers can delete their events"
  ON events FOR DELETE USING (auth.uid() = organizer_id);

-- Event RSVPs
CREATE TABLE IF NOT EXISTS event_rsvps (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user ON event_rsvps(user_id);

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view RSVPs"
  ON event_rsvps FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can RSVP to events"
  ON event_rsvps FOR INSERT
  WITH CHECK (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()));

CREATE POLICY "Users can cancel their own RSVPs"
  ON event_rsvps FOR DELETE USING (auth.uid() = user_id);

-- Event helper functions
CREATE OR REPLACE FUNCTION is_event_full(event_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  event_capacity INTEGER;
  rsvp_count INTEGER;
BEGIN
  SELECT capacity INTO event_capacity FROM events WHERE id = event_uuid;
  IF event_capacity IS NULL THEN RETURN FALSE; END IF;
  SELECT COUNT(*) INTO rsvp_count FROM event_rsvps WHERE event_id = event_uuid;
  RETURN rsvp_count >= event_capacity;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_event_rsvp_count(event_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM event_rsvps WHERE event_id = event_uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION has_user_rsvpd(event_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM event_rsvps WHERE event_id = event_uuid AND user_id = user_uuid);
$$ LANGUAGE SQL STABLE;

DROP TRIGGER IF EXISTS check_event_capacity_trigger ON event_rsvps;
CREATE OR REPLACE FUNCTION check_event_capacity()
RETURNS TRIGGER AS $$
BEGIN
  IF is_event_full(NEW.event_id) THEN RAISE EXCEPTION 'Event is full'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_event_capacity_trigger
  BEFORE INSERT ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION check_event_capacity();

-- ============================================================
-- 3. Grants and Applications
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_grants_type ON grants(grant_type);
CREATE INDEX IF NOT EXISTS idx_grants_active ON grants(is_active);
CREATE INDEX IF NOT EXISTS idx_grants_deadline ON grants(deadline);

ALTER TABLE grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active grants"
  ON grants FOR SELECT USING (is_active = TRUE OR auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create grants"
  ON grants FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update grants they created"
  ON grants FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete grants they created"
  ON grants FOR DELETE USING (auth.uid() IS NOT NULL);

-- Grant Applications
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

CREATE INDEX IF NOT EXISTS idx_grant_applications_grant ON grant_applications(grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_applications_user ON grant_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_grant_applications_status ON grant_applications(status);

ALTER TABLE grant_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own applications"
  ON grant_applications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create applications"
  ON grant_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM grant_applications WHERE grant_id = grant_applications.grant_id AND user_id = auth.uid()));

CREATE POLICY "Users can update their own applications"
  ON grant_applications FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own applications"
  ON grant_applications FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION get_grant_application_count(grant_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM grant_applications WHERE grant_id = grant_uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION has_user_applied(grant_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM grant_applications WHERE grant_id = grant_uuid AND user_id = user_uuid);
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- 4. Messaging System
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);

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

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Helper function to check conversation membership (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION is_conversation_member(conv_id UUID, uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conv_id AND user_id = uid
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (is_conversation_member(id, auth.uid()));

CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view participants of own conversations"
  ON conversation_participants FOR SELECT
  USING (is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "Authenticated users can add participants"
  ON conversation_participants FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view messages in own conversations"
  ON messages FOR SELECT
  USING (is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "Users can send messages to own conversations"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "Users can delete their own messages"
  ON messages FOR DELETE USING (auth.uid() = sender_id);

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
  FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

CREATE OR REPLACE FUNCTION find_conversation_between(user1 UUID, user2 UUID)
RETURNS UUID AS $$
  SELECT cp1.conversation_id
  FROM conversation_participants cp1
  JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = user1 AND cp2.user_id = user2
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Enable Realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================================
-- 5. Forums System
-- ============================================================

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

ALTER TABLE forum_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view forum boards"
  ON forum_boards FOR SELECT USING (TRUE);

CREATE POLICY "Anyone can view posts"
  ON forum_posts FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can create posts"
  ON forum_posts FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update own posts"
  ON forum_posts FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own posts"
  ON forum_posts FOR DELETE USING (auth.uid() = author_id);

CREATE POLICY "Anyone can view replies"
  ON forum_replies FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can create replies"
  ON forum_replies FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update own replies"
  ON forum_replies FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own replies"
  ON forum_replies FOR DELETE USING (auth.uid() = author_id);

DROP TRIGGER IF EXISTS update_forum_posts_updated_at ON forum_posts;
CREATE TRIGGER update_forum_posts_updated_at
  BEFORE UPDATE ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_forum_replies_updated_at ON forum_replies;
CREATE TRIGGER update_forum_replies_updated_at
  BEFORE UPDATE ON forum_replies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

-- Seed default forum boards
INSERT INTO forum_boards (name, description, slug, icon, sort_order) VALUES
  ('General Discussion', 'Open discussion about Caribbean innovation and technology', 'general', 'MessageSquare', 1),
  ('Project Showcase', 'Share and discuss your projects with the community', 'showcase', 'FolderKanban', 2),
  ('Funding & Grants', 'Discuss funding opportunities and grant applications', 'funding', 'DollarSign', 3),
  ('Mentorship', 'Find mentors and share knowledge', 'mentorship', 'Users', 4),
  ('Events & Meetups', 'Coordinate and discuss upcoming events', 'events', 'Calendar', 5),
  ('Technical Help', 'Ask technical questions and get help from the community', 'tech-help', 'HelpCircle', 6)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Done! All tables, policies, triggers, and seed data created.
-- ============================================================
