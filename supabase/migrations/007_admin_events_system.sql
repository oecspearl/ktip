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
