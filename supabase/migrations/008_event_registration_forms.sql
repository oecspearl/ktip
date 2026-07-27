-- Migration 008: Add custom registration form fields to events and registration data to RSVPs
-- This enables admins to build custom registration forms per event

-- Add JSONB column for custom registration field definitions on events
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_fields JSONB DEFAULT '[]'::jsonb;

-- Add JSONB column for storing attendee registration responses on RSVPs
ALTER TABLE event_rsvps ADD COLUMN IF NOT EXISTS registration_data JSONB DEFAULT '{}'::jsonb;

-- Comment for documentation
COMMENT ON COLUMN events.registration_fields IS 'JSON array of RegistrationFieldConfig objects defining the custom registration form';
COMMENT ON COLUMN event_rsvps.registration_data IS 'JSON object of field_id -> value pairs from registration form submission';
