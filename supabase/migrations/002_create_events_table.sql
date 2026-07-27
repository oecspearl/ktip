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
