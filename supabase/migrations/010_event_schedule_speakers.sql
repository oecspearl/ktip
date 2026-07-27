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
