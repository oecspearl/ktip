-- ============================================================
-- KTIP / FORGE Extended Demo Seed Data
-- Run AFTER migrations and AFTER seed.sql (in the Supabase SQL
-- editor, which runs as postgres — RLS is bypassed).
--
-- Fills every surface seed.sql left empty: integrations,
-- connections, notifications, achievements/leaderboard,
-- collaboration (docs/whiteboards/snippets/invites), event page
-- sections/criteria/updates/articles, the virtual venue, resumes,
-- and every admin queue (verification, grievances, feedback,
-- moderation, institutions, analytics, UAT).
--
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING throughout.
-- UUID prefixes (new, extending seed.sql's convention):
--   1a integrations   1b venue_rooms       1c event_page_sections
--   1d event_criteria 1e event_updates     1f event_articles
--   2a documents      2b whiteboards       2c snippets
--   2d resumes        3a notifications     3b connections
--   3c email_invites  3d verification_req  3e grievances
--   3f feedback       4a content_reports   4b institutions
--   4c entity_docs    4d moderation_log    5b venue_room_messages
--   d0…07/08 new events
--
-- Notes:
-- * Badges/leaderboard are DERIVED: we seed the underlying activity
--   then call check_achievements_for() per demo user at the end.
-- * Storage paths referenced below (verification docs, entity docs)
--   have no real objects — downloads will 404. URL columns use
--   external URLs, matching seed.sql's convention.
-- * whiteboards.snapshot stays NULL (tldraw snapshots are
--   schema-versioned; NULL renders an empty board safely).
-- ============================================================


-- ============================================================
-- 0. PREFLIGHT — this file depends on seed.sql's demo users,
--    projects, events and grants. Fail fast with a clear message
--    instead of 50 FK errors.
-- ============================================================

DO $$
BEGIN
  -- Self-heal: if seed.sql's auth.users exist but the on-signup
  -- trigger didn't create their profiles, backfill them.
  INSERT INTO profiles (id, display_name)
  SELECT u.id, COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
  FROM auth.users u
  WHERE u.id::text LIKE 'a0000000-%'
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Demo users not found (profiles a0000000-…01 missing).',
      HINT = 'Run supabase/seed.sql first (creates the 12 demo users, projects, events, grants), then re-run this file.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM events WHERE id = 'd0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Base demo events not found (d0000000-…01 missing).',
      HINT = 'Run supabase/seed.sql first, then re-run this file.';
  END IF;
END $$;


-- ============================================================
-- 1. EVENTS — upgrade the existing hackathon with a challenge
--    brief + custom registration form
-- ============================================================

UPDATE events SET
  has_challenge = TRUE,
  submission_deadline = start_date + INTERVAL '2 days',
  registration_fields = '[
    {"id":"team_name","label":"Team name (if you have one)","type":"text","required":false,"placeholder":"e.g. Reef Rangers"},
    {"id":"track","label":"Challenge track","type":"select","required":true,"options":[{"value":"climate","label":"Climate Resilience"},{"value":"agritech","label":"AgriTech"},{"value":"blue_economy","label":"Blue Economy"}]},
    {"id":"experience","label":"Coding experience","type":"select","required":true,"options":[{"value":"beginner","label":"Beginner"},{"value":"intermediate","label":"Intermediate"},{"value":"advanced","label":"Advanced"}]},
    {"id":"dietary","label":"Dietary requirements","type":"textarea","required":false},
    {"id":"tshirt","label":"T-shirt size","type":"select","required":false,"options":[{"value":"s","label":"S"},{"value":"m","label":"M"},{"value":"l","label":"L"},{"value":"xl","label":"XL"}]}
  ]'::jsonb
WHERE id = 'd0000000-0000-0000-0000-000000000001';


-- ============================================================
-- 2. NEW EVENTS — a live virtual hackathon (venue open NOW) and
--    a completed past hackathon
-- ============================================================

INSERT INTO events (id, title, description, event_type, status, location, is_virtual,
                    start_date, end_date, capacity, image_url, is_climate_action,
                    organizer_id, created_at, tags, has_challenge, submission_deadline,
                    has_venue, venue_opens_at, venue_closes_at, spectators_enabled, spectator_scope) VALUES
  ('d0000000-0000-0000-0000-000000000007',
   'OECS Climathon: Virtual Build Weekend',
   'A fully virtual 72-hour build sprint. Teams across all OECS member states prototype climate-resilience tools with mentors on call around the clock. Join the virtual venue to find a team, get help, and demo your build on the Showcase Stage.',
   'hackathon', 'published', NULL, true,
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 days',
   80,
   'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&h=600&fit=crop',
   true,
   'a0000000-0000-0000-0000-000000000001',
   NOW() - INTERVAL '21 days',
   ARRAY['climathon','virtual','climate','hackathon'],
   TRUE, NOW() + INTERVAL '36 hours',
   TRUE, NOW() - INTERVAL '2 days', NOW() + INTERVAL '3 days',
   TRUE, 'members'),

  ('d0000000-0000-0000-0000-000000000008',
   'AgriHack Saint Vincent 2026',
   'Past event — a weekend hackathon focused on agricultural technology for smallholder farmers. 14 teams competed; the winning team built an SMS-based crop price alert service now being piloted with the SVG Ministry of Agriculture.',
   'hackathon', 'completed',
   'SVG Community College, Villa', false,
   NOW() - INTERVAL '60 days', NOW() - INTERVAL '58 days',
   60,
   'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&h=600&fit=crop',
   true,
   'a0000000-0000-0000-0000-000000000005',
   NOW() - INTERVAL '90 days',
   ARRAY['agritech','hackathon','svg'],
   TRUE, NOW() - INTERVAL '58 days',
   FALSE, NULL, NULL, FALSE, 'members')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  venue_opens_at = EXCLUDED.venue_opens_at,
  venue_closes_at = EXCLUDED.venue_closes_at,
  submission_deadline = EXCLUDED.submission_deadline;


-- ============================================================
-- 3. VENUE ROOMS for the live Climathon (mirrors the default set
--    from migration 070 — seed_default_venue_rooms() needs an
--    authenticated host, so we insert directly)
-- ============================================================

INSERT INTO venue_rooms (id, event_id, key, name, kind, description, audio_mode, svg_zone_id, sort_order) VALUES
  ('1b000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007', 'main-hall',  'Main Hall',       'main_hall',  'Opening remarks, announcements and the closing ceremony.', 'moderated',   'zone-main-hall',  10),
  ('1b000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000007', 'networking', 'Networking Area', 'networking', 'Open mics. See everyone here and talk freely.',            'open',        'zone-networking', 20),
  ('1b000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000007', 'workshop',   'Workshop Room',   'workshop',   'Scheduled sessions from mentors and sponsors.',            'moderated',   'zone-workshop',   30),
  ('1b000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000007', 'help-desk',  'Help Desk',       'help_desk',  'Stuck? A mentor is here.',                                 'open',        'zone-help-desk',  40),
  ('1b000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000007', 'showcase',   'Showcase Stage',  'stage',      'Demos and pitches.',                                       'listen_only', 'zone-showcase',   50),
  ('1b000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000007', 'quiet-room', 'Quiet Room',      'breakout',   'Heads-down focus. No audio.',                              'listen_only', 'zone-quiet',      60)
ON CONFLICT (event_id, key) DO NOTHING;

-- Venue roster. A few members have last_seen_at = NOW() so rooms
-- show occupancy on first paint (presence counts <2 min as online).
INSERT INTO event_venue_members (event_id, user_id, role, availability, status_note, current_room_id, skills, looking_for_team, last_seen_at) VALUES
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'organizer',   'working',     'Running the show — ping me anytime', '1b000000-0000-0000-0000-000000000001', ARRAY['facilitation'], FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000003', 'mentor',      'working',     'Marine science & climate data questions welcome', '1b000000-0000-0000-0000-000000000004', ARRAY['data science','climate'], FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000004', 'mentor',      'away',        'Back at 3pm AST', NULL, ARRAY['business models','pitching'], FALSE, NOW() - INTERVAL '45 minutes'),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000011', 'judge',       'busy',        'Reviewing submissions', '1b000000-0000-0000-0000-000000000006', ARRAY['finance'], FALSE, NOW() - INTERVAL '10 minutes'),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000005', 'participant', 'working',     'Building an SMS flood-alert bot', '1b000000-0000-0000-0000-000000000002', ARRAY['iot','javascript'], FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000006', 'participant', 'busy',        'Deep in the backend', '1b000000-0000-0000-0000-000000000006', ARRAY['react','node'], FALSE, NOW() - INTERVAL '20 minutes'),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000008', 'participant', 'help_wanted', 'Debugging the sensor API — anyone know LoRa?', '1b000000-0000-0000-0000-000000000004', ARRAY['python','arduino'], TRUE, NOW() - INTERVAL '1 minute'),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000009', 'participant', 'working',     'Need a frontend dev!', '1b000000-0000-0000-0000-000000000002', ARRAY['ml','python'], TRUE, NOW() - INTERVAL '5 minutes'),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000010', 'participant', 'working',     'Looking for a team — business/pitch side', NULL, ARRAY['business strategy'], TRUE, NOW() - INTERVAL '80 minutes')
ON CONFLICT (event_id, user_id) DO NOTHING;

-- Room chat history. event_id is set by trigger — omit it.
INSERT INTO venue_room_messages (id, room_id, author_id, body, kind, created_at) VALUES
  ('5b000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Welcome to the OECS Climathon Virtual Build Weekend! Kickoff replay is pinned in the Workshop Room. Submissions close in 36 hours.', 'chat', NOW() - INTERVAL '20 hours'),
  ('5b000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Mentors are rotating through the Help Desk all weekend. Come by with anything — code, data, pitch.', 'chat', NOW() - INTERVAL '19 hours'),
  ('5b000000-0000-0000-0000-000000000003', '1b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Reminder: 3-minute demo videos are due with your submission. Keep them scrappy!', 'chat', NOW() - INTERVAL '4 hours'),
  ('5b000000-0000-0000-0000-000000000004', '1b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009', 'Hey all! Shania here from Grenada — building a reef-bleaching early warning dashboard. Need a frontend dev, anyone free?', 'chat', NOW() - INTERVAL '10 hours'),
  ('5b000000-0000-0000-0000-000000000005', '1b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000010', 'Marcus here from Saint Lucia — I can do the pitch deck and business model if you need one more!', 'chat', NOW() - INTERVAL '9 hours'),
  ('5b000000-0000-0000-0000-000000000006', '1b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009', 'Marcus — yes! DM sent.', 'chat', NOW() - INTERVAL '9 hours'),
  ('5b000000-0000-0000-0000-000000000007', '1b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'Anyone tried the CHIRPS rainfall API? Rate limits are brutal today.', 'chat', NOW() - INTERVAL '3 hours'),
  ('5b000000-0000-0000-0000-000000000008', '1b000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000008', 'Stuck on LoRa packet loss between my sensor sim and the gateway. Anyone around?', 'chat', NOW() - INTERVAL '2 hours'),
  ('5b000000-0000-0000-0000-000000000009', '1b000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'Tariq — check your spreading factor first. SF7 drops badly over simulated distance. Happy to hop on a call.', 'chat', NOW() - INTERVAL '110 minutes'),
  ('5b000000-0000-0000-0000-000000000010', '1b000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000008', 'That was it. SF9 is solid now — thanks Dr. Williams!', 'chat', NOW() - INTERVAL '90 minutes'),
  ('5b000000-0000-0000-0000-000000000011', '1b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011', 'Judges are online. Looking forward to the showcase — remember: impact first, tech second.', 'chat', NOW() - INTERVAL '60 minutes'),
  ('5b000000-0000-0000-0000-000000000012', '1b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'Coffee count: 4. Backend status: alive. Morale: high.', 'chat', NOW() - INTERVAL '30 minutes')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 4. CHALLENGE BRIEFS (event_criteria) for both hackathons
-- ============================================================

INSERT INTO event_criteria (id, event_id, kind, title, description, is_required, weight, sort_order) VALUES
  -- OECS Innovation Hackathon (d0…01)
  ('1d000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'objective', 'Build a climate-resilience tool', 'Solutions must address a climate-adaptation challenge facing an OECS member state.', TRUE, NULL, 10),
  ('1d000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'objective', 'Design for low bandwidth', 'Target users are on mobile data in rural areas — the tool must degrade gracefully offline.', TRUE, NULL, 20),
  ('1d000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'objective', 'Show a path to adoption', 'Identify who deploys and maintains this after the weekend.', FALSE, NULL, 30),
  ('1d000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'constraint', 'Teams of 2–5', 'Solo entries are not eligible for prizes.', TRUE, NULL, 40),
  ('1d000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 'constraint', 'Open data only', 'Any datasets used must be publicly available or provided by the organizers.', TRUE, NULL, 50),
  ('1d000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000001', 'deliverable', '3-minute demo video', 'A recorded walkthrough of the working prototype.', TRUE, NULL, 60),
  ('1d000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000001', 'deliverable', 'Public code repository', 'Source code under an OSI-approved licence.', TRUE, NULL, 70),
  ('1d000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000001', 'judging_criterion', 'Impact', 'How significantly does this improve climate resilience for real communities?', TRUE, 30, 80),
  ('1d000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000001', 'judging_criterion', 'Innovation', 'Novelty of the approach relative to existing solutions.', TRUE, 25, 90),
  ('1d000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000001', 'judging_criterion', 'Feasibility', 'Could this realistically be deployed and sustained in the OECS?', TRUE, 25, 100),
  ('1d000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000001', 'judging_criterion', 'Presentation', 'Clarity and persuasiveness of the demo and pitch.', TRUE, 20, 110),
  -- Climathon (d0…07)
  ('1d000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000007', 'objective', 'Prototype a climate-adaptation tool', 'Working software by Sunday — concept decks alone do not qualify.', TRUE, NULL, 10),
  ('1d000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000007', 'objective', 'Use at least one regional dataset', 'CARICOM stats, CHIRPS rainfall, OECS open data, or organizer-provided sets.', TRUE, NULL, 20),
  ('1d000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000007', 'constraint', 'Teams of 2–5', 'Find teammates in the Networking Area.', TRUE, NULL, 30),
  ('1d000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000007', 'deliverable', '3-minute demo video', 'Recorded demo, uploaded with your submission.', TRUE, NULL, 40),
  ('1d000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000007', 'deliverable', 'Public repo', 'Code visible to judges.', TRUE, NULL, 50),
  ('1d000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000007', 'judging_criterion', 'Impact', 'Benefit to vulnerable OECS communities.', TRUE, 35, 60),
  ('1d000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000007', 'judging_criterion', 'Execution', 'How much actually works.', TRUE, 35, 70),
  ('1d000000-0000-0000-0000-000000000019', 'd0000000-0000-0000-0000-000000000007', 'judging_criterion', 'Storytelling', 'Quality of the demo narrative.', TRUE, 30, 80)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 5. EVENT PAGE SECTIONS (hackathon + conference)
-- ============================================================

INSERT INTO event_page_sections (id, event_id, section_type, title, content, sort_order, is_visible) VALUES
  ('1c000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'about', 'About the Hackathon',
   '{"body": "The OECS Innovation Hackathon is the region''s flagship 48-hour build event. Now in its third year, it brings 100 developers, designers and entrepreneurs to Saint Lucia to prototype climate-resilient solutions. Past winners have gone on to raise seed funding and pilot with member-state governments. Meals, mentorship and workspace are provided — bring a laptop and an idea."}'::jsonb, 10, true),
  ('1c000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'faq', 'Frequently Asked Questions',
   '{"items": [
     {"question": "Do I need a team to register?", "answer": "No — solo registrations are welcome. We run a team-forming session right after the opening keynote, and most solo hackers find a team there."},
     {"question": "Is the hackathon free to attend?", "answer": "Yes. Attendance, meals and workspace are fully sponsored. Travel between islands is not covered, but limited travel bursaries are available for students — email the organizers."},
     {"question": "Who owns the intellectual property?", "answer": "Your team keeps everything you build. Sponsors get no licence or claim on your work."},
     {"question": "What should I bring?", "answer": "Laptop, charger, and any hardware you want to hack with. We provide power strips, WiFi, whiteboards and an Arduino/sensor lending library."}
   ]}'::jsonb, 20, true),
  ('1c000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'venue', 'Venue',
   '{"name": "Bay Gardens Hotel — Conference Centre", "address": "Rodney Bay Village, Gros Islet, Saint Lucia", "map_url": "https://maps.google.com/?q=Bay+Gardens+Hotel+Rodney+Bay+Saint+Lucia", "directions": "10 minutes from Rodney Bay Marina; taxis from UVF airport take about 75 minutes. Free parking on site. The hackathon floor is in the Cas-en-Bas wing, upstairs from reception."}'::jsonb, 30, true),
  ('1c000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'sponsors', 'Our Sponsors',
   '{"items": [
     {"name": "OECS Commission", "website": "https://oecs.org"},
     {"name": "Caribbean Development Bank", "website": "https://caribank.org"},
     {"name": "CaribbeanCloud Ltd", "website": "https://caribbeancloud.example"}
   ]}'::jsonb, 40, true),
  ('1c000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000004', 'about', 'About the Conference',
   '{"body": "Two days of keynotes, panels and workshops on digital transformation across the OECS. Tracks cover e-governance, fintech and financial inclusion, data governance, and digital skills. Expect 200+ attendees from government, academia and the private sector."}'::jsonb, 10, true),
  ('1c000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000004', 'faq', 'FAQ',
   '{"items": [
     {"question": "Is there a virtual attendance option?", "answer": "Keynotes and main-stage panels are livestreamed. Workshops are in-person only."},
     {"question": "Are conference sessions recorded?", "answer": "Yes — recordings are published to the KTIP resource library within two weeks."}
   ]}'::jsonb, 20, true),
  ('1c000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000007', 'about', 'How the Virtual Weekend Works',
   '{"body": "Everything happens inside the KTIP virtual venue: team forming in the Networking Area, mentor office hours at the Help Desk, scheduled sessions in the Workshop Room, and final demos on the Showcase Stage. The venue is open around the clock until submissions close."}'::jsonb, 10, true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 6. EVENT UPDATES & ARTICLES
-- ============================================================

INSERT INTO event_updates (id, event_id, author_id, title, content, update_type, is_published, created_at) VALUES
  ('1e000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Registration is live — 100 spots',
   'Registration for the OECS Innovation Hackathon 2026 is now open. Spots are capped at 100 and the last two editions sold out, so register early. Student travel bursaries available — see the FAQ.',
   'announcement', true, NOW() - INTERVAL '18 days'),
  ('1e000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Challenge tracks announced',
   'This year''s tracks: Climate Resilience, AgriTech, and Blue Economy. Each track has a dedicated mentor pool and a $5,000 track prize on top of the grand prize.',
   'announcement', true, NOW() - INTERVAL '10 days'),
  ('1e000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Schedule change: judging moved to 5pm',
   'Final presentations now start at 5pm instead of 3pm on day two, to give teams two extra build hours. Awards ceremony timing is unchanged.',
   'schedule_change', true, NOW() - INTERVAL '3 days'),
  ('1e000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001',
   '36 hours to go — submission checklist',
   'Submissions close in 36 hours. Checklist: working prototype, 3-minute demo video, public repo link. Upload everything through your dashboard before the deadline — no extensions.',
   'reminder', true, NOW() - INTERVAL '4 hours')
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_articles (id, event_id, author_id, title, content, article_type, is_published, image_url, created_at) VALUES
  ('1f000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001',
   'Blue Economy Innovation Summit — Recap',
   'Over two days in Antigua, 120 participants from 9 OECS member states explored how ocean resources can drive sustainable growth.\n\nHighlights:\n\n- Dr. Althea Williams presented three years of reef-monitoring data from Grenada''s marine parks, showing how low-cost sensors change enforcement economics.\n- A fisheries panel with Blue Horizon Fisheries covered cold-chain logistics for small vessels.\n- The closing workshop produced 14 project concepts, 5 of which are now active on this platform.\n\nThank you to every participant, speaker and sponsor. Recordings are linked in the resources article.',
   'recap', true, 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop', NOW() - INTERVAL '35 days'),
  ('1f000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002',
   'Summit Resources: Slides, Recordings & Datasets',
   'All summit materials in one place:\n\n- Keynote and panel recordings (12 sessions)\n- Speaker slide decks (with permission)\n- The Moliniere-Beausejour MPA open reef dataset discussed in the monitoring workshop\n- The Blue Economy opportunity mapping worksheet from the closing session\n\nMaterials are also being added to the KTIP resource library under the "blue economy" tag.',
   'resources', true, NULL, NOW() - INTERVAL '33 days')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 7. RSVPs for the new events (triggers auto-create submission
--    receipts + notifications + event badges)
-- ============================================================

INSERT INTO event_rsvps (id, event_id, user_id, status, created_at) VALUES
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000005', 'confirmed', NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000006', 'confirmed', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000008', 'confirmed', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000009', 'confirmed', NOW() - INTERVAL '11 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000010', 'confirmed', NOW() - INTERVAL '8 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000005', 'checked_in', NOW() - INTERVAL '62 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000008', 'checked_in', NOW() - INTERVAL '61 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000009', 'checked_in', NOW() - INTERVAL '61 days')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 8. INTEGRATIONS (Resources page + admin — zero rows anywhere else)
-- ============================================================

INSERT INTO integrations (id, name, description, category, logo_url, website_url, is_published, sort_order) VALUES
  ('1a000000-0000-0000-0000-000000000001', 'OECS Virtual Campus', 'Single sign-on with the OECS Virtual Campus. Learners bring their course history straight into their KTIP profile and CV.', 'education', NULL, 'https://learning.oecs.int', true, 10),
  ('1a000000-0000-0000-0000-000000000002', 'Caribbean Development Bank Portal', 'Browse CDB funding windows and technical-assistance programmes, and track application cycles relevant to OECS innovators.', 'funding', NULL, 'https://caribank.org', true, 20),
  ('1a000000-0000-0000-0000-000000000003', 'Green Climate Fund — SIDS Window', 'Climate adaptation and mitigation funding for Small Island Developing States, including small grants for community organisations.', 'funding', NULL, 'https://greenclimate.fund', true, 30),
  ('1a000000-0000-0000-0000-000000000004', 'OECS Commission e-Services', 'Official OECS Commission services: regional statistics, policy documents, and programme registration.', 'government', NULL, 'https://oecs.int', true, 40),
  ('1a000000-0000-0000-0000-000000000005', 'CARICOM Statistics Portal', 'Regional open-data portal — population, trade, agriculture and climate statistics used across KTIP project datasets.', 'government', NULL, 'https://statistics.caricom.org', true, 50),
  ('1a000000-0000-0000-0000-000000000006', 'GitHub Education', 'Free developer tooling for verified students and educators — private repos, cloud credits and the Student Developer Pack.', 'developer', NULL, 'https://education.github.com', true, 60),
  ('1a000000-0000-0000-0000-000000000007', 'Notion for Startups', 'Workspace templates for project planning, grant tracking and team documentation. Free plan available for early-stage teams.', 'productivity', NULL, 'https://notion.so/startups', true, 70),
  ('1a000000-0000-0000-0000-000000000008', 'WiPay Caribbean', 'Caribbean payment gateway — accept local debit cards and mobile payments in EC dollars for your product or event.', 'other', NULL, 'https://wipaycaribbean.com', true, 80)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 9. CONNECTIONS (accepted network + actionable pending requests)
-- ============================================================

INSERT INTO connections (id, requester_id, addressee_id, status, created_at, updated_at) VALUES
  -- Accepted core network
  ('3b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'accepted', NOW() - INTERVAL '160 days', NOW() - INTERVAL '159 days'),
  ('3b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'accepted', NOW() - INTERVAL '140 days', NOW() - INTERVAL '139 days'),
  ('3b000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'accepted', NOW() - INTERVAL '130 days', NOW() - INTERVAL '128 days'),
  ('3b000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'accepted', NOW() - INTERVAL '110 days', NOW() - INTERVAL '109 days'),
  ('3b000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'accepted', NOW() - INTERVAL '100 days', NOW() - INTERVAL '99 days'),
  ('3b000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000011', 'accepted', NOW() - INTERVAL '85 days', NOW() - INTERVAL '84 days'),
  ('3b000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006', 'accepted', NOW() - INTERVAL '75 days', NOW() - INTERVAL '74 days'),
  ('3b000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000003', 'accepted', NOW() - INTERVAL '42 days', NOW() - INTERVAL '41 days'),
  ('3b000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000004', 'accepted', NOW() - INTERVAL '48 days', NOW() - INTERVAL '47 days'),
  ('3b000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000004', 'accepted', NOW() - INTERVAL '90 days', NOW() - INTERVAL '89 days'),
  ('3b000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000002', 'accepted', NOW() - INTERVAL '40 days', NOW() - INTERVAL '39 days'),
  ('3b000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000004', 'accepted', NOW() - INTERVAL '65 days', NOW() - INTERVAL '64 days'),
  -- Pending, addressed TO Keisha and Sandra (actionable when logged in as them)
  ('3b000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000005', 'pending', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
  ('3b000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000011', 'pending', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  -- One declined
  ('3b000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000007', 'declined', NOW() - INTERVAL '30 days', NOW() - INTERVAL '29 days')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 10. COLLABORATION — documents, whiteboards, snippets, shares,
--     email invites
-- ============================================================

INSERT INTO documents (id, title, content, owner_id, created_at, updated_at) VALUES
  ('2a000000-0000-0000-0000-000000000001', 'AgriSense Pilot Report — Union Island',
   '<h1>AgriSense Pilot Report — Union Island</h1><p>Three-week field trial with 5 farms on Union Island, testing soil-moisture alerts delivered over SMS.</p><h2>Results</h2><ul><li>87% of irrigation alerts matched agronomist recommendations</li><li>Battery life: 6 weeks per charge (target was 4)</li><li>Zero sensor failures despite two heavy-rain events</li></ul><h2>Next steps</h2><ol><li>Add CHIRPS rainfall data to the prediction model</li><li>Expand to 20 farms across Bequia and Canouan</li><li>Local-language SMS templates</li></ol>',
   'a0000000-0000-0000-0000-000000000005', NOW() - INTERVAL '40 days', NOW() - INTERVAL '12 days'),
  ('2a000000-0000-0000-0000-000000000002', 'Hackathon Judging Notes — Draft',
   '<h1>Judging Notes</h1><p>Working notes for the OECS Innovation Hackathon judging panel.</p><h2>Scoring reminders</h2><ul><li>Impact 30% — favour solutions with a named deploying partner</li><li>Innovation 25%</li><li>Feasibility 25% — can it survive without the founding team?</li><li>Presentation 20%</li></ul><p><em>Do not share scores with teams before the awards ceremony.</em></p>',
   'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '8 days', NOW() - INTERVAL '2 days'),
  ('2a000000-0000-0000-0000-000000000003', 'EduCarib Curriculum Mapping',
   '<h1>EduCarib Curriculum Mapping</h1><p>Mapping platform modules to CSEC and CAPE syllabi.</p><h2>Complete</h2><ul><li>CSEC Mathematics — 100% of core objectives</li><li>CSEC English A — 90%</li></ul><h2>In progress</h2><ul><li>CAPE Computer Science — unit 1 drafted</li><li>CSEC Integrated Science — needs SME review</li></ul>',
   'a0000000-0000-0000-0000-000000000006', NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days'),
  ('2a000000-0000-0000-0000-000000000004', 'ReefWatch Grant Budget Draft',
   '<h1>ReefWatch AI — Budget Draft</h1><p>Draft budget for the Blue Economy Research Fellowship application.</p><table><tbody><tr><th>Item</th><th>USD</th></tr><tr><td>Underwater drone (BlueROV2)</td><td>12,000</td></tr><tr><td>Compute credits (training)</td><td>4,500</td></tr><tr><td>Field trips (12 transects)</td><td>6,000</td></tr><tr><td>Stipend</td><td>7,500</td></tr></tbody></table><p>Total: <strong>$30,000</strong></p>',
   'a0000000-0000-0000-0000-000000000009', NOW() - INTERVAL '20 days', NOW() - INTERVAL '6 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO document_shares (document_id, shared_with, shared_by, permission, status) VALUES
  ('2a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'view', 'accepted'),
  ('2a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000005', 'view', 'accepted'),
  ('2a000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000009', 'edit', 'accepted')
ON CONFLICT DO NOTHING;

-- tldraw snapshots stay NULL — boards open empty but functional.
INSERT INTO whiteboards (id, title, snapshot, owner_id, created_at, updated_at) VALUES
  ('2b000000-0000-0000-0000-000000000001', 'Climathon Ideas Wall', NULL, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '15 days', NOW() - INTERVAL '1 day'),
  ('2b000000-0000-0000-0000-000000000002', 'AgriSense Sensor Network Layout', NULL, 'a0000000-0000-0000-0000-000000000005', NOW() - INTERVAL '35 days', NOW() - INTERVAL '10 days'),
  ('2b000000-0000-0000-0000-000000000003', 'ReefWatch ML Pipeline Sketch', NULL, 'a0000000-0000-0000-0000-000000000009', NOW() - INTERVAL '18 days', NOW() - INTERVAL '4 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO whiteboard_shares (whiteboard_id, shared_with, shared_by, permission, status) VALUES
  ('2b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'edit', 'accepted'),
  ('2b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000005', 'edit', 'accepted'),
  ('2b000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000009', 'view', 'pending')
ON CONFLICT DO NOTHING;

INSERT INTO snippets (id, title, language, content, owner_id, created_at, updated_at) VALUES
  ('2c000000-0000-0000-0000-000000000001', 'Solar Panel Output Estimator', 'python',
   E'"""Estimate daily solar output for a panel array in the Eastern Caribbean."""\n\nPEAK_SUN_HOURS = 5.2  # Antigua annual average\nDERATE = 0.78         # inverter + wiring + soiling losses\n\ndef daily_output_kwh(panel_watts: int, count: int) -> float:\n    return panel_watts * count * PEAK_SUN_HOURS * DERATE / 1000\n\nif __name__ == "__main__":\n    # 24 x 400W panels — typical community microgrid node\n    print(f"{daily_output_kwh(400, 24):.1f} kWh/day")',
   'a0000000-0000-0000-0000-000000000008', NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days'),
  ('2c000000-0000-0000-0000-000000000002', 'SMS Alert Sender (Twilio stub)', 'javascript',
   E'// AgriSense SMS alert stub — swap the console.log for the Twilio call.\nconst THRESHOLD = 22; // % volumetric soil moisture\n\nexport async function checkAndAlert(reading, farmer) {\n  if (reading.moisture >= THRESHOLD) return null;\n  const msg = `AgriSense: soil moisture at ${reading.moisture}% on plot ${reading.plotId}. Irrigation recommended today.`;\n  console.log(`SMS to ${farmer.phone}: ${msg}`);\n  return { to: farmer.phone, body: msg, sentAt: new Date().toISOString() };\n}',
   'a0000000-0000-0000-0000-000000000005', NOW() - INTERVAL '30 days', NOW() - INTERVAL '14 days'),
  ('2c000000-0000-0000-0000-000000000003', 'Partner API — Employer Feed Sample', 'json',
   E'{\n  "data": [\n    {\n      "slug": "castries-tech-limited",\n      "legal_name": "Castries Tech Limited",\n      "trading_name": "CasTech",\n      "industry": "ICT & Digital Services",\n      "country_code": "LC",\n      "verified_at": "2026-05-13T14:02:11Z",\n      "contact_email": "careers@castriestech.example"\n    }\n  ],\n  "meta": { "count": 1, "include_removed": false }\n}',
   'a0000000-0000-0000-0000-000000000012', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO snippet_shares (snippet_id, shared_with, shared_by, permission, status) VALUES
  ('2c000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000008', 'view', 'accepted'),
  ('2c000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000005', 'edit', 'pending')
ON CONFLICT DO NOTHING;

INSERT INTO email_invites (id, email, token, invited_by, resource_type, resource_id, resource_title, permission, status, expires_at, accepted_by, accepted_at) VALUES
  ('3c000000-0000-0000-0000-000000000001', 'newmember@example.com', 'seed-invite-token-0001',
   'a0000000-0000-0000-0000-000000000001', 'platform', NULL, NULL, 'view', 'pending', NOW() + INTERVAL '10 days', NULL, NULL),
  ('3c000000-0000-0000-0000-000000000002', 'agronomist@example.com', 'seed-invite-token-0002',
   'a0000000-0000-0000-0000-000000000005', 'document', '2a000000-0000-0000-0000-000000000001', 'AgriSense Pilot Report — Union Island', 'view', 'pending', NOW() + INTERVAL '12 days', NULL, NULL),
  ('3c000000-0000-0000-0000-000000000003', 'tariq.phillip@demo.forge.oecs', 'seed-invite-token-0003',
   'a0000000-0000-0000-0000-000000000005', 'whiteboard', '2b000000-0000-0000-0000-000000000002', 'AgriSense Sensor Network Layout', 'edit', 'accepted', NOW() + INTERVAL '5 days',
   'a0000000-0000-0000-0000-000000000008', NOW() - INTERVAL '9 days')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 11. PROJECT TEAMS, FOLLOWS & VIEW COUNTS
-- ============================================================

INSERT INTO project_members (project_id, user_id, role, status, invited_by) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'editor', 'accepted', 'a0000000-0000-0000-0000-000000000005'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'viewer', 'accepted', 'a0000000-0000-0000-0000-000000000005'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000007', 'editor', 'accepted', 'a0000000-0000-0000-0000-000000000006'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000010', 'viewer', 'pending',  'a0000000-0000-0000-0000-000000000006'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'editor', 'accepted', 'a0000000-0000-0000-0000-000000000009'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000008', 'viewer', 'accepted', 'a0000000-0000-0000-0000-000000000009'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000012', 'editor', 'accepted', 'a0000000-0000-0000-0000-000000000008'),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002', 'viewer', 'accepted', 'a0000000-0000-0000-0000-000000000012')
ON CONFLICT (project_id, user_id) DO NOTHING;

INSERT INTO project_follows (project_id, user_id) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000010'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000011'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005'),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000003')
ON CONFLICT (project_id, user_id) DO NOTHING;

-- Realistic view counts. These fed the wide_reach badge until 126 cut it;
-- project_views is still derived by achievement_counts(), so the numbers
-- stay here for the project cards and for whatever reads the metric next.
UPDATE projects SET view_count = GREATEST(view_count, v.views)
FROM (VALUES
  ('b0000000-0000-0000-0000-000000000001'::uuid, 412),
  ('b0000000-0000-0000-0000-000000000002'::uuid, 287),
  ('b0000000-0000-0000-0000-000000000003'::uuid, 134),
  ('b0000000-0000-0000-0000-000000000004'::uuid, 351),
  ('b0000000-0000-0000-0000-000000000005'::uuid, 298),
  ('b0000000-0000-0000-0000-000000000006'::uuid, 176),
  ('b0000000-0000-0000-0000-000000000007'::uuid, 88),
  ('b0000000-0000-0000-0000-000000000008'::uuid, 142)
) AS v(id, views)
WHERE projects.id = v.id;


-- ============================================================
-- 12. GRANTS — a draft application (wizard resume) and one
--     approval (fires history trigger + the 'funded' badge)
-- ============================================================

-- current_step + 'draft' status come from migration 045. Guarded so this
-- file still runs on a database where 045 hasn't been applied yet —
-- PL/pgSQL prepares statements lazily, so the unreached branch never
-- touches the missing column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grant_applications'
      AND column_name = 'current_step'
  ) THEN
    INSERT INTO grant_applications (id, grant_id, user_id, application_data, status, current_step, created_at) VALUES
      (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000010',
       '{"project_name": "PeerTutor Caribbean", "summary": "Peer-to-peer CSEC tutoring marketplace for OECS students"}'::jsonb,
       'draft', 2, NOW() - INTERVAL '4 days')
    ON CONFLICT DO NOTHING;
  ELSE
    RAISE NOTICE 'grant_applications.current_step missing — apply migration 045, draft application skipped';
  END IF;
END $$;

-- Approve Keisha's Innovation Seed Fund application (was under_review).
-- Runs BEFORE the achievements loop so the 'funded' badge is awarded.
UPDATE grant_applications
SET status = 'approved'
WHERE user_id = 'a0000000-0000-0000-0000-000000000005'
  AND grant_id = 'f0000000-0000-0000-0000-000000000001'
  AND status = 'under_review';


-- ============================================================
-- 13. INSTITUTIONS, MEMBERS & STUDENT SAFEGUARDING
-- ============================================================

INSERT INTO institutions (id, slug, name, kind, country_code, email_domains, status, contact_email, website_url, verified_by, verified_at, created_by) VALUES
  ('4b000000-0000-0000-0000-000000000001', 'sir-arthur-lewis-community-college', 'Sir Arthur Lewis Community College', 'tvet', 'LC',
   ARRAY['salcc.edu.lc'], 'verified', 'registrar@salcc.edu.lc', 'https://salcc.edu.lc',
   'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '70 days', 'a0000000-0000-0000-0000-000000000001'),
  ('4b000000-0000-0000-0000-000000000002', 'uwi-open-campus-oecs', 'UWI Open Campus — OECS', 'university', 'VC',
   ARRAY['open.uwi.edu','my.uwi.edu'], 'verified', 'oecs@open.uwi.edu', 'https://open.uwi.edu',
   'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '55 days', 'a0000000-0000-0000-0000-000000000001'),
  ('4b000000-0000-0000-0000-000000000003', 'st-marys-academy-grenada', 'St. Mary''s Academy', 'school', 'GD',
   ARRAY['stmarys.edu.gd'], 'pending', 'office@stmarys.edu.gd', NULL,
   NULL, NULL, 'a0000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO institution_members (institution_id, user_id, role, status, approved_by, approved_at) VALUES
  ('4b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'educator', 'approved', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '50 days'),
  ('4b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'student', 'approved', 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '45 days'),
  ('4b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009', 'student', 'approved', 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '44 days'),
  ('4b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'student', 'approved', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '30 days')
ON CONFLICT (institution_id, user_id) DO NOTHING;

INSERT INTO student_safeguarding (user_id, institution_id, verified_domain, sponsor_user_id, birth_year, guardian_consent_at, guardian_consent_ref) VALUES
  ('a0000000-0000-0000-0000-000000000008', '4b000000-0000-0000-0000-000000000002', 'my.uwi.edu', NULL, 2004, NULL, NULL),
  ('a0000000-0000-0000-0000-000000000009', '4b000000-0000-0000-0000-000000000002', 'my.uwi.edu', NULL, 2005, NULL, NULL),
  -- Minor: guardian consent on file, sponsored by Dr. Williams
  ('a0000000-0000-0000-0000-000000000010', '4b000000-0000-0000-0000-000000000001', 'salcc.edu.lc',
   'a0000000-0000-0000-0000-000000000003', 2010, NOW() - INTERVAL '28 days', 'CONSENT-2026-0114')
ON CONFLICT (user_id) DO NOTHING;


-- ============================================================
-- 14. VERIFICATION REQUESTS (admin queue + settings tab)
--     Document paths reference no real storage objects.
-- ============================================================

INSERT INTO verification_requests (id, user_id, status, document_paths, user_note, admin_note, reviewer_id, reviewed_at, created_at) VALUES
  ('3d000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'approved',
   ARRAY['a0000000-0000-0000-0000-000000000003/uwi-staff-id.pdf'],
   'UWI staff ID and faculty page link attached.', 'Confirmed against the UWI St. George''s staff directory.',
   'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '60 days', NOW() - INTERVAL '62 days'),
  ('3d000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'pending',
   ARRAY['a0000000-0000-0000-0000-000000000005/national-id.pdf', 'a0000000-0000-0000-0000-000000000005/business-registration.pdf'],
   'Requesting verified entrepreneur status — AgriTech SVG business registration attached.', NULL, NULL, NULL, NOW() - INTERVAL '5 days'),
  ('3d000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000006', 'pending',
   ARRAY['a0000000-0000-0000-0000-000000000006/company-certificate.pdf'],
   'EduCarib Ltd incorporation certificate attached.', NULL, NULL, NULL, NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 15. GRIEVANCES (triggers create receipts + notifications)
-- ============================================================

INSERT INTO grievances (id, reporter_id, reported_user_id, category, description, context, status, admin_notes, resolved_by, resolved_at, created_at) VALUES
  ('3e000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000012', 'soliciting',
   'This member sent me three unsolicited messages pitching a paid "startup consulting package" after I declined the first time.',
   'Direct messages, last one two days ago.', 'pending', NULL, NULL, NULL, NOW() - INTERVAL '2 days'),
  ('3e000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000004', 'misrepresentation',
   'Profile claimed to be an official OECS Commission reviewer for grant applications, which appears not to be the case.',
   'Seen on their public profile bio last month.', 'resolved',
   'Reviewed with the member — the bio wording was ambiguous, not fraudulent. They have rephrased it. No further action.',
   'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '20 days', NOW() - INTERVAL '25 days')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 16. FEEDBACK (admin queue)
-- ============================================================

INSERT INTO feedback (id, user_id, category, subject, message, status, admin_note, created_at) VALUES
  ('3f000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'bug',
   'Venue chat scroll jumps on mobile',
   'In the virtual venue on Android Chrome, the room chat jumps to the top every time a new message arrives. Makes it hard to follow during busy sessions.',
   'in_review', 'Reproduced on Pixel 7 / Chrome 126. Ticketed.', NOW() - INTERVAL '6 days'),
  ('3f000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'feature_request',
   'Export grant application as PDF',
   'Would love to download my submitted grant applications as a PDF for my own records and for sharing with co-founders.',
   'new', NULL, NOW() - INTERVAL '4 days'),
  ('3f000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000011', 'general',
   'Directory filters are great',
   'The new member directory filters made it much faster to find agritech founders. Small thing: a "clear all filters" button would help.',
   'resolved', 'Passed to design; clear-all shipped in the last release.', NOW() - INTERVAL '15 days'),
  ('3f000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000010', 'content',
   'Outdated deadline on a grant page',
   'The Caribbean Angel Network pitch competition page still shows last cycle''s deadline in the description text.',
   'new', NULL, NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 17. CONTENT REPORTS & MODERATION LOG
--     All non-actioned so no achievement counts are affected.
-- ============================================================

INSERT INTO content_reports (id, reporter_id, target_type, target_id, target_author_id, category, detail, content_snapshot, status, severity, admin_notes, resolved_by, resolved_at, created_at) VALUES
  ('4a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'forum_post',
   'f1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000008', 'spam_scam',
   'Reply chain under this post includes a link that looks like a phishing domain (not the post itself — flagging for review).',
   'Best low-cost microcontroller for outdoor solar monitoring? I am building a solar panel monitoring system...',
   'open', NULL, NULL, NULL, NULL, NOW() - INTERVAL '2 days'),
  ('4a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'project_comment',
   'c1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000011', 'spam_scam',
   'Comment reads like an unsolicited investment solicitation.',
   'I am interested in exploring investment opportunities for this micro-grid project. Let us connect!',
   'reviewing', 'low', 'Looks like a legitimate investor interaction — verifying account history before dismissing.', NULL, NULL, NOW() - INTERVAL '5 days'),
  ('4a000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000006', 'profile',
   'a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000012', 'pii_leak',
   'Bio previously listed a personal phone number.',
   'CTO at CaribbeanCloud Ltd. Advocates for open data and digital government in the OECS. [phone number removed]',
   'dismissed', 'low', 'Number was removed by the member before review. Nothing to action.',
   'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '8 days', NOW() - INTERVAL '10 days')
ON CONFLICT DO NOTHING;

INSERT INTO moderation_log (id, actor_kind, actor_id, user_id, target_type, target_id, severity, action, detail, created_at) VALUES
  ('4d000000-0000-0000-0000-000000000001', 'reporter', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008',
   'forum_post', 'f1000000-0000-0000-0000-000000000005', NULL, 'flagged',
   '{"source": "content_report", "category": "spam_scam"}'::jsonb, NOW() - INTERVAL '2 days'),
  ('4d000000-0000-0000-0000-000000000002', 'reporter', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000011',
   'project_comment', 'c1000000-0000-0000-0000-000000000004', 'low', 'flagged',
   '{"source": "content_report", "category": "spam_scam"}'::jsonb, NOW() - INTERVAL '5 days'),
  ('4d000000-0000-0000-0000-000000000003', 'admin', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000012',
   'profile', 'a0000000-0000-0000-0000-000000000012', 'low', 'restored',
   '{"note": "Report dismissed — PII already removed by the member."}'::jsonb, NOW() - INTERVAL '8 days')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 18. ENTITY DOCUMENTS (attachments on projects/grants)
--     Storage objects don't exist — content_html/markdown are
--     filled so the in-app viewer still renders.
-- ============================================================

INSERT INTO entity_documents (id, entity_type, entity_id, owner_id, title, description, storage_path, file_name, mime_type, file_size, visibility, content_html, markdown, extraction_status) VALUES
  ('4c000000-0000-0000-0000-000000000001', 'project', 'b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000005', 'Union Island Pilot Report', 'Three-week field trial results, 5 farms.',
   'b0000000-0000-0000-0000-000000000001/union-island-pilot-report.pdf', 'union-island-pilot-report.pdf', 'application/pdf', 482133, 'public',
   '<h1>Union Island Pilot Report</h1><p>Field trial of AgriSense soil-moisture sensors with 5 farms over 3 weeks.</p><ul><li>87% alert accuracy vs agronomist recommendations</li><li>6-week battery life</li><li>Farmer satisfaction 4.6/5</li></ul>',
   E'# Union Island Pilot Report\n\nField trial of AgriSense soil-moisture sensors with 5 farms over 3 weeks.\n\n- 87% alert accuracy vs agronomist recommendations\n- 6-week battery life\n- Farmer satisfaction 4.6/5', 'done'),
  ('4c000000-0000-0000-0000-000000000002', 'project', 'b0000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000009', 'ReefWatch Training Data Protocol', 'How transect imagery is collected and labelled.',
   'b0000000-0000-0000-0000-000000000005/training-data-protocol.pdf', 'training-data-protocol.pdf', 'application/pdf', 291002, 'members',
   '<h1>Training Data Protocol</h1><p>Collection and labelling standard for ReefWatch AI transect imagery.</p><ol><li>ROV transects at 3m depth intervals</li><li>Frame extraction at 2s intervals</li><li>Dual-annotator labelling, disagreements resolved by a marine biologist</li></ol>',
   E'# Training Data Protocol\n\nCollection and labelling standard for ReefWatch AI transect imagery.\n\n1. ROV transects at 3m depth intervals\n2. Frame extraction at 2s intervals\n3. Dual-annotator labelling, disagreements resolved by a marine biologist', 'done'),
  ('4c000000-0000-0000-0000-000000000003', 'grant', 'f0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 'Seed Fund Guidelines 2026', 'Official application guidelines and scoring rubric.',
   'f0000000-0000-0000-0000-000000000001/seed-fund-guidelines-2026.pdf', 'seed-fund-guidelines-2026.pdf', 'application/pdf', 655910, 'public',
   '<h1>OECS Innovation Seed Fund — Guidelines 2026</h1><p>Grants of $5,000–$25,000 for early-stage OECS innovators.</p><h2>Scoring</h2><ul><li>Problem significance — 25%</li><li>Solution quality — 25%</li><li>Team — 20%</li><li>Impact potential — 20%</li><li>Budget realism — 10%</li></ul>',
   E'# OECS Innovation Seed Fund — Guidelines 2026\n\nGrants of $5,000–$25,000 for early-stage OECS innovators.\n\n## Scoring\n\n- Problem significance — 25%\n- Solution quality — 25%\n- Team — 20%\n- Impact potential — 20%\n- Budget realism — 10%', 'done')
ON CONFLICT (id) DO NOTHING;

-- One explicit access grant on the members-only document
INSERT INTO document_access (document_id, user_id, role, granted_by) VALUES
  ('4c000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'editor', 'a0000000-0000-0000-0000-000000000009')
ON CONFLICT (document_id, user_id) DO NOTHING;


-- ============================================================
-- 19. RESUMES (Keisha public → /u/:id/cv works signed out;
--     Tariq private)
-- ============================================================

INSERT INTO resumes (id, user_id, template, data, is_public, created_at, updated_at) VALUES
  ('2d000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'viridion',
   '{
     "profile": {
       "name": "Keisha Baptiste",
       "role": "Founder · AgriTech SVG",
       "motto": "Technology that grows with our farmers",
       "location": "Kingstown, Saint Vincent and the Grenadines",
       "email": "keisha.baptiste@demo.forge.oecs",
       "phone": "+1 784 555 0100",
       "socials": [{"label": "GitHub", "href": "https://github.com/keishab"}],
       "about": [
         "Founder of AgriTech SVG, building IoT soil-moisture and weather sensing for smallholder farmers across the Grenadines.",
         "Led the Union Island pilot that cut irrigation-related crop loss by 30% across five farms, and now scaling to 50 sites with OECS Innovation Seed Fund backing."
       ]
     },
     "roles": [
       {
         "org": "AgriTech SVG", "title": "Founder & CEO", "period": "2023 — Present", "location": "Kingstown, SVG",
         "points": [
           "Designed and deployed a LoRa sensor network across 5 pilot farms with 87% irrigation-alert accuracy",
           "Raised seed funding from the OECS Innovation Seed Fund",
           "Built farmer-facing SMS alerting used weekly by every pilot farm"
         ]
       },
       {
         "org": "Freelance", "title": "Full-stack Developer", "period": "2021 — 2023", "location": "Remote",
         "points": [
           "Delivered web dashboards for Caribbean agriculture and tourism clients",
           "Specialised in offline-capable apps for low-connectivity environments"
         ]
       }
     ],
     "education": [{"credential": "BSc Computer Science", "school": "UWI Cave Hill", "year": "2021"}],
     "courses": [],
     "skills": [
       {"area": "IoT Engineering", "abbr": "Io", "skills": ["Arduino", "ESP32", "LoRa", "sensor calibration"]},
       {"area": "Software", "abbr": "Sw", "skills": ["TypeScript", "React", "PostgreSQL", "Python"]},
       {"area": "Product", "abbr": "Pd", "skills": ["UX research", "field trials", "roadmapping"]}
     ],
     "languages": ["English", "Vincentian Creole"],
     "professionalSkills": ["Grant writing", "Public speaking", "Farmer training"],
     "academic": [],
     "interests": "Sailing, community gardens, agri-data openness"
   }'::jsonb,
   TRUE, NOW() - INTERVAL '30 days', NOW() - INTERVAL '7 days'),
  ('2d000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'viridion',
   '{
     "profile": {
       "name": "Tariq Phillip",
       "role": "Computer Science Student · UWI",
       "location": "St. John''s, Antigua and Barbuda",
       "email": "tariq.phillip@demo.forge.oecs",
       "phone": "+1 268 555 0134",
       "socials": [{"label": "GitHub", "href": "https://github.com/tariqp"}],
       "about": ["Final-year CS student focused on renewable energy monitoring. Leading SolarGrid Antigua, a community microgrid project pairing rooftop solar with battery storage."]
     },
     "roles": [
       {
         "org": "SolarGrid Antigua", "title": "Project Lead", "period": "2025 — Present", "location": "Antigua",
         "points": [
           "Designed monitoring firmware for a 24-panel community array",
           "Won 2nd place at AgriHack Saint Vincent 2026 with an SMS crop-price alert prototype"
         ]
       }
     ],
     "education": [{"credential": "BSc Computer Science (in progress)", "school": "UWI Open Campus", "year": "2027"}],
     "courses": [],
     "skills": [
       {"area": "Embedded", "abbr": "Em", "skills": ["Arduino", "ESP32", "C++"]},
       {"area": "Data", "abbr": "Da", "skills": ["Python", "pandas", "Grafana"]}
     ],
     "languages": ["English"],
     "professionalSkills": ["Technical writing"],
     "academic": [{"subject": "Renewable Energy Systems", "skills": "PV sizing, battery chemistry, load modelling"}],
     "interests": "Football, drone photography"
   }'::jsonb,
   FALSE, NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days')
ON CONFLICT (user_id, template) DO NOTHING;


-- ============================================================
-- 20. PREFERENCES & PERSONALIZATION
-- ============================================================

INSERT INTO notification_preferences (user_id, email, messages, events, projects, forums, collaboration, connections, achievements) VALUES
  ('a0000000-0000-0000-0000-000000000001', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
  ('a0000000-0000-0000-0000-000000000005', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
  ('a0000000-0000-0000-0000-000000000009', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
  ('a0000000-0000-0000-0000-000000000011', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
  -- Andre keeps forum noise off — shows a non-default state in settings
  ('a0000000-0000-0000-0000-000000000012', TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, TRUE)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_personalization (user_id, enabled, use_profile_signals, use_behavior_signals, use_badge_signals, climate_focus, topics, categories, content_types) VALUES
  ('a0000000-0000-0000-0000-000000000005', TRUE, TRUE, TRUE, TRUE, TRUE,
   ARRAY['agriculture','iot','funding'], ARRAY['agriculture','environment'], ARRAY['grant:startup','event:workshop','resource:guide']),
  ('a0000000-0000-0000-0000-000000000008', TRUE, TRUE, TRUE, TRUE, TRUE,
   ARRAY['renewable energy','solar'], ARRAY['environment','technology'], ARRAY['event:hackathon','resource:guide']),
  ('a0000000-0000-0000-0000-000000000011', TRUE, TRUE, FALSE, TRUE, FALSE,
   ARRAY['funding','cleantech'], ARRAY['business','agriculture'], ARRAY['grant:startup','event:demo_day'])
ON CONFLICT (user_id) DO NOTHING;


-- ============================================================
-- 21. ACTIVITY DAYS & HIDDEN-BADGE FLAGS
--     (check_achievements_for adds today's row per user)
-- ============================================================

-- Keisha: 12 consecutive days → streak badges
INSERT INTO user_activity_days (user_id, activity_date)
SELECT 'a0000000-0000-0000-0000-000000000005', CURRENT_DATE - n FROM generate_series(1, 12) n
ON CONFLICT DO NOTHING;

-- Marcia: last 4 days + every other day over ~4 months → 30+ total days
INSERT INTO user_activity_days (user_id, activity_date)
SELECT 'a0000000-0000-0000-0000-000000000001', CURRENT_DATE - n FROM generate_series(1, 4) n
ON CONFLICT DO NOTHING;
INSERT INTO user_activity_days (user_id, activity_date)
SELECT 'a0000000-0000-0000-0000-000000000001', CURRENT_DATE - n FROM generate_series(6, 120, 3) n
ON CONFLICT DO NOTHING;

-- Tariq: 7 consecutive days
INSERT INTO user_activity_days (user_id, activity_date)
SELECT 'a0000000-0000-0000-0000-000000000008', CURRENT_DATE - n FROM generate_series(1, 7) n
ON CONFLICT DO NOTHING;

-- Shania: 3 consecutive days
INSERT INTO user_activity_days (user_id, activity_date)
SELECT 'a0000000-0000-0000-0000-000000000009', CURRENT_DATE - n FROM generate_series(1, 3) n
ON CONFLICT DO NOTHING;

-- Everyone else: a scattering of past active days
INSERT INTO user_activity_days (user_id, activity_date)
SELECT u.id, CURRENT_DATE - n
FROM (VALUES
  ('a0000000-0000-0000-0000-000000000002'::uuid), ('a0000000-0000-0000-0000-000000000003'::uuid),
  ('a0000000-0000-0000-0000-000000000004'::uuid), ('a0000000-0000-0000-0000-000000000006'::uuid),
  ('a0000000-0000-0000-0000-000000000007'::uuid), ('a0000000-0000-0000-0000-000000000010'::uuid),
  ('a0000000-0000-0000-0000-000000000011'::uuid), ('a0000000-0000-0000-0000-000000000012'::uuid)
) u(id), generate_series(2, 30, 4) n
ON CONFLICT DO NOTHING;

-- Hidden-badge flags (allowlisted keys only)
INSERT INTO user_flags (user_id, flag_key, flag_value) VALUES
  ('a0000000-0000-0000-0000-000000000005', 'achievements_views', 12),
  ('a0000000-0000-0000-0000-000000000005', 'leaderboard_views', 11),
  ('a0000000-0000-0000-0000-000000000001', 'directory_views', 25),
  ('a0000000-0000-0000-0000-000000000004', 'leaderboard_views', 14)
ON CONFLICT (user_id, flag_key) DO NOTHING;


-- ============================================================
-- 22. AWARD ACHIEVEMENTS
--     Re-derives every badge from the activity seeded above.
--     Populates user_badges → leaderboard, gallery, showcase.
-- ============================================================

DO $$
DECLARE v_user RECORD;
BEGIN
  FOR v_user IN SELECT id FROM profiles WHERE id::text LIKE 'a0000000-%' LOOP
    PERFORM check_achievements_for(v_user.id, FALSE);
  END LOOP;
END $$;

-- Showcase pins (must run after the awarding loop; only pins badges
-- the user actually earned)
INSERT INTO user_showcase (user_id, badge_id, position)
SELECT 'a0000000-0000-0000-0000-000000000005'::uuid, b.id, x.pos
FROM (VALUES ('funded', 1::smallint), ('first_project', 2::smallint), ('streak_7', 3::smallint)) x(slug, pos)
JOIN badges b ON b.slug = x.slug
WHERE EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = 'a0000000-0000-0000-0000-000000000005' AND ub.badge_id = b.id)
ON CONFLICT DO NOTHING;

INSERT INTO user_showcase (user_id, badge_id, position)
SELECT 'a0000000-0000-0000-0000-000000000009'::uuid, b.id, x.pos
FROM (VALUES ('first_project', 1::smallint), ('event_goer', 2::smallint)) x(slug, pos)
JOIN badges b ON b.slug = x.slug
WHERE EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = 'a0000000-0000-0000-0000-000000000009' AND ub.badge_id = b.id)
ON CONFLICT DO NOTHING;

INSERT INTO user_showcase (user_id, badge_id, position)
SELECT 'a0000000-0000-0000-0000-000000000001'::uuid, b.id, x.pos
-- regular_visitor was cut by 126 (total_active_days shadowed streak_days).
-- verified_member replaces it: Marcia is seeded is_verified, so this slot
-- fills deterministically rather than depending on how many days the
-- backfill happened to mark active.
FROM (VALUES ('event_host', 1::smallint), ('well_connected', 2::smallint), ('verified_member', 3::smallint)) x(slug, pos)
JOIN badges b ON b.slug = x.slug
WHERE EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = 'a0000000-0000-0000-0000-000000000001' AND ub.badge_id = b.id)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 23. NOTIFICATIONS (manual, mixed read/unread — receipts and
--     badge notifications were already created by triggers above)
-- ============================================================

INSERT INTO notifications (id, user_id, type, title, body, link, is_read, created_at) VALUES
  -- Keisha (a05)
  ('3a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'connection_request',
   'New connection request', 'Marcus George wants to connect with you.', '/dashboard/connections', FALSE, NOW() - INTERVAL '3 days'),
  ('3a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'submission_receipt',
   'Grant application approved 🎉', 'Your OECS Innovation Seed Fund application has been approved.', '/grants/my-applications', FALSE, NOW() - INTERVAL '1 day'),
  ('3a000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'event_update',
   'Climathon: 36 hours to go', 'Submission checklist posted — prototype, demo video, public repo.', '/events/d0000000-0000-0000-0000-000000000007', FALSE, NOW() - INTERVAL '4 hours'),
  ('3a000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'forum_reply',
   'New reply to your post', 'Dr. Althea Williams replied to "AgriSense SVG — Field test results are in!"', '/forums/showcase/f1000000-0000-0000-0000-000000000002', TRUE, NOW() - INTERVAL '10 days'),
  ('3a000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 'message',
   'New message from Sandra Mitchell', 'Absolutely! How about Thursday at 2pm AST?', '/messages', TRUE, NOW() - INTERVAL '85 days'),
  -- Marcia (a01)
  ('3a000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'event_reminder',
   'Your event starts in 30 days', 'OECS Innovation Hackathon 2026 — 68 of 100 spots filled.', '/events/d0000000-0000-0000-0000-000000000001', FALSE, NOW() - INTERVAL '1 day'),
  ('3a000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'forum_reply',
   'New reply in General', 'Camille Fontaine replied to "Welcome to FORGE — OECS Innovate & Connect!"', '/forums/general/f1000000-0000-0000-0000-000000000001', TRUE, NOW() - INTERVAL '80 days'),
  ('3a000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'connection_accepted',
   'Connection accepted', 'Dr. Althea Williams accepted your connection request.', '/dashboard/connections', TRUE, NOW() - INTERVAL '139 days'),
  -- Shania (a09)
  ('3a000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000009', 'project_follow',
   'New follower on ReefWatch AI', 'Keisha Baptiste is now following your project.', '/projects/b0000000-0000-0000-0000-000000000005', FALSE, NOW() - INTERVAL '2 days'),
  ('3a000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000009', 'event_update',
   'Climathon: 36 hours to go', 'Submission checklist posted.', '/events/d0000000-0000-0000-0000-000000000007', FALSE, NOW() - INTERVAL '4 hours'),
  ('3a000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000009', 'document_share',
   'Document shared with you', 'Dr. Althea Williams can now edit "ReefWatch Training Data Protocol".', '/collaborate/documents', TRUE, NOW() - INTERVAL '6 days'),
  -- Sandra (a11)
  ('3a000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000011', 'connection_request',
   'New connection request', 'Rashid Mohammed wants to connect with you.', '/dashboard/connections', FALSE, NOW() - INTERVAL '2 days'),
  ('3a000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000011', 'message',
   'New message from Keisha Baptiste', 'Hi Sandra! Thank you so much for reaching out...', '/messages', TRUE, NOW() - INTERVAL '87 days'),
  -- Tariq (a08)
  ('3a000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000008', 'whiteboard_share',
   'Whiteboard shared with you', 'Keisha Baptiste shared "AgriSense Sensor Network Layout" with you.', '/collaborate/whiteboards', FALSE, NOW() - INTERVAL '9 days'),
  ('3a000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000008', 'project_invite',
   'Project invitation', 'You''ve been added to AgriSense SVG as an editor.', '/projects/b0000000-0000-0000-0000-000000000001', TRUE, NOW() - INTERVAL '20 days')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 24. ANALYTICS EVENTS (~900 rows over the last 30 days)
--     Idempotency: each batch guards on its own session prefix.
-- ============================================================

-- Page views
INSERT INTO analytics_events (session_id, user_id, event_type, event_name, properties, page_path, created_at)
SELECT
  'seed-pv-' || (1 + floor(random() * 180))::int,
  CASE WHEN random() < 0.55 THEN ('a0000000-0000-0000-0000-0000000000' || lpad((1 + floor(random() * 12))::int::text, 2, '0'))::uuid ELSE NULL END,
  'page_view', 'page_view', '{}'::jsonb,
  (ARRAY['/','/projects','/events','/forums','/grants','/resources','/leaderboard','/hackathons','/directory','/help'])[1 + floor(random() * 10)::int],
  NOW() - (random() * 30 * INTERVAL '1 day')
FROM generate_series(1, 650)
WHERE NOT EXISTS (SELECT 1 FROM analytics_events WHERE session_id LIKE 'seed-pv-%');

-- Feature usage
INSERT INTO analytics_events (session_id, user_id, event_type, event_name, properties, page_path, created_at)
SELECT
  'seed-fu-' || (1 + floor(random() * 90))::int,
  ('a0000000-0000-0000-0000-0000000000' || lpad((1 + floor(random() * 12))::int::text, 2, '0'))::uuid,
  'feature_use',
  f.name, f.props::jsonb, f.path,
  NOW() - (random() * 30 * INTERVAL '1 day')
FROM generate_series(1, 160) g
JOIN (VALUES
    (1, 'whiteboard:create', '{"feature":"whiteboard","action":"create"}', '/collaborate/whiteboards'),
    (2, 'document:create',   '{"feature":"document","action":"create"}',   '/collaborate/documents'),
    (3, 'search:query',      '{"feature":"search","action":"query"}',      '/'),
    (4, 'session:start',     '{"feature":"session","action":"start"}',     '/')
) f(idx, name, props, path) ON f.idx = (g % 4) + 1
WHERE NOT EXISTS (SELECT 1 FROM analytics_events WHERE session_id LIKE 'seed-fu-%');

-- Funnel steps
INSERT INTO analytics_events (session_id, user_id, event_type, event_name, properties, page_path, created_at)
SELECT
  'seed-fs-' || (1 + floor(random() * 60))::int,
  NULL,
  'funnel_step',
  'prereg:step_' || (CASE WHEN g % 6 < 3 THEN 1 WHEN g % 6 < 5 THEN 2 ELSE 3 END) || '_complete',
  jsonb_build_object('funnel', 'prereg', 'step', 'step_' || (CASE WHEN g % 6 < 3 THEN 1 WHEN g % 6 < 5 THEN 2 ELSE 3 END) || '_complete'),
  '/signup',
  NOW() - (random() * 30 * INTERVAL '1 day')
FROM generate_series(1, 90) g
WHERE NOT EXISTS (SELECT 1 FROM analytics_events WHERE session_id LIKE 'seed-fs-%');

-- Conversions
INSERT INTO analytics_events (session_id, user_id, event_type, event_name, properties, page_path, created_at)
SELECT
  'seed-cv-' || (1 + floor(random() * 40))::int,
  CASE WHEN random() < 0.7 THEN ('a0000000-0000-0000-0000-0000000000' || lpad((1 + floor(random() * 12))::int::text, 2, '0'))::uuid ELSE NULL END,
  'conversion',
  (ARRAY['prereg_submitted','rsvp_submitted','application_submitted'])[1 + floor(random() * 3)::int],
  '{}'::jsonb,
  (ARRAY['/signup','/events','/grants'])[1 + floor(random() * 3)::int],
  NOW() - (random() * 30 * INTERVAL '1 day')
FROM generate_series(1, 50)
WHERE NOT EXISTS (SELECT 1 FROM analytics_events WHERE session_id LIKE 'seed-cv-%');


-- ============================================================
-- 25. UAT SURVEY RESPONSES (10, skewed positive, 2 critical)
--     Guard: only when the table is empty.
-- ============================================================

INSERT INTO uat_responses (q1_usefulness, q2_valuable_features, q3_connect_innovators, q4_discover_opportunities,
                           q5_recommend_rating, q6_ease_of_navigation, q7_professional, q8_overall_experience,
                           q9_issues, q9_issues_detail, q10_performance, q11_improvements, q12_comments, created_at)
SELECT * FROM (VALUES
  ('very_useful', ARRAY['projects','grants','forums'], 'yes', 'yes', 5, 'very_easy', 'yes', 'excellent', FALSE, NULL, 'fast',
   'A mobile app would be great.', 'Best regional platform I have used. The grants section alone is worth it.', NOW() - INTERVAL '20 days'),
  ('very_useful', ARRAY['events','collaboration','directory'], 'yes', 'somewhat', 5, 'easy', 'yes', 'excellent', FALSE, NULL, 'fast',
   NULL, 'The virtual venue for hackathons is a standout feature.', NOW() - INTERVAL '18 days'),
  ('very_useful', ARRAY['grants','resources'], 'somewhat', 'yes', 4, 'easy', 'yes', 'good', FALSE, NULL, 'acceptable',
   'More grant deadlines from non-OECS funders.', NULL, NOW() - INTERVAL '16 days'),
  ('somewhat', ARRAY['forums','directory'], 'yes', 'somewhat', 4, 'easy', 'yes', 'good', TRUE,
   'Venue chat lagged badly on mobile during the Climathon kickoff.', 'slow',
   'Fix mobile performance in the venue.', 'Otherwise very solid.', NOW() - INTERVAL '14 days'),
  ('very_useful', ARRAY['projects','events','grants','forums'], 'yes', 'yes', 5, 'very_easy', 'yes', 'excellent', FALSE, NULL, 'fast',
   NULL, 'Signed up three colleagues already.', NOW() - INTERVAL '12 days'),
  ('somewhat', ARRAY['resources'], 'somewhat', 'somewhat', 3, 'neutral', 'somewhat', 'average', TRUE,
   'Got logged out twice while writing a long forum post and lost the draft.', 'acceptable',
   'Autosave drafts in the forum composer.', NULL, NOW() - INTERVAL '10 days'),
  ('very_useful', ARRAY['collaboration','projects'], 'yes', 'yes', 4, 'easy', 'yes', 'good', FALSE, NULL, 'fast',
   'Whiteboard templates would speed things up.', 'Collaboration tools replaced two paid apps for our team.', NOW() - INTERVAL '8 days'),
  ('very_useful', ARRAY['events','grants'], 'yes', 'yes', 5, 'very_easy', 'yes', 'excellent', FALSE, NULL, 'fast',
   NULL, 'The achievements system actually keeps our students engaged.', NOW() - INTERVAL '6 days'),
  ('very_useful', ARRAY['directory','forums','events'], 'yes', 'yes', 4, 'easy', 'yes', 'good', FALSE, NULL, 'acceptable',
   'Calendar sync for events.', NULL, NOW() - INTERVAL '4 days'),
  ('very_useful', ARRAY['projects','grants'], 'yes', 'yes', 5, 'easy', 'yes', 'excellent', FALSE, NULL, 'fast',
   NULL, 'Found my co-founder through the directory. Enough said.', NOW() - INTERVAL '2 days')
) AS v(q1, q2, q3, q4, q5, q6, q7, q8, q9, q9d, q10, q11, q12, ts)
WHERE NOT EXISTS (SELECT 1 FROM uat_responses);


-- ============================================================
-- DONE. Verify with:
--   SELECT * FROM get_leaderboard();
--   SELECT count(*) FROM user_badges;
--   SELECT count(*) FROM analytics_events WHERE session_id LIKE 'seed-%';
-- Then browse: /hackathons, /events/d0…07/venue, /leaderboard,
-- /achievements, /collaborate, /resources?tab=integrations, and
-- every /admin queue.
-- ============================================================
