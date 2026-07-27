-- Migration 014: Member Directory
-- Adds skills to profiles and indexes for directory search
-- Supports the PAD requirement for networking and knowledge exchange

-- Add skills column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Index for skills search (GIN index for array containment queries)
CREATE INDEX IF NOT EXISTS idx_profiles_skills ON profiles USING GIN (skills);

-- Index for country filtering
CREATE INDEX IF NOT EXISTS idx_profiles_country ON profiles(country);
