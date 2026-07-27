-- 042: Short summary field for the Discover hero
-- Optional one-liner shown in the homepage hero; falls back to description when null.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE grants ADD COLUMN IF NOT EXISTS summary TEXT;
