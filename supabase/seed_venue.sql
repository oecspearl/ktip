-- ============================================================
-- KTIP / FORGE — Virtual Venue Demo Seed (a three-floor hackathon)
-- Run AFTER migrations, seed.sql, seed_extended.sql and
-- seed_events.sql (in the Supabase SQL editor, which runs as
-- postgres — RLS is bypassed).
--
-- seed_extended.sql gives the Climathon (d0…07) the six default
-- rooms from migration 070, but nothing that landed after it:
--
--   * no `venue_map` and no `cells`, so every room sits in the
--     "Not on the map" list and the drawn floorplan (089) is empty;
--   * one floor, no stairs, no doors (089/107);
--   * no `sections`, so every room renders its kind's default
--     panels and the panel picker (091) has nothing to show;
--   * no room-scoped roles (109), no schedule rows pointing at a
--     room (108), no closed rooms, no role-gated rooms, no
--     sponsor booths with a sponsor on them, no saved template
--     (107).
--
-- This file adds one more live hackathon (d0…21) whose venue is a
-- three-floor building that exercises all of that:
--
--   Ground floor   registration, main hall, networking, showcase
--                  stage, help desk, three sponsor booths
--   Build floor    workshop, mentor lounge, quiet room, resource
--                  library, hardware bench, six team pods
--   Judges' floor  judging room, deliberation room (closed),
--                  green room, final-pitch stage (closed until the
--                  finals), organizer HQ
--
-- plus a roster with every venue role, a speaker who is a speaker
-- in one room only, chat, a room-linked schedule, a challenge
-- brief, page sections, RSVPs and a saved venue template.
--
-- Idempotent: fixed UUIDs + ON CONFLICT throughout. Re-running it
-- rewrites geometry and roster state, which is what you want after
-- editing the layout below.
--
-- UUID prefixes used here (none are used by the other seed files):
--   d0…21  the event          7b…  venue_rooms      7e…  venue_room_roles
--   7a…    event_criteria     8b…  venue_room_messages
--   7c…    event_page_sections 9b… event_schedule   7d…  venue_templates
--
-- Grid notes (28 × 18, the editor default):
--   * cells are inclusive rects via venue_rect_cells(x0, y0, x1, y1);
--   * the stairs block {0,0,2,2} is shared by all floors, so no room
--     on any floor covers (0..1, 0..1);
--   * each floor's door is on the south edge at columns 13–14 (row
--     17), so nothing is placed on row 17.
-- ============================================================


-- ============================================================
-- 0. PREFLIGHT
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Demo users not found (profile a0000000-…01 missing).',
      HINT = 'Run supabase/seed.sql first, then re-run this file.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'venue_map'
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'events.venue_map is missing.',
      HINT = 'Apply migration 089_venue_map.sql (and everything after it) first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_schedule' AND column_name = 'room_id'
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'event_schedule.room_id is missing.',
      HINT = 'Apply migration 108_schedule_rooms.sql first.';
  END IF;

  IF to_regclass('public.venue_room_roles') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'venue_room_roles table is missing.',
      HINT = 'Apply migration 109_venue_room_roles.sql first.';
  END IF;

  IF to_regclass('public.venue_templates') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'venue_templates table is missing.',
      HINT = 'Apply migration 107_venue_templates.sql first.';
  END IF;
END $$;


-- ============================================================
-- 1. THE EVENT — a live, fully virtual, three-floor hackathon
-- ============================================================

INSERT INTO events (id, title, summary, description, event_type, status, location, is_virtual,
                    start_date, end_date, capacity, image_url, is_climate_action,
                    organizer_id, created_at, tags, has_challenge, submission_deadline,
                    has_venue, venue_opens_at, venue_closes_at, spectators_enabled, spectator_scope,
                    venue_map) VALUES
  ('d0000000-0000-0000-0000-000000000021',
   'OECS Blue Economy Hackathon: Virtual Build Week',
   'Five days, three floors, one ocean. Build tools for fisheries, reefs and coastal resilience inside the KTIP virtual venue.',
   'A fully virtual five-day build sprint on the blue economy. Teams from every OECS member state prototype tools for small-scale fisheries, reef monitoring, marine spatial planning and coastal resilience. The venue is a three-floor building: register and mingle on the ground floor, build in a team pod on the build floor, and pitch to the judges upstairs. Mentors rotate through the Help Desk around the clock; sponsors are on the ground floor all week.',
   'hackathon', 'published', NULL, true,
   NOW() - INTERVAL '2 days', NOW() + INTERVAL '3 days',
   120,
   'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop',
   true,
   'a0000000-0000-0000-0000-000000000002',
   NOW() - INTERVAL '30 days',
   ARRAY['blue-economy','virtual','hackathon','fisheries','coastal'],
   TRUE, NOW() + INTERVAL '60 hours',
   TRUE, NOW() - INTERVAL '3 days', NOW() + INTERVAL '4 days',
   TRUE, 'members',
   '{
     "v": 1, "cols": 28, "rows": 18,
     "floors": [
       {"key": "ground", "name": "Ground floor",  "door": {"side": "s", "at": 13}},
       {"key": "build",  "name": "Build floor",   "door": {"side": "s", "at": 13}},
       {"key": "judges", "name": "Judges'' floor", "door": {"side": "s", "at": 13}}
     ],
     "stairs": {"x": 0, "y": 0, "w": 2, "h": 2}
   }'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  tags = EXCLUDED.tags,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  submission_deadline = EXCLUDED.submission_deadline,
  has_venue = EXCLUDED.has_venue,
  venue_opens_at = EXCLUDED.venue_opens_at,
  venue_closes_at = EXCLUDED.venue_closes_at,
  spectators_enabled = EXCLUDED.spectators_enabled,
  venue_map = EXCLUDED.venue_map;


-- ============================================================
-- 2. ROOMS — three floors, drawn on the grid
--
-- `sections` uses the stored shape from migration 091,
-- [{id}, …]; parseSections() treats a missing `enabled` as true.
-- Rooms with sections = '[]' fall back to their kind's defaults,
-- which is deliberate for the plain rooms — it shows both paths.
-- ============================================================

INSERT INTO venue_rooms (
  id, event_id, key, name, kind, description, audio_mode, capacity, max_publishers,
  recording_enabled, is_open, sort_order, floor, cells, color, wall_height,
  allowed_roles, sections, sponsor_name, sponsor_url, sponsor_logo_url
) VALUES
  -- ---------------------------------------------------------- ground floor
  ('7b000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000021',
   'registration', 'Registration Desk', 'help_desk',
   'Check in, read the rules, and find your way around the building.',
   'open', 10, 12, FALSE, TRUE, 10, 0, venue_rect_cells(11, 14, 15, 16), '#7E9EC7', 0.88,
   '{}',
   '[{"id":"check_in"},{"id":"host_controls"},{"id":"rules"},{"id":"chat"},{"id":"onboarding"},{"id":"wayfinding"},{"id":"announcements"},{"id":"occupants"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000021',
   'main-hall', 'Main Hall', 'main_hall',
   'Opening keynote, daily stand-ups, announcements and the closing ceremony.',
   'moderated', NULL, 12, FALSE, TRUE, 20, 0, venue_rect_cells(2, 2, 9, 7), '#2A5788', 1.75,
   '{}', '[]'::jsonb, NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000021',
   'networking', 'Networking Lounge', 'networking',
   'Open mics. Find a team, find a skill, or just say hello.',
   'open', 40, 12, FALSE, TRUE, 30, 0, venue_rect_cells(12, 2, 19, 7), '#7AB000', 1.25,
   '{}',
   '[{"id":"av_placeholder"},{"id":"chat"},{"id":"looking_for_team"},{"id":"skill_finder"},{"id":"occupants"},{"id":"venue_headcount"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000021',
   'showcase', 'Showcase Stage', 'stage',
   'Sponsor showcases, mid-week demos and the community vote.',
   'listen_only', NULL, 6, FALSE, TRUE, 40, 0, venue_rect_cells(21, 2, 26, 8), '#041E42', 2.0,
   '{}',
   '[{"id":"sponsor_hero"},{"id":"host_controls"},{"id":"av_placeholder"},{"id":"reactions"},{"id":"showcase_gallery"},{"id":"chat"},{"id":"occupants"},{"id":"hand_queue"},{"id":"countdown"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000021',
   'help-desk', 'Help Desk', 'help_desk',
   'Stuck? A mentor is on duty here around the clock.',
   'open', 12, 12, FALSE, TRUE, 50, 0, venue_rect_cells(2, 10, 6, 13), '#7E9EC7', 1.13,
   '{}',
   '[{"id":"av_placeholder"},{"id":"chat"},{"id":"mentors_on_duty"},{"id":"help_nudge"},{"id":"occupants"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000021',
   'booth-cdb', 'CDB Booth', 'sponsor_booth',
   'Talk to the Caribbean Development Bank about blue-economy financing and the post-hackathon accelerator.',
   'open', 25, 12, FALSE, TRUE, 60, 0, venue_rect_cells(9, 10, 13, 13), '#B38500', 1.38,
   '{}',
   '[{"id":"sponsor_hero"},{"id":"av_placeholder"},{"id":"resources"},{"id":"chat"},{"id":"sponsor_links","config":{"links":[{"label":"Blue Economy Financing","url":"https://www.caribank.org"},{"label":"Accelerator brief (PDF)","url":"https://example.com/cdb-accelerator.pdf"}]}},{"id":"occupants"}]'::jsonb,
   'Caribbean Development Bank', 'https://www.caribank.org', NULL),

  ('7b000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000021',
   'booth-flow', 'Flow Booth', 'sponsor_booth',
   'Connectivity credits, IoT SIMs and the Flow API for teams building field tools.',
   'open', 25, 12, FALSE, TRUE, 70, 0, venue_rect_cells(15, 10, 19, 13), '#B38500', 1.38,
   '{}',
   '[{"id":"sponsor_hero"},{"id":"av_placeholder"},{"id":"chat"},{"id":"sponsor_links","config":{"links":[{"label":"Developer portal","url":"https://example.com/flow-dev"}]}},{"id":"occupants"}]'::jsonb,
   'Flow Caribbean', 'https://discoverflow.co', NULL),

  ('7b000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000021',
   'booth-oecs', 'OECS Commission Booth', 'sponsor_booth',
   'Open data sets from the Ocean Governance unit and someone to explain them.',
   'open', 25, 12, FALSE, TRUE, 80, 0, venue_rect_cells(21, 10, 25, 13), '#B38500', 1.38,
   '{}',
   '[{"id":"sponsor_hero"},{"id":"av_placeholder"},{"id":"resources"},{"id":"faq"},{"id":"chat"},{"id":"occupants"}]'::jsonb,
   'OECS Commission', 'https://www.oecs.org', NULL),

  -- ---------------------------------------------------------- build floor
  ('7b000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000021',
   'workshop', 'Workshop Room', 'workshop',
   'Scheduled sessions from mentors and sponsors. Hands up to ask.',
   'moderated', 60, 12, FALSE, TRUE, 100, 1, venue_rect_cells(2, 2, 7, 6), '#E6AC09', 1.38,
   '{}', '[]'::jsonb, NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000021',
   'mentor-lounge', 'Mentor Lounge', 'help_desk',
   'Mentors, judges and organizers only. Compare notes between shifts.',
   'open', 20, 12, FALSE, TRUE, 110, 1, venue_rect_cells(9, 2, 13, 5), '#7E9EC7', 1.25,
   ARRAY['mentor','judge','organizer'],
   '[{"id":"av_placeholder"},{"id":"chat"},{"id":"mentors_on_duty"},{"id":"occupants"},{"id":"activity_log"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000021',
   'quiet-room', 'Quiet Room', 'breakout',
   'Heads-down focus. No audio, no chat.',
   'listen_only', NULL, 1, FALSE, TRUE, 120, 1, venue_rect_cells(15, 2, 20, 5), '#78716c', 1.0,
   '{}',
   '[{"id":"focus_timer"},{"id":"occupants"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000021',
   'library', 'Resource Library', 'breakout',
   'Data sets, API keys, the brief and the FAQ. Read-only by design.',
   'listen_only', NULL, 1, FALSE, TRUE, 130, 1, venue_rect_cells(22, 2, 26, 6), '#78716c', 1.0,
   '{}',
   '[{"id":"resources"},{"id":"faq"},{"id":"rules"},{"id":"occupants"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000021',
   'pod-1', 'Pod 1 · Reef Watch', 'breakout',
   'Team pod. Reef-bleaching early warning from citizen dive logs.',
   'open', 8, 8, FALSE, TRUE, 140, 1, venue_rect_cells(2, 8, 5, 10), '#AEE12B', 1.0,
   '{}',
   '[{"id":"host_controls"},{"id":"av_placeholder"},{"id":"objectives"},{"id":"chat"},{"id":"occupants"},{"id":"countdown"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000021',
   'pod-2', 'Pod 2 · CatchLog', 'breakout',
   'Team pod. Offline-first catch logging for small-scale fishers.',
   'open', 8, 8, FALSE, TRUE, 150, 1, venue_rect_cells(7, 8, 10, 10), '#AEE12B', 1.0,
   '{}',
   '[{"id":"host_controls"},{"id":"av_placeholder"},{"id":"objectives"},{"id":"chat"},{"id":"occupants"},{"id":"countdown"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000021',
   'pod-3', 'Pod 3 · Sargassum Radar', 'breakout',
   'Team pod. Satellite-driven sargassum landfall alerts for beach operators.',
   'open', 8, 8, FALSE, TRUE, 160, 1, venue_rect_cells(12, 8, 15, 10), '#AEE12B', 1.0,
   '{}',
   '[{"id":"host_controls"},{"id":"av_placeholder"},{"id":"objectives"},{"id":"chat"},{"id":"occupants"},{"id":"countdown"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000021',
   'pod-4', 'Pod 4', 'breakout',
   'Team pod. Unclaimed — grab it in the Networking Lounge.',
   'open', 8, 8, FALSE, TRUE, 170, 1, venue_rect_cells(2, 12, 5, 14), '#AEE12B', 1.0,
   '{}',
   '[{"id":"host_controls"},{"id":"av_placeholder"},{"id":"objectives"},{"id":"chat"},{"id":"occupants"},{"id":"countdown"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000021',
   'pod-5', 'Pod 5', 'breakout',
   'Team pod. Unclaimed — grab it in the Networking Lounge.',
   'open', 8, 8, FALSE, TRUE, 180, 1, venue_rect_cells(7, 12, 10, 14), '#AEE12B', 1.0,
   '{}',
   '[{"id":"host_controls"},{"id":"av_placeholder"},{"id":"objectives"},{"id":"chat"},{"id":"occupants"},{"id":"countdown"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000021',
   'pod-6', 'Pod 6', 'breakout',
   'Team pod. Unclaimed — grab it in the Networking Lounge.',
   'open', 8, 8, FALSE, TRUE, 190, 1, venue_rect_cells(12, 12, 15, 14), '#AEE12B', 1.0,
   '{}',
   '[{"id":"host_controls"},{"id":"av_placeholder"},{"id":"objectives"},{"id":"chat"},{"id":"occupants"},{"id":"countdown"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000019', 'd0000000-0000-0000-0000-000000000021',
   'hardware-bench', 'Hardware Bench', 'breakout',
   'Sensors, LoRa, buoys. Show your wiring on camera and get it debugged.',
   'open', 12, 12, FALSE, TRUE, 200, 1, venue_rect_cells(18, 9, 24, 13), '#E6AC09', 1.13,
   '{}',
   '[{"id":"av_placeholder"},{"id":"resources"},{"id":"chat"},{"id":"help_nudge"},{"id":"occupants"}]'::jsonb,
   NULL, NULL, NULL),

  -- ---------------------------------------------------------- judges' floor
  ('7b000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000021',
   'judging', 'Judging Room', 'judging',
   'Teams present to the panel here. Judges and organizers only.',
   'moderated', 15, 12, FALSE, TRUE, 300, 2, venue_rect_cells(2, 2, 6, 5), '#041E42', 1.5,
   ARRAY['judge','organizer'],
   '[{"id":"challenge_brief"},{"id":"av_placeholder"},{"id":"chat"},{"id":"judges_present"},{"id":"occupants"},{"id":"countdown"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000021', 'd0000000-0000-0000-0000-000000000021',
   'deliberation', 'Deliberation Room', 'judging',
   'Closed until scoring. Judges confer here after the final pitches.',
   'moderated', 10, 12, FALSE, FALSE, 310, 2, venue_rect_cells(2, 8, 8, 12), '#041E42', 1.5,
   ARRAY['judge','organizer'],
   '[{"id":"challenge_brief"},{"id":"av_placeholder"},{"id":"chat"},{"id":"judges_present"},{"id":"occupants"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000022', 'd0000000-0000-0000-0000-000000000021',
   'green-room', 'Green Room', 'breakout',
   'Speakers and finalists prepare here before going on stage.',
   'open', 10, 12, FALSE, TRUE, 320, 2, venue_rect_cells(8, 2, 11, 5), '#7AB000', 1.25,
   ARRAY['speaker','mentor','judge','organizer'],
   '[{"id":"host_controls"},{"id":"av_placeholder"},{"id":"chat"},{"id":"occupants"},{"id":"countdown"},{"id":"activity_log"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000023', 'd0000000-0000-0000-0000-000000000021',
   'finals', 'Final Pitches', 'stage',
   'Opens on the last day. Six finalists, five minutes each, live scoring.',
   'listen_only', NULL, 6, TRUE, FALSE, 330, 2, venue_rect_cells(13, 2, 21, 7), '#2A5788', 1.75,
   '{}',
   '[{"id":"host_controls"},{"id":"av_placeholder"},{"id":"reactions"},{"id":"showcase_gallery"},{"id":"chat"},{"id":"hand_queue"},{"id":"countdown"},{"id":"occupants"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000024', 'd0000000-0000-0000-0000-000000000021',
   'organizer-hq', 'Organizer HQ', 'breakout',
   'Ops room. Announcements go out from here.',
   'open', 8, 12, FALSE, TRUE, 340, 2, venue_rect_cells(23, 2, 26, 5), '#B38500', 1.13,
   ARRAY['organizer'],
   '[{"id":"host_controls"},{"id":"av_placeholder"},{"id":"chat"},{"id":"announcement_feed"},{"id":"activity_log"},{"id":"venue_headcount"},{"id":"occupants"}]'::jsonb,
   NULL, NULL, NULL)
ON CONFLICT (event_id, key) DO UPDATE SET
  name              = EXCLUDED.name,
  kind              = EXCLUDED.kind,
  description       = EXCLUDED.description,
  audio_mode        = EXCLUDED.audio_mode,
  capacity          = EXCLUDED.capacity,
  max_publishers    = EXCLUDED.max_publishers,
  recording_enabled = EXCLUDED.recording_enabled,
  is_open           = EXCLUDED.is_open,
  sort_order        = EXCLUDED.sort_order,
  floor             = EXCLUDED.floor,
  cells             = EXCLUDED.cells,
  color             = EXCLUDED.color,
  wall_height       = EXCLUDED.wall_height,
  allowed_roles     = EXCLUDED.allowed_roles,
  sections          = EXCLUDED.sections,
  sponsor_name      = EXCLUDED.sponsor_name,
  sponsor_url       = EXCLUDED.sponsor_url,
  sponsor_logo_url  = EXCLUDED.sponsor_logo_url,
  updated_at        = now();


-- ============================================================
-- 3. ROSTER — every venue role, spread across all three floors.
--    A few last_seen_at = NOW() so rooms show occupancy on first
--    paint (presence counts <2 min as online).
-- ============================================================

INSERT INTO event_venue_members (event_id, user_id, role, availability, status_note, current_room_id, skills, looking_for_team, last_seen_at) VALUES
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000002', 'organizer',   'working',     'Host. Ping me in Organizer HQ.',                         '7b000000-0000-0000-0000-000000000024', ARRAY['facilitation','ops'],          FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000001', 'judge',       'working',     'Reading briefs before the panel',                        '7b000000-0000-0000-0000-000000000020', ARRAY['policy','regional programmes'], FALSE, NOW() - INTERVAL '3 minutes'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000011', 'judge',       'busy',        'Scoring the mid-week demos',                             '7b000000-0000-0000-0000-000000000020', ARRAY['finance','due diligence'],     FALSE, NOW() - INTERVAL '1 minute'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000003', 'mentor',      'working',     'On duty at the Help Desk — marine data, sensors, models', '7b000000-0000-0000-0000-000000000005', ARRAY['data science','marine biology','python'], FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000004', 'mentor',      'away',        'Back for the 4pm AST pitch clinic',                      '7b000000-0000-0000-0000-000000000010', ARRAY['business models','pitching'],  FALSE, NOW() - INTERVAL '50 minutes'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000012', 'participant', 'working',     'Speaking in the Workshop Room at 2pm — ocean data APIs',  '7b000000-0000-0000-0000-000000000009', ARRAY['gis','apis','node'],          FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000005', 'participant', 'working',     'Reef Watch — wiring the dive-log parser',                '7b000000-0000-0000-0000-000000000013', ARRAY['react','node','iot'],          FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000006', 'participant', 'busy',        'Reef Watch — do not disturb, migration in progress',     '7b000000-0000-0000-0000-000000000013', ARRAY['postgres','python'],           FALSE, NOW() - INTERVAL '4 minutes'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000007', 'participant', 'working',     'CatchLog — offline sync is nearly there',                '7b000000-0000-0000-0000-000000000014', ARRAY['flutter','sqlite','ux'],       FALSE, NOW() - INTERVAL '2 minutes'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000009', 'participant', 'working',     'Sargassum Radar — need a frontend dev!',                 '7b000000-0000-0000-0000-000000000015', ARRAY['ml','python','remote sensing'], TRUE,  NOW() - INTERVAL '6 minutes'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000008', 'participant', 'help_wanted', 'Buoy sim drops LoRa packets past 300m — anyone?',        '7b000000-0000-0000-0000-000000000019', ARRAY['arduino','lora','c++'],        FALSE, NOW() - INTERVAL '1 minute'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000010', 'participant', 'working',     'Looking for a team — business and pitch side',           '7b000000-0000-0000-0000-000000000003', ARRAY['business strategy','pitching'], TRUE,  NOW() - INTERVAL '90 seconds')
ON CONFLICT (event_id, user_id) DO UPDATE SET
  role            = EXCLUDED.role,
  availability    = EXCLUDED.availability,
  status_note     = EXCLUDED.status_note,
  current_room_id = EXCLUDED.current_room_id,
  skills          = EXCLUDED.skills,
  looking_for_team = EXCLUDED.looking_for_team,
  last_seen_at    = EXCLUDED.last_seen_at;

-- Room-scoped roles (109). Andre is a participant everywhere except the
-- Workshop Room, where he holds the mic; Keisha pitches Reef Watch on the
-- Showcase Stage but is an ordinary participant in every other room.
INSERT INTO venue_room_roles (id, event_id, room_id, user_id, role) VALUES
  ('7e000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000021', '7b000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000012', 'speaker'),
  ('7e000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000021', '7b000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'speaker')
ON CONFLICT (room_id, user_id) DO UPDATE SET role = EXCLUDED.role;


-- ============================================================
-- 4. ROOM CHAT — event_id is set by trigger, omit it.
--    One 'system' message so that branch renders too.
-- ============================================================

INSERT INTO venue_room_messages (id, room_id, author_id, body, kind, created_at) VALUES
  -- Main Hall
  ('8b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Welcome to Blue Economy Build Week! Three floors: register and mingle down here, build upstairs, pitch on the top floor. Daily stand-up in this room at 9am AST.', 'chat', NOW() - INTERVAL '2 days'),
  ('8b000000-0000-0000-0000-000000000002', '7b000000-0000-0000-0000-000000000002', NULL, 'Venue opened by the host.', 'system', NOW() - INTERVAL '2 days'),
  ('8b000000-0000-0000-0000-000000000003', '7b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'Mentor rota is pinned in the Resource Library. Help Desk is staffed 24/7 until submissions close.', 'chat', NOW() - INTERVAL '47 hours'),
  ('8b000000-0000-0000-0000-000000000004', '7b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Reminder: Final Pitches stage stays closed until the last day. Finalists will be announced here at noon.', 'chat', NOW() - INTERVAL '5 hours'),
  -- Networking Lounge
  ('8b000000-0000-0000-0000-000000000005', '7b000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000009', 'Shania from Grenada — Sargassum Radar needs a frontend dev. We have the model, we need the map!', 'chat', NOW() - INTERVAL '30 hours'),
  ('8b000000-0000-0000-0000-000000000006', '7b000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000010', 'Marcus from Saint Lucia. I can do the pitch deck and business model if any pod needs one more.', 'chat', NOW() - INTERVAL '28 hours'),
  ('8b000000-0000-0000-0000-000000000007', '7b000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000007', 'Pods 4–6 are still free upstairs if a new team forms. Claim one in the room description.', 'chat', NOW() - INTERVAL '20 hours'),
  ('8b000000-0000-0000-0000-000000000008', '7b000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'Anyone else hitting the OECS Ocean Governance API rate limit? 60 req/min is tight.', 'chat', NOW() - INTERVAL '3 hours'),
  -- Help Desk
  ('8b000000-0000-0000-0000-000000000009', '7b000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000009', 'What resolution is the Sentinel-2 sargassum index good down to? Beach-scale or bay-scale?', 'chat', NOW() - INTERVAL '4 hours'),
  ('8b000000-0000-0000-0000-000000000010', '7b000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'Bay-scale honestly. 10m pixels but the index is noisy near shore. Pair it with a webcam or a drone frame for the last 200m.', 'chat', NOW() - INTERVAL '230 minutes'),
  -- Hardware Bench
  ('8b000000-0000-0000-0000-000000000011', '7b000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000008', 'Buoy sim is dropping most packets past 300m. SF7, 125kHz. Camera is on if anyone wants to look at the wiring.', 'chat', NOW() - INTERVAL '70 minutes'),
  ('8b000000-0000-0000-0000-000000000012', '7b000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000003', 'Try SF9 first. Salt spray on the antenna connector is the other usual culprit.', 'chat', NOW() - INTERVAL '55 minutes'),
  -- Pod 1 · Reef Watch
  ('8b000000-0000-0000-0000-000000000013', '7b000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000005', 'Parser handles the three dive-log formats now. Rashid, the schema migration is yours when you surface.', 'chat', NOW() - INTERVAL '2 hours'),
  ('8b000000-0000-0000-0000-000000000014', '7b000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000006', 'On it. Do not merge anything for 20 minutes.', 'chat', NOW() - INTERVAL '25 minutes'),
  -- Workshop Room
  ('8b000000-0000-0000-0000-000000000015', '7b000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000012', 'Slides for "Ocean data APIs in 40 minutes" are in the Resource Library. Bring questions about the CARICOM fisheries endpoints.', 'chat', NOW() - INTERVAL '6 hours'),
  -- Judging Room
  ('8b000000-0000-0000-0000-000000000016', '7b000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000011', 'Scoring sheet for the mid-week demos is ready. Impact first, then execution, then story.', 'chat', NOW() - INTERVAL '90 minutes'),
  ('8b000000-0000-0000-0000-000000000017', '7b000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000001', 'Agreed. Let us keep the Deliberation Room closed until all six have presented.', 'chat', NOW() - INTERVAL '80 minutes'),
  -- Organizer HQ
  ('8b000000-0000-0000-0000-000000000018', '7b000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000002', 'Headcount 11 on the floor right now. Opening the Final Pitches stage Friday 09:00 AST.', 'chat', NOW() - INTERVAL '40 minutes')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 5. SCHEDULE — every session points at a venue room (108), so
--    the agenda shows the room name instead of a free-text
--    location and the room page shows what is on next.
-- ============================================================

INSERT INTO event_schedule (id, event_id, title, description, start_time, end_time, location, room_id, schedule_type, sort_order)
SELECT v.id::uuid, e.id, v.title, v.description,
       e.start_date + v.starts_after, e.start_date + v.ends_after,
       NULL, v.room_id::uuid, v.schedule_type, v.sort_order
FROM events e
CROSS JOIN (VALUES
  ('9b000000-0000-0000-0000-000000000001', 'Opening keynote: the OECS ocean economy',
   'Why the region is betting on the blue economy, and what the judges are hoping to see by Friday.',
   INTERVAL '0 hours', INTERVAL '1 hour', '7b000000-0000-0000-0000-000000000002', 'keynote', 10),
  ('9b000000-0000-0000-0000-000000000002', 'Team forming',
   'Pitch your idea in 60 seconds, then find your people. Pods 1–6 are claimed first come, first served.',
   INTERVAL '1 hour', INTERVAL '2 hours 30 minutes', '7b000000-0000-0000-0000-000000000003', 'networking', 20),
  ('9b000000-0000-0000-0000-000000000003', 'Sponsor showcase',
   'Five minutes each from CDB, Flow and the OECS Commission on the data and credits they have brought.',
   INTERVAL '3 hours', INTERVAL '3 hours 45 minutes', '7b000000-0000-0000-0000-000000000004', 'session', 30),
  ('9b000000-0000-0000-0000-000000000004', 'Workshop: ocean data APIs in 40 minutes',
   'Andre Williams walks the CARICOM fisheries and OECS Ocean Governance endpoints, live.',
   INTERVAL '1 day 5 hours', INTERVAL '1 day 5 hours 45 minutes', '7b000000-0000-0000-0000-000000000009', 'workshop', 40),
  ('9b000000-0000-0000-0000-000000000005', 'Hardware clinic',
   'Bring your buoy, your sensor or your wiring diagram to the bench.',
   INTERVAL '1 day 7 hours', INTERVAL '1 day 9 hours', '7b000000-0000-0000-0000-000000000019', 'workshop', 50),
  ('9b000000-0000-0000-0000-000000000006', 'Mid-week demos',
   'Every pod shows two minutes of something working. Judges score, spectators react.',
   INTERVAL '2 days 6 hours', INTERVAL '2 days 8 hours', '7b000000-0000-0000-0000-000000000004', 'session', 60),
  ('9b000000-0000-0000-0000-000000000007', 'Pitch clinic with James Pierre',
   'Ten-minute slots. Bring your deck.',
   INTERVAL '3 days 7 hours', INTERVAL '3 days 9 hours', '7b000000-0000-0000-0000-000000000010', 'session', 70),
  ('9b000000-0000-0000-0000-000000000008', 'Submissions close',
   'Repo link and demo video due. The Help Desk stays open for upload trouble.',
   INTERVAL '4 days 4 hours', INTERVAL '4 days 4 hours 30 minutes', '7b000000-0000-0000-0000-000000000005', 'other', 80),
  ('9b000000-0000-0000-0000-000000000009', 'Final pitches',
   'Six finalists, five minutes each, live scoring. The stage opens 30 minutes before.',
   INTERVAL '4 days 6 hours', INTERVAL '4 days 8 hours', '7b000000-0000-0000-0000-000000000023', 'session', 90),
  ('9b000000-0000-0000-0000-000000000010', 'Judges deliberate',
   'Closed session.',
   INTERVAL '4 days 8 hours', INTERVAL '4 days 9 hours', '7b000000-0000-0000-0000-000000000021', 'break', 100),
  ('9b000000-0000-0000-0000-000000000011', 'Closing ceremony and awards',
   'Winners, the CDB accelerator invitations, and what happens next.',
   INTERVAL '4 days 9 hours', INTERVAL '4 days 10 hours', '7b000000-0000-0000-0000-000000000002', 'keynote', 110)
) AS v(id, title, description, starts_after, ends_after, room_id, schedule_type, sort_order)
WHERE e.id = 'd0000000-0000-0000-0000-000000000021'
ON CONFLICT (id) DO UPDATE SET
  title         = EXCLUDED.title,
  description   = EXCLUDED.description,
  start_time    = EXCLUDED.start_time,
  end_time      = EXCLUDED.end_time,
  room_id       = EXCLUDED.room_id,
  schedule_type = EXCLUDED.schedule_type,
  sort_order    = EXCLUDED.sort_order;


-- ============================================================
-- 6. CHALLENGE BRIEF (event_criteria)
-- ============================================================

INSERT INTO event_criteria (id, event_id, kind, title, description, is_required, weight, sort_order) VALUES
  ('7a000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000021', 'objective',         'Build for the blue economy',        'Fisheries, reefs, marine spatial planning, coastal resilience or ocean-based livelihoods in an OECS member state.', TRUE, NULL, 10),
  ('7a000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000021', 'objective',         'Work offline or on 2G',              'Fishers and dive operators are often out of coverage. The tool must degrade gracefully and sync later.', TRUE, NULL, 20),
  ('7a000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000021', 'objective',         'Name the operator',                  'Who runs this after the week ends — a co-op, a ministry, a dive shop, an NGO?', FALSE, NULL, 30),
  ('7a000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000021', 'constraint',        'Teams of 2–5',                       'Solo entries may attend but are not eligible for prizes. Claim a pod on the build floor.', TRUE, NULL, 40),
  ('7a000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000021', 'constraint',        'Use at least one sponsor data set',  'OECS Ocean Governance, CARICOM fisheries, Sentinel-2, or a set from the Resource Library.', TRUE, NULL, 50),
  ('7a000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000021', 'deliverable',       '3-minute demo video',                'A recorded walkthrough of the working prototype.', TRUE, NULL, 60),
  ('7a000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000021', 'deliverable',       'Public code repository',             'Source under an OSI-approved licence.', TRUE, NULL, 70),
  ('7a000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000021', 'judging_criterion', 'Impact',                             'Benefit to coastal communities and marine ecosystems.', TRUE, 35, 80),
  ('7a000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000021', 'judging_criterion', 'Execution',                          'How much actually works, on a phone, offline.', TRUE, 35, 90),
  ('7a000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000021', 'judging_criterion', 'Path to adoption',                   'Is there a named operator and a credible first deployment?', TRUE, 30, 100)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 7. EVENT PAGE SECTIONS
-- ============================================================

INSERT INTO event_page_sections (id, event_id, section_type, title, content, sort_order, is_visible) VALUES
  ('7c000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000021', 'about', 'About Build Week',
   '{"body": "Blue Economy Build Week is a fully virtual five-day sprint for developers, designers, marine scientists and entrepreneurs across the OECS. Everything happens inside the KTIP virtual venue: a three-floor building with a registration desk and sponsor booths on the ground floor, team pods and a hardware bench on the build floor, and the judging rooms and final-pitch stage upstairs. Mentors staff the Help Desk around the clock. Prizes include Caribbean Development Bank accelerator places and Flow connectivity credits for field pilots."}'::jsonb, 10, true),
  ('7c000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000021', 'venue', 'Finding your way around',
   '{"body": "Enter through the Registration Desk on the ground floor and check in. Use the stairs in the corner to move between floors. Team pods 1–6 are on the build floor — claim a free one by editing its description. The Mentor Lounge, Judging Room and Organizer HQ are role-restricted; the Deliberation Room and Final Pitches stage stay closed until the last day."}'::jsonb, 20, true),
  ('7c000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000021', 'faq', 'Frequently Asked Questions',
   '{"items": [
     {"question": "Do I need a team to register?", "answer": "No. Team forming runs in the Networking Lounge on day one, and the Looking-for-team panel there works all week."},
     {"question": "Which rooms can I enter?", "answer": "Every room on the ground and build floors is open to all members. The Mentor Lounge, Judging Room and Organizer HQ are limited to those roles, and two rooms on the judges'' floor stay closed until the finals."},
     {"question": "Can I watch without competing?", "answer": "Yes. Any signed-in KTIP member can spectate: watch the stages, read the chat, react to demos."},
     {"question": "Who owns what we build?", "answer": "Your team does. Sponsors get no licence or claim on your work."}
   ]}'::jsonb, 30, true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 8. RSVPs — confirmed for everyone on the roster, one pending,
--    one waitlisted so the approval queue (096) has rows.
-- ============================================================

INSERT INTO event_rsvps (id, event_id, user_id, status, created_at) VALUES
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000005', 'confirmed', NOW() - INTERVAL '25 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000006', 'confirmed', NOW() - INTERVAL '24 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000007', 'confirmed', NOW() - INTERVAL '22 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000008', 'confirmed', NOW() - INTERVAL '20 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000009', 'confirmed', NOW() - INTERVAL '18 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000010', 'confirmed', NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000012', 'confirmed', NOW() - INTERVAL '12 days')
ON CONFLICT (event_id, user_id) DO NOTHING;


-- ============================================================
-- 9. SAVED VENUE TEMPLATE (107) — the building above, snapshotted
--    for the host so "Use a saved template" has something to
--    offer. Same exclusions as the app's own snapshot: no team
--    rooms (there are none — pods are `breakout`), no sponsor
--    fields, no svg_zone_id.
-- ============================================================

INSERT INTO venue_templates (id, owner_id, name, description, source_event_id, map, rooms, is_shared)
SELECT
  '7d000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'Three-floor hackathon',
  'Ground floor for arrivals and sponsors, a build floor of team pods, and a judges'' floor with a closed finals stage.',
  e.id,
  e.venue_map,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'key', r.key, 'name', r.name, 'kind', r.kind, 'description', r.description,
      'color', r.color, 'wall_height', r.wall_height, 'capacity', r.capacity,
      'audio_mode', r.audio_mode, 'recording_enabled', r.recording_enabled,
      'allowed_roles', to_jsonb(r.allowed_roles), 'floor', r.floor, 'cells', r.cells,
      'sections', r.sections
    ) ORDER BY r.floor, r.sort_order)
    FROM venue_rooms r
    WHERE r.event_id = e.id AND r.kind <> 'team'
  ),
  TRUE
FROM events e
WHERE e.id = 'd0000000-0000-0000-0000-000000000021'
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  map         = EXCLUDED.map,
  rooms       = EXCLUDED.rooms,
  is_shared   = EXCLUDED.is_shared,
  updated_at  = now();


-- ============================================================
-- DONE
--
-- Browse: /events/d0000000-0000-0000-0000-000000000021 and its
-- /venue. Sign in as devon.charles@demo.forge.oecs (host) to open
-- the editor, or as any other demo user to walk the floors.
--
-- Verify (read-only):
--   SELECT floor, key, jsonb_array_length(cells) AS cells, is_open, allowed_roles
--   FROM venue_rooms WHERE event_id = 'd0000000-0000-0000-0000-000000000021'
--   ORDER BY floor, sort_order;
--
-- Dates are computed at seed time. `npm run seed:events` slides
-- this event back around today along with the others.
-- ============================================================
