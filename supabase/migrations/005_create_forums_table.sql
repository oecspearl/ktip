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
