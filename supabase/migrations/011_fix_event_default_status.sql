-- Migration 011: Fix event default status
-- Events should be created as drafts so admins can set them up before publishing

ALTER TABLE events ALTER COLUMN status SET DEFAULT 'draft';
