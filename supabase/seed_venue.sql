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
   'OECS Blue Economy Hackathon: Virtual Build Fortnight',
   'Two weeks online to build tools for fishers, reef wardens and coastal towns, inside a three-floor virtual venue.',
   'A two-week online hackathon on the blue economy. Teams from across the OECS are building tools for small-scale fishers, reef monitoring, sargassum landfall warnings and coastal planning. The venue is a three-floor building. You check in and meet people on the ground floor, build in a team pod on the build floor, and pitch to the judges on the top floor. A mentor is on the Help Desk at most hours, and the sponsors keep their booths open on the ground floor for the full fortnight.',
   'hackathon', 'published', NULL, true,
   NOW() - INTERVAL '2 days', NOW() + INTERVAL '14 days',
   120,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000021.webp',
   true,
   'a0000000-0000-0000-0000-000000000002',
   NOW() - INTERVAL '30 days',
   ARRAY['blue-economy','virtual','hackathon','fisheries','coastal'],
   TRUE, NOW() + INTERVAL '12 days',
   TRUE, NOW() - INTERVAL '3 days', NOW() + INTERVAL '15 days',
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
   'Check in here first. The house rules and a floor guide are pinned in this room.',
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
   'Mics are open. Come here to find a team, or someone with the skill your team is missing.',
   'open', 40, 12, FALSE, TRUE, 30, 0, venue_rect_cells(12, 2, 19, 7), '#7AB000', 1.25,
   '{}',
   '[{"id":"av_placeholder"},{"id":"chat"},{"id":"looking_for_team"},{"id":"skill_finder"},{"id":"occupants"},{"id":"venue_headcount"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000021',
   'showcase', 'Showcase Stage', 'stage',
   'Sponsor talks, the midpoint demos and the community vote.',
   'listen_only', NULL, 6, FALSE, TRUE, 40, 0, venue_rect_cells(21, 2, 26, 8), '#041E42', 2.0,
   '{}',
   '[{"id":"sponsor_hero"},{"id":"host_controls"},{"id":"av_placeholder"},{"id":"reactions"},{"id":"showcase_gallery"},{"id":"chat"},{"id":"occupants"},{"id":"hand_queue"},{"id":"countdown"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000021',
   'help-desk', 'Help Desk', 'help_desk',
   'A mentor is on duty here day and night. Bring your bug.',
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
   'Open to mentors, judges and organizers. Compare notes between shifts.',
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
   'Team pod. Still free, claim it from the Networking Lounge.',
   'open', 8, 8, FALSE, TRUE, 170, 1, venue_rect_cells(2, 12, 5, 14), '#AEE12B', 1.0,
   '{}',
   '[{"id":"host_controls"},{"id":"av_placeholder"},{"id":"objectives"},{"id":"chat"},{"id":"occupants"},{"id":"countdown"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000021',
   'pod-5', 'Pod 5', 'breakout',
   'Team pod. Still free, claim it from the Networking Lounge.',
   'open', 8, 8, FALSE, TRUE, 180, 1, venue_rect_cells(7, 12, 10, 14), '#AEE12B', 1.0,
   '{}',
   '[{"id":"host_controls"},{"id":"av_placeholder"},{"id":"objectives"},{"id":"chat"},{"id":"occupants"},{"id":"countdown"}]'::jsonb,
   NULL, NULL, NULL),

  ('7b000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000021',
   'pod-6', 'Pod 6', 'breakout',
   'Team pod. Still free, claim it from the Networking Lounge.',
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
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000002', 'organizer',   'working',     'Host. Find me in Organizer HQ.',                         '7b000000-0000-0000-0000-000000000024', ARRAY['facilitation','ops'],          FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000001', 'judge',       'working',     'Reading team briefs before the panel',                   '7b000000-0000-0000-0000-000000000020', ARRAY['policy','regional programmes'], FALSE, NOW() - INTERVAL '3 minutes'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000011', 'judge',       'busy',        'Going through team repos',                               '7b000000-0000-0000-0000-000000000020', ARRAY['finance','due diligence'],     FALSE, NOW() - INTERVAL '1 minute'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000003', 'mentor',      'working',     'On the Help Desk. Marine data, sensors and models',       '7b000000-0000-0000-0000-000000000005', ARRAY['data science','marine biology','python'], FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000004', 'mentor',      'away',        'Back at 4pm AST',                                        '7b000000-0000-0000-0000-000000000010', ARRAY['business models','pitching'],  FALSE, NOW() - INTERVAL '50 minutes'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000012', 'participant', 'working',     'Giving the ocean data APIs talk in the Workshop Room',   '7b000000-0000-0000-0000-000000000009', ARRAY['gis','apis','node'],          FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000005', 'participant', 'working',     'Reef Watch: wiring up the dive-log parser',              '7b000000-0000-0000-0000-000000000013', ARRAY['react','node','iot'],          FALSE, NOW()),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000006', 'participant', 'busy',        'Reef Watch: running a migration, please don''t merge',   '7b000000-0000-0000-0000-000000000013', ARRAY['postgres','python'],           FALSE, NOW() - INTERVAL '4 minutes'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000007', 'participant', 'working',     'CatchLog: offline sync nearly done',                     '7b000000-0000-0000-0000-000000000014', ARRAY['flutter','sqlite','ux'],       FALSE, NOW() - INTERVAL '2 minutes'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000009', 'participant', 'working',     'Sargassum Radar: looking for a frontend dev',            '7b000000-0000-0000-0000-000000000015', ARRAY['ml','python','remote sensing'], TRUE,  NOW() - INTERVAL '6 minutes'),
  ('d0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000008', 'participant', 'help_wanted', 'Buoy sim drops LoRa packets past 300m. Any ideas?',      '7b000000-0000-0000-0000-000000000019', ARRAY['arduino','lora','c++'],        FALSE, NOW() - INTERVAL '1 minute')
ON CONFLICT (event_id, user_id) DO UPDATE SET
  role            = EXCLUDED.role,
  availability    = EXCLUDED.availability,
  status_note     = EXCLUDED.status_note,
  current_room_id = EXCLUDED.current_room_id,
  skills          = EXCLUDED.skills,
  looking_for_team = EXCLUDED.looking_for_team,
  last_seen_at    = EXCLUDED.last_seen_at;

-- Marcus George (a10) is the one unverified demo persona, and 205's trigger
-- refuses venue memberships for unverified users. Older runs of this file
-- seated him; clear that row so a re-run matches a fresh seed.
DELETE FROM event_venue_members
WHERE event_id = 'd0000000-0000-0000-0000-000000000021'
  AND user_id  = 'a0000000-0000-0000-0000-000000000010';

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
  ('8b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Welcome to the Blue Economy Build Fortnight. Check in and meet people down here, build on the floor above, and pitch on the top floor. Stand-up is in this room every morning at 9am AST.', 'chat', NOW() - INTERVAL '2 days'),
  ('8b000000-0000-0000-0000-000000000002', '7b000000-0000-0000-0000-000000000002', NULL, 'Venue opened by the host.', 'system', NOW() - INTERVAL '2 days'),
  ('8b000000-0000-0000-0000-000000000003', '7b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'Mentor rota is pinned in the Resource Library. Someone will be on the Help Desk at all hours until submissions close.', 'chat', NOW() - INTERVAL '47 hours'),
  ('8b000000-0000-0000-0000-000000000004', '7b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Reminder: the Final Pitches stage stays shut until finals day. We name the six finalists in this room the day before.', 'chat', NOW() - INTERVAL '5 hours'),
  -- Networking Lounge
  ('8b000000-0000-0000-0000-000000000005', '7b000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000009', 'Shania from Grenada. Sargassum Radar has a working model but nobody to build the map. Any frontend people around?', 'chat', NOW() - INTERVAL '30 hours'),
  ('8b000000-0000-0000-0000-000000000006', '7b000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'James here. Can''t help with the map, but once you have a demo, book a slot with me in the Mentor Lounge and we''ll tighten the pitch.', 'chat', NOW() - INTERVAL '28 hours'),
  ('8b000000-0000-0000-0000-000000000007', '7b000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000007', 'Pods 4 to 6 upstairs are still free if a new team forms. Claim one by editing its room description.', 'chat', NOW() - INTERVAL '20 hours'),
  ('8b000000-0000-0000-0000-000000000008', '7b000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'Anyone else hitting the rate limit on the OECS Ocean Governance API? 60 requests a minute is tight', 'chat', NOW() - INTERVAL '3 hours'),
  -- Help Desk
  ('8b000000-0000-0000-0000-000000000009', '7b000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000009', 'How fine is the Sentinel-2 sargassum index? Good enough for one beach, or only a whole bay?', 'chat', NOW() - INTERVAL '4 hours'),
  ('8b000000-0000-0000-0000-000000000010', '7b000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'Bay scale, honestly. The pixels are 10m but the index gets noisy close to shore. For the last 200m, pair it with a webcam or a drone shot.', 'chat', NOW() - INTERVAL '230 minutes'),
  -- Hardware Bench
  ('8b000000-0000-0000-0000-000000000011', '7b000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000008', 'Buoy sim is losing most packets past 300m. SF7, 125kHz. Camera''s on if anyone wants to look at the wiring', 'chat', NOW() - INTERVAL '70 minutes'),
  ('8b000000-0000-0000-0000-000000000012', '7b000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000003', 'Try SF9 first. If that doesn''t do it, check the antenna connector. Salt spray gets into those all the time.', 'chat', NOW() - INTERVAL '55 minutes'),
  -- Pod 1 · Reef Watch
  ('8b000000-0000-0000-0000-000000000013', '7b000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000005', 'Parser reads all three dive-log formats now. Rashid, the schema migration is yours when you''re free', 'chat', NOW() - INTERVAL '2 hours'),
  ('8b000000-0000-0000-0000-000000000014', '7b000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000006', 'On it. Nobody merge anything for 20 minutes pls', 'chat', NOW() - INTERVAL '25 minutes'),
  -- Workshop Room
  ('8b000000-0000-0000-0000-000000000015', '7b000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000012', 'Slides for my ocean data APIs session are in the Resource Library. Bring your questions on the CARICOM fisheries endpoints.', 'chat', NOW() - INTERVAL '6 hours'),
  -- Judging Room
  ('8b000000-0000-0000-0000-000000000016', '7b000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000011', 'Scoring sheet for the midpoint demos is up. Impact first, then execution, then how well they tell it.', 'chat', NOW() - INTERVAL '90 minutes'),
  ('8b000000-0000-0000-0000-000000000017', '7b000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000001', 'Agreed. And let''s keep the Deliberation Room closed until all six finalists have pitched.', 'chat', NOW() - INTERVAL '80 minutes'),
  -- Organizer HQ
  ('8b000000-0000-0000-0000-000000000018', '7b000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000002', 'Headcount is 11 on the floor right now. Final Pitches stage opens at 09:00 AST on finals day.', 'chat', NOW() - INTERVAL '40 minutes')
ON CONFLICT (id) DO UPDATE SET room_id = EXCLUDED.room_id, author_id = EXCLUDED.author_id, body = EXCLUDED.body, kind = EXCLUDED.kind, created_at = EXCLUDED.created_at;


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
   'Why governments in the region are putting money into fisheries, marine tourism and ocean research, and what the judges want to see at the final pitches.',
   INTERVAL '0 hours', INTERVAL '1 hour', '7b000000-0000-0000-0000-000000000002', 'keynote', 10),
  ('9b000000-0000-0000-0000-000000000002', 'Team forming',
   'Pitch your idea in 60 seconds, then find teammates. Pods 1 to 6 go to whichever teams claim them first.',
   INTERVAL '1 hour', INTERVAL '2 hours 30 minutes', '7b000000-0000-0000-0000-000000000003', 'networking', 20),
  ('9b000000-0000-0000-0000-000000000003', 'Sponsor showcase',
   'CDB, Flow and the OECS Commission get five minutes each to explain the data and credits on offer.',
   INTERVAL '3 hours', INTERVAL '3 hours 45 minutes', '7b000000-0000-0000-0000-000000000004', 'session', 30),
  ('9b000000-0000-0000-0000-000000000004', 'Workshop: ocean data APIs in 40 minutes',
   'Andre Williams goes through the CARICOM fisheries and OECS Ocean Governance endpoints live, with real queries.',
   INTERVAL '2 days 5 hours', INTERVAL '2 days 5 hours 45 minutes', '7b000000-0000-0000-0000-000000000009', 'workshop', 40),
  ('9b000000-0000-0000-0000-000000000005', 'Hardware clinic',
   'Bring your buoy, sensor or wiring diagram to the bench and a mentor will look at it on camera.',
   INTERVAL '3 days 7 hours', INTERVAL '3 days 9 hours', '7b000000-0000-0000-0000-000000000019', 'workshop', 50),
  ('9b000000-0000-0000-0000-000000000006', 'Midpoint demos',
   'Each pod shows two minutes of something that works. Judges score it and spectators can react.',
   INTERVAL '7 days 6 hours', INTERVAL '7 days 8 hours', '7b000000-0000-0000-0000-000000000004', 'session', 60),
  ('9b000000-0000-0000-0000-000000000007', 'Pitch clinic with James Pierre',
   'Ten-minute slots. Bring your deck.',
   INTERVAL '11 days 7 hours', INTERVAL '11 days 9 hours', '7b000000-0000-0000-0000-000000000010', 'session', 70),
  ('9b000000-0000-0000-0000-000000000008', 'Submissions close',
   'Repo link and demo video are due. The Help Desk stays open if your upload gives trouble.',
   INTERVAL '14 days', INTERVAL '14 days 30 minutes', '7b000000-0000-0000-0000-000000000005', 'other', 80),
  ('9b000000-0000-0000-0000-000000000009', 'Final pitches',
   'Six finalists get five minutes each, scored live. The stage opens 30 minutes before the first pitch.',
   INTERVAL '15 days 6 hours', INTERVAL '15 days 8 hours', '7b000000-0000-0000-0000-000000000023', 'session', 90),
  ('9b000000-0000-0000-0000-000000000010', 'Judges deliberate',
   'Closed session.',
   INTERVAL '15 days 8 hours', INTERVAL '15 days 9 hours', '7b000000-0000-0000-0000-000000000021', 'break', 100),
  ('9b000000-0000-0000-0000-000000000011', 'Closing ceremony and awards',
   'Winners are announced, CDB hands out its accelerator invitations, and we explain how teams can keep building after the hackathon.',
   INTERVAL '15 days 9 hours', INTERVAL '15 days 10 hours', '7b000000-0000-0000-0000-000000000002', 'keynote', 110)
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
  ('7a000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000021', 'objective',         'Build for the blue economy',        'Fisheries, reefs, marine spatial planning, coastal resilience or ocean-based jobs in an OECS member state.', TRUE, NULL, 10),
  ('7a000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000021', 'objective',         'Work offline or on 2G',              'Fishers and dive operators are often out of signal. The tool has to keep working and sync when they are back in range.', TRUE, NULL, 20),
  ('7a000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000021', 'objective',         'Name the operator',                  'Say who runs this once the hackathon ends: a fishers'' co-op, a ministry, a dive shop or an NGO.', FALSE, NULL, 30),
  ('7a000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000021', 'constraint',        'Teams of 2 to 5',                    'Solo entrants can take part but cannot win prizes. Claim a pod on the build floor.', TRUE, NULL, 40),
  ('7a000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000021', 'constraint',        'Use at least one sponsor data set',  'OECS Ocean Governance, CARICOM fisheries, Sentinel-2, or a set from the Resource Library.', TRUE, NULL, 50),
  ('7a000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000021', 'deliverable',       '3-minute demo video',                'A recorded walkthrough of the working prototype.', TRUE, NULL, 60),
  ('7a000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000021', 'deliverable',       'Public code repository',             'Source under an OSI-approved licence.', TRUE, NULL, 70),
  ('7a000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000021', 'judging_criterion', 'Impact',                             'How much it helps coastal communities and the reefs and fish stocks they depend on.', TRUE, 35, 80),
  ('7a000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000021', 'judging_criterion', 'Execution',                          'How much of it works on a phone with no signal.', TRUE, 35, 90),
  ('7a000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000021', 'judging_criterion', 'Path to adoption',                   'A named operator and a believable first deployment, for example with a fisheries co-op in Gouyave or Soufriere.', TRUE, 30, 100)
ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, kind = EXCLUDED.kind, title = EXCLUDED.title, description = EXCLUDED.description, is_required = EXCLUDED.is_required, weight = EXCLUDED.weight, sort_order = EXCLUDED.sort_order;


-- ============================================================
-- 7. EVENT PAGE SECTIONS
-- ============================================================

INSERT INTO event_page_sections (id, event_id, section_type, title, content, sort_order, is_visible) VALUES
  ('7c000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000021', 'about', 'About the Build Fortnight',
   '{"body": "The Blue Economy Build Fortnight is a two-week online hackathon for developers, designers, marine scientists and founders across the OECS. It all happens inside the KTIP virtual venue, a three-floor building. The registration desk and sponsor booths are on the ground floor. Team pods and a hardware bench are on the build floor. The judging rooms and the final-pitch stage are on the top floor. A mentor is on the Help Desk at most hours of the day. Winners can earn places in the Caribbean Development Bank accelerator and Flow data credits for field pilots in places like Gouyave, Soufriere and Brades."}'::jsonb, 10, true),
  ('7c000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000021', 'venue', 'Finding your way around',
   '{"body": "Come in through the Registration Desk on the ground floor and check in. The stairs in the corner take you between floors. Team pods 1 to 6 are on the build floor, and you claim a free one by editing its description. Only people with the right role can enter the Mentor Lounge, Judging Room and Organizer HQ. The Deliberation Room and the Final Pitches stage stay closed until the last day."}'::jsonb, 20, true),
  ('7c000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000021', 'faq', 'Frequently Asked Questions',
   '{"items": [
     {"question": "Do I need a team to register?", "answer": "No. Team forming runs in the Networking Lounge on day one, and the Looking-for-team panel there stays up for the whole fortnight."},
     {"question": "Which rooms can I enter?", "answer": "Every room on the ground and build floors is open to all members. The Mentor Lounge, Judging Room and Organizer HQ are limited to those roles, and two rooms on the judges'' floor stay closed until the finals."},
     {"question": "Can I watch without competing?", "answer": "Yes. Any verified KTIP member can come in as a spectator to watch the stages, follow the chat and react to demos."},
     {"question": "Who owns what we build?", "answer": "Your team does. Sponsors get no licence or claim on your work."}
   ]}'::jsonb, 30, true)
ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, section_type = EXCLUDED.section_type, title = EXCLUDED.title, content = EXCLUDED.content, sort_order = EXCLUDED.sort_order, is_visible = EXCLUDED.is_visible;


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
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000012', 'confirmed', NOW() - INTERVAL '12 days')
ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status, created_at = EXCLUDED.created_at;


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
