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
