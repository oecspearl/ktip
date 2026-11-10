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
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marcia.joseph@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Marcia Joseph","role":"programme_supervisor"}'::jsonb, NOW() - INTERVAL '180 days', NOW(), '', ''),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'devon.charles@demo.forge.oecs', crypt('DemoPass123!', gen_salt('bf')), NOW(), '{"display_name":"Devon Charles","role":"people_supervisor"}'::jsonb, NOW() - INTERVAL '170 days', NOW(), '', ''),
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

-- GoTrue reads these token columns as plain strings, and a NULL in any of them
-- fails every sign-in with "Database error querying schema". Accounts made
-- through the auth API get '' here; accounts made by raw INSERT get NULL.
UPDATE auth.users SET
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE id::text LIKE 'a0000000-0000-0000-0000-0000000000%';

-- Now UPDATE the auto-created profiles with full demo data.
-- Every demo persona is verified by an admin (145/205) except Marcus George
-- a10, the one unverified account, so the read-only state has a demo login.
-- mfa_grandfathered / requires_mfa_enrollment keep the 118 enrolment wall
-- out of the way. entrepreneur_stage (201) is set on entrepreneur roles only.
-- Marcia and Devon hold supervisor seats, not super_admin: 143 caps
-- super_admin (and its oecs alias) at one seat, held by a real person.
UPDATE profiles SET display_name = 'Marcia Joseph', bio = 'Programme supervisor at the OECS Commission in Castries. Fifteen years on regional development policy, most of it spent getting research out of the lab and into ministries and small firms.', avatar_url = 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000001.webp', country = 'Saint Lucia', roles = ARRAY['programme_supervisor','mentor'], skills = ARRAY['Policy & Governance','Project Management','Climate Resilience','Community Development'], is_verified = true, verified_via = 'admin', verified_at = NOW() - INTERVAL '178 days', mfa_grandfathered = true, requires_mfa_enrollment = false, created_at = NOW() - INTERVAL '180 days' WHERE id = 'a0000000-0000-0000-0000-000000000001';
UPDATE profiles SET display_name = 'Devon Charles', bio = 'Senior Programme Officer at the OECS Commission, based in Roseau. I work on e-services for member states and I still think most of them should run on a basic phone.', avatar_url = 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000002.webp', country = 'Dominica', roles = ARRAY['people_supervisor'], skills = ARRAY['Business Strategy','Finance','Supply Chain'], is_verified = true, verified_via = 'admin', verified_at = NOW() - INTERVAL '168 days', mfa_grandfathered = true, requires_mfa_enrollment = false, created_at = NOW() - INTERVAL '170 days' WHERE id = 'a0000000-0000-0000-0000-000000000002';
-- faculty role: holds grant:sponsor, so she can sponsor the student grant
-- applications below (064's enforce_grant_application_sponsor trigger).
UPDATE profiles SET display_name = 'Dr. Althea Williams', bio = 'Marine biologist with UWI, based in St. George''s. I study coral bleaching and sargassum, and I mentor students working on reef and fisheries projects.', avatar_url = 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000003.webp', country = 'Grenada', roles = ARRAY['mentor','faculty'], skills = ARRAY['Marine Conservation','Climate Resilience','Data Science','Renewable Energy'], is_verified = true, verified_via = 'admin', verified_at = NOW() - INTERVAL '148 days', mfa_grandfathered = true, requires_mfa_enrollment = false, created_at = NOW() - INTERVAL '150 days' WHERE id = 'a0000000-0000-0000-0000-000000000003';
UPDATE profiles SET display_name = 'James Pierre', bio = 'Started three companies out of Basseterre and sold one. Now I write small cheques for Caribbean software teams and mentor first-time founders.', avatar_url = 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000004.webp', country = 'Saint Kitts and Nevis', roles = ARRAY['mentor','investor'], skills = ARRAY['Software Development','Business Strategy','Marketing','Finance'], is_verified = true, verified_via = 'admin', verified_at = NOW() - INTERVAL '138 days', mfa_grandfathered = true, requires_mfa_enrollment = false, created_at = NOW() - INTERVAL '140 days' WHERE id = 'a0000000-0000-0000-0000-000000000004';
UPDATE profiles SET display_name = 'Keisha Baptiste', bio = 'Founder of AgriTech SVG. We put soil and weather sensors on smallholder farms in the Grenadines so farmers know when to water and when to hold off.', avatar_url = 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000005.webp', country = 'Saint Vincent and the Grenadines', roles = ARRAY['entrepreneur'], skills = ARRAY['Agriculture Technology','Software Development','UX/UI Design'], is_verified = true, verified_via = 'admin', verified_at = NOW() - INTERVAL '118 days', mfa_grandfathered = true, requires_mfa_enrollment = false, entrepreneur_stage = 'startup', created_at = NOW() - INTERVAL '120 days' WHERE id = 'a0000000-0000-0000-0000-000000000005';
UPDATE profiles SET display_name = 'Rashid Mohammed', bio = 'Building EduCarib, an e-learning platform written around the CSEC and CAPE syllabuses for schools in the region.', avatar_url = 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000006.webp', country = 'Grenada', roles = ARRAY['entrepreneur'], skills = ARRAY['Education Technology','Software Development','Project Management'], is_verified = true, verified_via = 'admin', verified_at = NOW() - INTERVAL '108 days', mfa_grandfathered = true, requires_mfa_enrollment = false, entrepreneur_stage = 'export_ready', created_at = NOW() - INTERVAL '110 days' WHERE id = 'a0000000-0000-0000-0000-000000000006';
UPDATE profiles SET display_name = 'Camille Fontaine', bio = 'Tourism-tech founder in Roseau. I''m building augmented-reality walking trails for Dominica''s old town.', avatar_url = 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000007.webp', country = 'Dominica', roles = ARRAY['entrepreneur'], skills = ARRAY['Tourism Innovation','Creative Arts','UX/UI Design','Marketing'], is_verified = true, verified_via = 'admin', verified_at = NOW() - INTERVAL '98 days', mfa_grandfathered = true, requires_mfa_enrollment = false, entrepreneur_stage = 'aspiring', created_at = NOW() - INTERVAL '100 days' WHERE id = 'a0000000-0000-0000-0000-000000000007';
UPDATE profiles SET display_name = 'Tariq Phillip', bio = 'Computer Science student at UWI, from St. John''s. Working on cheap monitoring kits for rooftop solar.', avatar_url = 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000008.webp', country = 'Antigua and Barbuda', roles = ARRAY['student'], skills = ARRAY['Software Development','Renewable Energy','Data Science'], is_verified = true, verified_via = 'admin', verified_at = NOW() - INTERVAL '88 days', mfa_grandfathered = true, requires_mfa_enrollment = false, created_at = NOW() - INTERVAL '90 days' WHERE id = 'a0000000-0000-0000-0000-000000000008';
UPDATE profiles SET display_name = 'Shania Lewis', bio = 'Environmental science student in Grenada. I''m training a model to spot coral bleaching in drone footage from Moliniere Bay.', avatar_url = 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000009.webp', country = 'Grenada', roles = ARRAY['student'], skills = ARRAY['Marine Conservation','Data Science','Climate Resilience'], is_verified = true, verified_via = 'admin', verified_at = NOW() - INTERVAL '78 days', mfa_grandfathered = true, requires_mfa_enrollment = false, created_at = NOW() - INTERVAL '80 days' WHERE id = 'a0000000-0000-0000-0000-000000000009';
UPDATE profiles SET display_name = 'Marcus George', bio = 'Business student in Castries. Interested in social enterprise and in how community groups can earn their own income.', avatar_url = 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000010.webp', country = 'Saint Lucia', roles = ARRAY['student'], skills = ARRAY['Business Strategy','Community Development','Marketing'], is_verified = false, verified_via = NULL, verified_at = NULL, mfa_grandfathered = true, requires_mfa_enrollment = false, created_at = NOW() - INTERVAL '70 days' WHERE id = 'a0000000-0000-0000-0000-000000000010';
UPDATE profiles SET display_name = 'Sandra Mitchell', bio = 'Angel investor in Bridgetown. I back early Caribbean companies in solar and battery storage, and lately a couple of food processors. Often I am the first outside money in.', avatar_url = 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000011.webp', country = 'Barbados', roles = ARRAY['investor','private_sector'], skills = ARRAY['Finance','Renewable Energy','Agriculture Technology','Business Strategy'], is_verified = true, verified_via = 'admin', verified_at = NOW() - INTERVAL '128 days', mfa_grandfathered = true, requires_mfa_enrollment = false, created_at = NOW() - INTERVAL '130 days' WHERE id = 'a0000000-0000-0000-0000-000000000011';
-- entrepreneur role added: private_sector alone has no grant:apply, and Andre
-- has a grant application below (064 trigger enforces the permission).
UPDATE profiles SET display_name = 'Andre Williams', bio = 'CTO at CaribbeanCloud Ltd in Brades. I argue for open data across the OECS, and for government forms you can finish online in one sitting.', avatar_url = 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000012.webp', country = 'Montserrat', roles = ARRAY['private_sector','entrepreneur'], skills = ARRAY['Software Development','Healthcare Innovation','Water Management','Disaster Preparedness'], is_verified = true, verified_via = 'admin', verified_at = NOW() - INTERVAL '58 days', mfa_grandfathered = true, requires_mfa_enrollment = false, entrepreneur_stage = 'exporter', created_at = NOW() - INTERVAL '60 days' WHERE id = 'a0000000-0000-0000-0000-000000000012';

-- Backup emails. 204 makes a verified backup address mandatory (the gate at
-- /security/backup-email), so each demo login gets one here, already
-- verified, in the 056 alias table.
INSERT INTO user_email_aliases (user_id, email, verified_at, verification_token) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'marcia.joseph@ktip-demo.org', NOW() - INTERVAL '178 days', NULL),
  ('a0000000-0000-0000-0000-000000000002', 'devon.charles@ktip-demo.org', NOW() - INTERVAL '168 days', NULL),
  ('a0000000-0000-0000-0000-000000000003', 'althea.williams@ktip-demo.org', NOW() - INTERVAL '148 days', NULL),
  ('a0000000-0000-0000-0000-000000000004', 'james.pierre@ktip-demo.org', NOW() - INTERVAL '138 days', NULL),
  ('a0000000-0000-0000-0000-000000000005', 'keisha.baptiste@ktip-demo.org', NOW() - INTERVAL '118 days', NULL),
  ('a0000000-0000-0000-0000-000000000006', 'rashid.mohammed@ktip-demo.org', NOW() - INTERVAL '108 days', NULL),
  ('a0000000-0000-0000-0000-000000000007', 'camille.fontaine@ktip-demo.org', NOW() - INTERVAL '98 days', NULL),
  ('a0000000-0000-0000-0000-000000000008', 'tariq.phillip@ktip-demo.org', NOW() - INTERVAL '88 days', NULL),
  ('a0000000-0000-0000-0000-000000000009', 'shania.lewis@ktip-demo.org', NOW() - INTERVAL '78 days', NULL),
  ('a0000000-0000-0000-0000-000000000010', 'marcus.george@ktip-demo.org', NOW() - INTERVAL '68 days', NULL),
  ('a0000000-0000-0000-0000-000000000011', 'sandra.mitchell@ktip-demo.org', NOW() - INTERVAL '128 days', NULL),
  ('a0000000-0000-0000-0000-000000000012', 'andre.williams@ktip-demo.org', NOW() - INTERVAL '58 days', NULL)
ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  verified_at = EXCLUDED.verified_at,
  verification_token = NULL;


-- ============================================================
-- 2. PROJECTS  (8 projects across categories & phases)
-- ============================================================

INSERT INTO projects (id, title, description, category, phase, hashtags, image_url, is_public, is_climate_action, is_innovation, owner_id, created_at) VALUES
  ('b0000000-0000-0000-0000-000000000001',
   'AgriSense SVG',
   'Soil-moisture and weather sensors for smallholder farms on Union Island and Canouan. Farmers get an SMS when a plot needs water, and a simple dashboard shows yield estimates for each field. On the pilot farms, crop loss in the dry season fell by about 30%.',
   'agriculture', 'prototype',
   ARRAY['iot','agriculture','climate','grenadines'],
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/project-images/seed/projects/b0000000-0000-0000-0000-000000000001.webp',
   true, true, true,
   'a0000000-0000-0000-0000-000000000005',
   NOW() - INTERVAL '115 days'),

  ('b0000000-0000-0000-0000-000000000002',
   'EduCarib Platform',
   'E-learning built around the CSEC and CAPE syllabuses. Teachers set work and track progress from a dashboard, and the phone app downloads lessons overnight so students in schools with weak Wi-Fi can still use it during the day.',
   'education', 'funding',
   ARRAY['edtech','elearning','caribbean','offline'],
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/project-images/seed/projects/b0000000-0000-0000-0000-000000000002.webp',
   true, false, true,
   'a0000000-0000-0000-0000-000000000006',
   NOW() - INTERVAL '105 days'),

  ('b0000000-0000-0000-0000-000000000003',
   'Dominica Heritage Trails',
   'Augmented-reality walking tours of old Roseau. Point a phone at the Old Market or the Cathedral and you see the street as it looked in the 1900s, with recordings of elders telling what happened there.',
   'technology', 'concept',
   ARRAY['ar','tourism','heritage','dominica'],
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/project-images/seed/projects/b0000000-0000-0000-0000-000000000003.webp',
   true, false, false,
   'a0000000-0000-0000-0000-000000000007',
   NOW() - INTERVAL '95 days'),

  ('b0000000-0000-0000-0000-000000000004',
   'SolarGrid Antigua',
   'A community micro-grid in All Saints that pairs rooftop solar with shared battery storage. The goal is power for 100 households that stays on after a storm and costs less than the grid tariff.',
   'environment', 'funding',
   ARRAY['solar','energy','resilience','microgrid'],
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/project-images/seed/projects/b0000000-0000-0000-0000-000000000004.webp',
   true, true, false,
   'a0000000-0000-0000-0000-000000000008',
   NOW() - INTERVAL '85 days'),

  ('b0000000-0000-0000-0000-000000000005',
   'ReefWatch AI',
   'A model that reads underwater drone footage from Grenada''s marine protected areas and flags bleached coral and lionfish, so rangers at Moliniere-Beausejour can check reef health without diving every transect.',
   'environment', 'prototype',
   ARRAY['ai','marine','coral','conservation'],
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/project-images/seed/projects/b0000000-0000-0000-0000-000000000005.webp',
   true, true, true,
   'a0000000-0000-0000-0000-000000000009',
   NOW() - INTERVAL '75 days'),

  ('b0000000-0000-0000-0000-000000000006',
   'CaribbeanCloud Gov',
   'An open-source toolkit for OECS government departments that want to put services online. It ships with portal templates, an open data API and document storage, and it is already running in Montserrat.',
   'technology', 'launch',
   ARRAY['govtech','opendata','cloud','oecs'],
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/project-images/seed/projects/b0000000-0000-0000-0000-000000000006.webp',
   true, false, false,
   'a0000000-0000-0000-0000-000000000012',
   NOW() - INTERVAL '55 days'),

  ('b0000000-0000-0000-0000-000000000007',
   'MediConnect OECS',
   'Telemedicine for district clinics. A nurse in a rural clinic can book a video consult with a specialist on another island, share the patient''s notes and receive an e-prescription the pharmacy will accept.',
   'healthcare', 'concept',
   ARRAY['telehealth','healthcare','rural','telemedicine'],
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/project-images/seed/projects/b0000000-0000-0000-0000-000000000007.webp',
   true, false, false,
   'a0000000-0000-0000-0000-000000000012',
   NOW() - INTERVAL '45 days'),

  ('b0000000-0000-0000-0000-000000000008',
   'WaterSafe Montserrat',
   'Low-cost water-quality sensors in springs and storage tanks around Montserrat. Readings go to a public dashboard every 15 minutes, and the water authority gets an alert when turbidity or pH moves out of range.',
   'environment', 'prototype',
   ARRAY['water','iot','monitoring','climate'],
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/project-images/seed/projects/b0000000-0000-0000-0000-000000000008.webp',
   true, true, true,
   'a0000000-0000-0000-0000-000000000012',
   NOW() - INTERVAL '35 days')

ON CONFLICT (id) DO UPDATE SET
  -- 172. Refreshed on re-run so an existing demo database picks up the flag.
  is_innovation = EXCLUDED.is_innovation,
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
   'Farmers in Carriacou have the same problem every dry season. Have you looked at pulling in satellite rainfall data as well?', NOW() - INTERVAL '110 days'),
  ('c1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005',
   'Thanks Dr. Williams. Yes, we are testing CHIRPS rainfall data for the next version.', NOW() - INTERVAL '109 days'),
  ('c1000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   'Rashid, the OECS Education Development Management Unit would like to talk to you about syllabus mapping. I can make the introduction.', NOW() - INTERVAL '100 days'),
  ('c1000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000011',
   'I would like to see the numbers on this micro-grid. Send me a message when you have a cost per household.', NOW() - INTERVAL '80 days'),
  ('c1000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003',
   'Good work, Shania. I can get you access to the Moliniere-Beausejour MPA drone footage for training data.', NOW() - INTERVAL '70 days'),
  ('c1000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002',
   'Andre, this fits the e-services work several member states have already committed to. Can we find an hour to talk it through?', NOW() - INTERVAL '50 days')
ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content;


-- ============================================================
-- 4. EVENTS  (6 events in various states)
-- ============================================================

INSERT INTO events (id, title, description, event_type, status, location, is_virtual, start_date, end_date, capacity, image_url, is_climate_action, organizer_id, created_at) VALUES
  ('d0000000-0000-0000-0000-000000000001',
   'OECS Innovation Hackathon',
   'Teams of developers, designers and founders from across the OECS spend the week building tools that help islands cope with drought and heavy sargassum seasons. Mentors are on site in Rodney Bay every afternoon. The top three teams take home seed funding and six months of mentoring.',
   'hackathon', 'published',
   'Bay Gardens Hotel, Rodney Bay, Saint Lucia', false,
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days',
   100,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000001.webp',
   true,
   'a0000000-0000-0000-0000-000000000001',
   NOW() - INTERVAL '20 days'),

  ('d0000000-0000-0000-0000-000000000002',
   'Intro to IoT for Agriculture Workshop',
   'A one-day, hands-on session. You will wire a soil-moisture sensor to an ESP32, send the readings to a free online dashboard and take the finished monitor home with you. No coding experience needed, but bring a laptop.',
   'workshop', 'published',
   'National Research & Development Foundation, Kingstown', false,
   '2026-12-10 13:00:00+00', '2026-12-10 19:00:00+00',
   30,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000002.webp',
   true,
   'a0000000-0000-0000-0000-000000000005',
   NOW() - INTERVAL '30 days'),

  ('d0000000-0000-0000-0000-000000000003',
   'Caribbean Climate Tech Meetup',
   'Monthly online meetup for people building climate tech in the region. This session is on coastal erosion: drone surveys of beach profiles in Grenada, and the tide gauges going in along Dominica''s east coast.',
   'meetup', 'published',
   NULL, true,
   '2026-12-03 22:00:00+00', '2026-12-04 01:00:00+00',
   NULL,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000003.webp',
   true,
   'a0000000-0000-0000-0000-000000000003',
   NOW() - INTERVAL '10 days'),

  ('d0000000-0000-0000-0000-000000000004',
   'OECS Digital Economy Conference 2027',
   'Three days in Roseau on e-government and digital payments in OECS member states. Most sessions are led by ministry staff who have run e-service projects and by founders who have sold software to government, so expect detail on procurement and what went wrong.',
   'conference', 'published',
   'Dominica State College, Roseau', false,
   '2027-02-23 13:00:00+00', '2027-02-25 21:00:00+00',
   200,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000004.webp',
   false,
   'a0000000-0000-0000-0000-000000000002',
   NOW() - INTERVAL '15 days'),

  ('d0000000-0000-0000-0000-000000000005',
   'Demo Day: Cohort 3 Startups',
   'Eight startups from the third KTIP accelerator cohort pitch to investors and mentors. Each team gets seven minutes and five for questions. Drinks on the terrace afterwards.',
   'demo_day', 'published',
   'Grenada Trade Centre, St. George''s', false,
   '2027-02-11 14:00:00+00', '2027-02-11 18:00:00+00',
   150,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000005.webp',
   false,
   'a0000000-0000-0000-0000-000000000004',
   NOW() - INTERVAL '5 days'),

  ('d0000000-0000-0000-0000-000000000006',
   'Blue Economy Innovation Summit',
   'Two days in St. John''s with 120 people, mostly from fisheries and tourism, looking at which ocean-based businesses the OECS can realistically grow. Sargassum use and fish cold-chain got the most time.',
   'conference', 'completed',
   'Sandals Grande, Antigua', false,
   NOW() - INTERVAL '40 days', NOW() - INTERVAL '38 days',
   120,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000006.webp',
   true,
   'a0000000-0000-0000-0000-000000000001',
   NOW() - INTERVAL '90 days')

ON CONFLICT (id) DO UPDATE SET
  image_url = EXCLUDED.image_url,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date;

-- Migration 153 — the country each in-person seed event is in, so the
-- ranker's geo term has something to fire on. Separate statement rather than a
-- column in the INSERT above so the seed still loads on a database that has
-- not yet run 153. The virtual meetup (…03) deliberately stays NULL.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'events' AND column_name = 'country_code') THEN
    UPDATE events SET country_code = v.code
      FROM (VALUES
        ('d0000000-0000-0000-0000-000000000001'::uuid, 'LC'),
        ('d0000000-0000-0000-0000-000000000002'::uuid, 'VC'),
        ('d0000000-0000-0000-0000-000000000004'::uuid, 'DM'),
        ('d0000000-0000-0000-0000-000000000005'::uuid, 'GD'),
        ('d0000000-0000-0000-0000-000000000006'::uuid, 'AG')
      ) AS v(id, code)
     WHERE events.id = v.id;
  END IF;
END $$;


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
   'Dr. Lorna Augustin', 'Head of Enterprise Programmes, OECS Commission',
   'Runs the Commission''s enterprise programmes in Castries and spent ten years before that on education reform across the member states.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/speakers/e1000000-0000-0000-0000-000000000001.webp', 1),
  ('e1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001',
   'Keisha Baptiste', 'Founder, AgriSense SVG',
   'Runs AgriSense, a sensor network on smallholder farms in the Grenadines. She will talk about what broke in the first field season.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000005.webp', 2),
  ('e1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000004',
   'Prof. Kerwin Lestrade', 'Engineering faculty, UWI Five Islands',
   'Engineer and long-time adviser on ICT policy for small states, with a particular interest in how island governments buy software.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/speakers/e1000000-0000-0000-0000-000000000003.webp', 1),
  ('e1000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004',
   'Sandra Mitchell', 'Angel Investor, Bridgetown',
   'Has backed eleven Caribbean companies, most of them in solar and battery storage. She will cover what she looks for before a first cheque.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000011.webp', 2)
ON CONFLICT (id) DO UPDATE SET
  photo_url = EXCLUDED.photo_url,
  name = EXCLUDED.name,
  title = EXCLUDED.title,
  bio = EXCLUDED.bio;


-- ============================================================
-- 7. EVENT SCHEDULE (hackathon)
--
-- Times are derived from the hackathon's own start_date rather than from
-- NOW(). They used to be hardcoded at NOW() + 30/31 days, which matched the
-- event only while the event itself was seeded at +30 days: the moment the
-- hackathon moved to span today, its agenda stayed a month out and the
-- detail page showed a schedule for an event that had already happened.
-- Fixed ids so a re-run refreshes the rows instead of adding a second agenda.
-- The DELETE clears the random-id copies older runs of this seed left behind.
-- ============================================================

DELETE FROM event_schedule
 WHERE event_id = 'd0000000-0000-0000-0000-000000000001'
   AND id NOT IN ('5c000000-0000-0000-0000-000000000001',
                  '5c000000-0000-0000-0000-000000000002',
                  '5c000000-0000-0000-0000-000000000003',
                  '5c000000-0000-0000-0000-000000000004',
                  '5c000000-0000-0000-0000-000000000005',
                  '5c000000-0000-0000-0000-000000000006');

INSERT INTO event_schedule (id, event_id, title, description, start_time, end_time, schedule_type, sort_order)
SELECT v.id, e.id, v.title, v.description,
       e.start_date + v.starts_after, e.start_date + v.ends_after,
       v.schedule_type, v.sort_order
FROM events e
CROSS JOIN (VALUES
  ('5c000000-0000-0000-0000-000000000001'::uuid,
   'Registration and Welcome', 'Pick up your badge and team pack at the front desk, then find a table.',
   INTERVAL '0 hours', INTERVAL '1 hour', 'other', 1),
  ('5c000000-0000-0000-0000-000000000002'::uuid,
   'Opening Keynote', 'Why drought and sargassum are now planning problems for every OECS ministry, and where software can help.',
   INTERVAL '1 hour', INTERVAL '2 hours', 'keynote', 2),
  ('5c000000-0000-0000-0000-000000000003'::uuid,
   'Hacking Opens', 'Form teams, pick a challenge brief and start building. Mentors walk the room each afternoon.',
   INTERVAL '2 hours', INTERVAL '4 days 14 hours', 'session', 3),
  ('5c000000-0000-0000-0000-000000000004'::uuid,
   'Lunch and Networking', 'Lunch on the patio. A good time to find the skills your team is missing.',
   INTERVAL '5 hours', INTERVAL '6 hours', 'break', 4),
  ('5c000000-0000-0000-0000-000000000005'::uuid,
   'Final Presentations and Judging', 'Each team has five minutes to demo, then three minutes of questions from the judges.',
   INTERVAL '4 days 14 hours', INTERVAL '4 days 17 hours', 'session', 5),
  ('5c000000-0000-0000-0000-000000000006'::uuid,
   'Awards and Closing', 'Winners are announced and the seed funding and mentoring places are handed out.',
   INTERVAL '4 days 17 hours', INTERVAL '4 days 18 hours', 'other', 6)
) AS v(id, title, description, starts_after, ends_after, schedule_type, sort_order)
WHERE e.id = 'd0000000-0000-0000-0000-000000000001'
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  schedule_type = EXCLUDED.schedule_type,
  sort_order = EXCLUDED.sort_order;


-- ============================================================
-- 8. GRANTS  (6 funding opportunities)
-- ============================================================

-- created_by: 181 lets only a grant's creator decide its applications, so
-- every demo call needs one. Sandra Mitchell (a11) posts all six.
INSERT INTO grants (id, title, description, amount_min, amount_max, currency, deadline, eligibility, application_url, grant_type, is_active, is_climate_action, created_by, created_at) VALUES
  ('f0000000-0000-0000-0000-000000000001',
   'OECS Innovation Seed Fund',
   'Seed grants of $5,000 to $25,000 for early-stage innovators in OECS member states. This round gives priority to food security and to climate resilience, for example dry-season irrigation or storm warnings for fishers.',
   5000, 25000, 'USD',
   '2026-12-11 23:59:00+00',
   'You must be a citizen or resident of an OECS member state. Individuals can apply, and so can registered businesses under 3 years old.',
   'https://oecs.org/innovation-fund', 'startup', true, true,
   'a0000000-0000-0000-0000-000000000011',
   NOW() - INTERVAL '60 days'),

  ('f0000000-0000-0000-0000-000000000002',
   'Caribbean Development Bank TechGrant',
   'Grants of up to $50,000 for technology that makes a public service faster or cheaper to deliver, such as land registry searches or online business licences. Winners also get a year with a CDB adviser.',
   10000, 50000, 'USD',
   '2027-01-15 23:59:00+00',
   'Open to registered entities in CDB borrowing member countries. Your proposal needs to show how the work could be used in at least one other country.',
   'https://caribank.org/techgrant', 'development', true, false,
   'a0000000-0000-0000-0000-000000000011',
   NOW() - INTERVAL '45 days'),

  ('f0000000-0000-0000-0000-000000000003',
   'Blue Economy Research Fellowship',
   'Research grants of $15,000 to $40,000 for work on fisheries, reef health and coastal change in OECS waters. Past fellows have studied sargassum landings in Grenada and reef fish stocks off Saint Lucia.',
   15000, 40000, 'USD',
   '2027-01-29 23:59:00+00',
   'PhD candidates and post-doctoral researchers affiliated with a recognised institution. OECS nationals are preferred.',
   NULL, 'research', true, true,
   'a0000000-0000-0000-0000-000000000011',
   NOW() - INTERVAL '30 days'),

  ('f0000000-0000-0000-0000-000000000004',
   'EdTech Caribbean Accelerator Grant',
   'Up to $30,000 plus six months of mentoring for education startups whose users are Caribbean students or teachers.',
   10000, 30000, 'USD',
   '2027-02-12 23:59:00+00',
   'Ed-tech startups with a working MVP and at least one Caribbean co-founder.',
   'https://edtechcaribbean.org/apply', 'education', true, false,
   'a0000000-0000-0000-0000-000000000011',
   NOW() - INTERVAL '20 days'),

  ('f0000000-0000-0000-0000-000000000005',
   'GCF Small Grants for Climate Adaptation',
   'Green Climate Fund small grants of $10,000 to $50,000 for adaptation work led by communities in small island states. Typical projects include rainwater storage, slope stabilisation and mangrove replanting.',
   10000, 50000, 'USD',
   '2027-02-26 23:59:00+00',
   'Community organisations and NGOs in Small Island Developing States. The people who benefit must be in the community that applies.',
   'https://greenclimate.fund/sids', 'innovation', true, true,
   'a0000000-0000-0000-0000-000000000011',
   NOW() - INTERVAL '15 days'),

  ('f0000000-0000-0000-0000-000000000006',
   'Caribbean Angel Network Pitch Competition',
   'The top three pitches receive $20,000 to $75,000 in angel investment. Open to Caribbean startups with a prototype or later.',
   20000, 75000, 'USD',
   '2026-12-18 23:59:00+00',
   'Caribbean-based startups with a working prototype. You must be able to pitch in person in Bridgetown, Barbados.',
   'https://caribbeanangelnetwork.com/pitch', 'startup', true, false,
   'a0000000-0000-0000-0000-000000000011',
   NOW() - INTERVAL '10 days')

ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  amount_min = EXCLUDED.amount_min,
  amount_max = EXCLUDED.amount_max,
  currency = EXCLUDED.currency,
  deadline = EXCLUDED.deadline,
  eligibility = EXCLUDED.eligibility,
  application_url = EXCLUDED.application_url,
  grant_type = EXCLUDED.grant_type,
  is_active = EXCLUDED.is_active,
  is_climate_action = EXCLUDED.is_climate_action,
  created_by = EXCLUDED.created_by;

-- Hero copy (042 summary + 043 details). Applied as a separate UPDATE rather
-- than columns on the insert above so it also reaches databases seeded before
-- this block existed. Guarded on empty, so anything edited through the admin
-- grant form survives.
UPDATE grants AS g
SET summary = v.summary,
    details = v.details
FROM (VALUES
  ('f0000000-0000-0000-0000-000000000001'::uuid,
   'Seed grants of US$5,000 to US$25,000 for early-stage OECS innovators.',
   '[{"id":"funding","label":"Funding","items":[
       {"id":"f1","label":"Type","value":"Non-dilutive seed grant"},
       {"id":"f2","label":"Disbursement","value":"Two tranches, milestone-based"},
       {"id":"f3","label":"Priority sectors","value":"Food security and climate resilience"}]},
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
   'Research grants of US$15,000 to US$40,000 for ocean and coastal science in OECS waters.',
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
   'Green Climate Fund small grants of US$10,000 to US$50,000 for community-led climate adaptation.',
   '[{"id":"funding","label":"Funding","items":[
       {"id":"f1","label":"Type","value":"Climate adaptation small grant"},
       {"id":"f2","label":"Duration","value":"24 months"},
       {"id":"f3","label":"Co-financing","value":"In-kind community contribution encouraged"}]},
     {"id":"elig","label":"Eligibility","items":[
       {"id":"e1","label":"Applicant","value":"Community organisations and NGOs in SIDS"},
       {"id":"e2","label":"Beneficiaries","value":"Must directly benefit vulnerable communities"}]},
     {"id":"contact","label":"Contact","value":"sids@greenclimate.fund"}]'::jsonb),

  ('f0000000-0000-0000-0000-000000000006'::uuid,
   'The top three pitches take US$20,000 to US$75,000 in angel investment.',
   '[{"id":"funding","label":"Funding","items":[
       {"id":"f1","label":"Type","value":"Equity angel investment"},
       {"id":"f2","label":"Awards","value":"Three winners per cycle"},
       {"id":"f3","label":"Terms","value":"Negotiated per deal with the lead angel"}]},
     {"id":"elig","label":"Eligibility","items":[
       {"id":"e1","label":"Stage","value":"Working prototype or beyond"},
       {"id":"e2","label":"Attendance","value":"Must pitch in person in Bridgetown, Barbados"}]},
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
   '{"project_name": "AgriSense SVG", "summary": "Soil and weather sensors for smallholder farms in the Grenadines", "amount_requested": 20000}'::jsonb,
   'under_review', NULL, NULL, NULL, NOW() - INTERVAL '50 days'),

  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008',
   '{"project_name": "SolarGrid Antigua", "summary": "Solar and battery micro-grid for 100 households in All Saints", "amount_requested": 25000}'::jsonb,
   'pending',
   'a0000000-0000-0000-0000-000000000003',
   'Tariq has done the load survey for all 100 households himself. The SolarGrid pilot is well scoped and I am glad to sponsor it.',
   NOW() - INTERVAL '41 days',
   NOW() - INTERVAL '40 days'),

  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000012',
   '{"project_name": "CaribbeanCloud Gov", "summary": "Open-source toolkit for putting OECS government services online", "amount_requested": 45000}'::jsonb,
   'approved', NULL, NULL, NULL, NOW() - INTERVAL '35 days'),

  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000009',
   '{"project_name": "ReefWatch AI", "summary": "Bleaching detection from drone footage in Grenada''s marine parks", "amount_requested": 30000}'::jsonb,
   'under_review',
   'a0000000-0000-0000-0000-000000000003',
   'I supervise Shania''s reef monitoring research and support this application. Her labelled set from Moliniere is already the best we have.',
   NOW() - INTERVAL '26 days',
   NOW() - INTERVAL '25 days'),

  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000006',
   '{"project_name": "EduCarib Platform", "summary": "CSEC and CAPE lessons that work offline", "amount_requested": 28000}'::jsonb,
   'pending', NULL, NULL, NULL, NOW() - INTERVAL '15 days'),

  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005',
   '{"project_name": "AgriSense Climate Module", "summary": "Drought alerts and rainfall forecasts added to AgriSense", "amount_requested": 35000}'::jsonb,
   'pending', NULL, NULL, NULL, NOW() - INTERVAL '10 days'),

  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000007',
   '{"project_name": "Dominica Heritage Trails", "summary": "AR walking tours of old Roseau", "amount_requested": 40000}'::jsonb,
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
   'Welcome to KTIP: introduce yourself here',
   'Welcome to KTIP. This is where people building things across the OECS find mentors, compare notes and hear about funding calls before they close.\n\nPlease introduce yourself in this thread with your name, your island and what you are working on. If you are looking for a co-founder or a mentor, say so. There is a good chance someone here has already solved the problem you are stuck on.',
   true, NOW() - INTERVAL '175 days'),

  ('f1000000-0000-0000-0000-000000000002',
   (SELECT id FROM forum_boards WHERE slug = 'showcase'),
   'a0000000-0000-0000-0000-000000000005',
   'AgriSense SVG: first field test results',
   'Our first field test on Union Island is done. Over three weeks with 5 farmers, the soil-moisture sensors called irrigation correctly 87% of the time.\n\nWhat we learned:\n- Battery life was better than we expected, about 6 weeks per charge\n- SMS alerts arrived even in the patchy coverage around Ashton\n- After a 30-minute session at the community centre, every farmer could read the dashboard on their own\n\nAsk me anything about the setup.',
   false, NOW() - INTERVAL '90 days'),

  ('f1000000-0000-0000-0000-000000000003',
   (SELECT id FROM forum_boards WHERE slug = 'funding'),
   'a0000000-0000-0000-0000-000000000004',
   'Tips for writing a winning OECS Innovation Fund application',
   'I have read a lot of these applications as a mentor. Here is what the funded ones tend to do:\n\n1. **Lead with the problem.** Show you understand it better than the reviewer does.\n2. **Be specific about impact.** "Help farmers" is weak. "Cut post-harvest loss by 25% for 200 nutmeg farmers in St. Andrew''s" is strong.\n3. **Show traction.** A small pilot or ten user interviews both count.\n4. **Budget honestly.** Reviewers can tell when numbers are padded.\n5. **Say why it is you.** Name what you know about this problem that other applicants do not.\n\nI do free 15-minute application reviews for members. Send me a message.',
   true, NOW() - INTERVAL '55 days'),

  ('f1000000-0000-0000-0000-000000000004',
   (SELECT id FROM forum_boards WHERE slug = 'mentorship'),
   'a0000000-0000-0000-0000-000000000003',
   'Offering mentorship: Marine science & climate research',
   'Hi everyone, I am Dr. Althea Williams, a marine biologist with UWI in St. George''s. I have spent 12 years on coral reef ecology and climate modelling, and a fair bit of that on fisheries policy.\n\nI can take on 2 or 3 students or early-career founders this term. Good fits are:\n- Reef and fisheries monitoring tech\n- Climate data analysis\n- Sargassum, from tracking it to finding a use for it\n- Blue economy businesses\n\nReply with a few lines on your project and the help you need, and I will get back to you.',
   false, NOW() - INTERVAL '45 days'),

  ('f1000000-0000-0000-0000-000000000005',
   (SELECT id FROM forum_boards WHERE slug = 'tech-help'),
   'a0000000-0000-0000-0000-000000000008',
   'Best low-cost microcontroller for outdoor solar monitoring?',
   'I am building panel monitoring for SolarGrid Antigua and need a microcontroller that:\n- Survives outdoors in our heat and humidity\n- Has Wi-Fi or LoRa\n- Draws very little power, since it runs off the panels\n- Costs under $15 a unit\n\nRight now it is between the ESP32 and the Arduino Nano 33 IoT. If you have kept outdoor IoT running in the Caribbean for more than a season, I would like to hear what held up.',
   false, NOW() - INTERVAL '30 days'),

  ('f1000000-0000-0000-0000-000000000006',
   (SELECT id FROM forum_boards WHERE slug = 'events'),
   'a0000000-0000-0000-0000-000000000002',
   'OECS Digital Economy Conference 2027: call for speakers',
   'Speaker proposals are open for the OECS Digital Economy Conference at Dominica State College in Roseau, 23 to 25 February 2027.\n\nWe want talks on:\n- E-government services people actually use\n- Mobile payments for people without a bank account\n- Data protection and privacy rules across member states\n- AI in small island public services\n- Training digital staff and keeping them on-island\n\nSend a 200-word abstract by 15 January 2027. Reply here or message me with questions.',
   false, NOW() - INTERVAL '12 days')

ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content;


-- Forum Replies

-- Replies carry random ids, so a re-run would stack a second copy of each.
-- Clear the demo authors' replies on the demo posts first.
DELETE FROM forum_replies
 WHERE post_id::text LIKE 'f1000000-%'
   AND author_id::text LIKE 'a0000000-%';

INSERT INTO forum_replies (id, post_id, author_id, content, created_at) VALUES
  -- Replies to Welcome post
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005',
   'Hi all, Keisha from St. Vincent. I run AgriSense, soil sensors for small farms in the Grenadines. Glad to be here.', NOW() - INTERVAL '174 days'),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008',
   'Tariq from Antigua. Second-year CS at UWI, working on monitoring for rooftop solar. I am looking for a mentor who has done hardware in the field.', NOW() - INTERVAL '89 days'),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007',
   'Camille in Roseau. I am building AR walking tours of the old town. Good to see people from so many islands on here.', NOW() - INTERVAL '85 days'),

  -- Replies to AgriSense showcase
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003',
   '87% on a first field test is a strong start, Keisha. Which model are you using for the irrigation calls?', NOW() - INTERVAL '89 days'),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000011',
   'Good results. When you are ready to go beyond five farms, I would like to talk about funding the larger pilot.', NOW() - INTERVAL '88 days'),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005',
   'Thanks, both. It is a plain random forest for now. Next season we will try an LSTM on the time series. Sandra, I will message you.', NOW() - INTERVAL '87 days'),

  -- Replies to funding tips
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000006',
   'Point 2 is the one, James. I rewrote the EduCarib application around exam pass rates in three named schools and the feedback was night and day.', NOW() - INTERVAL '50 days'),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000010',
   'Would you look at student applications too? I am putting together a proposal for a social enterprise in Castries.', NOW() - INTERVAL '48 days'),

  -- Replies to mentorship offer
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000009',
   'Dr. Williams, I would like to apply. I am working on ReefWatch AI, which looks for coral bleaching in drone footage. I need the most help with collecting and labelling training data.', NOW() - INTERVAL '44 days'),

  -- Replies to tech help
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000012',
   'Go with the ESP32. We have dozens in the field for CaribbeanCloud. The S3 has good Wi-Fi range and copes with the humidity here as long as you put a conformal coating on the board.', NOW() - INTERVAL '29 days'),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005',
   'Another vote for the ESP32. All our AgriSense stations run on them. Buy the version with an external antenna connector, the range in the field is much better.', NOW() - INTERVAL '28 days'),

  -- Reply to conference call for speakers
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000012',
   'I would like to propose a talk on "Open Data APIs for OECS Government Services". Abstract to follow.', NOW() - INTERVAL '11 days')

ON CONFLICT DO NOTHING;


-- ============================================================
-- 11. RESOURCES  (8 resources across types & categories)
-- ============================================================

INSERT INTO resources (id, title, description, content, resource_type, category, tags, author_id, is_published, is_climate_action, thumbnail_url, created_at) VALUES
  ('c0000000-0000-0000-0000-000000000001',
   'Getting Started with IoT in Caribbean Agriculture',
   'A beginner''s guide to putting sensors on a farm in the tropics: what to buy, how to set it up and how to use the readings to decide when to irrigate.',
   '## Introduction\n\nFarming in the Eastern Caribbean means dry seasons that keep getting longer, steep plots and the chance of losing a crop to a single storm. Cheap sensors will not fix that, but they can tell a smallholder when a field actually needs water, so nobody is guessing.\n\n## What You Will Need\n\n- **Microcontroller**: ESP32 or Arduino Nano 33 IoT ($10-15)\n- **Sensors**: soil moisture, temperature and humidity, rain gauge ($5-20 each)\n- **Power**: small solar panel and battery pack ($15-25)\n- **Connectivity**: Wi-Fi if the plot is near a house, LoRa for fields further out\n\n## Step 1: Choose Your Sensors\n\nUse capacitive soil-moisture sensors, not resistive ones. Resistive probes corrode within a few months in our humidity, and their readings drift long before that.\n\n## Step 2: Set Up Your Dashboard\n\nThingSpeak and Grafana Cloud both have free tiers that will handle a few stations. Both can send an SMS when a reading crosses a threshold you set.\n\n## Step 3: Deploy and Test\n\nPut out one station and watch it for 2 weeks before you build more. Use an enclosure rated IP65 or better, and mount it high enough that goats cannot get at it.\n\n## Resources\n\n- ESP32 Getting Started Guide\n- ThingSpeak documentation\n- AgriSense SVG open-source firmware (GitHub)',
   'guide', 'agriculture',
   ARRAY['iot','agriculture','sensors','tutorial'],
   'a0000000-0000-0000-0000-000000000005',
   true, true,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/document-images/seed/resources/c0000000-0000-0000-0000-000000000001.webp',
   NOW() - INTERVAL '80 days'),

  ('c0000000-0000-0000-0000-000000000002',
   'OECS Climate Resilience Innovation Report 2025',
   'Our yearly look at 20 climate-tech projects from across the OECS, with case studies, the money they raised and what their teams would do differently.',
   '## Executive Summary\n\nIn 2025 we documented 20 climate projects across OECS member states, from reef monitoring in Grenada to solar micro-grids in Antigua. Most are small and early. A few now run services that ministries depend on.\n\n## Key Findings\n\n- **60%** of projects work on environmental monitoring or early warning\n- **$1.2M** in total funding raised by the featured projects\n- **8 of 11** OECS member states had at least one active climate-tech project\n- Student-led projects rose by **45%** compared with 2024\n\n## Featured Projects\n\n### AgriSense SVG\nSoil sensors on more than 50 farms in the Grenadines, with dry-season crop loss down by about 30%.\n\n### ReefWatch AI\nBleaching detection from drone footage, now used in 3 marine protected areas in Grenada.\n\n### SolarGrid Antigua\nA community micro-grid planned for 100 households in All Saints.\n\n## Recommendations\n\n1. Set aside a fixed share of seed funding for climate projects\n2. Agree data-sharing terms between member states for environmental monitoring\n3. Start a regional network so climate innovators on different islands can find each other',
   'article', 'climate_action',
   ARRAY['climate','report','oecs','innovation'],
   'a0000000-0000-0000-0000-000000000001',
   true, true,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/document-images/seed/resources/c0000000-0000-0000-0000-000000000002.webp',
   NOW() - INTERVAL '60 days'),

  ('c0000000-0000-0000-0000-000000000003',
   'How EduCarib Reached 5,000 Students in 6 Months',
   'How EduCarib grew across Caribbean schools in its first six months, why it was built to work offline and how it won teachers over.',
   '## The Problem\n\nMany schools in the region work from old textbooks, have patchy internet and are short of maths and science teachers. Students sitting CSEC often have nothing to practise with beyond past papers.\n\n## What We Built\n\nEduCarib is an e-learning platform written for Caribbean students and teachers:\n\n- **Lessons mapped to the CSEC and CAPE syllabuses**\n- **Offline first**: lessons download when there is a signal and sync back later\n- **Teacher dashboard** for setting work and seeing who is falling behind\n- **Kwéyòl support** for students in Dominica and Saint Lucia\n\n## How It Grew\n\n1. **Started with 3 schools** in Trinidad and Tobago\n2. **Trained 50 teacher champions** who showed colleagues how to use it\n3. **Signed agreements with ministries of education** so schools could adopt it officially\n4. **Gave students badges** for bringing classmates on board\n\n## Results\n\n- 5,000 active students in 4 countries after 6 months\n- 92% of teachers said they were satisfied\n- Active users scored 15% higher on CSEC mock exams',
   'case_study', 'education',
   ARRAY['edtech','education','growth','offline'],
   'a0000000-0000-0000-0000-000000000006',
   true, false,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/document-images/seed/resources/c0000000-0000-0000-0000-000000000003.webp',
   NOW() - INTERVAL '50 days'),

  ('c0000000-0000-0000-0000-000000000004',
   'Grant Application Template: OECS Innovation Fund',
   'A template with section headings, word limits and notes for applying to the OECS Innovation Seed Fund.',
   '## Project Title\n[Your project name. Keep it plain and easy to remember]\n\n## Executive Summary (250 words max)\n[One paragraph: the problem, how you solve it and the result you expect]\n\n## Problem Statement (500 words max)\n- What specific problem are you addressing?\n- Who is affected and how?\n- What exists today, and where does it fall short?\n\n## Proposed Solution (750 words max)\n- Describe your solution in detail\n- What technology or method will you use?\n- How is it different from what is already available?\n- What existing work does it build on?\n\n## Impact and Outcomes (500 words max)\n- Measurable results, with numbers\n- When you expect to reach them\n- How the work continues after the grant ends\n- Where else in the region it could be used\n\n## Team (300 words max)\n- Key team members and their background\n- Why this team is the right one for the work\n- Advisors or partners, if any\n\n## Budget (table format)\n| Item | Cost (USD) | Justification |\n|------|-----------|---------------|\n| [Item 1] | $X,XXX | [Brief justification] |\n| [Item 2] | $X,XXX | [Brief justification] |\n| **Total** | **$XX,XXX** | |\n\n## Timeline\n| Month | Milestone |\n|-------|----------|\n| 1-2 | [Milestone] |\n| 3-4 | [Milestone] |\n| 5-6 | [Milestone] |\n\n## Tips\n- Put numbers on your impact\n- Show evidence of demand, such as survey results or letters of support\n- Keep the budget realistic and explain every line',
   'template', 'other',
   ARRAY['template','grants','application','funding'],
   'a0000000-0000-0000-0000-000000000001',
   true, false,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/document-images/seed/resources/c0000000-0000-0000-0000-000000000004.webp',
   NOW() - INTERVAL '40 days'),

  ('c0000000-0000-0000-0000-000000000005',
   'Coral Reef Monitoring with Machine Learning',
   'A technical guide to classifying underwater images, building a training set and running ML models for reef monitoring in Caribbean waters.',
   '## Overview\n\nCaribbean reefs are under pressure from warmer water, runoff and overfishing, and there are not enough divers to survey every reef often enough to catch bleaching early. A trained model can work through thousands of frames of drone footage and point rangers to the sites that need a closer look.\n\n## Data Collection\n\n### Underwater Drones\n- Use ROVs rated for 50m or deeper\n- Capture images at fixed intervals along transect lines\n- Keep GPS logs so every frame can be mapped\n\n### Image Requirements\n- Resolution: at least 1080p\n- Lighting: natural light, with an LED array at deeper sites\n- Coverage: overlapping frames so they can be stitched\n\n## Model Architecture\n\nStart with a pre-trained ResNet-50 and fine-tune it on Caribbean reef imagery:\n\n1. **Classification**: healthy, bleached, diseased or dead\n2. **Object detection**: lionfish, and lesions from stony coral tissue loss disease\n3. **Segmentation**: percentage of live coral cover\n\n## Training Tips\n\n- Augment with rotation and colour jitter, because water clarity changes from one day to the next\n- Balance your dataset. Bleached coral is usually underrepresented\n- Check the model against ground truth labelled by marine biologists\n\n## Deployment\n\nExport the model to TensorFlow Lite so it can run on an Nvidia Jetson or a Raspberry Pi 4 on the boat.',
   'guide', 'environment',
   ARRAY['ml','marine','conservation','coral','ai'],
   'a0000000-0000-0000-0000-000000000009',
   true, true,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/document-images/seed/resources/c0000000-0000-0000-0000-000000000005.webp',
   NOW() - INTERVAL '35 days'),

  ('c0000000-0000-0000-0000-000000000006',
   'Digital Government Playbook for Small Island States',
   'A practical guide to putting public services online in OECS states, from architecture and security to getting people to actually use them.',
   '## Why It Matters for Small Islands\n\nIn a small island state, a visit to a government office can mean a ferry ride and a day off work. IT budgets are small, and one hurricane can take out the only server room. Online services, done well, help with both.\n\n## Core Principles\n\n1. **Cloud first**: keep as little as possible on-island\n2. **Mobile first**: well over 80% of internet use in the region is on phones\n3. **Works offline**: a form should survive a dropped connection\n4. **Open standards**: open-source tools stop you being tied to one vendor\n5. **Privacy by design**: be clear about what data you hold and why\n\n## Recommended Architecture\n\n### Citizen Portal\n- One login for every government service\n- Works on small screens and meets WCAG 2.1\n- English and French, with Kwéyòl where it is spoken\n\n### API Layer\n- REST APIs for sharing data between agencies\n- OAuth 2.0 authentication\n- Rate limiting and audit logs\n\n### Data Layer\n- PostgreSQL for structured data\n- Versioned document storage\n- Automatic backups to cloud storage off the island\n\n## Case Study: CaribbeanCloud Gov\n\nThree OECS governments now run services on the CaribbeanCloud toolkit. On average, the time to process a request fell by 60%.',
   'guide', 'technology',
   ARRAY['govtech','digital','government','sids'],
   'a0000000-0000-0000-0000-000000000012',
   true, false,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/document-images/seed/resources/c0000000-0000-0000-0000-000000000006.webp',
   NOW() - INTERVAL '25 days'),

  ('c0000000-0000-0000-0000-000000000007',
   'From Student Project to Startup in Roseau',
   'Camille Fontaine on how a class assignment at Dominica State College became Dominica Heritage Trails, a funded tourism startup.',
   '## It Started as a Class Assignment\n\nIn my final year at Dominica State College, my mobile development class had to build an AR prototype. I picked old Roseau, mostly because I walked through it every day.\n\n## When It Clicked\n\nI took the prototype down to the cruise ship berth and asked visitors to try it. People stood on the Bayfront for ten minutes reading about buildings they would have walked straight past. One woman asked where she could download it.\n\n## Building the MVP\n\nThe first real version took 3 months:\n- Unity and AR Foundation for the AR\n- Oral histories recorded with 5 elders from Roseau and Portsmouth\n- 3D models of 8 historic buildings\n- Testing with 50 visitors and 20 locals\n\n## Finding Support\n\nKTIP made a real difference:\n- **James Pierre** mentored me on the business model\n- **The OECS Innovation Seed Fund** gave us our first grant\n- **People on the forum** helped with technical problems and introductions\n\n## What I Learned\n\n1. Talk to customers before you write code\n2. Build for the people and places here, not for a pitch deck written somewhere else\n3. The people you meet are worth as much as the product\n4. Start small, test quickly and drop what does not work\n\n## What Is Next\n\nWe are adding trails on three more islands, starting with Saint Lucia, and setting up revenue sharing with local tour guides.',
   'success_story', 'technology',
   ARRAY['startup','ar','tourism','student','journey'],
   'a0000000-0000-0000-0000-000000000007',
   true, false,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/document-images/seed/resources/c0000000-0000-0000-0000-000000000007.webp',
   NOW() - INTERVAL '15 days'),

  ('c0000000-0000-0000-0000-000000000008',
   'Water Quality Monitoring: A Practical Guide for Caribbean Communities',
   'How to set up an affordable water-quality monitoring station with open-source hardware and free cloud tools, step by step.',
   '## Why Monitor Water Quality\n\nIn many Caribbean communities, water is tested only now and then because lab tests cost money and samples have to travel. A few cheap sensors in the right places can show what happens between those lab samples, for example after heavy rain on Montserrat or when a spring near Roseau turns cloudy.\n\n## What to Measure\n\n| Parameter | Why It Matters | Sensor Cost |\n|-----------|---------------|-------------|\n| pH | Indicates contamination, affects treatment | $8-15 |\n| Turbidity | Sediment levels, visual water quality | $10-20 |\n| Temperature | Ecosystem health, treatment efficiency | $3-5 |\n| Dissolved Oxygen | Aquatic life viability | $15-30 |\n| Conductivity | Salinity intrusion detection | $10-20 |\n\n## Hardware Setup\n\n1. **Controller**: ESP32 in a waterproof enclosure\n2. **Power**: 6W solar panel and an 18650 battery pack\n3. **Sensors**: analog sensors connected through the ADC\n4. **Housing**: IP67 junction box on a post above the high-water line\n\n## Software\n\n- Arduino firmware to read the sensors and send over Wi-Fi\n- InfluxDB for the time-series data\n- Grafana dashboard with SMS alerts when a reading crosses a threshold\n\n## Deployment Tips\n\n- Calibrate sensors monthly\n- Clean the probes every week, or algae will throw the readings off\n- Put one sensor upstream and one downstream of any suspected pollution source\n- Publish the data so people in the community can check it themselves',
   'guide', 'environment',
   ARRAY['water','monitoring','iot','community','health'],
   'a0000000-0000-0000-0000-000000000012',
   true, true,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/document-images/seed/resources/c0000000-0000-0000-0000-000000000008.webp',
   NOW() - INTERVAL '10 days')

ON CONFLICT (id) DO UPDATE SET
  thumbnail_url = EXCLUDED.thumbnail_url,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  content = EXCLUDED.content;


-- ============================================================
-- 12. CONVERSATIONS & MESSAGES  (2 sample conversations)
-- ============================================================

-- Messages carry fixed ids (ac...NN) so a re-run refreshes them instead of
-- appending another copy. The DELETEs clear copies an older seed left with
-- random ids.

-- Conversation 1: Sandra (investor) and Keisha (entrepreneur)
INSERT INTO conversations (id, created_at, updated_at) VALUES
  ('ab000000-0000-0000-0000-000000000001', NOW() - INTERVAL '88 days', NOW() - INTERVAL '86 days')
ON CONFLICT (id) DO UPDATE SET created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;

INSERT INTO conversation_participants (id, conversation_id, user_id) VALUES
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011'),
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005')
ON CONFLICT DO NOTHING;

DELETE FROM messages
 WHERE conversation_id = 'ab000000-0000-0000-0000-000000000001'
   AND id NOT IN ('ac000000-0000-0000-0000-000000000001',
                  'ac000000-0000-0000-0000-000000000002',
                  'ac000000-0000-0000-0000-000000000003');

INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES
  ('ac000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
   'Hi Keisha, I saw the AgriSense field test results on the forum. Good numbers for a first season. I invest in Caribbean ag-tech and cleantech and would like to hear what you need to grow. Would you be up for a call?',
   NOW() - INTERVAL '88 days'),
  ('ac000000-0000-0000-0000-000000000002', 'ab000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005',
   'Hi Sandra, thanks for getting in touch. Yes, we are raising seed money to go from 5 farms to 50 across Union Island and Canouan. Happy to talk. Which days suit you?',
   NOW() - INTERVAL '87 days'),
  ('ac000000-0000-0000-0000-000000000003', 'ab000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
   'Any weekday afternoon works for me, Eastern Caribbean time, and video is fine. Please send the pitch deck ahead of the call if you have one ready.',
   NOW() - INTERVAL '86 days')
ON CONFLICT (id) DO UPDATE SET
  sender_id = EXCLUDED.sender_id,
  content = EXCLUDED.content;

-- Conversation 2: Shania and Tariq, both students. Peer to peer on purpose:
-- the safeguarding rule forbids a 1:1 thread between a student and a mentor,
-- so this thread used to pair Shania with Dr. Williams and no longer does.
-- The DELETE drops Dr. Williams from databases seeded before the change.
INSERT INTO conversations (id, created_at, updated_at) VALUES
  ('ab000000-0000-0000-0000-000000000002', NOW() - INTERVAL '43 days', NOW() - INTERVAL '41 days')
ON CONFLICT (id) DO UPDATE SET created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;

DELETE FROM conversation_participants
 WHERE conversation_id = 'ab000000-0000-0000-0000-000000000002'
   AND user_id NOT IN ('a0000000-0000-0000-0000-000000000009',
                       'a0000000-0000-0000-0000-000000000008');

INSERT INTO conversation_participants (id, conversation_id, user_id) VALUES
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009'),
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008')
ON CONFLICT DO NOTHING;

DELETE FROM messages
 WHERE conversation_id = 'ab000000-0000-0000-0000-000000000002'
   AND id NOT IN ('ac000000-0000-0000-0000-000000000004',
                  'ac000000-0000-0000-0000-000000000005',
                  'ac000000-0000-0000-0000-000000000006');

INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES
  ('ac000000-0000-0000-0000-000000000004', 'ab000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009',
   'Hey Tariq, Shania here, from ReefWatch. I saw your intro in the welcome thread. I want to put a small buoy at Moliniere that logs water temperature alongside the drone footage, and you know a lot more about microcontrollers than I do. Can I ask you a few things?',
   NOW() - INTERVAL '43 days'),
  ('ac000000-0000-0000-0000-000000000005', 'ab000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008',
   'Sure, ask away. For a buoy I would use an ESP32 with LoRa, because Wi-Fi will not reach from the water. Seal the box properly and drop a sachet of silica gel inside. The humidity kills boards faster than the salt does. I can send you my parts list.',
   NOW() - INTERVAL '42 days'),
  ('ac000000-0000-0000-0000-000000000006', 'ab000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009',
   'The parts list would help a lot, thanks. I will try a LoRa board first. Want to compare notes every couple of weeks? You tell me what breaks on the solar side and I will tell you what breaks underwater.',
   NOW() - INTERVAL '41 days')
ON CONFLICT (id) DO UPDATE SET
  sender_id = EXCLUDED.sender_id,
  content = EXCLUDED.content;

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
   'Software house in Castries that builds online service portals for OECS governments.',
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
   'Fishing cooperative running ice and cold-chain logistics for 40 small boats out of St. George''s.',
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
   'Solar PV installer and maintenance contractor, with 6 MW installed across Antigua and Barbuda.',
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
   'Attested in person by the Invest Dominica liaison. No registry extract yet, so follow up.',
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
ON CONFLICT (id) DO UPDATE SET legal_name = EXCLUDED.legal_name, trading_name = EXCLUDED.trading_name, description = EXCLUDED.description, verification_note = EXCLUDED.verification_note;

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
