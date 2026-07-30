-- ============================================================
-- KTIP / FORGE Demo Seed Data
-- Run after all migrations have been applied.
-- Uses fixed UUIDs so foreign keys resolve correctly.
-- All demo users share the password: DemoPass123!
-- ============================================================

-- ============================================================
-- 1. AUTH USERS + PROFILES  (12 demo users across OECS countries)
-- ============================================================
-- Insert into auth.users first (profiles auto-created by trigger).
-- Then UPDATE profiles with full demo data.
-- Password hash below is bcrypt for "DemoPass123!"

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token) VALUES
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marcia.joseph@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Marcia Joseph","role":"oecs"}'::jsonb, NOW() - INTERVAL '180 days', NOW(), '', ''),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'devon.charles@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Devon Charles","role":"oecs"}'::jsonb, NOW() - INTERVAL '170 days', NOW(), '', ''),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'althea.williams@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Dr. Althea Williams","role":"mentor"}'::jsonb, NOW() - INTERVAL '150 days', NOW(), '', ''),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'james.pierre@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"James Pierre","role":"mentor"}'::jsonb, NOW() - INTERVAL '140 days', NOW(), '', ''),
  ('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'keisha.baptiste@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Keisha Baptiste","role":"entrepreneur"}'::jsonb, NOW() - INTERVAL '120 days', NOW(), '', ''),
  ('a0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rashid.mohammed@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Rashid Mohammed","role":"entrepreneur"}'::jsonb, NOW() - INTERVAL '110 days', NOW(), '', ''),
  ('a0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'camille.fontaine@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Camille Fontaine","role":"entrepreneur"}'::jsonb, NOW() - INTERVAL '100 days', NOW(), '', ''),
  ('a0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tariq.phillip@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Tariq Phillip","role":"student"}'::jsonb, NOW() - INTERVAL '90 days', NOW(), '', ''),
  ('a0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shania.lewis@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Shania Lewis","role":"student"}'::jsonb, NOW() - INTERVAL '80 days', NOW(), '', ''),
  ('a0000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marcus.george@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Marcus George","role":"student"}'::jsonb, NOW() - INTERVAL '70 days', NOW(), '', ''),
  ('a0000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sandra.mitchell@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Sandra Mitchell","role":"investor"}'::jsonb, NOW() - INTERVAL '130 days', NOW(), '', ''),
  ('a0000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'andre.williams@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Andre Williams","role":"private_sector"}'::jsonb, NOW() - INTERVAL '60 days', NOW(), '', '')
ON CONFLICT (id) DO NOTHING;

-- Now UPDATE the auto-created profiles with full demo data
UPDATE profiles SET display_name = 'Marcia Joseph', bio = 'OECS Innovation Director with 15 years of experience in Caribbean development policy and technology transfer.', avatar_url = 'https://images.unsplash.com/photo-1676694047749-ee0fa2709893?w=400&h=400&fit=crop&crop=face', country = 'Saint Lucia', roles = ARRAY['oecs','mentor'], skills = ARRAY['Policy & Governance','Project Management','Climate Resilience','Community Development'], is_verified = true, created_at = NOW() - INTERVAL '180 days' WHERE id = 'a0000000-0000-0000-0000-000000000001';
UPDATE profiles SET display_name = 'Devon Charles', bio = 'Senior Programme Officer at the OECS Commission. Passionate about digital transformation in small island states.', avatar_url = 'https://images.unsplash.com/photo-1696603865152-74514c198a07?w=400&h=400&fit=crop&crop=face', country = 'Dominica', roles = ARRAY['oecs'], skills = ARRAY['Business Strategy','Finance','Supply Chain'], is_verified = true, created_at = NOW() - INTERVAL '170 days' WHERE id = 'a0000000-0000-0000-0000-000000000002';
-- faculty role: holds grant:sponsor, so she can sponsor the student grant
-- applications below (064's enforce_grant_application_sponsor trigger).
UPDATE profiles SET display_name = 'Dr. Althea Williams', bio = 'Marine biologist and climate researcher at UWI. Mentor for environment and blue economy projects.', avatar_url = 'https://images.unsplash.com/photo-1581518869825-41b2eafe38b7?w=400&h=400&fit=crop&crop=face', country = 'Grenada', roles = ARRAY['mentor','faculty'], skills = ARRAY['Marine Conservation','Climate Resilience','Data Science','Renewable Energy'], is_verified = true, created_at = NOW() - INTERVAL '150 days' WHERE id = 'a0000000-0000-0000-0000-000000000003';
UPDATE profiles SET display_name = 'James Pierre', bio = 'Serial entrepreneur and tech investor. Founded 3 startups across the Caribbean.', avatar_url = 'https://images.unsplash.com/photo-1546884786-4a76106c9191?w=400&h=400&fit=crop&crop=face', country = 'Saint Kitts and Nevis', roles = ARRAY['mentor','investor'], skills = ARRAY['Software Development','Business Strategy','Marketing','Finance'], is_verified = true, created_at = NOW() - INTERVAL '140 days' WHERE id = 'a0000000-0000-0000-0000-000000000004';
UPDATE profiles SET display_name = 'Keisha Baptiste', bio = 'Founder of AgriTech SVG — using IoT sensors to help smallholder farmers in the Grenadines.', avatar_url = 'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=400&h=400&fit=crop&crop=face', country = 'Saint Vincent and the Grenadines', roles = ARRAY['entrepreneur'], skills = ARRAY['Agriculture Technology','Software Development','UX/UI Design'], is_verified = false, created_at = NOW() - INTERVAL '120 days' WHERE id = 'a0000000-0000-0000-0000-000000000005';
UPDATE profiles SET display_name = 'Rashid Mohammed', bio = 'Building EduCarib — a localized e-learning platform for Caribbean schools.', avatar_url = 'https://images.unsplash.com/photo-1649433658557-54cf58577c68?w=400&h=400&fit=crop&crop=face', country = 'Trinidad and Tobago', roles = ARRAY['entrepreneur'], skills = ARRAY['Education Technology','Software Development','Project Management'], is_verified = false, created_at = NOW() - INTERVAL '110 days' WHERE id = 'a0000000-0000-0000-0000-000000000006';
UPDATE profiles SET display_name = 'Camille Fontaine', bio = 'Tourism-tech innovator. Developing AR heritage trail apps for Dominica.', avatar_url = 'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?w=400&h=400&fit=crop&crop=face', country = 'Dominica', roles = ARRAY['entrepreneur'], skills = ARRAY['Tourism Innovation','Creative Arts','UX/UI Design','Marketing'], is_verified = false, created_at = NOW() - INTERVAL '100 days' WHERE id = 'a0000000-0000-0000-0000-000000000007';
UPDATE profiles SET display_name = 'Tariq Phillip', bio = 'Computer Science student at UWI exploring renewable energy monitoring systems.', avatar_url = 'https://images.unsplash.com/photo-1492288991661-058aa541ff43?w=400&h=400&fit=crop&crop=face', country = 'Antigua and Barbuda', roles = ARRAY['student'], skills = ARRAY['Software Development','Renewable Energy','Data Science'], is_verified = false, created_at = NOW() - INTERVAL '90 days' WHERE id = 'a0000000-0000-0000-0000-000000000008';
UPDATE profiles SET display_name = 'Shania Lewis', bio = 'Environmental science major passionate about coral reef monitoring with AI.', avatar_url = 'https://images.unsplash.com/photo-1606735819077-62180cf1fc97?w=400&h=400&fit=crop&crop=face', country = 'Grenada', roles = ARRAY['student'], skills = ARRAY['Marine Conservation','Data Science','Climate Resilience'], is_verified = false, created_at = NOW() - INTERVAL '80 days' WHERE id = 'a0000000-0000-0000-0000-000000000009';
UPDATE profiles SET display_name = 'Marcus George', bio = 'Business student interested in social entrepreneurship and community development.', avatar_url = 'https://images.unsplash.com/photo-1576558656222-ba66febe3dec?w=400&h=400&fit=crop&crop=face', country = 'Saint Lucia', roles = ARRAY['student'], skills = ARRAY['Business Strategy','Community Development','Marketing'], is_verified = false, created_at = NOW() - INTERVAL '70 days' WHERE id = 'a0000000-0000-0000-0000-000000000010';
UPDATE profiles SET display_name = 'Sandra Mitchell', bio = 'Angel investor focused on Caribbean cleantech and sustainable agriculture.', avatar_url = 'https://images.unsplash.com/photo-1630959305606-3123a081dada?w=400&h=400&fit=crop&crop=face', country = 'Barbados', roles = ARRAY['investor','private_sector'], skills = ARRAY['Finance','Renewable Energy','Agriculture Technology','Business Strategy'], is_verified = true, created_at = NOW() - INTERVAL '130 days' WHERE id = 'a0000000-0000-0000-0000-000000000011';
-- entrepreneur role added: private_sector alone has no grant:apply, and Andre
-- has a grant application below (064 trigger enforces the permission).
UPDATE profiles SET display_name = 'Andre Williams', bio = 'CTO at CaribbeanCloud Ltd. Advocates for open data and digital government in the OECS.', avatar_url = 'https://images.unsplash.com/photo-1528892952291-009c663ce843?w=400&h=400&fit=crop&crop=face', country = 'Montserrat', roles = ARRAY['private_sector','entrepreneur'], skills = ARRAY['Software Development','Healthcare Innovation','Water Management','Disaster Preparedness'], is_verified = true, created_at = NOW() - INTERVAL '60 days' WHERE id = 'a0000000-0000-0000-0000-000000000012';


-- ============================================================
-- 2. PROJECTS  (8 projects across categories & phases)
-- ============================================================

INSERT INTO projects (id, title, description, category, phase, hashtags, image_url, is_public, is_climate_action, owner_id, created_at) VALUES
  ('b0000000-0000-0000-0000-000000000001',
   'AgriSense SVG',
   'IoT soil-moisture and weather sensors for smallholder farmers in the Grenadines. The system sends SMS alerts and yield predictions via a simple dashboard, reducing crop loss by up to 30%.',
   'agriculture', 'prototype',
   ARRAY['iot','agriculture','climate','grenadines'],
   'https://images.unsplash.com/photo-1762337547936-9b92844d7e44?w=800&h=600&fit=crop',
   true, true,
   'a0000000-0000-0000-0000-000000000005',
   NOW() - INTERVAL '115 days'),

  ('b0000000-0000-0000-0000-000000000002',
   'EduCarib Platform',
   'A localised e-learning platform aligned with Caribbean curriculum standards. Features interactive lessons, teacher dashboards, and offline-capable mobile apps for schools with limited connectivity.',
   'education', 'funding',
   ARRAY['edtech','elearning','caribbean','offline'],
   'https://images.unsplash.com/photo-1693302981072-0d72e90623b3?w=800&h=600&fit=crop',
   true, false,
   'a0000000-0000-0000-0000-000000000006',
   NOW() - INTERVAL '105 days'),

  ('b0000000-0000-0000-0000-000000000003',
   'Dominica Heritage Trails',
   'Augmented-reality walking tours through Roseau''s historic sites. Visitors use their phones to see historical overlays, hear oral histories, and collect digital badges.',
   'technology', 'concept',
   ARRAY['ar','tourism','heritage','dominica'],
   'https://images.unsplash.com/photo-1536069221282-d877868cad6b?w=800&h=600&fit=crop',
   true, false,
   'a0000000-0000-0000-0000-000000000007',
   NOW() - INTERVAL '95 days'),

  ('b0000000-0000-0000-0000-000000000004',
   'SolarGrid Antigua',
   'Community micro-grid project pairing rooftop solar panels with battery storage. Aims to provide 100 households with resilient, affordable electricity.',
   'environment', 'funding',
   ARRAY['solar','energy','resilience','microgrid'],
   'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?w=800&h=600&fit=crop',
   true, true,
   'a0000000-0000-0000-0000-000000000008',
   NOW() - INTERVAL '85 days'),

  ('b0000000-0000-0000-0000-000000000005',
   'ReefWatch AI',
   'Machine-learning pipeline that analyses underwater drone footage to monitor coral bleaching, invasive species, and reef health across Grenadian marine parks.',
   'environment', 'prototype',
   ARRAY['ai','marine','coral','conservation'],
   'https://images.unsplash.com/photo-1708649290066-5f617003b93f?w=800&h=600&fit=crop',
   true, true,
   'a0000000-0000-0000-0000-000000000009',
   NOW() - INTERVAL '75 days'),

  ('b0000000-0000-0000-0000-000000000006',
   'CaribbeanCloud Gov',
   'Open-source cloud infrastructure toolkit for OECS governments. Includes citizen portal templates, open data APIs, and secure document management.',
   'technology', 'launch',
   ARRAY['govtech','opendata','cloud','oecs'],
   'https://images.unsplash.com/photo-1772602666529-80b72786bca6?w=800&h=600&fit=crop',
   true, false,
   'a0000000-0000-0000-0000-000000000012',
   NOW() - INTERVAL '55 days'),

  ('b0000000-0000-0000-0000-000000000007',
   'MediConnect OECS',
   'Telemedicine platform connecting rural clinics across OECS islands with specialists. Features video consultations, e-prescriptions, and patient record sharing.',
   'healthcare', 'concept',
   ARRAY['telehealth','healthcare','rural','telemedicine'],
   'https://images.unsplash.com/photo-1758691461932-d0aa0ebf6b31?w=800&h=600&fit=crop',
   true, false,
   'a0000000-0000-0000-0000-000000000012',
   NOW() - INTERVAL '45 days'),

  ('b0000000-0000-0000-0000-000000000008',
   'WaterSafe Montserrat',
   'Smart water-quality monitoring network using low-cost sensors deployed in rivers and reservoirs. Real-time data feeds a public dashboard and automated contamination alerts.',
   'environment', 'prototype',
   ARRAY['water','iot','monitoring','climate'],
   'https://images.unsplash.com/photo-1530053969600-caed2596d242?w=800&h=600&fit=crop',
   true, true,
   'a0000000-0000-0000-0000-000000000012',
   NOW() - INTERVAL '35 days')

ON CONFLICT (id) DO UPDATE SET
  image_url = EXCLUDED.image_url,
  title = EXCLUDED.title,
  description = EXCLUDED.description;


-- ============================================================
-- 3. PROJECT LIKES & COMMENTS
-- ============================================================

INSERT INTO project_likes (project_id, user_id) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000011'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000009'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000004'),
  ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000011')
ON CONFLICT DO NOTHING;

INSERT INTO project_comments (id, project_id, user_id, content, created_at) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003',
   'This is exactly what our farmers in Carriacou need! Have you considered integrating satellite rainfall data?', NOW() - INTERVAL '110 days'),
  ('c1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005',
   'Thanks Dr. Williams! Yes, we are looking into CHIRPS rainfall data for the next iteration.', NOW() - INTERVAL '109 days'),
  ('c1000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   'Great initiative Rashid. The OECS Education Unit would love to discuss curriculum alignment.', NOW() - INTERVAL '100 days'),
  ('c1000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000011',
   'I am interested in exploring investment opportunities for this micro-grid project. Let us connect!', NOW() - INTERVAL '80 days'),
  ('c1000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003',
   'Shania, brilliant work! I can help you access the Moliniere-Beausejour MPA drone datasets for training data.', NOW() - INTERVAL '70 days'),
  ('c1000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002',
   'Andre, this aligns perfectly with the OECS Digital Government Strategy. Let us schedule a call.', NOW() - INTERVAL '50 days')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 4. EVENTS  (6 events in various states)
-- ============================================================

INSERT INTO events (id, title, description, event_type, status, location, is_virtual, start_date, end_date, capacity, image_url, is_climate_action, organizer_id, created_at) VALUES
  ('d0000000-0000-0000-0000-000000000001',
   'OECS Innovation Hackathon 2026',
   'A 48-hour hackathon bringing together developers, designers, and entrepreneurs from across the OECS to build climate-resilient solutions. Prizes include mentorship packages and seed funding.',
   'hackathon', 'published',
   'Bay Gardens Hotel, Rodney Bay, Saint Lucia', false,
   NOW() + INTERVAL '30 days', NOW() + INTERVAL '32 days',
   100,
   'https://images.unsplash.com/photo-1629904869392-ae2a682d4d01?w=800&h=600&fit=crop',
   true,
   'a0000000-0000-0000-0000-000000000001',
   NOW() - INTERVAL '20 days'),

  ('d0000000-0000-0000-0000-000000000002',
   'Intro to IoT for Agriculture Workshop',
   'Hands-on workshop covering sensor basics, Arduino programming, and data dashboards. Participants will build a working soil-moisture monitor to take home.',
   'workshop', 'published',
   'National Research & Development Foundation, Kingstown', false,
   NOW() + INTERVAL '14 days', NOW() + INTERVAL '14 days',
   30,
   'https://images.unsplash.com/photo-1520367691844-3df6787b3b6f?w=800&h=600&fit=crop',
   true,
   'a0000000-0000-0000-0000-000000000005',
   NOW() - INTERVAL '30 days'),

  ('d0000000-0000-0000-0000-000000000003',
   'Caribbean Climate Tech Meetup',
   'Monthly virtual meetup for innovators working on climate solutions across the Caribbean. This month: coastal erosion monitoring technologies.',
   'meetup', 'published',
   NULL, true,
   NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days',
   NULL,
   'https://images.unsplash.com/photo-1505784045224-1247b2b29cf3?w=800&h=600&fit=crop',
   true,
   'a0000000-0000-0000-0000-000000000003',
   NOW() - INTERVAL '10 days'),

  ('d0000000-0000-0000-0000-000000000004',
   'OECS Digital Economy Conference 2026',
   'Two-day conference exploring digital transformation, fintech, and e-governance in OECS member states. Keynotes from regional and international speakers.',
   'conference', 'published',
   'Dominica State College, Roseau', false,
   NOW() + INTERVAL '60 days', NOW() + INTERVAL '62 days',
   200,
   'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=600&fit=crop',
   false,
   'a0000000-0000-0000-0000-000000000002',
   NOW() - INTERVAL '15 days'),

  ('d0000000-0000-0000-0000-000000000005',
   'Demo Day: Cohort 3 Startups',
   'Watch 8 Caribbean startups from the FORGE accelerator pitch to a panel of investors and mentors. Networking reception to follow.',
   'demo_day', 'published',
   'Grenada Trade Centre, St. George''s', false,
   NOW() + INTERVAL '45 days', NOW() + INTERVAL '45 days',
   150,
   'https://images.unsplash.com/photo-1559666126-84f389727b9a?w=800&h=600&fit=crop',
   false,
   'a0000000-0000-0000-0000-000000000004',
   NOW() - INTERVAL '5 days'),

  ('d0000000-0000-0000-0000-000000000006',
   'Blue Economy Innovation Summit',
   'Past event — a two-day summit that brought together 120 participants to explore ocean-based innovation opportunities for OECS nations.',
   'conference', 'completed',
   'Sandals Grande, Antigua', false,
   NOW() - INTERVAL '40 days', NOW() - INTERVAL '38 days',
   120,
   'https://images.unsplash.com/photo-1752668223248-f49e9c042c23?w=800&h=600&fit=crop',
   true,
   'a0000000-0000-0000-0000-000000000001',
   NOW() - INTERVAL '90 days')

ON CONFLICT (id) DO UPDATE SET
  image_url = EXCLUDED.image_url,
  title = EXCLUDED.title,
  description = EXCLUDED.description;


-- ============================================================
-- 5. EVENT RSVPs
-- ============================================================

INSERT INTO event_rsvps (id, event_id, user_id, status, created_at) VALUES
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'confirmed', NOW() - INTERVAL '18 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', 'confirmed', NOW() - INTERVAL '17 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'confirmed', NOW() - INTERVAL '16 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000009', 'confirmed', NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'confirmed', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000012', 'confirmed', NOW() - INTERVAL '13 days'),

  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'confirmed', NOW() - INTERVAL '25 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009', 'confirmed', NOW() - INTERVAL '24 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000010', 'confirmed', NOW() - INTERVAL '23 days'),

  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'confirmed', NOW() - INTERVAL '8 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000009', 'confirmed', NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000012', 'confirmed', NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000008', 'confirmed', NOW() - INTERVAL '5 days'),

  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'confirmed', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000011', 'confirmed', NOW() - INTERVAL '11 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000012', 'confirmed', NOW() - INTERVAL '10 days'),

  -- Past event — checked in attendees
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000003', 'checked_in', NOW() - INTERVAL '40 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000005', 'checked_in', NOW() - INTERVAL '40 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000009', 'checked_in', NOW() - INTERVAL '40 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000011', 'checked_in', NOW() - INTERVAL '40 days')

ON CONFLICT DO NOTHING;


-- ============================================================
-- 6. EVENT SPEAKERS (for the hackathon & conference)
-- ============================================================

INSERT INTO event_speakers (id, event_id, name, title, bio, photo_url, sort_order) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
   'Dr. Didacus Jules', 'Director General, OECS Commission',
   'Leading the OECS vision for regional integration, innovation, and sustainable development.',
   'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face', 1),
  ('e1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001',
   'Keisha Baptiste', 'Founder, AgriTech SVG',
   'Pioneer in agricultural IoT solutions for Caribbean smallholder farmers.',
   'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=400&h=400&fit=crop&crop=face', 2),
  ('e1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000004',
   'Prof. Brian Copeland', 'Dean of Engineering, UWI',
   'Expert in digital transformation and ICT policy for developing states.',
   'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop&crop=face', 1),
  ('e1000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004',
   'Sandra Mitchell', 'Angel Investor & Cleantech Advocate',
   'Active investor in Caribbean climate technology and sustainable agriculture ventures.',
   'https://images.unsplash.com/photo-1630959305606-3123a081dada?w=400&h=400&fit=crop&crop=face', 2)
ON CONFLICT (id) DO UPDATE SET
  photo_url = EXCLUDED.photo_url,
  name = EXCLUDED.name,
  title = EXCLUDED.title,
  bio = EXCLUDED.bio;


-- ============================================================
-- 7. EVENT SCHEDULE (hackathon)
-- ============================================================

INSERT INTO event_schedule (id, event_id, title, description, start_time, end_time, schedule_type, sort_order) VALUES
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001',
   'Registration & Welcome', 'Check in, grab your swag bag, and meet your fellow hackers.',
   NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days' + INTERVAL '1 hour',
   'other', 1),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001',
   'Opening Keynote', 'Setting the stage: Climate innovation in the OECS.',
   NOW() + INTERVAL '30 days' + INTERVAL '1 hour', NOW() + INTERVAL '30 days' + INTERVAL '2 hours',
   'keynote', 2),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001',
   'Hacking Begins!', 'Form teams, choose challenges, and start building.',
   NOW() + INTERVAL '30 days' + INTERVAL '2 hours', NOW() + INTERVAL '31 days' + INTERVAL '14 hours',
   'session', 3),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001',
   'Lunch & Networking', 'Refuel and exchange ideas with other teams.',
   NOW() + INTERVAL '30 days' + INTERVAL '5 hours', NOW() + INTERVAL '30 days' + INTERVAL '6 hours',
   'break', 4),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001',
   'Final Presentations & Judging', 'Each team has 5 minutes to pitch their solution.',
   NOW() + INTERVAL '31 days' + INTERVAL '14 hours', NOW() + INTERVAL '31 days' + INTERVAL '17 hours',
   'session', 5),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001',
   'Awards Ceremony & Closing', 'Winners announced and prizes awarded.',
   NOW() + INTERVAL '31 days' + INTERVAL '17 hours', NOW() + INTERVAL '31 days' + INTERVAL '18 hours',
   'other', 6)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 8. GRANTS  (6 funding opportunities)
-- ============================================================

INSERT INTO grants (id, title, description, amount_min, amount_max, currency, deadline, eligibility, application_url, grant_type, is_active, is_climate_action, created_at) VALUES
  ('f0000000-0000-0000-0000-000000000001',
   'OECS Innovation Seed Fund',
   'Seed grants of $5,000–$25,000 for early-stage innovators in OECS member states. Priority given to projects addressing climate resilience, food security, and digital inclusion.',
   5000, 25000, 'USD',
   NOW() + INTERVAL '45 days',
   'Must be a citizen or resident of an OECS member state. Open to individuals and registered businesses less than 3 years old.',
   'https://oecs.org/innovation-fund', 'startup', true, true,
   NOW() - INTERVAL '60 days'),

  ('f0000000-0000-0000-0000-000000000002',
   'Caribbean Development Bank TechGrant',
   'Grants up to $50,000 for technology projects that improve public service delivery in Caribbean nations. Includes mentorship from CDB advisors.',
   10000, 50000, 'USD',
   NOW() + INTERVAL '90 days',
   'Open to registered entities in CDB member countries. Must demonstrate potential for regional impact.',
   'https://caribank.org/techgrant', 'development', true, false,
   NOW() - INTERVAL '45 days'),

  ('f0000000-0000-0000-0000-000000000003',
   'Blue Economy Research Fellowship',
   'Research grants of $15,000–$40,000 for studies on sustainable ocean resources, marine biodiversity, and coastal resilience in OECS waters.',
   15000, 40000, 'USD',
   NOW() + INTERVAL '60 days',
   'PhD candidates and post-doctoral researchers affiliated with a recognised institution. OECS nationals preferred.',
   NULL, 'research', true, true,
   NOW() - INTERVAL '30 days'),

  ('f0000000-0000-0000-0000-000000000004',
   'EdTech Caribbean Accelerator Grant',
   'Up to $30,000 in funding plus 6 months of mentorship for education technology startups serving Caribbean learners.',
   10000, 30000, 'USD',
   NOW() + INTERVAL '75 days',
   'Ed-tech startups with at least an MVP. Must have at least one Caribbean co-founder.',
   'https://edtechcaribbean.org/apply', 'education', true, false,
   NOW() - INTERVAL '20 days'),

  ('f0000000-0000-0000-0000-000000000005',
   'GCF Small Grants — Climate Adaptation',
   'Green Climate Fund small grants ($10,000–$50,000) for community-based climate adaptation projects in SIDS.',
   10000, 50000, 'USD',
   NOW() + INTERVAL '120 days',
   'Community organisations and NGOs in Small Island Developing States. Projects must directly benefit vulnerable communities.',
   'https://greenclimate.fund/sids', 'innovation', true, true,
   NOW() - INTERVAL '15 days'),

  ('f0000000-0000-0000-0000-000000000006',
   'Caribbean Angel Network — Pitch Competition',
   'Top 3 pitches receive $20,000–$75,000 in angel investment. Open to Caribbean-based startups at prototype stage or beyond.',
   20000, 75000, 'USD',
   NOW() + INTERVAL '30 days',
   'Caribbean-based startups with a working prototype. Must be able to pitch in person in Barbados.',
   'https://caribbeanangelnetwork.com/pitch', 'startup', true, false,
   NOW() - INTERVAL '10 days')

ON CONFLICT (id) DO NOTHING;

-- Hero copy (042 summary + 043 details). Applied as a separate UPDATE rather
-- than columns on the insert above so it also reaches databases seeded before
-- this block existed — the insert is ON CONFLICT DO NOTHING and would skip them.
-- Guarded on empty, so anything edited through the admin grant form survives.
UPDATE grants AS g
SET summary = v.summary,
    details = v.details
FROM (VALUES
  ('f0000000-0000-0000-0000-000000000001'::uuid,
   'Seed funding of US$5,000–US$25,000 for early-stage OECS innovators.',
   '[{"id":"funding","label":"Funding","items":[
       {"id":"f1","label":"Type","value":"Non-dilutive seed grant"},
       {"id":"f2","label":"Disbursement","value":"Two tranches, milestone-based"},
       {"id":"f3","label":"Priority sectors","value":"Climate resilience, food security, digital inclusion"}]},
     {"id":"elig","label":"Eligibility","items":[
       {"id":"e1","label":"Residency","value":"Citizen or resident of an OECS member state"},
       {"id":"e2","label":"Stage","value":"Individuals and businesses under 3 years old"}]},
     {"id":"contact","label":"Contact","value":"innovation@oecs.int"}]'::jsonb),

  ('f0000000-0000-0000-0000-000000000002'::uuid,
   'Up to US$50,000 for technology that improves Caribbean public services.',
   '[{"id":"funding","label":"Funding","items":[
       {"id":"f1","label":"Type","value":"Development grant"},
       {"id":"f2","label":"Mentorship","value":"12 months with a CDB advisor"},
       {"id":"f3","label":"Co-financing","value":"10% match required"}]},
     {"id":"elig","label":"Eligibility","items":[
       {"id":"e1","label":"Applicant","value":"Registered entities in CDB member countries"},
       {"id":"e2","label":"Impact","value":"Must show regional impact potential"}]},
     {"id":"contact","label":"Contact","value":"techgrant@caribank.org"}]'::jsonb),

  ('f0000000-0000-0000-0000-000000000003'::uuid,
   'Research grants of US$15,000–US$40,000 for ocean and coastal science in OECS waters.',
   '[{"id":"funding","label":"Funding","items":[
       {"id":"f1","label":"Type","value":"Research fellowship"},
       {"id":"f2","label":"Duration","value":"18 months"},
       {"id":"f3","label":"Covers","value":"Stipend, fieldwork and publication costs"}]},
     {"id":"elig","label":"Eligibility","items":[
       {"id":"e1","label":"Level","value":"PhD candidates and post-doctoral researchers"},
       {"id":"e2","label":"Affiliation","value":"Recognised institution; OECS nationals preferred"}]},
     {"id":"contact","label":"Contact","value":"bluefellowship@oecs.int"}]'::jsonb),

  ('f0000000-0000-0000-0000-000000000004'::uuid,
   'Up to US$30,000 plus six months of mentorship for Caribbean ed-tech startups.',
   '[{"id":"funding","label":"Funding","items":[
       {"id":"f1","label":"Type","value":"Accelerator grant"},
       {"id":"f2","label":"Programme","value":"6-month mentorship cohort"},
       {"id":"f3","label":"Disbursement","value":"Split across cohort milestones"}]},
     {"id":"elig","label":"Eligibility","items":[
       {"id":"e1","label":"Stage","value":"At least a working MVP"},
       {"id":"e2","label":"Team","value":"One or more Caribbean co-founders"}]},
     {"id":"contact","label":"Contact","value":"apply@edtechcaribbean.org"}]'::jsonb),

  ('f0000000-0000-0000-0000-000000000005'::uuid,
   'Green Climate Fund small grants of US$10,000–US$50,000 for community climate adaptation.',
   '[{"id":"funding","label":"Funding","items":[
       {"id":"f1","label":"Type","value":"Climate adaptation small grant"},
       {"id":"f2","label":"Duration","value":"24 months"},
       {"id":"f3","label":"Co-financing","value":"In-kind community contribution encouraged"}]},
     {"id":"elig","label":"Eligibility","items":[
       {"id":"e1","label":"Applicant","value":"Community organisations and NGOs in SIDS"},
       {"id":"e2","label":"Beneficiaries","value":"Must directly benefit vulnerable communities"}]},
     {"id":"contact","label":"Contact","value":"sids@greenclimate.fund"}]'::jsonb),

  ('f0000000-0000-0000-0000-000000000006'::uuid,
   'Top three pitches take US$20,000–US$75,000 in angel investment.',
   '[{"id":"funding","label":"Funding","items":[
       {"id":"f1","label":"Type","value":"Equity angel investment"},
       {"id":"f2","label":"Awards","value":"Three winners per cycle"},
       {"id":"f3","label":"Terms","value":"Negotiated per deal with the lead angel"}]},
     {"id":"elig","label":"Eligibility","items":[
       {"id":"e1","label":"Stage","value":"Working prototype or beyond"},
       {"id":"e2","label":"Attendance","value":"Must pitch in person in Barbados"}]},
     {"id":"contact","label":"Contact","value":"pitch@caribbeanangelnetwork.com"}]'::jsonb)
) AS v(id, summary, details)
WHERE g.id = v.id
  AND (g.summary IS NULL OR g.summary = '' OR g.details IS NULL OR g.details = '[]'::jsonb);


-- ============================================================
-- 9. GRANT APPLICATIONS
-- ============================================================

-- Student applications (Tariq a08, Shania a09) carry an accepted faculty
-- sponsor (Dr. Williams a03) — 064's enforce_grant_application_sponsor
-- trigger rejects any non-draft student application without one.
INSERT INTO grant_applications (id, grant_id, user_id, application_data, status, sponsor_id, sponsor_note, sponsor_approved_at, created_at) VALUES
  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005',
   '{"project_name": "AgriSense SVG", "summary": "IoT sensors for smallholder farmers in SVG", "amount_requested": 20000}'::jsonb,
   'under_review', NULL, NULL, NULL, NOW() - INTERVAL '50 days'),

  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008',
   '{"project_name": "SolarGrid Antigua", "summary": "Community micro-grid for 100 households", "amount_requested": 25000}'::jsonb,
   'pending',
   'a0000000-0000-0000-0000-000000000003',
   'Tariq is a dedicated student — the SolarGrid pilot is well scoped and I am glad to sponsor it.',
   NOW() - INTERVAL '41 days',
   NOW() - INTERVAL '40 days'),

  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000012',
   '{"project_name": "CaribbeanCloud Gov", "summary": "Open-source cloud toolkit for OECS governments", "amount_requested": 45000}'::jsonb,
   'approved', NULL, NULL, NULL, NOW() - INTERVAL '35 days'),

  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000009',
   '{"project_name": "ReefWatch AI", "summary": "ML-based coral reef monitoring in Grenada", "amount_requested": 30000}'::jsonb,
   'under_review',
   'a0000000-0000-0000-0000-000000000003',
   'I supervise Shania''s reef monitoring research and fully support this fellowship application.',
   NOW() - INTERVAL '26 days',
   NOW() - INTERVAL '25 days'),

  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000006',
   '{"project_name": "EduCarib Platform", "summary": "Localised e-learning for Caribbean schools", "amount_requested": 28000}'::jsonb,
   'pending', NULL, NULL, NULL, NOW() - INTERVAL '15 days'),

  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005',
   '{"project_name": "AgriSense Climate Module", "summary": "Climate adaptation extension for AgriSense", "amount_requested": 35000}'::jsonb,
   'pending', NULL, NULL, NULL, NOW() - INTERVAL '10 days'),

  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000007',
   '{"project_name": "Dominica Heritage Trails", "summary": "AR heritage walking tours for Dominica", "amount_requested": 40000}'::jsonb,
   'rejected', NULL, NULL, NULL, NOW() - INTERVAL '8 days')

ON CONFLICT DO NOTHING;


-- ============================================================
-- 10. FORUM POSTS & REPLIES
-- ============================================================

-- We need the board IDs. They were seeded by migration 005.
-- Use subqueries to resolve them by slug.

INSERT INTO forum_posts (id, board_id, author_id, title, content, is_pinned, created_at) VALUES
  ('f1000000-0000-0000-0000-000000000001',
   (SELECT id FROM forum_boards WHERE slug = 'general'),
   'a0000000-0000-0000-0000-000000000001',
   'Welcome to FORGE — OECS Innovate & Connect!',
   'Welcome everyone to the FORGE community platform! This is your space to connect with fellow innovators, share ideas, find mentors, and access funding opportunities across the OECS.\n\nPlease introduce yourself in this thread — tell us your name, country, and what you are working on. Let us build something great together!',
   true, NOW() - INTERVAL '175 days'),

  ('f1000000-0000-0000-0000-000000000002',
   (SELECT id FROM forum_boards WHERE slug = 'showcase'),
   'a0000000-0000-0000-0000-000000000005',
   'AgriSense SVG — Field test results are in!',
   'Excited to share our first field test results from Union Island. Our soil-moisture sensors correctly predicted irrigation needs 87% of the time over a 3-week trial with 5 farmers.\n\nKey learnings:\n- Battery life exceeded expectations (6 weeks on a single charge)\n- SMS delivery was reliable even with spotty cell coverage\n- Farmers found the dashboard easy to use after a 30-min training\n\nHappy to answer any questions!',
   false, NOW() - INTERVAL '90 days'),

  ('f1000000-0000-0000-0000-000000000003',
   (SELECT id FROM forum_boards WHERE slug = 'funding'),
   'a0000000-0000-0000-0000-000000000004',
   'Tips for writing a winning OECS Innovation Fund application',
   'Having reviewed dozens of applications as a mentor, here are my top tips:\n\n1. **Lead with the problem** — Show you deeply understand the challenge\n2. **Be specific about impact** — "Help farmers" is weak; "Reduce post-harvest loss by 25% for 200 farmers in SVG" is strong\n3. **Show traction** — Even small pilots or user interviews count\n4. **Budget realistically** — Reviewers can spot inflated numbers\n5. **Tell your story** — Why are YOU the right person to solve this?\n\nHappy to do free 15-min application reviews for community members. DM me!',
   true, NOW() - INTERVAL '55 days'),

  ('f1000000-0000-0000-0000-000000000004',
   (SELECT id FROM forum_boards WHERE slug = 'mentorship'),
   'a0000000-0000-0000-0000-000000000003',
   'Offering mentorship: Marine science & climate research',
   'Hi everyone, I am Dr. Althea Williams — marine biologist at UWI St. George''s. I have 12 years of experience in coral reef ecology, climate modelling, and environmental policy.\n\nI am offering to mentor 2-3 students or early-career innovators working on:\n- Marine conservation technology\n- Climate data analysis\n- Environmental monitoring systems\n- Blue economy ventures\n\nIf interested, please reply with a brief description of your project and what kind of support you need.',
   false, NOW() - INTERVAL '45 days'),

  ('f1000000-0000-0000-0000-000000000005',
   (SELECT id FROM forum_boards WHERE slug = 'tech-help'),
   'a0000000-0000-0000-0000-000000000008',
   'Best low-cost microcontroller for outdoor solar monitoring?',
   'I am building a solar panel monitoring system for my SolarGrid Antigua project. Need a microcontroller that:\n- Works reliably outdoors (heat, humidity)\n- Has WiFi or LoRa connectivity\n- Low power consumption (solar-powered)\n- Budget under $15 per unit\n\nCurrently considering ESP32 vs Arduino Nano 33 IoT. Any recommendations from folks who have deployed outdoor IoT in the Caribbean?',
   false, NOW() - INTERVAL '30 days'),

  ('f1000000-0000-0000-0000-000000000006',
   (SELECT id FROM forum_boards WHERE slug = 'events'),
   'a0000000-0000-0000-0000-000000000002',
   'OECS Digital Economy Conference 2026 — Call for speakers!',
   'We are accepting speaker proposals for the upcoming OECS Digital Economy Conference in Roseau, Dominica.\n\nTopics of interest:\n- Digital government and e-services\n- Fintech for financial inclusion\n- Data governance and privacy\n- AI and automation in SIDS\n- Digital skills and workforce development\n\nSubmit a 200-word abstract by the end of this month. Reply here or DM me for details.',
   false, NOW() - INTERVAL '12 days')

ON CONFLICT (id) DO NOTHING;


-- Forum Replies

INSERT INTO forum_replies (id, post_id, author_id, content, created_at) VALUES
  -- Replies to Welcome post
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005',
   'Hi everyone! I am Keisha from SVG. Working on AgriSense — IoT sensors for farmers. Thrilled to be part of this community!', NOW() - INTERVAL '174 days'),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008',
   'Hey! Tariq here from Antigua. CS student at UWI exploring solar energy monitoring. Looking forward to connecting with mentors!', NOW() - INTERVAL '89 days'),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007',
   'Camille from Dominica here! Building AR heritage tours. Excited to see so many innovators from across the region.', NOW() - INTERVAL '85 days'),

  -- Replies to AgriSense showcase
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003',
   '87% accuracy on the first field test is impressive, Keisha! What ML model are you using for the irrigation predictions?', NOW() - INTERVAL '89 days'),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000011',
   'Very promising results. I would love to discuss potential investment once you are ready for a larger pilot.', NOW() - INTERVAL '88 days'),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005',
   'Thanks all! Using a simple random forest right now — planning to test LSTM for time-series predictions next. Sandra, I will DM you!', NOW() - INTERVAL '87 days'),

  -- Replies to funding tips
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000006',
   'This is gold, James! Point 2 especially — I rewrote my EduCarib application to be more specific and it made a huge difference.', NOW() - INTERVAL '50 days'),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000010',
   'Would you be open to reviewing student applications too? I am working on a social enterprise proposal.', NOW() - INTERVAL '48 days'),

  -- Replies to mentorship offer
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000009',
   'Dr. Williams, I would love your mentorship! I am working on ReefWatch AI — using ML to detect coral bleaching from drone footage. Could really use guidance on training data collection.', NOW() - INTERVAL '44 days'),

  -- Replies to tech help
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000012',
   'Definitely go with ESP32 — we use them extensively at CaribbeanCloud. The ESP32-S3 has great WiFi range and can handle Caribbean humidity if you use a conformal coating on the PCB.', NOW() - INTERVAL '29 days'),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005',
   'Seconding ESP32! We use them for AgriSense. Pro tip: get the version with an external antenna connector for better range in the field.', NOW() - INTERVAL '28 days'),

  -- Reply to conference call for speakers
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000012',
   'I would like to propose a talk on "Open Data APIs for OECS Government Services" — will send my abstract this week.', NOW() - INTERVAL '11 days')

ON CONFLICT DO NOTHING;


-- ============================================================
-- 11. RESOURCES  (8 resources across types & categories)
-- ============================================================

INSERT INTO resources (id, title, description, content, resource_type, category, tags, author_id, is_published, is_climate_action, thumbnail_url, created_at) VALUES
  ('c0000000-0000-0000-0000-000000000001',
   'Getting Started with IoT in Caribbean Agriculture',
   'A beginner-friendly guide to using Internet of Things sensors for crop monitoring, irrigation management, and yield prediction in tropical climates.',
   '## Introduction\n\nThe Caribbean agricultural sector faces unique challenges — unpredictable rainfall, limited arable land, and vulnerability to hurricanes. Internet of Things (IoT) technology offers practical solutions that can help smallholder farmers make data-driven decisions.\n\n## What You Will Need\n\n- **Microcontroller**: ESP32 or Arduino Nano 33 IoT ($10-15)\n- **Sensors**: Soil moisture, temperature/humidity, rain gauge ($5-20 each)\n- **Power**: Small solar panel + battery pack ($15-25)\n- **Connectivity**: WiFi for farm-to-dashboard, or LoRa for remote areas\n\n## Step 1: Choose Your Sensors\n\nFor Caribbean conditions, we recommend capacitive soil moisture sensors over resistive ones — they last longer in humid environments and are more accurate.\n\n## Step 2: Set Up Your Dashboard\n\nUse a free platform like ThingSpeak or Grafana Cloud to visualise your sensor data. Most platforms support SMS alerts when readings fall outside your set thresholds.\n\n## Step 3: Deploy and Test\n\nStart with a single sensor station and monitor for 2 weeks before expanding. Protect your electronics with a weatherproof enclosure rated at least IP65.\n\n## Resources\n\n- ESP32 Getting Started Guide\n- ThingSpeak documentation\n- AgriSense SVG open-source firmware (GitHub)',
   'guide', 'agriculture',
   ARRAY['iot','agriculture','sensors','tutorial'],
   'a0000000-0000-0000-0000-000000000005',
   true, true,
   'https://images.unsplash.com/photo-1762337547936-9b92844d7e44?w=600&h=400&fit=crop',
   NOW() - INTERVAL '80 days'),

  ('c0000000-0000-0000-0000-000000000002',
   'OECS Climate Resilience Innovation Report 2025',
   'Annual report highlighting 20 climate-tech innovations from across the OECS, including case studies, impact metrics, and lessons learned.',
   '## Executive Summary\n\nThis report showcases the growing climate innovation ecosystem across OECS member states. In 2025, we documented 20 projects addressing climate challenges ranging from coral reef monitoring to renewable energy microgrids.\n\n## Key Findings\n\n- **60%** of projects focused on environmental monitoring and early warning systems\n- **$1.2M** in total funding raised by featured projects\n- **8 of 11** OECS member states had at least one active climate-tech project\n- Student-led projects increased by **45%** compared to 2024\n\n## Featured Projects\n\n### AgriSense SVG\nIoT sensors helping 50+ farmers in the Grenadines reduce crop loss by 30%.\n\n### ReefWatch AI\nML-powered coral bleaching detection deployed across 3 marine parks in Grenada.\n\n### SolarGrid Antigua\nCommunity micro-grid providing resilient electricity to 100 households.\n\n## Recommendations\n\n1. Increase seed funding allocation for climate-tech projects\n2. Establish regional data sharing agreements for environmental monitoring\n3. Create a Caribbean Climate Innovation Network to connect innovators across islands',
   'article', 'climate_action',
   ARRAY['climate','report','oecs','innovation'],
   'a0000000-0000-0000-0000-000000000001',
   true, true,
   'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=600&h=400&fit=crop',
   NOW() - INTERVAL '60 days'),

  ('c0000000-0000-0000-0000-000000000003',
   'How EduCarib Reached 5,000 Students in 6 Months',
   'Case study of the EduCarib e-learning platform''s rapid growth across Caribbean schools, including offline-first design decisions and teacher adoption strategies.',
   '## The Challenge\n\nCaribbean schools face chronic challenges with educational resources — outdated textbooks, limited internet connectivity, and a shortage of specialised teachers, particularly in STEM subjects.\n\n## The Solution\n\nEduCarib is a localised e-learning platform designed specifically for Caribbean students and teachers. Key features include:\n\n- **Curriculum-aligned content** for CSEC and CAPE examinations\n- **Offline-first design** — content downloads and syncs when connectivity is available\n- **Teacher dashboard** for tracking student progress and assigning work\n- **Creole language support** for Haiti and Dominica\n\n## Growth Strategy\n\n1. **Pilot with 3 schools** in Trinidad and Tobago\n2. **Teacher champions programme** — trained 50 teachers as platform advocates\n3. **Ministry of Education partnerships** for institutional adoption\n4. **Student referral incentives** — gamified badges for inviting classmates\n\n## Results\n\n- 5,000 active students across 4 countries in 6 months\n- 92% teacher satisfaction rate\n- 15% improvement in CSEC mock exam scores for active users',
   'case_study', 'education',
   ARRAY['edtech','education','growth','offline'],
   'a0000000-0000-0000-0000-000000000006',
   true, false,
   'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&h=400&fit=crop',
   NOW() - INTERVAL '50 days'),

  ('c0000000-0000-0000-0000-000000000004',
   'Grant Application Template — OECS Innovation Fund',
   'Ready-to-use template with section headers, word count guidelines, and tips for a strong application to the OECS Innovation Seed Fund.',
   '## Project Title\n[Your project name — be descriptive and memorable]\n\n## Executive Summary (250 words max)\n[Concise overview: what problem you solve, how, and expected impact]\n\n## Problem Statement (500 words max)\n- What specific problem are you addressing?\n- Who is affected and how?\n- What is the current state / existing solutions?\n- Why is a new approach needed?\n\n## Proposed Solution (750 words max)\n- Describe your solution in detail\n- What technology / approach will you use?\n- What makes your solution unique?\n- How does it build on existing work?\n\n## Impact & Outcomes (500 words max)\n- Quantifiable impact metrics (be specific!)\n- Timeline for achieving outcomes\n- Long-term sustainability plan\n- Regional scalability potential\n\n## Team (300 words max)\n- Key team members and their qualifications\n- Why is this team uniquely positioned?\n- Any advisors or partners?\n\n## Budget (table format)\n| Item | Cost (USD) | Justification |\n|------|-----------|---------------|\n| [Item 1] | $X,XXX | [Brief justification] |\n| [Item 2] | $X,XXX | [Brief justification] |\n| **Total** | **$XX,XXX** | |\n\n## Timeline\n| Month | Milestone |\n|-------|----------|\n| 1-2 | [Milestone] |\n| 3-4 | [Milestone] |\n| 5-6 | [Milestone] |\n\n## Tips\n- Be specific about impact numbers\n- Show evidence of demand (surveys, letters of support)\n- Keep budget realistic and well-justified',
   'template', 'other',
   ARRAY['template','grants','application','funding'],
   'a0000000-0000-0000-0000-000000000001',
   true, false,
   'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&h=400&fit=crop',
   NOW() - INTERVAL '40 days'),

  ('c0000000-0000-0000-0000-000000000005',
   'Coral Reef Monitoring with Machine Learning',
   'Technical guide covering underwater image classification, training datasets, and deployment of ML models for marine conservation in Caribbean waters.',
   '## Overview\n\nCoral reefs in the Caribbean are under severe threat from climate change, pollution, and overfishing. Machine learning offers scalable monitoring solutions that can process thousands of underwater images to detect bleaching, disease, and invasive species.\n\n## Data Collection\n\n### Underwater Drones\n- Use ROVs rated for 50m+ depth\n- Capture images at consistent intervals along transect lines\n- Maintain GPS logs for spatial mapping\n\n### Image Requirements\n- Resolution: minimum 1080p\n- Lighting: natural light supplemented with LED array\n- Coverage: overlapping frames for stitching\n\n## Model Architecture\n\nWe recommend starting with a pre-trained ResNet-50 backbone, fine-tuned on Caribbean reef imagery:\n\n1. **Classification**: Healthy / Bleached / Diseased / Dead\n2. **Object Detection**: Identify invasive lionfish, crown-of-thorns starfish\n3. **Segmentation**: Map coral coverage percentage\n\n## Training Tips\n\n- Use data augmentation (rotation, colour jittering) to account for varying water conditions\n- Balance your dataset — bleached coral images are often underrepresented\n- Validate against expert-labeled ground truth from marine biologists\n\n## Deployment\n\nExport your model to TensorFlow Lite for edge deployment on Nvidia Jetson or Raspberry Pi 4.',
   'guide', 'environment',
   ARRAY['ml','marine','conservation','coral','ai'],
   'a0000000-0000-0000-0000-000000000009',
   true, true,
   'https://images.unsplash.com/photo-1708649290066-5f617003b93f?w=600&h=400&fit=crop',
   NOW() - INTERVAL '35 days'),

  ('c0000000-0000-0000-0000-000000000006',
   'Digital Government Playbook for Small Island States',
   'A comprehensive guide to building citizen-centric digital services in OECS nations, covering architecture, security, and citizen adoption strategies.',
   '## Why Digital Government Matters for SIDS\n\nSmall Island Developing States face unique challenges in public service delivery — dispersed populations across multiple islands, limited IT budgets, and vulnerability to natural disasters that can destroy physical infrastructure.\n\n## Core Principles\n\n1. **Cloud-first**: Reduce dependence on on-island infrastructure\n2. **Mobile-first**: 80%+ of Caribbean internet access is via mobile\n3. **Offline-capable**: Design for intermittent connectivity\n4. **Open standards**: Avoid vendor lock-in with open-source solutions\n5. **Privacy by design**: Build trust through transparent data practices\n\n## Recommended Architecture\n\n### Citizen Portal\n- Single sign-on for all government services\n- Mobile-responsive design with WCAG 2.1 accessibility\n- Multi-language support (English, French, Creole)\n\n### API Layer\n- RESTful APIs for inter-agency data sharing\n- OAuth 2.0 authentication\n- Rate limiting and audit logging\n\n### Data Layer\n- PostgreSQL for structured data\n- Document storage with versioning\n- Automated backups to off-island cloud storage\n\n## Case Study: CaribbeanCloud Gov\n\nThe CaribbeanCloud open-source toolkit has been adopted by 3 OECS governments, reducing service delivery times by an average of 60%.',
   'guide', 'technology',
   ARRAY['govtech','digital','government','sids'],
   'a0000000-0000-0000-0000-000000000012',
   true, false,
   'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=400&fit=crop',
   NOW() - INTERVAL '25 days'),

  ('c0000000-0000-0000-0000-000000000007',
   'From Student Project to Startup: A Caribbean Founder''s Journey',
   'Camille Fontaine shares her experience turning a university AR project into Dominica Heritage Trails, a funded tourism-tech startup.',
   '## It Started as a Class Assignment\n\nIn my final year at Dominica State College, I had to build an AR prototype for my mobile development class. I chose to recreate historical Roseau — and something clicked.\n\n## The Pivot Moment\n\nWhen I showed the prototype to tourists at the Roseau cruise port, their reactions told me everything. People were fascinated by the history behind the buildings they were walking past. One visitor said, "This should be an app!"\n\n## Building the MVP\n\nI spent 3 months building a basic version:\n- Unity + AR Foundation for the AR experience\n- Recorded oral histories from 5 local elders\n- Created 3D models of 8 historic buildings\n- Tested with 50 tourists and 20 locals\n\n## Finding Support\n\nThe FORGE community was instrumental:\n- **James Pierre** mentored me on business model development\n- **OECS Innovation Fund** provided initial seed funding\n- **Forum community** gave technical feedback and connections\n\n## Lessons Learned\n\n1. Talk to customers before writing code\n2. Caribbean problems need Caribbean solutions — do not copy Silicon Valley\n3. The network you build is as valuable as the product you build\n4. Start small, test fast, iterate based on feedback\n\n## What is Next\n\nExpanding to 3 more islands and adding a revenue-sharing model with local tour guides.',
   'success_story', 'technology',
   ARRAY['startup','ar','tourism','student','journey'],
   'a0000000-0000-0000-0000-000000000007',
   true, false,
   'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=600&h=400&fit=crop',
   NOW() - INTERVAL '15 days'),

  ('c0000000-0000-0000-0000-000000000008',
   'Water Quality Monitoring: A Practical Guide for Caribbean Communities',
   'Step-by-step instructions for setting up affordable water quality monitoring stations using open-source hardware and free cloud platforms.',
   '## Why Monitor Water Quality?\n\nClean water is fundamental to public health, agriculture, and ecosystem health. In many Caribbean communities, water quality data is collected infrequently due to the cost of laboratory testing. Low-cost sensor networks can fill this gap.\n\n## What to Measure\n\n| Parameter | Why It Matters | Sensor Cost |\n|-----------|---------------|-------------|\n| pH | Indicates contamination, affects treatment | $8-15 |\n| Turbidity | Sediment levels, visual water quality | $10-20 |\n| Temperature | Ecosystem health, treatment efficiency | $3-5 |\n| Dissolved Oxygen | Aquatic life viability | $15-30 |\n| Conductivity | Salinity intrusion detection | $10-20 |\n\n## Hardware Setup\n\n1. **Controller**: ESP32 with waterproof enclosure\n2. **Power**: 6W solar panel + 18650 battery pack\n3. **Sensors**: Analog sensors connected via ADC\n4. **Housing**: IP67 junction box mounted on a post above waterline\n\n## Software\n\n- Arduino firmware for sensor reading and WiFi transmission\n- InfluxDB for time-series data storage\n- Grafana dashboard with SMS alerts for threshold breaches\n\n## Deployment Tips\n\n- Calibrate sensors monthly\n- Clean sensor probes weekly to prevent biofouling\n- Install sensors upstream and downstream of suspected pollution sources\n- Share data publicly to build community trust and engagement',
   'guide', 'environment',
   ARRAY['water','monitoring','iot','community','health'],
   'a0000000-0000-0000-0000-000000000012',
   true, true,
   'https://images.unsplash.com/photo-1530053969600-caed2596d242?w=600&h=400&fit=crop',
   NOW() - INTERVAL '10 days')

ON CONFLICT (id) DO UPDATE SET
  thumbnail_url = EXCLUDED.thumbnail_url,
  title = EXCLUDED.title,
  description = EXCLUDED.description;


-- ============================================================
-- 12. CONVERSATIONS & MESSAGES  (2 sample conversations)
-- ============================================================

-- Conversation 1: Sandra (investor) → Keisha (entrepreneur)
INSERT INTO conversations (id, created_at, updated_at) VALUES
  ('ab000000-0000-0000-0000-000000000001', NOW() - INTERVAL '88 days', NOW() - INTERVAL '86 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO conversation_participants (id, conversation_id, user_id) VALUES
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011'),
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005')
ON CONFLICT DO NOTHING;

INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
   'Hi Keisha! I saw your AgriSense project showcase on the forum — impressive field test results. I invest in Caribbean cleantech and ag-tech. Would you be open to a chat about your funding needs?',
   NOW() - INTERVAL '88 days'),
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005',
   'Hi Sandra! Thank you so much for reaching out. Yes, we are currently looking for seed investment to expand from 5 to 50 farm sites. I would love to discuss. Are you free for a call this week?',
   NOW() - INTERVAL '87 days'),
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
   'Absolutely! How about Thursday at 2pm AST? I can do a video call. Also, please send me your pitch deck if you have one ready.',
   NOW() - INTERVAL '86 days')
ON CONFLICT DO NOTHING;

-- Conversation 2: Shania (student) → Dr. Williams (mentor)
INSERT INTO conversations (id, created_at, updated_at) VALUES
  ('ab000000-0000-0000-0000-000000000002', NOW() - INTERVAL '43 days', NOW() - INTERVAL '41 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO conversation_participants (id, conversation_id, user_id) VALUES
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009'),
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009',
   'Dr. Williams, thank you for offering mentorship on the forum! I am Shania, working on ReefWatch AI. I have a basic image classifier but struggling with underwater image quality. Could you help me access the Moliniere reef datasets?',
   NOW() - INTERVAL '43 days'),
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003',
   'Hi Shania! Of course — I have access to 3 years of transect imagery from the Moliniere-Beausejour MPA. Let me set up a shared drive for you. Also, I suggest using histogram equalisation as a preprocessing step for the murky water images.',
   NOW() - INTERVAL '42 days'),
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009',
   'That would be amazing! I will try histogram equalisation this week. Could we also meet bi-weekly to review my progress? I am targeting a conference paper submission by March.',
   NOW() - INTERVAL '41 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 13. EMPLOYERS  (10 companies across the verification lifecycle)
-- ============================================================
-- Requires migrations 058 and 059.
--
-- Deliberately covers every state the partner feed distinguishes, so
-- /api/partner/v1/employers can be exercised end to end:
--   * verified + shared                            -> in the feed
--   * verified + shared, contact email unconfirmed -> in the feed, contact_email null
--   * verified but NOT shared                      -> withheld (verification is not consent)
--   * pending / unverified / rejected              -> never in the feed, and no tombstone
--   * revoked (was verified)                       -> tombstone under ?include_removed=true
--
-- No API key is seeded. A key committed to a file is a live credential the
-- moment this runs anywhere real — issue one from Admin -> Partner API.

INSERT INTO employers (
  id, slug, legal_name, trading_name, industry, website_url, logo_url, description,
  country_code, administrative_area, locality, address_line1, address_line2, postal_code,
  contact_email, contact_email_verified_at, contact_phone,
  verification_status, verification_method, registration_number,
  verified_at, verified_by, verification_note, document_paths,
  share_externally, created_by, created_at, updated_at
) VALUES
  -- 1. Verified and published — the happy path
  ('e0000000-0000-0000-0000-000000000001', 'castries-tech-limited', 'Castries Tech Limited', 'CasTech',
   'ICT & Digital Services', 'https://castriestech.example', NULL,
   'Software development house building government service portals across the OECS.',
   'LC', 'Castries', 'Castries', '12 Bridge Street', NULL, 'LC04 101',
   'careers@castriestech.example', NOW() - INTERVAL '80 days', '+1-758-555-0142',
   'verified', 'registry_lookup', 'LC-2019-004412',
   NOW() - INTERVAL '78 days', 'a0000000-0000-0000-0000-000000000001',
   'Confirmed against the Saint Lucia Registry of Companies. Director list matches.',
   ARRAY['e0000000-0000-0000-0000-000000000001/certificate-of-incorporation.pdf'],
   TRUE, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '90 days', NOW() - INTERVAL '78 days'),

  -- 2. Verified and published
  ('e0000000-0000-0000-0000-000000000002', 'blue-horizon-fisheries', 'Blue Horizon Fisheries Ltd', 'Blue Horizon',
   'Blue Economy & Fisheries', 'https://bluehorizon.example', NULL,
   'Sustainable fishing cooperative running cold-chain logistics for 40 small vessels.',
   'GD', 'Saint George', 'St. George''s', 'Melville Street Fish Market', 'Unit 4', NULL,
   'hr@bluehorizon.example', NOW() - INTERVAL '55 days', '+1-473-555-0188',
   'verified', 'document_review', 'GD-2016-001987',
   NOW() - INTERVAL '52 days', 'a0000000-0000-0000-0000-000000000001',
   'Incorporation certificate and 2025 tax compliance letter on file.',
   ARRAY['e0000000-0000-0000-0000-000000000002/incorporation.pdf',
         'e0000000-0000-0000-0000-000000000002/tax-compliance-2025.pdf'],
   TRUE, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '60 days', NOW() - INTERVAL '52 days'),

  -- 3. Verified and published
  ('e0000000-0000-0000-0000-000000000003', 'sunfield-renewables', 'Sunfield Renewables Inc.', NULL,
   'Renewable Energy', 'https://sunfield.example', NULL,
   'Solar PV installer and O&M provider; 6 MW deployed across Antigua and Barbuda.',
   'AG', 'Saint John', 'St. John''s', 'Friars Hill Road', NULL, NULL,
   'people@sunfield.example', NOW() - INTERVAL '30 days', '+1-268-555-0110',
   'verified', 'document_review', 'AG-2021-003310',
   NOW() - INTERVAL '28 days', 'a0000000-0000-0000-0000-000000000001',
   'Registry printout supplied by applicant, cross-checked against the utility interconnection list.',
   ARRAY['e0000000-0000-0000-0000-000000000003/registry-printout.pdf'],
   TRUE, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '40 days', NOW() - INTERVAL '28 days'),

  -- 4. Verified and published, but the contact address was never confirmed.
  --    The feed returns this employer with contact_email = null.
  ('e0000000-0000-0000-0000-000000000004', 'nature-isle-agro', 'Nature Isle Agro-Processing Ltd', 'Nature Isle',
   'Agriculture & Agri-processing', 'https://natureisle.example', NULL,
   'Value-added processing of bay leaf, cocoa and root crops for regional export.',
   'DM', 'Saint Andrew', 'Marigot', 'Industrial Estate Road', NULL, NULL,
   'jobs@natureisle.example', NULL, '+1-767-555-0173',
   'verified', 'manual_attestation', NULL,
   NOW() - INTERVAL '20 days', 'a0000000-0000-0000-0000-000000000001',
   'Attested in person by the Invest Dominica liaison. No registry extract yet — follow up.',
   '{}',
   TRUE, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '25 days', NOW() - INTERVAL '20 days'),

  -- 5. Verified but has NOT consented to external sharing. Withheld from the feed.
  ('e0000000-0000-0000-0000-000000000005', 'bequia-marine-services', 'Bequia Marine Services Ltd', NULL,
   'Transport & Logistics', 'https://bequiamarine.example', NULL,
   'Inter-island freight and vessel maintenance operating out of Port Elizabeth.',
   'VC', 'Grenadines', 'Port Elizabeth', 'Front Street', NULL, 'VC0400',
   'admin@bequiamarine.example', NOW() - INTERVAL '15 days', '+1-784-555-0125',
   'verified', 'registry_lookup', 'VC-2014-000771',
   NOW() - INTERVAL '14 days', 'a0000000-0000-0000-0000-000000000001',
   'Verified. Employer explicitly declined to be listed on partner platforms.',
   ARRAY['e0000000-0000-0000-0000-000000000005/registry.pdf'],
   FALSE, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '18 days', NOW() - INTERVAL '14 days'),

  -- 6. Awaiting review
  ('e0000000-0000-0000-0000-000000000006', 'basseterre-health-labs', 'Basseterre Health Labs Ltd', NULL,
   'Health & Wellness', 'https://bhlabs.example', NULL,
   'Clinical diagnostics laboratory serving public and private clinics in Saint Kitts.',
   'KN', 'Saint George Basseterre', 'Basseterre', 'Cayon Street', 'Suite 2', NULL,
   'recruitment@bhlabs.example', NULL, '+1-869-555-0164',
   'pending', NULL, NULL,
   NULL, NULL, 'Awaiting the certificate of good standing requested on intake.',
   ARRAY['e0000000-0000-0000-0000-000000000006/application-form.pdf'],
   FALSE, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days'),

  -- 7. Newly created, untouched. Andre Williams (demo private_sector user) owns it.
  ('e0000000-0000-0000-0000-000000000007', 'caribbeancloud-limited', 'CaribbeanCloud Limited', 'CaribbeanCloud',
   'ICT & Digital Services', 'https://caribbeancloud.example', NULL,
   'Regional cloud hosting and open-data infrastructure for OECS public agencies.',
   'MS', 'Saint Peter', 'Brades', 'Main Road', NULL, NULL,
   'careers@caribbeancloud.example', NULL, NULL,
   'unverified', NULL, NULL,
   NULL, NULL, NULL, '{}',
   FALSE, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),

  -- 8. Rejected, and never verified — so it produces no tombstone. A failed
  --    application must not be announced to partners.
  ('e0000000-0000-0000-0000-000000000008', 'tortola-logistics-group', 'Tortola Logistics Group', NULL,
   'Transport & Logistics', NULL, NULL,
   'Freight forwarding. Application could not be substantiated.',
   'VG', 'Tortola', 'Road Town', 'Waterfront Drive', NULL, NULL,
   'contact@tortolalogistics.example', NULL, NULL,
   'rejected', NULL, NULL,
   NULL, NULL, 'Registration number did not resolve; applicant unreachable after two attempts.',
   '{}',
   FALSE, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '35 days', NOW() - INTERVAL '31 days'),

  -- 9. Was verified and shared, then revoked. This is the tombstone case:
  --    it comes back as {"removed": true} under ?include_removed=true.
  ('e0000000-0000-0000-0000-000000000009', 'helen-bay-hospitality', 'Helen Bay Hospitality Ltd', 'Helen Bay',
   'Tourism & Hospitality', 'https://helenbay.example', NULL,
   'Boutique resort group. Verification withdrawn pending a labour-standards review.',
   'LC', 'Gros Islet', 'Rodney Bay', 'Reduit Beach Avenue', NULL, 'LC01 401',
   'hr@helenbay.example', NOW() - INTERVAL '100 days', '+1-758-555-0199',
   'revoked', 'document_review', 'LC-2011-002204',
   NOW() - INTERVAL '95 days', 'a0000000-0000-0000-0000-000000000001',
   'Verification revoked after a grievance was upheld. Do not restore without OECS sign-off.',
   ARRAY['e0000000-0000-0000-0000-000000000009/incorporation.pdf'],
   FALSE, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '110 days', NOW() - INTERVAL '3 days'),

  -- 10. Verified and published, outside the OECS — exercises the country
  --     hierarchy with a non-member state.
  ('e0000000-0000-0000-0000-000000000010', 'bridgetown-finserve', 'Bridgetown FinServe Inc.', 'FinServe',
   'Financial Services', 'https://finserve.example', NULL,
   'Regional payments processor with an OECS SME lending desk.',
   'BB', 'Saint Michael', 'Bridgetown', 'Broad Street', 'Level 3', 'BB11000',
   'talent@finserve.example', NOW() - INTERVAL '12 days', '+1-246-555-0157',
   'verified', 'registry_lookup', 'BB-2009-011204',
   NOW() - INTERVAL '10 days', 'a0000000-0000-0000-0000-000000000001',
   'Verified against the Barbados Corporate Affairs registry.',
   ARRAY['e0000000-0000-0000-0000-000000000010/registry.pdf'],
   TRUE, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '14 days', NOW() - INTERVAL '10 days')
ON CONFLICT (id) DO NOTHING;

-- People attached to demo employers
INSERT INTO employer_members (id, employer_id, user_id, role, created_at) VALUES
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000012', 'owner', NOW() - INTERVAL '4 days'),
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000011', 'admin', NOW() - INTERVAL '12 days')
ON CONFLICT DO NOTHING;

-- Audit trail. Written directly rather than through set_employer_verification(),
-- which requires an authenticated OECS session.
INSERT INTO employer_verification_events (id, employer_id, from_status, to_status, method, note, actor_id, created_at) VALUES
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000001', 'pending', 'verified', 'registry_lookup',
   'Confirmed against the Saint Lucia Registry of Companies.', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '78 days'),
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000002', 'pending', 'verified', 'document_review',
   'Incorporation certificate and 2025 tax compliance letter on file.', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '52 days'),
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000003', 'pending', 'verified', 'document_review',
   'Registry printout cross-checked against the utility interconnection list.', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '28 days'),
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000004', 'pending', 'verified', 'manual_attestation',
   'Attested in person by the Invest Dominica liaison.', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '20 days'),
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000005', 'pending', 'verified', 'registry_lookup',
   'Verified. Employer declined partner listing.', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000008', 'pending', 'rejected', NULL,
   'Registration number did not resolve; applicant unreachable.', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '31 days'),
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000009', 'pending', 'verified', 'document_review',
   'Incorporation certificate on file.', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '95 days'),
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000009', 'verified', 'revoked', NULL,
   'Verification revoked after a grievance was upheld.', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000010', 'pending', 'verified', 'registry_lookup',
   'Verified against the Barbados Corporate Affairs registry.', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '10 days')
ON CONFLICT DO NOTHING;
