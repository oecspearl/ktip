-- ============================================================
-- PATCH: Update image URLs on existing seed data rows
-- Run this in Supabase SQL Editor to apply images to existing data
-- ============================================================

-- PROJECTS
UPDATE projects SET image_url = 'https://images.unsplash.com/photo-1762337547936-9b92844d7e44?w=800&h=600&fit=crop' WHERE id = 'b0000000-0000-0000-0000-000000000001';
UPDATE projects SET image_url = 'https://images.unsplash.com/photo-1693302981072-0d72e90623b3?w=800&h=600&fit=crop' WHERE id = 'b0000000-0000-0000-0000-000000000002';
UPDATE projects SET image_url = 'https://images.unsplash.com/photo-1536069221282-d877868cad6b?w=800&h=600&fit=crop' WHERE id = 'b0000000-0000-0000-0000-000000000003';
UPDATE projects SET image_url = 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?w=800&h=600&fit=crop' WHERE id = 'b0000000-0000-0000-0000-000000000004';
UPDATE projects SET image_url = 'https://images.unsplash.com/photo-1708649290066-5f617003b93f?w=800&h=600&fit=crop' WHERE id = 'b0000000-0000-0000-0000-000000000005';
UPDATE projects SET image_url = 'https://images.unsplash.com/photo-1772602666529-80b72786bca6?w=800&h=600&fit=crop' WHERE id = 'b0000000-0000-0000-0000-000000000006';
UPDATE projects SET image_url = 'https://images.unsplash.com/photo-1758691461932-d0aa0ebf6b31?w=800&h=600&fit=crop' WHERE id = 'b0000000-0000-0000-0000-000000000007';
UPDATE projects SET image_url = 'https://images.unsplash.com/photo-1530053969600-caed2596d242?w=800&h=600&fit=crop' WHERE id = 'b0000000-0000-0000-0000-000000000008';

-- EVENTS
UPDATE events SET image_url = 'https://images.unsplash.com/photo-1629904869392-ae2a682d4d01?w=800&h=600&fit=crop' WHERE id = 'd0000000-0000-0000-0000-000000000001';
UPDATE events SET image_url = 'https://images.unsplash.com/photo-1520367691844-3df6787b3b6f?w=800&h=600&fit=crop' WHERE id = 'd0000000-0000-0000-0000-000000000002';
UPDATE events SET image_url = 'https://images.unsplash.com/photo-1505784045224-1247b2b29cf3?w=800&h=600&fit=crop' WHERE id = 'd0000000-0000-0000-0000-000000000003';
UPDATE events SET image_url = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=600&fit=crop' WHERE id = 'd0000000-0000-0000-0000-000000000004';
UPDATE events SET image_url = 'https://images.unsplash.com/photo-1559666126-84f389727b9a?w=800&h=600&fit=crop' WHERE id = 'd0000000-0000-0000-0000-000000000005';
UPDATE events SET image_url = 'https://images.unsplash.com/photo-1752668223248-f49e9c042c23?w=800&h=600&fit=crop' WHERE id = 'd0000000-0000-0000-0000-000000000006';

-- EVENT SPEAKERS
UPDATE event_speakers SET photo_url = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face' WHERE id = 'e1000000-0000-0000-0000-000000000001';
UPDATE event_speakers SET photo_url = 'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=400&h=400&fit=crop&crop=face' WHERE id = 'e1000000-0000-0000-0000-000000000002';
UPDATE event_speakers SET photo_url = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop&crop=face' WHERE id = 'e1000000-0000-0000-0000-000000000003';
UPDATE event_speakers SET photo_url = 'https://images.unsplash.com/photo-1630959305606-3123a081dada?w=400&h=400&fit=crop&crop=face' WHERE id = 'e1000000-0000-0000-0000-000000000004';

-- RESOURCES
UPDATE resources SET thumbnail_url = 'https://images.unsplash.com/photo-1762337547936-9b92844d7e44?w=600&h=400&fit=crop' WHERE id = 'c0000000-0000-0000-0000-000000000001';
UPDATE resources SET thumbnail_url = 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=600&h=400&fit=crop' WHERE id = 'c0000000-0000-0000-0000-000000000002';
UPDATE resources SET thumbnail_url = 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&h=400&fit=crop' WHERE id = 'c0000000-0000-0000-0000-000000000003';
UPDATE resources SET thumbnail_url = 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&h=400&fit=crop' WHERE id = 'c0000000-0000-0000-0000-000000000004';
UPDATE resources SET thumbnail_url = 'https://images.unsplash.com/photo-1708649290066-5f617003b93f?w=600&h=400&fit=crop' WHERE id = 'c0000000-0000-0000-0000-000000000005';
UPDATE resources SET thumbnail_url = 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=400&fit=crop' WHERE id = 'c0000000-0000-0000-0000-000000000006';
UPDATE resources SET thumbnail_url = 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=600&h=400&fit=crop' WHERE id = 'c0000000-0000-0000-0000-000000000007';
UPDATE resources SET thumbnail_url = 'https://images.unsplash.com/photo-1530053969600-caed2596d242?w=600&h=400&fit=crop' WHERE id = 'c0000000-0000-0000-0000-000000000008';
