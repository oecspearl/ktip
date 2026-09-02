-- ============================================================
-- KTIP / FORGE — Extra Events Demo Seed
-- Run AFTER migrations, seed.sql and seed_extended.sql (in the
-- Supabase SQL editor, which runs as postgres — RLS is bypassed).
--
-- seed.sql gives 6 events and seed_extended.sql 2 more, which is
-- too thin for the events surface, and thin in ways that hide
-- whole features rather than just looking sparse:
--
--   * `challenge` — a full event type with its own virtual-only
--     blueprint — was never seeded at all.
--   * `draft` and `cancelled` were never seeded, so the badge
--     branches in EventCard and the organizer-only draft RLS path
--     had nothing to act on.
--   * seed.sql sets no `tags`, and the events tag filter reads its
--     vocabulary off the table — so the filter was near-empty.
--   * `pending` / `waitlisted` / `declined` RSVPs were never
--     seeded, leaving the 096 registration approval queue empty.
--
-- This file adds 12 events (d0…09 through d0…20), backfills
-- summary + tags onto the original six, and hangs speakers,
-- agendas, challenge criteria and a realistic RSVP mix off them.
--
-- Idempotent: fixed UUIDs + ON CONFLICT throughout. RSVPs use
-- gen_random_uuid() with ON CONFLICT (event_id, user_id), which
-- the UNIQUE from migration 002 makes safe to re-run.
--
-- Two constraints shaped the data and are worth knowing before
-- editing it:
--
--   * No single-day event may have end_date = start_date.
--     useEvents treats `end_date >= now` as upcoming, so a
--     zero-length event flips to "past" the instant it begins —
--     the one hour it most needs to be visible. Every single-day
--     event here gets a 2–8 hour tail.
--   * registration_closes_at stays NULL on anything that receives
--     RSVPs. check_event_capacity() (migration 092) fires BEFORE
--     INSERT on event_rsvps and raises for a past close date, so
--     setting it would abort this seed rather than demo anything.
-- ============================================================


-- ============================================================
-- 0. PREFLIGHT — depends on seed.sql's demo users and events.
--    Fail fast with a clear message instead of a wall of FK errors.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Demo users not found (profile a0000000-…01 missing).',
      HINT = 'Run supabase/seed.sql first, then re-run this file.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM events WHERE id = 'd0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Base demo events not found (d0000000-…01 missing).',
      HINT = 'Run supabase/seed.sql first, then re-run this file.';
  END IF;
END $$;


-- ============================================================
-- 1. TWELVE MORE EVENTS
--
-- Spread so that every type, every status and both modalities are
-- represented, and so the calendar has something in it for the
-- next three months rather than two clusters and empty grids.
--
-- The two challenges follow the virtual-only blueprint from
-- src/lib/event-blueprints.ts: no location, no end_date, no
-- capacity — a submission deadline and a team size instead.
-- ============================================================

INSERT INTO events (id, title, summary, description, event_type, status, location, is_virtual,
                    start_date, end_date, capacity, image_url, is_climate_action,
                    organizer_id, created_at, tags, accent_color,
                    has_challenge, submission_deadline, team_size_min, team_size_max,
                    spectators_enabled, spectator_scope) VALUES

  -- 09 — near-term virtual workshop
  ('d0000000-0000-0000-0000-000000000009',
   'Grant Writing Clinic for Climate Founders',
   'A working session on turning a climate project into a fundable proposal.',
   'A hands-on clinic for founders preparing submissions to regional and international climate funds. Bring a draft concept note; leave with a reviewed budget, a theory of change, and a shortlist of funds that actually match your stage. Facilitated by the OECS Commission grants team.',
   'workshop', 'published',
   NULL, true,
   NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days 4 hours',
   40,
   'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&h=600&fit=crop',
   true,
   'a0000000-0000-0000-0000-000000000002',
   NOW() - INTERVAL '25 days',
   ARRAY['grants','funding','climate','workshop'],
   NULL,
   FALSE, NULL, NULL, NULL,
   FALSE, 'members'),

  -- 10 — in-person meetup, Antigua
  ('d0000000-0000-0000-0000-000000000010',
   'Women in Tech OECS: Founders Circle',
   'An evening of short talks and open floor for women building technology across the OECS.',
   'Three founders share what the last year actually cost them — hiring, funding, and the bits nobody posts about — followed by an open floor and structured networking. Open to women and non-binary people working in or moving into technology across OECS member states.',
   'meetup', 'published',
   'Sir Vivian Richards Cricket Ground Pavilion, North Sound, Antigua', false,
   NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 2 hours',
   50,
   'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=600&fit=crop',
   false,
   'a0000000-0000-0000-0000-000000000001',
   NOW() - INTERVAL '18 days',
   ARRAY['women-in-tech','networking','founders','community'],
   NULL,
   FALSE, NULL, NULL, NULL,
   FALSE, 'members'),

  -- 11 — challenge (virtual-only blueprint: no location/end/capacity)
  ('d0000000-0000-0000-0000-000000000011',
   'Coastal Data Challenge',
   'Build an open tool that makes OECS coastal erosion data usable by the people living on the coast.',
   'Three weeks, open to teams of one to four. We publish a decade of shoreline survey data from four member states; you build something that turns it into a decision a fisher, a hotelier or a planning officer can actually make. Submissions are judged on usefulness on the ground, not on model sophistication. Winning team gets a mentorship package and support taking the tool to a ministry pilot.',
   'challenge', 'published',
   NULL, true,
   NOW() + INTERVAL '5 days', NULL,
   NULL,
   'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop',
   true,
   'a0000000-0000-0000-0000-000000000003',
   NOW() - INTERVAL '12 days',
   ARRAY['challenge','coastal','data','climate'],
   NULL,
   TRUE, NOW() + INTERVAL '26 days', 1, 4,
   FALSE, 'members'),

  -- 12 — in-person workshop, Saint Kitts (has a custom registration form)
  ('d0000000-0000-0000-0000-000000000012',
   'Pitch Perfect: Investor Readiness Bootcamp',
   'A full day rebuilding your pitch in front of people who write cheques.',
   'A small-group bootcamp: you arrive with a deck, you leave with a different one. Morning covers the narrative and the numbers behind it; afternoon is live pitching to a rotating panel of regional investors and operators, with feedback in the room. Capped at 25 so everyone pitches twice.',
   'workshop', 'published',
   'St. Kitts Marriott Resort, Frigate Bay', false,
   NOW() + INTERVAL '21 days', NOW() + INTERVAL '21 days 8 hours',
   25,
   'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800&h=600&fit=crop',
   false,
   'a0000000-0000-0000-0000-000000000004',
   NOW() - INTERVAL '22 days',
   ARRAY['pitching','investment','bootcamp','founders'],
   NULL,
   FALSE, NULL, NULL, NULL,
   FALSE, 'members'),

  -- 13 — in-person meetup, Montserrat. Carries an accent_color override.
  ('d0000000-0000-0000-0000-000000000013',
   'Montserrat Digital Skills Fair',
   'A community day of free short courses, device help and career clinics.',
   'An open day at the cultural centre: thirty-minute taster sessions on spreadsheets, online safety, freelancing and basic web development, running on repeat all afternoon. Bring a laptop or use one of ours. Employers and training providers hold career clinics along the back wall. Free and open to everyone.',
   'meetup', 'published',
   'Montserrat Cultural Centre, Little Bay', false,
   NOW() + INTERVAL '28 days', NOW() + INTERVAL '28 days 6 hours',
   120,
   'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&h=600&fit=crop',
   false,
   'a0000000-0000-0000-0000-000000000012',
   NOW() - INTERVAL '30 days',
   ARRAY['digital-skills','community','montserrat','education'],
   'teal',
   FALSE, NULL, NULL, NULL,
   FALSE, 'members'),

  -- 14 — second challenge, longer runway
  ('d0000000-0000-0000-0000-000000000014',
   'Renewable Energy Innovation Challenge',
   'Cut the cost of getting a small island off diesel. Teams of two to five, forty days.',
   'Every OECS member state pays more for electricity than it should, and the reasons are as much about financing, maintenance and grid data as about panels. Propose and prototype something that moves one of those levers. Open to teams of two to five from anywhere in the region. Judged on evidence of demand, technical feasibility and a credible route to a first installation.',
   'challenge', 'published',
   NULL, true,
   NOW() + INTERVAL '35 days', NULL,
   NULL,
   'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=800&h=600&fit=crop',
   true,
   'a0000000-0000-0000-0000-000000000011',
   NOW() - INTERVAL '8 days',
   ARRAY['challenge','energy','climate','renewables'],
   NULL,
   TRUE, NOW() + INTERVAL '75 days', 2, 5,
   FALSE, 'members'),

  -- 15 — demo day, Grenada. Speakers + agenda hang off this one.
  ('d0000000-0000-0000-0000-000000000015',
   'OECS Youth Robotics Showcase',
   'Twelve secondary-school teams demo the robots they have spent a term building.',
   'The closing showcase of the regional schools robotics programme. Twelve teams from six member states demonstrate autonomous builds against a shared course, judged by engineers from across the region. Open to families, teachers and anyone considering starting a club at their own school — the afternoon includes a session on exactly that.',
   'demo_day', 'published',
   'Grenada Trade Centre, Morne Rouge', false,
   NOW() + INTERVAL '75 days', NOW() + INTERVAL '75 days 5 hours',
   180,
   'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800&h=600&fit=crop',
   false,
   'a0000000-0000-0000-0000-000000000003',
   NOW() - INTERVAL '40 days',
   ARRAY['youth','robotics','education','showcase'],
   NULL,
   FALSE, NULL, NULL, NULL,
   TRUE, 'public'),

  -- 16 — multi-day conference. Speakers + agenda hang off this one too.
  ('d0000000-0000-0000-0000-000000000016',
   'Blue Economy Founders Retreat',
   'Three days with the people building ocean businesses in the Eastern Caribbean.',
   'A working retreat rather than a conference: forty founders, financiers and marine scientists, three days, and a short list of things the region has failed to solve. Sessions on aquaculture financing, marine spatial planning as a business input, and what it takes to insure an ocean venture. Deliberately small, deliberately unfiltered.',
   'conference', 'published',
   'Anguilla Great House, Rendezvous Bay', false,
   NOW() + INTERVAL '100 days', NOW() + INTERVAL '102 days',
   90,
   'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=800&h=600&fit=crop',
   true,
   'a0000000-0000-0000-0000-000000000001',
   NOW() - INTERVAL '35 days',
   ARRAY['blue-economy','ocean','retreat','climate'],
   'sand',
   FALSE, NULL, NULL, NULL,
   TRUE, 'registered'),

  -- 17 — DRAFT. Visible only to its organizer (devon.charles) and admins.
  ('d0000000-0000-0000-0000-000000000017',
   'OECS Fintech Regulatory Sandbox Briefing',
   'Still being planned — a briefing on the proposed regional sandbox for financial services.',
   'Draft event, not yet announced. A half-day briefing for founders and compliance officers on the proposed OECS regulatory sandbox: what it would cover, how an application would work, and what supervisors expect to see. Agenda and speakers pending confirmation from the ECCB.',
   'conference', 'draft',
   'Financial Centre, Bridge Street, Castries, Saint Lucia', false,
   NOW() + INTERVAL '40 days', NOW() + INTERVAL '40 days 6 hours',
   60,
   'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&h=600&fit=crop',
   false,
   'a0000000-0000-0000-0000-000000000002',
   NOW() - INTERVAL '4 days',
   ARRAY['fintech','regulation','policy','finance'],
   NULL,
   FALSE, NULL, NULL, NULL,
   FALSE, 'members'),

  -- 18 — CANCELLED. Still upcoming by date, so the cancelled badge shows
  --      on an event that would otherwise be in the main listing.
  ('d0000000-0000-0000-0000-000000000018',
   'Island Maker Faire 2026',
   'Cancelled — postponed to a date to be confirmed after the venue works.',
   'This year''s maker faire has been cancelled. The Arawak Cultural Complex brought forward its roof works and no alternative venue of the right size was available at short notice. Exhibitor deposits are being refunded in full and a new date will be announced once the works complete. Apologies from the organising team.',
   'meetup', 'cancelled',
   'Arawak Cultural Complex, Roseau, Dominica', false,
   NOW() + INTERVAL '18 days', NOW() + INTERVAL '18 days 8 hours',
   200,
   'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&h=600&fit=crop',
   false,
   'a0000000-0000-0000-0000-000000000007',
   NOW() - INTERVAL '55 days',
   ARRAY['makers','hardware','community','dominica'],
   NULL,
   FALSE, NULL, NULL, NULL,
   FALSE, 'members'),

  -- 19 — past conference, four months back. Has speakers.
  ('d0000000-0000-0000-0000-000000000019',
   'OECS EdTech Summit 2025',
   'Past event — two days on what actually works in Caribbean classrooms.',
   'Past event. Educators, ministry staff and edtech founders from across the OECS spent two days separating what has demonstrably improved outcomes in regional classrooms from what has merely been procured. Produced a shared evaluation checklist now in use by three ministries of education.',
   'conference', 'completed',
   'SVG Community College, Villa, Saint Vincent', false,
   NOW() - INTERVAL '120 days', NOW() - INTERVAL '118 days',
   150,
   'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&h=600&fit=crop',
   false,
   'a0000000-0000-0000-0000-000000000002',
   NOW() - INTERVAL '200 days',
   ARRAY['edtech','education','summit','policy'],
   NULL,
   FALSE, NULL, NULL, NULL,
   FALSE, 'members'),

  -- 20 — long-past virtual hackathon, so "past events" has real depth
  ('d0000000-0000-0000-0000-000000000020',
   'Hurricane Ready Hack',
   'Past event — a 48-hour virtual build on disaster preparedness and response.',
   'Past event. Held ahead of the 2025 season, this fully virtual hackathon put eleven teams onto preparedness and response problems supplied by national disaster management offices. The winning entry — an offline-first shelter capacity tracker that syncs over SMS when the network returns — is now being trialled in two member states.',
   'hackathon', 'completed',
   NULL, true,
   NOW() - INTERVAL '200 days', NOW() - INTERVAL '198 days',
   70,
   'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=800&h=600&fit=crop',
   true,
   'a0000000-0000-0000-0000-000000000001',
   NOW() - INTERVAL '260 days',
   ARRAY['disaster','resilience','hackathon','virtual'],
   NULL,
   TRUE, NOW() - INTERVAL '198 days', 1, 5,
   FALSE, 'members')

ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  tags = EXCLUDED.tags,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  submission_deadline = EXCLUDED.submission_deadline;


-- ============================================================
-- 1b. CUSTOM REGISTRATION FORM for the pitch bootcamp
--
-- Applied as an UPDATE rather than a column on the insert above, matching
-- how seed_extended.sql attaches the hackathon's form. The RSVPs seeded in
-- section 6 answer exactly these fields — an organizer opening the
-- registration queue sees answers to questions the event actually asked.
-- ============================================================

UPDATE events SET registration_fields = '[
  {"id":"company","label":"Company or venture name","type":"text","required":false,"placeholder":"Leave blank if you are pre-company"},
  {"id":"stage","label":"Where are you today?","type":"select","required":true,"options":[{"value":"idea","label":"Idea"},{"value":"prototype","label":"Prototype"},{"value":"pilot","label":"Pilot"},{"value":"revenue","label":"Revenue"}]},
  {"id":"raising","label":"Are you raising?","type":"select","required":true,"options":[{"value":"none","label":"Not raising"},{"value":"grant","label":"Grant funding"},{"value":"pre_seed","label":"Pre-seed"},{"value":"seed","label":"Seed"}]},
  {"id":"deck_url","label":"Link to your current deck","type":"text","required":false,"placeholder":"We will read it before you arrive"}
]'::jsonb
WHERE id = 'd0000000-0000-0000-0000-000000000012';


-- ============================================================
-- 2. BACKFILL the original six
--
-- seed.sql sets neither summary nor tags. useTagVocabulary('events')
-- reads the tag filter's options straight off this column, so without
-- this the filter offers two events' worth of vocabulary. Tag values
-- are deliberately reused across events — a filter that returns a
-- single event per term demonstrates nothing.
-- ============================================================

UPDATE events SET
  summary = 'A 48-hour build sprint for climate-resilient solutions, with seed funding on the line.',
  tags = ARRAY['hackathon','climate','saint-lucia','in-person']
WHERE id = 'd0000000-0000-0000-0000-000000000001';

UPDATE events SET
  summary = 'Build a working soil-moisture monitor and take it home the same day.',
  tags = ARRAY['agritech','iot','workshop','hardware']
WHERE id = 'd0000000-0000-0000-0000-000000000002';

UPDATE events SET
  summary = 'This month''s virtual meetup: coastal erosion monitoring technologies.',
  tags = ARRAY['climate','coastal','networking','virtual']
WHERE id = 'd0000000-0000-0000-0000-000000000003';

UPDATE events SET
  summary = 'Two days on digital transformation, fintech and e-governance across the OECS.',
  tags = ARRAY['digital-economy','fintech','policy','summit']
WHERE id = 'd0000000-0000-0000-0000-000000000004';

UPDATE events SET
  summary = 'Eight FORGE accelerator startups pitch to investors and mentors.',
  tags = ARRAY['showcase','investment','founders','grenada']
WHERE id = 'd0000000-0000-0000-0000-000000000005';

UPDATE events SET
  summary = 'Past event — 120 participants on ocean-based innovation for OECS nations.',
  tags = ARRAY['blue-economy','ocean','climate','summit']
WHERE id = 'd0000000-0000-0000-0000-000000000006';


-- ============================================================
-- 3. SPEAKERS for the four events that warrant a lineup
--
-- Fixed ids under a 6b prefix so re-running updates rather than
-- duplicates. Portrait URLs follow seed.sql's ?w=400&h=400&crop=face
-- convention.
-- ============================================================

INSERT INTO event_speakers (id, event_id, name, title, bio, photo_url, sort_order) VALUES
  -- 10 · Women in Tech Founders Circle
  ('6b000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000010',
   'Keisha Baptiste', 'Founder, AgriTech SVG',
   'Built a sensor network for smallholder farmers across the Grenadines, from a prototype on her kitchen table to a paying deployment in three years.',
   'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=400&h=400&fit=crop&crop=face', 1),
  ('6b000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000010',
   'Camille Fontaine', 'Founder, Heritage Trails Dominica',
   'Works at the intersection of tourism and augmented reality. Talks candidly about bootstrapping a creative-tech business in a small market.',
   'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?w=400&h=400&fit=crop&crop=face', 2),
  ('6b000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000010',
   'Sandra Mitchell', 'Angel investor',
   'Invests in Caribbean cleantech and sustainable agriculture. Sits on the other side of the table and will explain what she actually reads in a deck.',
   'https://images.unsplash.com/photo-1630959305606-3123a081dada?w=400&h=400&fit=crop&crop=face', 3),

  -- 15 · Youth Robotics Showcase
  ('6b000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000015',
   'Dr. Althea Williams', 'Programme lead, OECS Schools Robotics',
   'Marine biologist at UWI who started the regional schools robotics programme after a term of volunteering turned into six.',
   'https://images.unsplash.com/photo-1581518869825-41b2eafe38b7?w=400&h=400&fit=crop&crop=face', 1),
  ('6b000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000015',
   'Tariq Phillip', 'Student mentor, UWI',
   'Computer science undergraduate who came up through the programme himself and now coaches two of the competing teams.',
   'https://images.unsplash.com/photo-1492288991661-058aa541ff43?w=400&h=400&fit=crop&crop=face', 2),

  -- 16 · Blue Economy Founders Retreat
  ('6b000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000016',
   'Marcia Joseph', 'Innovation Director, OECS Commission',
   'Fifteen years in Caribbean development policy and technology transfer. Opens the retreat with what the region has and has not managed to move.',
   'https://images.unsplash.com/photo-1676694047749-ee0fa2709893?w=400&h=400&fit=crop&crop=face', 1),
  ('6b000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000016',
   'Dr. Althea Williams', 'Marine biologist, UWI',
   'Researches reef resilience and works with founders translating marine science into something a business can be built on.',
   'https://images.unsplash.com/photo-1581518869825-41b2eafe38b7?w=400&h=400&fit=crop&crop=face', 2),
  ('6b000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000016',
   'James Pierre', 'Serial entrepreneur and investor',
   'Founded three startups across the Caribbean, two of which failed instructively. Leads the session on insuring an ocean venture.',
   'https://images.unsplash.com/photo-1546884786-4a76106c9191?w=400&h=400&fit=crop&crop=face', 3),

  -- 19 · EdTech Summit (past)
  ('6b000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000019',
   'Devon Charles', 'Senior Programme Officer, OECS Commission',
   'Chaired the summit and led the working group that produced the shared evaluation checklist.',
   'https://images.unsplash.com/photo-1696603865152-74514c198a07?w=400&h=400&fit=crop&crop=face', 1),
  ('6b000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000019',
   'Rashid Mohammed', 'Founder, EduCarib',
   'Building a localised e-learning platform for Caribbean schools. Presented two years of outcome data, including the parts that did not work.',
   'https://images.unsplash.com/photo-1649433658557-54cf58577c68?w=400&h=400&fit=crop&crop=face', 2)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  title = EXCLUDED.title,
  bio = EXCLUDED.bio,
  photo_url = EXCLUDED.photo_url,
  sort_order = EXCLUDED.sort_order;


-- ============================================================
-- 4. AGENDAS for events 15 and 16
--
-- Times are derived from the parent event's own start_date, not
-- from NOW(). seed.sql's hackathon agenda is pinned to NOW() + 30
-- days and so drifts a month away from the hackathon the moment
-- anything moves the event; deriving from start_date means the
-- agenda follows the event wherever it goes.
-- ============================================================

INSERT INTO event_schedule (id, event_id, title, description, start_time, end_time, location, schedule_type, sort_order)
SELECT * FROM (
  SELECT
    '6c000000-0000-0000-0000-000000000001'::uuid, e.id, 'Doors open and team setup',
    'Teams collect their table assignments and run a final calibration on the course.',
    e.start_date, e.start_date + INTERVAL '45 minutes', 'Main hall', 'other', 1
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000015'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000002'::uuid, e.id, 'Opening remarks',
    'Why a regional schools robotics programme, and what the last three cohorts produced.',
    e.start_date + INTERVAL '45 minutes', e.start_date + INTERVAL '1 hour 15 minutes', 'Main hall', 'keynote', 2
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000015'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000003'::uuid, e.id, 'Autonomous runs — round one',
    'Six teams run the course. Two attempts each, best score counts.',
    e.start_date + INTERVAL '1 hour 15 minutes', e.start_date + INTERVAL '2 hours 30 minutes', 'Course floor', 'session', 3
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000015'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000004'::uuid, e.id, 'Lunch and pit walk',
    'Visitors are welcome in the pits. Teams explain their builds.',
    e.start_date + INTERVAL '2 hours 30 minutes', e.start_date + INTERVAL '3 hours 15 minutes', 'Pit area', 'break', 4
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000015'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000005'::uuid, e.id, 'Starting a robotics club at your school',
    'A practical session for teachers: kit budgets, timetabling, and finding a first mentor.',
    e.start_date + INTERVAL '3 hours 15 minutes', e.start_date + INTERVAL '4 hours', 'Seminar room B', 'workshop', 5
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000015'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000006'::uuid, e.id, 'Finals and awards',
    'Top four teams run head to head, followed by the awards presentation.',
    e.start_date + INTERVAL '4 hours', e.start_date + INTERVAL '5 hours', 'Course floor', 'session', 6
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000015'

  -- 16 · Blue Economy Founders Retreat, day one
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000007'::uuid, e.id, 'Arrival and opening dinner',
    'Introductions round the table. Everyone gets ninety seconds and no slides.',
    e.start_date + INTERVAL '9 hours', e.start_date + INTERVAL '11 hours', 'Terrace', 'networking', 1
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000016'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000008'::uuid, e.id, 'What the region has failed to solve',
    'An opening keynote that sets the agenda for the two days by naming the stuck problems.',
    e.start_date + INTERVAL '1 day 1 hour', e.start_date + INTERVAL '1 day 2 hours', 'Great room', 'keynote', 2
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000016'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000009'::uuid, e.id, 'Financing aquaculture at small scale',
    'Working session on why the cheque sizes do not match the ventures, and what has worked anyway.',
    e.start_date + INTERVAL '1 day 2 hours 30 minutes', e.start_date + INTERVAL '1 day 4 hours', 'Great room', 'workshop', 3
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000016'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000010'::uuid, e.id, 'Marine spatial planning as a business input',
    'Where the planning data is, what state it is in, and how to build on it regardless.',
    e.start_date + INTERVAL '1 day 5 hours', e.start_date + INTERVAL '1 day 6 hours 30 minutes', 'Great room', 'session', 4
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000016'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000011'::uuid, e.id, 'Insuring an ocean venture',
    'What underwriters ask for, and what founders can do about the answers before they need cover.',
    e.start_date + INTERVAL '2 days 1 hour', e.start_date + INTERVAL '2 days 2 hours 30 minutes', 'Great room', 'session', 5
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000016'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000012'::uuid, e.id, 'Closing round and commitments',
    'Each participant names one thing they will do differently and who is holding them to it.',
    e.start_date + INTERVAL '2 days 3 hours', e.start_date + INTERVAL '2 days 4 hours', 'Terrace', 'networking', 6
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000016'
) AS agenda(id, event_id, title, description, start_time, end_time, location, schedule_type, sort_order)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  location = EXCLUDED.location,
  schedule_type = EXCLUDED.schedule_type,
  sort_order = EXCLUDED.sort_order;


-- ============================================================
-- 5. CHALLENGE BRIEFS for events 11 and 14
--
-- EventChallengeBrief renders nothing without these. Judging
-- criterion weights sum to 100 per event, matching the shape
-- seed_extended.sql uses for the hackathon and climathon.
-- ============================================================

INSERT INTO event_criteria (id, event_id, kind, title, description, is_required, weight, sort_order) VALUES
  -- 11 · Coastal Data Challenge
  ('6d000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000011',
   'objective', 'Make a decade of shoreline data legible to a non-specialist',
   'The person at the other end is a fisher, a hotelier or a planning officer — not an analyst. If they need a GIS course to use it, it has not met the objective.',
   TRUE, NULL, 1),
  ('6d000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000011',
   'objective', 'Support at least one concrete decision',
   'Name the decision your tool supports and show it being made. "Raises awareness" is not a decision.',
   TRUE, NULL, 2),
  ('6d000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000011',
   'constraint', 'Use only the published survey data and open sources',
   'Proprietary datasets are out — the whole point is that anyone in the region can rebuild and run this.',
   TRUE, NULL, 3),
  ('6d000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000011',
   'constraint', 'Must work on a mid-range phone over a weak connection',
   'Assume 3G and an older Android device. If it only runs on a laptop on hotel wifi, it does not reach the coast.',
   TRUE, NULL, 4),
  ('6d000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000011',
   'deliverable', 'Working prototype with a public URL or installable build',
   'Judges must be able to use it themselves without your help.',
   TRUE, NULL, 5),
  ('6d000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000011',
   'deliverable', 'Three-minute demo video',
   'One take, one user, one decision, start to finish.',
   TRUE, NULL, 6),
  ('6d000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000011',
   'deliverable', 'Source repository with a README a stranger can follow',
   'Optional but weighted — the tools that survive are the ones someone else can pick up.',
   FALSE, NULL, 7),
  ('6d000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000011',
   'judging_criterion', 'Usefulness on the ground',
   'Evidence that a real user would reach for this. Talking to five of them beats guessing well.',
   TRUE, 40.00, 8),
  ('6d000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000011',
   'judging_criterion', 'Clarity of the data presentation',
   'Does the interface make the uncertainty in the data visible, or hide it?',
   TRUE, 25.00, 9),
  ('6d000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000011',
   'judging_criterion', 'Technical execution',
   'Does it work reliably under the stated constraints, and is the code something a maintainer could inherit?',
   TRUE, 20.00, 10),
  ('6d000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000011',
   'judging_criterion', 'Route to a ministry pilot',
   'A credible next step, with a named counterpart if you have one.',
   TRUE, 15.00, 11),

  -- 14 · Renewable Energy Innovation Challenge
  ('6d000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000014',
   'objective', 'Move one lever on the cost of island renewables',
   'Financing, maintenance, grid data or installation. Pick one and be specific about which.',
   TRUE, NULL, 1),
  ('6d000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000014',
   'objective', 'Show the demand, do not assert it',
   'Interviews, letters of intent, a waiting list — something outside your own team saying they want this.',
   TRUE, NULL, 2),
  ('6d000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000014',
   'constraint', 'Deployable in at least two OECS member states',
   'A solution that only works under one country''s regulations is a consultancy project, not a venture.',
   TRUE, NULL, 3),
  ('6d000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000014',
   'constraint', 'Maintainable with locally available skills and parts',
   'If the nearest person who can service it is on another continent, it will be broken within a year.',
   TRUE, NULL, 4),
  ('6d000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000014',
   'deliverable', 'Prototype or technical proof of concept',
   'Hardware, software or a financial model — whichever your lever actually needs.',
   TRUE, NULL, 5),
  ('6d000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000014',
   'deliverable', 'Costed plan for a first installation',
   'Real numbers, named site, and who pays for what.',
   TRUE, NULL, 6),
  ('6d000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000014',
   'judging_criterion', 'Evidence of demand',
   'Weighted highest deliberately. The region does not lack ideas; it lacks ideas someone asked for.',
   TRUE, 35.00, 7),
  ('6d000000-0000-0000-0000-000000000019', 'd0000000-0000-0000-0000-000000000014',
   'judging_criterion', 'Technical feasibility',
   'Does the engineering hold up under island conditions — salt, storms, and intermittent supply?',
   TRUE, 30.00, 8),
  ('6d000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000014',
   'judging_criterion', 'Route to first installation',
   'How close is this to a site, a permit and a signature?',
   TRUE, 25.00, 9),
  ('6d000000-0000-0000-0000-000000000021', 'd0000000-0000-0000-0000-000000000014',
   'judging_criterion', 'Team fit',
   'Has this team any business being the one to build it?',
   TRUE, 10.00, 10)

ON CONFLICT (id) DO UPDATE SET
  kind = EXCLUDED.kind,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  is_required = EXCLUDED.is_required,
  weight = EXCLUDED.weight,
  sort_order = EXCLUDED.sort_order;


-- ============================================================
-- 6. RSVPs
--
-- The point of this block is the status mix. seed.sql seeds only
-- `confirmed` and `checked_in`, which leaves the registration
-- approval queue from migration 096 with nothing in it — approve
-- and decline are unreachable in a demo. So: several `pending`
-- rows awaiting a decision, plus `waitlisted` and `declined` rows
-- carrying the decided_by/decided_at audit pair.
--
-- gen_random_uuid() with ON CONFLICT on the (event_id, user_id)
-- UNIQUE from migration 002 — idempotent without hand-assigned ids.
--
-- Counts stay well under each event's capacity: is_event_full()
-- counts confirmed + checked_in and the BEFORE INSERT trigger
-- raises 'Event is full' rather than skipping the row.
-- ============================================================

INSERT INTO event_rsvps (id, event_id, user_id, status, attendance_type, registration_data, decided_by, decided_at, created_at) VALUES
  -- 09 · Grant Writing Clinic — a queue awaiting decisions
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000005', 'pending', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000006', 'pending', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000007', 'pending', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000009', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '7 days', NOW() - INTERVAL '8 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000012', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '9 days', NOW() - INTERVAL '10 days'),

  -- 10 · Women in Tech Founders Circle
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000005', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '14 days', NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000007', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '13 days', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000009', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '11 days', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000011', 'pending', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '2 days'),

  -- 11 · Coastal Data Challenge — a challenge draws bigger, messier interest
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000005', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '9 days', NOW() - INTERVAL '10 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000008', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '8 days', NOW() - INTERVAL '9 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000009', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '8 days', NOW() - INTERVAL '9 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000010', 'pending', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000006', 'pending', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '4 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000012', 'declined', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '5 days', NOW() - INTERVAL '7 days'),

  -- 12 · Pitch Perfect — capped at 25, and the registration form is custom
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000005', 'confirmed', 'participant',
   '{"company":"AgriTech SVG","stage":"revenue","raising":"seed","deck_url":"https://example.com/agritech-svg-deck"}'::jsonb,
   'a0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '18 days', NOW() - INTERVAL '19 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000006', 'confirmed', 'participant',
   '{"company":"EduCarib","stage":"pilot","raising":"pre_seed","deck_url":"https://example.com/educarib-deck"}'::jsonb,
   'a0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '17 days', NOW() - INTERVAL '18 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000007', 'waitlisted', 'participant',
   '{"company":"Heritage Trails Dominica","stage":"prototype","raising":"grant"}'::jsonb,
   'a0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '11 days', NOW() - INTERVAL '13 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000010', 'waitlisted', 'participant',
   '{"company":"","stage":"idea","raising":"none"}'::jsonb,
   'a0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '10 days', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000008', 'pending', 'participant',
   '{"company":"","stage":"idea","raising":"none"}'::jsonb, NULL, NULL, NOW() - INTERVAL '2 days'),

  -- 13 · Montserrat Digital Skills Fair — open community event, all waved through
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000008', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000012', NOW() - INTERVAL '20 days', NOW() - INTERVAL '21 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000009', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000012', NOW() - INTERVAL '20 days', NOW() - INTERVAL '21 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000010', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000012', NOW() - INTERVAL '19 days', NOW() - INTERVAL '20 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000006', 'cancelled', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '18 days'),

  -- 14 · Renewable Energy Challenge
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000008', 'pending', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000009', 'pending', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000012', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000011', NOW() - INTERVAL '5 days', NOW() - INTERVAL '6 days'),

  -- 15 · Youth Robotics Showcase — spectators enabled, so viewers show up here
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000008', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '30 days', NOW() - INTERVAL '32 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000009', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '30 days', NOW() - INTERVAL '32 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000011', 'confirmed', 'viewer', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '25 days', NOW() - INTERVAL '26 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000012', 'confirmed', 'viewer', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '24 days', NOW() - INTERVAL '25 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000007', 'pending', 'viewer', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '1 day'),

  -- 16 · Blue Economy Retreat — small and curated, so a real waitlist
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000003', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '28 days', NOW() - INTERVAL '30 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000004', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '28 days', NOW() - INTERVAL '30 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000011', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '27 days', NOW() - INTERVAL '29 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000005', 'waitlisted', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '15 days', NOW() - INTERVAL '17 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000006', 'pending', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000012', 'declined', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '12 days', NOW() - INTERVAL '16 days'),

  -- 19 · EdTech Summit (past) — attendance was taken
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000006', 'checked_in', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '130 days', NOW() - INTERVAL '140 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000008', 'checked_in', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '130 days', NOW() - INTERVAL '141 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000010', 'checked_in', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '130 days', NOW() - INTERVAL '142 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000007', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '135 days', NOW() - INTERVAL '145 days'),

  -- 20 · Hurricane Ready Hack (past)
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000005', 'checked_in', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '205 days', NOW() - INTERVAL '215 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000008', 'checked_in', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '205 days', NOW() - INTERVAL '216 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000009', 'checked_in', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '205 days', NOW() - INTERVAL '217 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000012', 'cancelled', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '220 days')

ON CONFLICT (event_id, user_id) DO UPDATE SET
  status = EXCLUDED.status,
  attendance_type = EXCLUDED.attendance_type,
  registration_data = EXCLUDED.registration_data,
  decided_by = EXCLUDED.decided_by,
  decided_at = EXCLUDED.decided_at;


-- ============================================================
-- DONE
--
-- Totals across all three seed files:
--   20 events — hackathon 4, conference 5, meetup 4, workshop 3,
--   challenge 2, demo_day 2; published 14, completed 4, draft 1,
--   cancelled 1; 6 virtual.
--
-- Dates here are computed at seed time. Run
-- `npm run seed:events` (scripts/refresh-event-dates.mjs) to slide
-- them back around today on a database seeded a while ago.
-- ============================================================
