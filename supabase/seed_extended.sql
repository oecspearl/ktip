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
-- moderation, institutions, analytics).
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
  submission_deadline = NOW() + INTERVAL '4 days',
  registration_fields = '[
    {"id":"team_name","label":"Team name, if you already have one","type":"text","required":false,"placeholder":"e.g. Reef Rangers"},
    {"id":"track","label":"Challenge track","type":"select","required":true,"options":[{"value":"climate","label":"Climate Resilience"},{"value":"agritech","label":"AgriTech"},{"value":"blue_economy","label":"Blue Economy"}]},
    {"id":"experience","label":"Coding experience","type":"select","required":true,"options":[{"value":"beginner","label":"Beginner"},{"value":"intermediate","label":"Intermediate"},{"value":"advanced","label":"Advanced"}]},
    {"id":"dietary","label":"Dietary needs or allergies","type":"textarea","required":false},
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
                    has_venue, venue_opens_at, venue_closes_at, spectators_enabled, spectator_scope,
                    results_published_at) VALUES
  ('d0000000-0000-0000-0000-000000000007',
   'OECS Climathon: Virtual Build Fortnight',
   'Two weeks, fully online, for teams building climate adaptation tools. Entrants from Castries to Basseterre are working on flood alerts, drought planning for banana and nutmeg farms, and cooling-centre maps for heat waves. Mentors keep office hours at the Help Desk most evenings. Find teammates in the Networking Area and demo your build on the Showcase Stage before judging.',
   'hackathon', 'published', NULL, true,
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '12 days',
   80,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000007.webp',
   true,
   'a0000000-0000-0000-0000-000000000001',
   NOW() - INTERVAL '21 days',
   ARRAY['climathon','virtual','climate','hackathon'],
   TRUE, NOW() + INTERVAL '10 days',
   TRUE, NOW() - INTERVAL '2 days', NOW() + INTERVAL '13 days',
   TRUE, 'members',
   NULL),

  ('d0000000-0000-0000-0000-000000000008',
   'AgriHack Saint Vincent 2026',
   'A weekend hackathon at the Villa campus on tools for smallholder farmers. Fourteen teams took part. The winners built an SMS service that texts farmers the week''s prices for dasheen, plantain and arrowroot at the Kingstown market, and the Ministry of Agriculture is now piloting it with 40 growers in Georgetown and Marriaqua.',
   'hackathon', 'completed',
   'SVG Community College, Villa', false,
   NOW() - INTERVAL '60 days', NOW() - INTERVAL '58 days',
   60,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000008.webp',
   true,
   'a0000000-0000-0000-0000-000000000005',
   NOW() - INTERVAL '90 days',
   ARRAY['agritech','hackathon','svg'],
   TRUE, NOW() - INTERVAL '58 days',
   FALSE, NULL, NULL, FALSE, 'members',
   NOW() - INTERVAL '55 days')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  venue_opens_at = EXCLUDED.venue_opens_at,
  venue_closes_at = EXCLUDED.venue_closes_at,
  submission_deadline = EXCLUDED.submission_deadline,
  results_published_at = EXCLUDED.results_published_at;


-- ============================================================
-- 3. VENUE ROOMS for the live Climathon (mirrors the default set
--    from migration 070 — seed_default_venue_rooms() needs an
--    authenticated host, so we insert directly)
-- ============================================================

INSERT INTO venue_rooms (id, event_id, key, name, kind, description, audio_mode, svg_zone_id, sort_order) VALUES
  ('1b000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007', 'main-hall',  'Main Hall',       'main_hall',  'Opening remarks and announcements happen here. So does the closing ceremony.', 'moderated', 'zone-main-hall', 10),
  ('1b000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000007', 'networking', 'Networking Area', 'networking', 'Mics are open. Come here to meet people and find a team.',  'open',        'zone-networking', 20),
  ('1b000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000007', 'workshop',   'Workshop Room',   'workshop',   'Scheduled sessions from mentors and sponsors.',            'moderated',   'zone-workshop',   30),
  ('1b000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000007', 'help-desk',  'Help Desk',       'help_desk',  'Bring a bug or a question. A mentor is on duty.',          'open',        'zone-help-desk',  40),
  ('1b000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000007', 'showcase',   'Showcase Stage',  'stage',      'Demos and pitches.',                                       'listen_only', 'zone-showcase',   50),
  ('1b000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000007', 'quiet-room', 'Quiet Room',      'breakout',   'Heads-down work. Audio is off in here.',                   'listen_only', 'zone-quiet',      60)
ON CONFLICT (event_id, key) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, description = EXCLUDED.description, audio_mode = EXCLUDED.audio_mode, svg_zone_id = EXCLUDED.svg_zone_id, sort_order = EXCLUDED.sort_order;

-- Venue roster. A few members have last_seen_at = NOW() so rooms
-- show occupancy on first paint (presence counts <2 min as online).
INSERT INTO event_venue_members (event_id, user_id, role, availability, status_note, current_room_id, skills, looking_for_team, last_seen_at) VALUES
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'organizer',   'working',     'Hosting. Message me if anything breaks', '1b000000-0000-0000-0000-000000000001', ARRAY['facilitation'], FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000003', 'mentor',      'working',     'Ask me about reef, rainfall or sea-level data', '1b000000-0000-0000-0000-000000000004', ARRAY['data science','climate'], FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000004', 'mentor',      'away',        'Back at 3pm AST', NULL, ARRAY['business models','pitching'], FALSE, NOW() - INTERVAL '45 minutes'),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000011', 'judge',       'busy',        'Reading early demos', '1b000000-0000-0000-0000-000000000006', ARRAY['finance'], FALSE, NOW() - INTERVAL '10 minutes'),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000005', 'participant', 'working',     'SMS flood alerts for the Grenadines', '1b000000-0000-0000-0000-000000000002', ARRAY['iot','javascript'], FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000006', 'participant', 'busy',        'Heads down on the API', '1b000000-0000-0000-0000-000000000006', ARRAY['react','node'], FALSE, NOW() - INTERVAL '20 minutes'),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000008', 'participant', 'help_wanted', 'Sensor sim losing LoRa packets. Anyone know LoRa well?', '1b000000-0000-0000-0000-000000000004', ARRAY['python','arduino'], TRUE, NOW() - INTERVAL '1 minute'),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000009', 'participant', 'working',     'Looking for a frontend dev', '1b000000-0000-0000-0000-000000000002', ARRAY['ml','python'], TRUE, NOW() - INTERVAL '5 minutes')
ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role, availability = EXCLUDED.availability, status_note = EXCLUDED.status_note, current_room_id = EXCLUDED.current_room_id, skills = EXCLUDED.skills, looking_for_team = EXCLUDED.looking_for_team, last_seen_at = EXCLUDED.last_seen_at;

-- Marcus George (a10) is the one unverified demo persona, and 205's trigger
-- refuses venue memberships for unverified users. Older runs of this file
-- seated him; clear that row so a re-run matches a fresh seed.
DELETE FROM event_venue_members
WHERE event_id = 'd0000000-0000-0000-0000-000000000007'
  AND user_id  = 'a0000000-0000-0000-0000-000000000010';

-- Room chat history. event_id is set by trigger — omit it.
INSERT INTO venue_room_messages (id, room_id, author_id, body, kind, created_at) VALUES
  ('5b000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Morning all, and welcome to the Climathon. The kickoff recording is pinned in the Workshop Room if you missed it. The submission deadline is on the event page and it will not move.', 'chat', NOW() - INTERVAL '20 hours'),
  ('5b000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Mentors are taking turns at the Help Desk for the whole fortnight. Bring code problems or data questions and we will work through them with you.', 'chat', NOW() - INTERVAL '19 hours'),
  ('5b000000-0000-0000-0000-000000000003', '1b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Reminder: every submission needs a 3-minute demo video. A phone recording is fine. We care what works, not how polished it looks.', 'chat', NOW() - INTERVAL '4 hours'),
  ('5b000000-0000-0000-0000-000000000004', '1b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009', 'Hi all, Shania from Grenada. Building an early warning dashboard for reef bleaching around Grand Anse and Moliniere. The model works, I need someone on the frontend.', 'chat', NOW() - INTERVAL '10 hours'),
  ('5b000000-0000-0000-0000-000000000005', '1b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'Rashid here. My backend is mostly done, so I can give you a few hours of React in the evenings if that helps.', 'chat', NOW() - INTERVAL '9 hours'),
  ('5b000000-0000-0000-0000-000000000006', '1b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009', 'Rashid yes please, sending you a DM now', 'chat', NOW() - INTERVAL '9 hours'),
  ('5b000000-0000-0000-0000-000000000007', '1b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'Anyone else on the CHIRPS rainfall API today? I keep getting rate limited', 'chat', NOW() - INTERVAL '3 hours'),
  ('5b000000-0000-0000-0000-000000000008', '1b000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000008', 'Losing LoRa packets between my sensor sim and the gateway. Anyone free to take a look?', 'chat', NOW() - INTERVAL '2 hours'),
  ('5b000000-0000-0000-0000-000000000009', '1b000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'Tariq, check your spreading factor first. SF7 drops badly once you simulate any real distance. Happy to jump on a call.', 'chat', NOW() - INTERVAL '110 minutes'),
  ('5b000000-0000-0000-0000-000000000010', '1b000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000008', 'That was it. Moved to SF9 and it''s stable now, thanks Dr. Williams', 'chat', NOW() - INTERVAL '90 minutes'),
  ('5b000000-0000-0000-0000-000000000011', '1b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011', 'Judges are online and looking at early demos. We score impact before the tech, so tell us who your build helps.', 'chat', NOW() - INTERVAL '60 minutes'),
  ('5b000000-0000-0000-0000-000000000012', '1b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'Coffee number 4. Backend still standing.', 'chat', NOW() - INTERVAL '30 minutes')
ON CONFLICT (id) DO UPDATE SET room_id = EXCLUDED.room_id, author_id = EXCLUDED.author_id, body = EXCLUDED.body, kind = EXCLUDED.kind, created_at = EXCLUDED.created_at;


-- ============================================================
-- 4. CHALLENGE BRIEFS (event_criteria) for both hackathons
-- ============================================================

INSERT INTO event_criteria (id, event_id, kind, title, description, is_required, weight, sort_order) VALUES
  -- OECS Innovation Hackathon (d0…01)
  ('1d000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'objective', 'Build a climate adaptation tool', 'Pick a climate problem one OECS member state is dealing with now, such as flash flooding in Roseau or dry-season water rationing in Antigua.', TRUE, NULL, 10),
  ('1d000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'objective', 'Design for low bandwidth', 'Most users will be on prepaid mobile data in rural areas. The tool has to keep working when the signal drops.', TRUE, NULL, 20),
  ('1d000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'objective', 'Show a path to adoption', 'Name the ministry, co-op or company that would run and maintain this after the hackathon.', FALSE, NULL, 30),
  ('1d000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'constraint', 'Teams of 2 to 5', 'Solo entries can take part but cannot win prizes.', TRUE, NULL, 40),
  ('1d000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 'constraint', 'Open data only', 'Every dataset you use must be public or supplied by the organizers.', TRUE, NULL, 50),
  ('1d000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000001', 'deliverable', '3-minute demo video', 'A recorded walkthrough of the working prototype.', TRUE, NULL, 60),
  ('1d000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000001', 'deliverable', 'Public code repository', 'Source code under an OSI-approved licence.', TRUE, NULL, 70),
  ('1d000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000001', 'judging_criterion', 'Impact', 'How much this would help a real community cope with storms, drought or heat.', TRUE, 30, 80),
  ('1d000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000001', 'judging_criterion', 'Innovation', 'What this does that existing tools in the region do not.', TRUE, 25, 90),
  ('1d000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000001', 'judging_criterion', 'Feasibility', 'Whether it could be deployed and paid for in a small island state.', TRUE, 25, 100),
  ('1d000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000001', 'judging_criterion', 'Presentation', 'How clearly the demo and pitch explain the problem and the fix.', TRUE, 20, 110),
  -- Climathon (d0…07)
  ('1d000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000007', 'objective', 'Prototype a climate adaptation tool', 'We need working software by the submission deadline. A slide deck on its own does not count.', TRUE, NULL, 10),
  ('1d000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000007', 'objective', 'Use at least one regional dataset', 'CARICOM statistics, CHIRPS rainfall, OECS open data, or a set the organizers provide.', TRUE, NULL, 20),
  ('1d000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000007', 'constraint', 'Teams of 2 to 5', 'Find teammates in the Networking Area.', TRUE, NULL, 30),
  ('1d000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000007', 'deliverable', '3-minute demo video', 'Recorded demo, uploaded with your submission.', TRUE, NULL, 40),
  ('1d000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000007', 'deliverable', 'Public repo', 'Judges need to be able to read your code.', TRUE, NULL, 50),
  ('1d000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000007', 'judging_criterion', 'Impact', 'Benefit to the OECS communities most exposed to climate risk.', TRUE, 35, 60),
  ('1d000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000007', 'judging_criterion', 'Execution', 'How much of it actually works.', TRUE, 35, 70),
  ('1d000000-0000-0000-0000-000000000019', 'd0000000-0000-0000-0000-000000000007', 'judging_criterion', 'Storytelling', 'How well the demo explains who it is for and why it matters.', TRUE, 30, 80)
ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, kind = EXCLUDED.kind, title = EXCLUDED.title, description = EXCLUDED.description, is_required = EXCLUDED.is_required, weight = EXCLUDED.weight, sort_order = EXCLUDED.sort_order;


-- ============================================================
-- 5. EVENT PAGE SECTIONS (hackathon + conference)
-- ============================================================

INSERT INTO event_page_sections (id, event_id, section_type, title, content, sort_order, is_visible) VALUES
  ('1c000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'about', 'About the Hackathon',
   '{"body": "The OECS Innovation Hackathon is the region''s main build event of the year, and this is its third edition. It brings 100 developers, designers and founders to Rodney Bay to prototype tools for climate resilience. Two past winning teams went on to raise seed money, and one is piloting its flood alert service with the Government of Dominica. Meals, mentors and desk space are covered. Bring a laptop and a problem you care about."}'::jsonb, 10, true),
  ('1c000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'faq', 'Frequently Asked Questions',
   '{"items": [
     {"question": "Do I need a team to register?", "answer": "No, you can sign up on your own. We run team forming straight after the opening keynote and most solo entrants find a team there."},
     {"question": "Is the hackathon free to attend?", "answer": "Yes. Sponsors cover entry, meals and workspace. Flights and ferries between islands are not covered, but we have a small number of travel bursaries for students. Email the organizers to apply."},
     {"question": "Who owns the intellectual property?", "answer": "Your team keeps everything you build. Sponsors get no licence or claim on your work."},
     {"question": "What should I bring?", "answer": "A laptop, your charger, and any hardware you want to work with. We provide power strips, WiFi, whiteboards and a lending shelf of Arduinos and sensors."}
   ]}'::jsonb, 20, true),
  ('1c000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'venue', 'Venue',
   '{"name": "Bay Gardens Hotel Conference Centre", "address": "Rodney Bay Village, Gros Islet, Saint Lucia", "map_url": "https://maps.google.com/?q=Bay+Gardens+Hotel+Rodney+Bay+Saint+Lucia", "directions": "Ten minutes from Rodney Bay Marina. A taxi from Hewanorra (UVF) takes about 75 minutes. Parking on site is free. The hackathon floor is in the Cas-en-Bas wing, one floor up from reception."}'::jsonb, 30, true),
  ('1c000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'sponsors', 'Our Sponsors',
   '{"items": [
     {"name": "OECS Commission", "website": "https://oecs.org"},
     {"name": "Caribbean Development Bank", "website": "https://caribank.org"},
     {"name": "CaribbeanCloud Ltd", "website": "https://caribbeancloud.example"}
   ]}'::jsonb, 40, true),
  ('1c000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000004', 'about', 'About the Conference',
   '{"body": "Two days of talks, panels and workshops on how OECS governments and businesses are moving services online. Sessions cover e-government, mobile payments in EC dollars, data protection law, and digital skills for the public service. We expect over 200 people from ministries, UWI and the private sector."}'::jsonb, 10, true),
  ('1c000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000004', 'faq', 'FAQ',
   '{"items": [
     {"question": "Is there a virtual attendance option?", "answer": "Keynotes and main-stage panels are streamed live. Workshops are in person only."},
     {"question": "Are conference sessions recorded?", "answer": "Yes. Recordings go up in the KTIP resource library within two weeks of the conference."}
   ]}'::jsonb, 20, true),
  ('1c000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000007', 'about', 'How the Build Fortnight Works',
   '{"body": "The whole Climathon runs inside the KTIP virtual venue. Teams form in the Networking Area, mentors hold office hours at the Help Desk, scheduled sessions run in the Workshop Room, and final demos happen on the Showcase Stage. The venue stays open day and night until submissions close."}'::jsonb, 10, true)
ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, section_type = EXCLUDED.section_type, title = EXCLUDED.title, content = EXCLUDED.content, sort_order = EXCLUDED.sort_order, is_visible = EXCLUDED.is_visible;


-- ============================================================
-- 6. EVENT UPDATES & ARTICLES
-- ============================================================

INSERT INTO event_updates (id, event_id, author_id, title, content, update_type, is_published, created_at) VALUES
  ('1e000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Registration is open: 100 places',
   'You can now register for the OECS Innovation Hackathon. We have 100 places and both previous editions filled up, so sign up early if you plan to come. Students can apply for a travel bursary. Details are in the FAQ.',
   'announcement', true, NOW() - INTERVAL '18 days'),
  ('1e000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Challenge tracks announced',
   'This year there are three tracks: Blue Economy, Climate Resilience and AgriTech. Each one has its own mentors and a US$5,000 track prize, separate from the grand prize.',
   'announcement', true, NOW() - INTERVAL '10 days'),
  ('1e000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Schedule change: judging moved to 5pm',
   'On the final day, presentations now start at 5pm instead of 3pm. Teams asked for more build time and we agreed. The awards ceremony stays at its original time.',
   'schedule_change', true, NOW() - INTERVAL '3 days'),
  ('1e000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001',
   'Submission checklist',
   'Before the deadline on the event page, upload three things from your dashboard: a working prototype, a 3-minute demo video, and a link to your public repo. We cannot grant extensions, so leave yourself time for slow uploads.',
   'reminder', true, NOW() - INTERVAL '4 hours')
ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, author_id = EXCLUDED.author_id, title = EXCLUDED.title, content = EXCLUDED.content, update_type = EXCLUDED.update_type, is_published = EXCLUDED.is_published, created_at = EXCLUDED.created_at;

INSERT INTO event_articles (id, event_id, author_id, title, content, article_type, is_published, image_url, created_at) VALUES
  ('1f000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001',
   'Blue Economy Innovation Summit: Recap',
   'Over two days in St. John''s, 120 people from 9 OECS member states talked about how fishing, tourism and marine research can earn more without emptying the sea.\n\nHighlights:\n\n- Dr. Althea Williams showed three years of reef monitoring data from Grenada''s marine parks. Cheap sensors meant wardens could patrol where the damage actually was.\n- Blue Horizon Fisheries led a panel on keeping catch cold on small boats, where ice runs out after a day.\n- The closing workshop produced 14 project ideas. Five are now active projects on KTIP.\n\nThanks to everyone who came, spoke or sponsored. Recordings are linked in the resources article.',
   'recap', true, 'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000006.webp', NOW() - INTERVAL '35 days'),
  ('1f000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002',
   'Summit Resources: Slides, Recordings and Data',
   'Everything from the summit, in one list:\n\n- Recordings of the keynotes and panels (12 sessions)\n- Speaker slides, where the speaker agreed to share them\n- The open reef dataset from the Moliniere-Beausejour marine protected area, used in the monitoring workshop\n- The opportunity mapping worksheet from the closing session\n\nWe are also adding these to the KTIP resource library under the "blue economy" tag.',
   'resources', true, NULL, NOW() - INTERVAL '33 days')
ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, author_id = EXCLUDED.author_id, title = EXCLUDED.title, content = EXCLUDED.content, article_type = EXCLUDED.article_type, is_published = EXCLUDED.is_published, image_url = EXCLUDED.image_url, created_at = EXCLUDED.created_at;


-- ============================================================
-- 7. RSVPs for the new events (triggers auto-create submission
--    receipts + notifications + event badges)
-- ============================================================

INSERT INTO event_rsvps (id, event_id, user_id, status, created_at) VALUES
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000005', 'confirmed', NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000006', 'confirmed', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000008', 'confirmed', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000009', 'confirmed', NOW() - INTERVAL '11 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000005', 'checked_in', NOW() - INTERVAL '62 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000008', 'checked_in', NOW() - INTERVAL '61 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000009', 'checked_in', NOW() - INTERVAL '61 days')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 8. INTEGRATIONS (Resources page + admin — zero rows anywhere else)
-- ============================================================

INSERT INTO integrations (id, name, description, category, logo_url, website_url, is_published, sort_order) VALUES
  ('1a000000-0000-0000-0000-000000000001', 'OECS Virtual Campus', 'Sign in with your OECS Virtual Campus account and your completed courses show up on your KTIP profile and CV.', 'education', NULL, 'https://learning.oecs.int', true, 10),
  ('1a000000-0000-0000-0000-000000000002', 'Caribbean Development Bank Portal', 'See which CDB funding windows and technical assistance programmes are open, and when the next application round starts.', 'funding', NULL, 'https://caribank.org', true, 20),
  ('1a000000-0000-0000-0000-000000000003', 'Green Climate Fund: SIDS Window', 'Funding for climate adaptation and mitigation in Small Island Developing States, including small grants for community groups.', 'funding', NULL, 'https://greenclimate.fund', true, 30),
  ('1a000000-0000-0000-0000-000000000004', 'OECS Commission e-Services', 'The OECS Commission''s own services: regional statistics, policy papers and programme sign-up.', 'government', NULL, 'https://oecs.int', true, 40),
  ('1a000000-0000-0000-0000-000000000005', 'CARICOM Statistics Portal', 'Open regional data on population, trade, agriculture and climate. Many KTIP projects pull their numbers from here.', 'government', NULL, 'https://statistics.caricom.org', true, 50),
  ('1a000000-0000-0000-0000-000000000006', 'GitHub Education', 'Free developer tools for verified students and teachers, including private repos, cloud credits and the Student Developer Pack.', 'developer', NULL, 'https://education.github.com', true, 60),
  ('1a000000-0000-0000-0000-000000000007', 'Notion for Startups', 'Templates for project plans, grant tracking and team notes. Early-stage teams can use the free plan.', 'productivity', NULL, 'https://notion.so/startups', true, 70),
  ('1a000000-0000-0000-0000-000000000008', 'WiPay Caribbean', 'A Caribbean payment gateway. Take local debit cards and mobile payments in EC dollars for your product or event.', 'other', NULL, 'https://wipaycaribbean.com', true, 80)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category, logo_url = EXCLUDED.logo_url, website_url = EXCLUDED.website_url, is_published = EXCLUDED.is_published, sort_order = EXCLUDED.sort_order;


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
ON CONFLICT (id) DO UPDATE SET requester_id = EXCLUDED.requester_id, addressee_id = EXCLUDED.addressee_id, status = EXCLUDED.status, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;


-- ============================================================
-- 10. COLLABORATION — documents, whiteboards, snippets, shares,
--     email invites
-- ============================================================

INSERT INTO documents (id, title, content, owner_id, created_at, updated_at) VALUES
  ('2a000000-0000-0000-0000-000000000001', 'AgriSense Pilot Report: Union Island',
   '<h1>AgriSense Pilot Report: Union Island</h1><p>A three-week trial on 5 farms on Union Island. Each farm got soil moisture sensors and irrigation alerts by SMS.</p><h2>Results</h2><ul><li>87% of irrigation alerts matched what the agronomist would have advised</li><li>Batteries lasted 6 weeks per charge, against a target of 4</li><li>No sensor failed, even through two days of heavy rain</li></ul><h2>Next steps</h2><ol><li>Feed CHIRPS rainfall data into the prediction model</li><li>Grow to 20 farms on Bequia and Canouan</li><li>Write SMS templates in Vincentian Creole as well as English</li></ol>',
   'a0000000-0000-0000-0000-000000000005', NOW() - INTERVAL '40 days', NOW() - INTERVAL '12 days'),
  ('2a000000-0000-0000-0000-000000000002', 'Hackathon Judging Notes (Draft)',
   '<h1>Judging Notes</h1><p>Working notes for the OECS Innovation Hackathon judging panel.</p><h2>Scoring reminders</h2><ul><li>Impact 30%. Give more weight to teams that have a named partner ready to deploy.</li><li>Innovation 25%</li><li>Feasibility 25%. Ask whether it keeps running if the founding team moves on.</li><li>Presentation 20%</li></ul><p><em>Do not share scores with teams before the awards ceremony.</em></p>',
   'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '8 days', NOW() - INTERVAL '2 days'),
  ('2a000000-0000-0000-0000-000000000003', 'EduCarib Curriculum Mapping',
   '<h1>EduCarib Curriculum Mapping</h1><p>Which EduCarib modules cover which parts of the CSEC and CAPE syllabuses.</p><h2>Complete</h2><ul><li>CSEC Mathematics: all core objectives</li><li>CSEC English A: 90%</li></ul><h2>In progress</h2><ul><li>CAPE Computer Science: unit 1 drafted</li><li>CSEC Integrated Science: waiting on a science teacher to review</li></ul>',
   'a0000000-0000-0000-0000-000000000006', NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days'),
  ('2a000000-0000-0000-0000-000000000004', 'ReefWatch Grant Budget Draft',
   '<h1>ReefWatch AI: Budget Draft</h1><p>Draft budget for the Blue Economy Research Fellowship application.</p><table><tbody><tr><th>Item</th><th>USD</th></tr><tr><td>Underwater drone (BlueROV2)</td><td>12,000</td></tr><tr><td>Compute credits (training)</td><td>4,500</td></tr><tr><td>Field trips (12 transects)</td><td>6,000</td></tr><tr><td>Stipend</td><td>7,500</td></tr></tbody></table><p>Total: <strong>$30,000</strong></p>',
   'a0000000-0000-0000-0000-000000000009', NOW() - INTERVAL '20 days', NOW() - INTERVAL '6 days')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, owner_id = EXCLUDED.owner_id, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;

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
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, snapshot = EXCLUDED.snapshot, owner_id = EXCLUDED.owner_id, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;

INSERT INTO whiteboard_shares (whiteboard_id, shared_with, shared_by, permission, status) VALUES
  ('2b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'edit', 'accepted'),
  ('2b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000005', 'edit', 'accepted'),
  ('2b000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000009', 'view', 'pending')
ON CONFLICT DO NOTHING;

INSERT INTO snippets (id, title, language, content, owner_id, created_at, updated_at) VALUES
  ('2c000000-0000-0000-0000-000000000001', 'Solar Panel Output Estimator', 'python',
   E'"""Estimate daily solar output for a panel array in the Eastern Caribbean."""\n\nPEAK_SUN_HOURS = 5.2  # Antigua annual average\nDERATE = 0.78         # inverter + wiring + soiling losses\n\ndef daily_output_kwh(panel_watts: int, count: int) -> float:\n    return panel_watts * count * PEAK_SUN_HOURS * DERATE / 1000\n\nif __name__ == "__main__":\n    # 24 x 400W panels, a typical community microgrid node\n    print(f"{daily_output_kwh(400, 24):.1f} kWh/day")',
   'a0000000-0000-0000-0000-000000000008', NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days'),
  ('2c000000-0000-0000-0000-000000000002', 'SMS Alert Sender (Twilio stub)', 'javascript',
   E'// AgriSense SMS alert stub. Swap the console.log for the Twilio call.\nconst THRESHOLD = 22; // % volumetric soil moisture\n\nexport async function checkAndAlert(reading, farmer) {\n  if (reading.moisture >= THRESHOLD) return null;\n  const msg = `AgriSense: soil moisture at ${reading.moisture}% on plot ${reading.plotId}. Irrigation recommended today.`;\n  console.log(`SMS to ${farmer.phone}: ${msg}`);\n  return { to: farmer.phone, body: msg, sentAt: new Date().toISOString() };\n}',
   'a0000000-0000-0000-0000-000000000005', NOW() - INTERVAL '30 days', NOW() - INTERVAL '14 days'),
  ('2c000000-0000-0000-0000-000000000003', 'Partner API: Employer Feed Sample', 'json',
   E'{\n  "data": [\n    {\n      "slug": "castries-tech-limited",\n      "legal_name": "Castries Tech Limited",\n      "trading_name": "CasTech",\n      "industry": "ICT & Digital Services",\n      "country_code": "LC",\n      "verified_at": "2026-05-13T14:02:11Z",\n      "contact_email": "careers@castriestech.example"\n    }\n  ],\n  "meta": { "count": 1, "include_removed": false }\n}',
   'a0000000-0000-0000-0000-000000000012', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, language = EXCLUDED.language, content = EXCLUDED.content, owner_id = EXCLUDED.owner_id, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;

INSERT INTO snippet_shares (snippet_id, shared_with, shared_by, permission, status) VALUES
  ('2c000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000008', 'view', 'accepted'),
  ('2c000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000005', 'edit', 'pending')
ON CONFLICT DO NOTHING;

INSERT INTO email_invites (id, email, token, invited_by, resource_type, resource_id, resource_title, permission, status, expires_at, accepted_by, accepted_at) VALUES
  ('3c000000-0000-0000-0000-000000000001', 'newmember@example.com', 'seed-invite-token-0001',
   'a0000000-0000-0000-0000-000000000001', 'platform', NULL, NULL, 'view', 'pending', NOW() + INTERVAL '20 days', NULL, NULL),
  ('3c000000-0000-0000-0000-000000000002', 'agronomist@example.com', 'seed-invite-token-0002',
   'a0000000-0000-0000-0000-000000000005', 'document', '2a000000-0000-0000-0000-000000000001', 'AgriSense Pilot Report: Union Island', 'view', 'pending', NOW() + INTERVAL '25 days', NULL, NULL),
  ('3c000000-0000-0000-0000-000000000003', 'tariq.phillip@demo.forge.oecs', 'seed-invite-token-0003',
   'a0000000-0000-0000-0000-000000000005', 'whiteboard', '2b000000-0000-0000-0000-000000000002', 'AgriSense Sensor Network Layout', 'edit', 'accepted', NOW() + INTERVAL '30 days',
   'a0000000-0000-0000-0000-000000000008', NOW() - INTERVAL '9 days')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, token = EXCLUDED.token, invited_by = EXCLUDED.invited_by, resource_type = EXCLUDED.resource_type, resource_id = EXCLUDED.resource_id, resource_title = EXCLUDED.resource_title, permission = EXCLUDED.permission, status = EXCLUDED.status, expires_at = EXCLUDED.expires_at, accepted_by = EXCLUDED.accepted_by, accepted_at = EXCLUDED.accepted_at;


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
ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status, invited_by = EXCLUDED.invited_by;

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
       '{"project_name": "PeerTutor Caribbean", "summary": "Fifth-formers in Castries and Vieux Fort book CSEC maths and English tutoring from sixth-form students, paid per session in EC dollars"}'::jsonb,
       'draft', 2, NOW() - INTERVAL '4 days')
    ON CONFLICT DO NOTHING;
  ELSE
    RAISE NOTICE 'grant_applications.current_step missing: apply migration 045. Draft application skipped.';
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
  ('4b000000-0000-0000-0000-000000000002', 'uwi-open-campus-oecs', 'UWI Open Campus (OECS)', 'university', 'VC',
   ARRAY['open.uwi.edu','my.uwi.edu'], 'verified', 'oecs@open.uwi.edu', 'https://open.uwi.edu',
   'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '55 days', 'a0000000-0000-0000-0000-000000000001'),
  ('4b000000-0000-0000-0000-000000000003', 'st-marys-academy-grenada', 'St. Mary''s Academy', 'school', 'GD',
   ARRAY['stmarys.edu.gd'], 'pending', 'office@stmarys.edu.gd', NULL,
   NULL, NULL, 'a0000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, kind = EXCLUDED.kind, country_code = EXCLUDED.country_code, email_domains = EXCLUDED.email_domains, status = EXCLUDED.status, contact_email = EXCLUDED.contact_email, website_url = EXCLUDED.website_url, verified_by = EXCLUDED.verified_by, verified_at = EXCLUDED.verified_at, created_by = EXCLUDED.created_by;

INSERT INTO institution_members (institution_id, user_id, role, status, approved_by, approved_at) VALUES
  ('4b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'educator', 'approved', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '50 days'),
  ('4b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'student', 'approved', 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '45 days'),
  ('4b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000009', 'student', 'approved', 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '44 days'),
  ('4b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'student', 'approved', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '30 days')
ON CONFLICT (institution_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status, approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at;

INSERT INTO student_safeguarding (user_id, institution_id, verified_domain, sponsor_user_id, birth_year, guardian_consent_at, guardian_consent_ref) VALUES
  ('a0000000-0000-0000-0000-000000000008', '4b000000-0000-0000-0000-000000000002', 'my.uwi.edu', NULL, 2004, NULL, NULL),
  ('a0000000-0000-0000-0000-000000000009', '4b000000-0000-0000-0000-000000000002', 'my.uwi.edu', NULL, 2005, NULL, NULL),
  -- Minor: guardian consent on file, sponsored by Dr. Williams
  ('a0000000-0000-0000-0000-000000000010', '4b000000-0000-0000-0000-000000000001', 'salcc.edu.lc',
   'a0000000-0000-0000-0000-000000000003', 2010, NOW() - INTERVAL '28 days', 'CONSENT-2026-0114')
ON CONFLICT (user_id) DO UPDATE SET institution_id = EXCLUDED.institution_id, verified_domain = EXCLUDED.verified_domain, sponsor_user_id = EXCLUDED.sponsor_user_id, birth_year = EXCLUDED.birth_year, guardian_consent_at = EXCLUDED.guardian_consent_at, guardian_consent_ref = EXCLUDED.guardian_consent_ref;


-- ============================================================
-- 14. VERIFICATION REQUESTS (admin queue + settings tab)
--     Document paths reference no real storage objects.
-- ============================================================

INSERT INTO verification_requests (id, user_id, status, document_paths, user_note, admin_note, reviewer_id, reviewed_at, created_at) VALUES
  ('3d000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'approved',
   ARRAY['a0000000-0000-0000-0000-000000000003/uwi-staff-id.pdf'],
   'Attached my UWI staff ID. My faculty page is linked on my profile.', 'Checked against the UWI staff directory for the Grenada site. Matches.',
   'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '60 days', NOW() - INTERVAL '62 days'),
  ('3d000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'pending',
   ARRAY['a0000000-0000-0000-0000-000000000005/national-id.pdf', 'a0000000-0000-0000-0000-000000000005/business-registration.pdf'],
   'Applying for verified entrepreneur status. National ID and the AgriTech SVG business registration from the Kingstown registry are attached.', NULL, NULL, NULL, NOW() - INTERVAL '5 days'),
  ('3d000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000006', 'pending',
   ARRAY['a0000000-0000-0000-0000-000000000006/company-certificate.pdf'],
   'Certificate of incorporation for EduCarib Ltd is attached.', NULL, NULL, NULL, NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 15. GRIEVANCES (triggers create receipts + notifications)
-- ============================================================

INSERT INTO grievances (id, reporter_id, reported_user_id, category, description, context, status, admin_notes, resolved_by, resolved_at, created_at) VALUES
  ('3e000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000012', 'soliciting',
   'I said no to a paid "startup consulting package" and this member messaged me three more times trying to sell it.',
   'Direct messages. The last one came in the same day I filed this.', 'pending', NULL, NULL, NULL, NOW() - INTERVAL '2 days'),
  ('3e000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000004', 'misrepresentation',
   'Their profile says they are an official OECS Commission reviewer for grant applications. As far as I can tell that is not true.',
   'It was in the bio on their public profile.', 'resolved',
   'Spoke with the member. The bio was badly worded, not dishonest: he reviews applications as a volunteer mentor. He has changed it. No further action.',
   'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '20 days', NOW() - INTERVAL '25 days')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 16. FEEDBACK (admin queue)
-- ============================================================

INSERT INTO feedback (id, user_id, category, subject, message, status, admin_note, created_at) VALUES
  ('3f000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'bug',
   'Venue chat scroll jumps on mobile',
   'On Android Chrome the room chat in the virtual venue jumps back to the top whenever a new message comes in. During a busy session I lose my place every few seconds.',
   'in_review', 'Reproduced on a Pixel 7 with Chrome 126. Ticket logged.', NOW() - INTERVAL '6 days'),
  ('3f000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'feature_request',
   'Export grant application as PDF',
   'Could I download a submitted grant application as a PDF? I want a copy for my records and one to send my co-founder.',
   'new', NULL, NOW() - INTERVAL '4 days'),
  ('3f000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000011', 'general',
   'Directory filters help a lot',
   'With the new directory filters I found the agritech founders in Saint Vincent and Dominica in about a minute. One request: a button to clear all filters at once.',
   'resolved', 'Sent to design. A clear-all button went out in the last release.', NOW() - INTERVAL '15 days'),
  ('3f000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000010', 'content',
   'Old deadline on a grant page',
   'The description on the Caribbean Angel Network Pitch Competition page still gives the deadline from the last round.',
   'new', NULL, NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, category = EXCLUDED.category, subject = EXCLUDED.subject, message = EXCLUDED.message, status = EXCLUDED.status, admin_note = EXCLUDED.admin_note, created_at = EXCLUDED.created_at;


-- ============================================================
-- 17. CONTENT REPORTS & MODERATION LOG
--     All non-actioned so no achievement counts are affected.
-- ============================================================

INSERT INTO content_reports (id, reporter_id, target_type, target_id, target_author_id, category, detail, content_snapshot, status, severity, admin_notes, resolved_by, resolved_at, created_at) VALUES
  ('4a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'forum_post',
   'f1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000008', 'spam_scam',
   'One of the replies under this post links to what looks like a phishing site. The post itself is fine, it is the reply I am worried about.',
   'Best low-cost microcontroller for outdoor solar monitoring? I am building a solar panel monitoring system...',
   'open', NULL, NULL, NULL, NULL, NOW() - INTERVAL '2 days'),
  ('4a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'project_comment',
   'c1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000011', 'spam_scam',
   'This comment looks like someone fishing for investment deals nobody asked for.',
   'I am interested in exploring investment opportunities for this micro-grid project. Let us connect!',
   'reviewing', 'low', 'Probably a genuine investor. Checking the account history before closing this.', NULL, NULL, NOW() - INTERVAL '5 days'),
  ('4a000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000006', 'profile',
   'a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000012', 'pii_leak',
   'The bio had a personal mobile number in it.',
   'CTO at CaribbeanCloud Ltd. Advocates for open data and digital government in the OECS. [phone number removed]',
   'dismissed', 'low', 'The member took the number down before we got to it. Nothing to do.',
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
   '{"note": "Report dismissed. The member had already removed the phone number."}'::jsonb, NOW() - INTERVAL '8 days')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 18. ENTITY DOCUMENTS (attachments on projects/grants)
--     Storage objects don't exist — content_html/markdown are
--     filled so the in-app viewer still renders.
-- ============================================================

INSERT INTO entity_documents (id, entity_type, entity_id, owner_id, title, description, storage_path, file_name, mime_type, file_size, visibility, content_html, markdown, extraction_status) VALUES
  ('4c000000-0000-0000-0000-000000000001', 'project', 'b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000005', 'Union Island Pilot Report', 'Results from the three-week trial on 5 farms.',
   'b0000000-0000-0000-0000-000000000001/union-island-pilot-report.pdf', 'union-island-pilot-report.pdf', 'application/pdf', 482133, 'public',
   '<h1>Union Island Pilot Report</h1><p>We ran AgriSense soil moisture sensors on 5 farms for 3 weeks.</p><ul><li>87% of alerts matched the agronomist''s advice</li><li>Batteries lasted 6 weeks</li><li>Farmers rated it 4.6 out of 5</li></ul>',
   E'# Union Island Pilot Report\n\nWe ran AgriSense soil moisture sensors on 5 farms for 3 weeks.\n\n- 87% of alerts matched the agronomist''s advice\n- Batteries lasted 6 weeks\n- Farmers rated it 4.6 out of 5', 'done'),
  ('4c000000-0000-0000-0000-000000000002', 'project', 'b0000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000009', 'ReefWatch Training Data Protocol', 'How we film reef transects and label the frames.',
   'b0000000-0000-0000-0000-000000000005/training-data-protocol.pdf', 'training-data-protocol.pdf', 'application/pdf', 291002, 'members',
   '<h1>Training Data Protocol</h1><p>How ReefWatch AI collects and labels transect footage.</p><ol><li>The ROV films each transect at 3m depth steps</li><li>We pull one frame every 2 seconds</li><li>Two people label every frame. A marine biologist settles any disagreement.</li></ol>',
   E'# Training Data Protocol\n\nHow ReefWatch AI collects and labels transect footage.\n\n1. The ROV films each transect at 3m depth steps\n2. We pull one frame every 2 seconds\n3. Two people label every frame. A marine biologist settles any disagreement.', 'done'),
  ('4c000000-0000-0000-0000-000000000003', 'grant', 'f0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 'Seed Fund Guidelines 2026', 'How to apply, and how applications are scored.',
   'f0000000-0000-0000-0000-000000000001/seed-fund-guidelines-2026.pdf', 'seed-fund-guidelines-2026.pdf', 'application/pdf', 655910, 'public',
   '<h1>OECS Innovation Seed Fund: 2026 Guidelines</h1><p>Grants of US$5,000 to US$25,000 for early-stage innovators based in an OECS member state.</p><h2>Scoring</h2><ul><li>How serious the problem is: 25%</li><li>Quality of the solution: 25%</li><li>Team: 20%</li><li>Likely impact: 20%</li><li>Whether the budget is realistic: 10%</li></ul>',
   E'# OECS Innovation Seed Fund: 2026 Guidelines\n\nGrants of US$5,000 to US$25,000 for early-stage innovators based in an OECS member state.\n\n## Scoring\n\n- How serious the problem is: 25%\n- Quality of the solution: 25%\n- Team: 20%\n- Likely impact: 20%\n- Whether the budget is realistic: 10%', 'done')
ON CONFLICT (id) DO UPDATE SET entity_type = EXCLUDED.entity_type, entity_id = EXCLUDED.entity_id, owner_id = EXCLUDED.owner_id, title = EXCLUDED.title, description = EXCLUDED.description, storage_path = EXCLUDED.storage_path, file_name = EXCLUDED.file_name, mime_type = EXCLUDED.mime_type, file_size = EXCLUDED.file_size, visibility = EXCLUDED.visibility, content_html = EXCLUDED.content_html, markdown = EXCLUDED.markdown, extraction_status = EXCLUDED.extraction_status;

-- One explicit access grant on the members-only document
INSERT INTO document_access (document_id, user_id, role, granted_by) VALUES
  ('4c000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'editor', 'a0000000-0000-0000-0000-000000000009')
ON CONFLICT (document_id, user_id) DO UPDATE SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by;


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
       "motto": "Sensors and SMS for farmers in the Grenadines",
       "location": "Kingstown, Saint Vincent and the Grenadines",
       "email": "keisha.baptiste@demo.forge.oecs",
       "phone": "+1 784 555 0100",
       "socials": [{"label": "GitHub", "href": "https://github.com/keishab"}],
       "about": [
         "I run AgriTech SVG. We put soil moisture and weather sensors on smallholder farms in the Grenadines and send farmers irrigation alerts by SMS.",
         "On Union Island our pilot cut crop loss from poor irrigation by 30% across five farms. With OECS Innovation Seed Fund money we are now growing to 50 sites."
       ]
     },
     "roles": [
       {
         "org": "AgriTech SVG", "title": "Founder and CEO", "period": "2023 to present", "location": "Kingstown, SVG",
         "points": [
           "Designed and installed a LoRa sensor network on 5 pilot farms, with 87% of irrigation alerts matching agronomist advice",
           "Won seed funding from the OECS Innovation Seed Fund",
           "Built the SMS alert service that every pilot farm uses each week"
         ]
       },
       {
         "org": "Freelance", "title": "Full-stack Developer", "period": "2021 to 2023", "location": "Remote",
         "points": [
           "Built web dashboards for agriculture and tourism clients in the Eastern Caribbean",
           "Focused on apps that keep working offline, for places with weak signal"
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
     "interests": "Sailing, community gardens, open farm data"
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
       "about": ["Final-year computer science student working on solar monitoring. I lead SolarGrid Antigua, a community microgrid that pairs rooftop solar with battery storage."]
     },
     "roles": [
       {
         "org": "SolarGrid Antigua", "title": "Project Lead", "period": "2025 to present", "location": "Antigua",
         "points": [
           "Wrote the monitoring firmware for a 24-panel community array",
           "Placed 2nd at AgriHack Saint Vincent 2026 with a solar-powered soil sensor for hillside dasheen plots"
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
ON CONFLICT (user_id, template) DO UPDATE SET data = EXCLUDED.data, is_public = EXCLUDED.is_public, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;


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
ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, messages = EXCLUDED.messages, events = EXCLUDED.events, projects = EXCLUDED.projects, forums = EXCLUDED.forums, collaboration = EXCLUDED.collaboration, connections = EXCLUDED.connections, achievements = EXCLUDED.achievements;

INSERT INTO user_personalization (user_id, enabled, use_profile_signals, use_behavior_signals, use_badge_signals, climate_focus, topics, categories, content_types) VALUES
  ('a0000000-0000-0000-0000-000000000005', TRUE, TRUE, TRUE, TRUE, TRUE,
   ARRAY['agriculture','iot','funding'], ARRAY['agriculture','environment'], ARRAY['grant:startup','event:workshop','resource:guide']),
  ('a0000000-0000-0000-0000-000000000008', TRUE, TRUE, TRUE, TRUE, TRUE,
   ARRAY['renewable energy','solar'], ARRAY['environment','technology'], ARRAY['event:hackathon','resource:guide']),
  ('a0000000-0000-0000-0000-000000000011', TRUE, TRUE, FALSE, TRUE, FALSE,
   ARRAY['funding','cleantech'], ARRAY['business','agriculture'], ARRAY['grant:startup','event:demo_day'])
ON CONFLICT (user_id) DO UPDATE SET enabled = EXCLUDED.enabled, use_profile_signals = EXCLUDED.use_profile_signals, use_behavior_signals = EXCLUDED.use_behavior_signals, use_badge_signals = EXCLUDED.use_badge_signals, climate_focus = EXCLUDED.climate_focus, topics = EXCLUDED.topics, categories = EXCLUDED.categories, content_types = EXCLUDED.content_types;


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
ON CONFLICT (user_id, flag_key) DO UPDATE SET flag_value = EXCLUDED.flag_value;


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
   'New connection request', 'Marcus George sent you a connection request.', '/dashboard/connections', FALSE, NOW() - INTERVAL '3 days'),
  ('3a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'submission_receipt',
   'Grant application approved', 'Your application to the OECS Innovation Seed Fund was approved. Next steps are on your applications page.', '/grants/my-applications', FALSE, NOW() - INTERVAL '1 day'),
  ('3a000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'event_update',
   'Climathon: submission checklist', 'Upload a working prototype, a 3-minute demo video and your public repo link before the deadline.', '/events/d0000000-0000-0000-0000-000000000007', FALSE, NOW() - INTERVAL '4 hours'),
  ('3a000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'forum_reply',
   'New reply to your post', 'Dr. Althea Williams replied to your post on the Union Island field test.', '/forums/showcase/f1000000-0000-0000-0000-000000000002', TRUE, NOW() - INTERVAL '10 days'),
  ('3a000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 'message',
   'New message from Sandra Mitchell', 'Thursday at 2pm AST works for me. Send the pitch deck when you can.', '/messages', TRUE, NOW() - INTERVAL '85 days'),
  -- Marcia (a01)
  ('3a000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'event_reminder',
   'Registration update', 'OECS Innovation Hackathon: 68 of 100 places are taken.', '/events/d0000000-0000-0000-0000-000000000001', FALSE, NOW() - INTERVAL '1 day'),
  ('3a000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'forum_reply',
   'New reply in General', 'Camille Fontaine replied to your welcome thread.', '/forums/general/f1000000-0000-0000-0000-000000000001', TRUE, NOW() - INTERVAL '80 days'),
  ('3a000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'connection_accepted',
   'Connection accepted', 'Dr. Althea Williams accepted your connection request.', '/dashboard/connections', TRUE, NOW() - INTERVAL '139 days'),
  -- Shania (a09)
  ('3a000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000009', 'project_follow',
   'New follower on ReefWatch AI', 'Keisha Baptiste is now following your project.', '/projects/b0000000-0000-0000-0000-000000000005', FALSE, NOW() - INTERVAL '2 days'),
  ('3a000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000009', 'event_update',
   'Climathon: submission checklist', 'Prototype, demo video and repo link are all due by the deadline.', '/events/d0000000-0000-0000-0000-000000000007', FALSE, NOW() - INTERVAL '4 hours'),
  ('3a000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000009', 'document_share',
   'Edit access granted', 'Dr. Althea Williams can now edit "ReefWatch Training Data Protocol".', '/collaborate/documents', TRUE, NOW() - INTERVAL '6 days'),
  -- Sandra (a11)
  ('3a000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000011', 'connection_request',
   'New connection request', 'Rashid Mohammed sent you a connection request.', '/dashboard/connections', FALSE, NOW() - INTERVAL '2 days'),
  ('3a000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000011', 'message',
   'New message from Keisha Baptiste', 'Hi Sandra, thanks for getting in touch. Yes, we are raising seed money to go from 5 farms to 50...', '/messages', TRUE, NOW() - INTERVAL '87 days'),
  -- Tariq (a08)
  ('3a000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000008', 'whiteboard_share',
   'Whiteboard shared with you', 'Keisha Baptiste shared "AgriSense Sensor Network Layout" with you.', '/collaborate/whiteboards', FALSE, NOW() - INTERVAL '9 days'),
  ('3a000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000008', 'project_invite',
   'Project invitation', 'Keisha Baptiste added you to AgriSense SVG as an editor.', '/projects/b0000000-0000-0000-0000-000000000001', TRUE, NOW() - INTERVAL '20 days')
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, type = EXCLUDED.type, title = EXCLUDED.title, body = EXCLUDED.body, link = EXCLUDED.link, is_read = EXCLUDED.is_read, created_at = EXCLUDED.created_at;


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
-- DONE. Verify with:
--   SELECT * FROM get_leaderboard();
--   SELECT count(*) FROM user_badges;
--   SELECT count(*) FROM analytics_events WHERE session_id LIKE 'seed-%';
-- Then browse: /hackathons, /events/d0…07/venue, /leaderboard,
-- /achievements, /collaborate, /resources?tab=integrations, and
-- every /admin queue.
-- ============================================================
