-- 043: Flexible "Additional Details" metadata (groups + label/value items)
-- Ordered JSONB array; an entry with "items" is a group, an entry with "value" is a flat item.

ALTER TABLE grants ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '[]'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '[]'::jsonb;
