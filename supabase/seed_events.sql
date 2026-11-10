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
-- src/lib/event-blueprints.ts: no location, no capacity, a
-- submission deadline and a team size instead. end_date is set to
-- the submission deadline: eventPhase (src/lib/event-timing.ts)
-- reads a NULL end as start + 24h, which marked a three-week
-- challenge as ended the day after it opened.
--
-- Upcoming events use absolute dates, mostly closing late January to
-- February 2027, so they rarely need moving. Past events stay
-- NOW()-relative so they are always in the past.
-- ============================================================

INSERT INTO events (id, title, summary, description, event_type, status, location, is_virtual,
                    start_date, end_date, capacity, image_url, is_climate_action,
                    organizer_id, created_at, tags, accent_color,
                    has_challenge, submission_deadline, team_size_min, team_size_max,
                    spectators_enabled, spectator_scope) VALUES

  -- 09 — near-term virtual workshop
  ('d0000000-0000-0000-0000-000000000009',
   'Grant Writing Clinic for Climate Founders',
   'Four hours on Zoom turning your climate project into a proposal a fund will read.',
   'For founders getting ready to apply to the GCF readiness window, the Caribbean Development Bank or the smaller regional climate funds. Bring a two-page concept note, even a rough one. The OECS Commission grants team goes through budgets and the theory of change in small groups, and by the end you will have a list of three or four funds that take projects at your stage. Last time most people found their budget was the weakest part, so bring your numbers.',
   'workshop', 'published',
   NULL, true,
   '2027-01-14 14:00+00', '2027-01-14 18:00+00',
   40,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000009.webp',
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
   'Short talks from three founders, then an open floor, for women building tech companies in the OECS.',
   'Three founders talk about what their last year cost them in hiring, in money and in the parts nobody puts on LinkedIn. Each gets fifteen minutes, then the floor is open. After that we pair people up by sector for half an hour so nobody spends the evening by the drinks table alone. Open to women and non-binary people working in tech or trying to get into it, from any member state. Light food from a St. John''s caterer.',
   'meetup', 'published',
   'Sir Vivian Richards Cricket Ground Pavilion, North Sound, Antigua', false,
   '2027-01-21 22:00+00', '2027-01-22 00:30+00',
   50,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000010.webp',
   false,
   'a0000000-0000-0000-0000-000000000001',
   NOW() - INTERVAL '18 days',
   ARRAY['women-in-tech','networking','founders','community'],
   NULL,
   FALSE, NULL, NULL, NULL,
   FALSE, 'members'),

  -- 11 — challenge (virtual-only blueprint: no location/capacity; end = deadline)
  ('d0000000-0000-0000-0000-000000000011',
   'Coastal Data Challenge',
   'Build an open tool that puts ten years of OECS shoreline data in front of the people who live on the coast.',
   'Three weeks, teams of one to four. We are releasing ten years of beach profile surveys from Dominica, Saint Lucia, Grenada and Saint Vincent. Your job is to turn them into something a fisher in Soufriere, a hotel manager on Grand Anse or a physical planning officer in Kingstown can use to make a real call, like where to haul boats or whether to approve a seawall. Judges score how useful it is on the ground, and a clever model nobody opens will score badly. The winning team gets six months of mentoring and help taking the tool to a ministry pilot.',
   'challenge', 'published',
   NULL, true,
   '2027-01-11 13:00+00', '2027-02-01 03:59+00',
   NULL,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000011.webp',
   true,
   'a0000000-0000-0000-0000-000000000003',
   NOW() - INTERVAL '12 days',
   ARRAY['challenge','coastal','data','climate'],
   NULL,
   TRUE, '2027-02-01 03:59+00', 1, 4,
   FALSE, 'members'),

  -- 12 — in-person workshop, Saint Kitts (has a custom registration form)
  ('d0000000-0000-0000-0000-000000000012',
   'Pitch Perfect: Investor Readiness Bootcamp',
   'A full day in Frigate Bay reworking your pitch in front of people who actually write cheques.',
   'You come in with a deck and you go home with a different one. The morning is about the story and the numbers under it, mostly unit economics and what you will spend the money on. After lunch you pitch live to a panel of investors and operators from Basseterre, Barbados and Trinidad, and they change seats every hour so you hear more than one opinion. We stop at 25 people so everybody pitches twice.',
   'workshop', 'published',
   'St. Kitts Marriott Resort, Frigate Bay', false,
   '2027-01-28 13:00+00', '2027-01-28 21:00+00',
   25,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000012.webp',
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
   'Free short classes, help with your phone or laptop, and career advice at the Cultural Centre.',
   'An open day at the Cultural Centre in Little Bay. Thirty-minute classes on Excel, staying safe online, freelancing and building a simple website run over and over through the day, so come when it suits you. Bring your own laptop or use one of the twenty we will have set up. Employers from Brades and the training providers have tables along the back wall if you want to talk about work or courses. Free, and everyone is welcome, from school leavers to retirees.',
   'meetup', 'published',
   'Montserrat Cultural Centre, Little Bay', false,
   '2027-02-04 14:00+00', '2027-02-04 20:00+00',
   120,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000013.webp',
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
   'Help a small island burn less diesel for its power. Teams of two to five, about six weeks.',
   'Most households in the OECS pay well over 30 US cents a kilowatt-hour, and the grids still run mostly on imported diesel. Panels are not the hard part. Projects stall on financing and maintenance, and on grid data nobody has cleaned up, and Dominica''s geothermal plans show how long the paperwork alone can take. Pick one of those problems, propose a fix and build a prototype. Teams of two to five from any member state. Judges look for proof that someone wants it, engineering that holds up, and a believable path to a first installation.',
   'challenge', 'published',
   NULL, true,
   '2027-01-18 13:00+00', '2027-02-26 23:00+00',
   NULL,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000014.webp',
   true,
   'a0000000-0000-0000-0000-000000000011',
   NOW() - INTERVAL '8 days',
   ARRAY['challenge','energy','climate','renewables'],
   NULL,
   TRUE, '2027-02-26 23:00+00', 2, 5,
   FALSE, 'members'),

  -- 15 — demo day, Grenada. Speakers + agenda hang off this one.
  ('d0000000-0000-0000-0000-000000000015',
   'OECS Youth Robotics Showcase',
   'Twelve secondary school teams run the robots they spent a whole term building.',
   'This is the end-of-term showcase for the regional schools robotics programme. Twelve teams from six member states run their robots on the same course with nobody touching the controls, and engineers from around the region do the judging. Families and teachers are welcome. If you are thinking of starting a club at your own school, stay for the session at midday, which covers what it costs and how to find a mentor.',
   'demo_day', 'published',
   'Grenada Trade Centre, Morne Rouge', false,
   '2027-02-18 13:00+00', '2027-02-18 18:00+00',
   180,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000015.webp',
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
   'Three days in Rendezvous Bay with people building ocean businesses in the Eastern Caribbean.',
   'We are calling it a retreat because it is not a conference. About forty founders, lenders and marine scientists spend three days on problems the region keeps failing to solve, like financing seamoss and fish farms at small scale, using the marine spatial plans in a business case, and getting insurance for a boat-based venture after a bad hurricane season. Sargassum will come up whether it is on the agenda or not. We keep the group small so people say what they really think.',
   'conference', 'published',
   'Anguilla Great House, Rendezvous Bay', false,
   '2027-02-26 13:00+00', '2027-02-28 20:00+00',
   90,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000016.webp',
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
   'Still in planning. A briefing on the proposed regional sandbox for fintech and payments.',
   'Draft, not announced yet. A half-day briefing in Castries for founders and compliance officers on the proposed OECS regulatory sandbox. We will cover which products it would take, how to apply, how long testing would run and what the supervisors at the ECCB want to see in an application. Speakers and the final agenda depend on the ECCB confirming who they can send.',
   'conference', 'draft',
   'Financial Centre, Bridge Street, Castries, Saint Lucia', false,
   '2027-02-15 14:00+00', '2027-02-15 20:00+00',
   60,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000017.webp',
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
   'Island Maker Faire',
   'Cancelled. We will set a new date once the venue''s roof repairs are finished.',
   'We have had to cancel the maker faire. The Arawak Cultural Complex moved its roof repairs forward, and nowhere else in Roseau could take 200 people and forty exhibitor tables at short notice. Every exhibitor deposit is being refunded in full, and you should see it within ten working days. We will post the new date here as soon as the works are done. Sorry to everyone who had already planned the trip.',
   'meetup', 'cancelled',
   'Arawak Cultural Complex, Roseau, Dominica', false,
   '2027-01-30 13:00+00', '2027-01-30 21:00+00',
   200,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000018.webp',
   false,
   'a0000000-0000-0000-0000-000000000007',
   NOW() - INTERVAL '55 days',
   ARRAY['makers','hardware','community','dominica'],
   NULL,
   FALSE, NULL, NULL, NULL,
   FALSE, 'members'),

  -- 19 — past conference, four months back. Has speakers.
  ('d0000000-0000-0000-0000-000000000019',
   'OECS EdTech Summit',
   'Past event. Two days in Kingstown on what works in Caribbean classrooms and what does not.',
   'Past event. Teachers, ministry staff and edtech founders from across the OECS spent two days at the Villa campus sorting the tools that improved results in our classrooms from the ones that were bought and then left in a cupboard. The working group came out of it with a one-page evaluation checklist, and the ministries of education in Saint Vincent, Grenada and Saint Lucia now use it before they buy.',
   'conference', 'completed',
   'SVG Community College, Villa, Saint Vincent', false,
   NOW() - INTERVAL '120 days', NOW() - INTERVAL '118 days',
   150,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000019.webp',
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
   'Past event. A 48-hour online build on getting ready for hurricanes and responding after them.',
   'Past event. We ran it online before hurricane season, and eleven teams worked on problems sent in by the national disaster offices, including NEMO in Saint Lucia and NaDMA in Grenada. The winners built a shelter tracker that works with no signal and sends its counts by SMS once the network comes back. Two member states are now trying it out.',
   'hackathon', 'completed',
   NULL, true,
   NOW() - INTERVAL '200 days', NOW() - INTERVAL '198 days',
   70,
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/event-images/seed/events/d0000000-0000-0000-0000-000000000020.webp',
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
  summary = 'Six days in Rodney Bay building tools for a hotter, stormier region, with seed funding for the winners.',
  tags = ARRAY['hackathon','climate','saint-lucia','in-person']
WHERE id = 'd0000000-0000-0000-0000-000000000001';

UPDATE events SET
  summary = 'Build a soil moisture sensor that works and take it home to your plot the same day.',
  tags = ARRAY['agritech','iot','workshop','hardware']
WHERE id = 'd0000000-0000-0000-0000-000000000002';

UPDATE events SET
  summary = 'An online meetup on the drones, sensors and cheap survey kits people use to track coastal erosion.',
  tags = ARRAY['climate','coastal','networking','virtual']
WHERE id = 'd0000000-0000-0000-0000-000000000003';

UPDATE events SET
  summary = 'Two days on DCash, online government services and what it takes to move public records off paper.',
  tags = ARRAY['digital-economy','fintech','policy','summit']
WHERE id = 'd0000000-0000-0000-0000-000000000004';

UPDATE events SET
  summary = 'Eight startups from the third accelerator cohort pitch to investors and mentors in St. George''s.',
  tags = ARRAY['showcase','investment','founders','grenada']
WHERE id = 'd0000000-0000-0000-0000-000000000005';

UPDATE events SET
  summary = 'Past event. 120 people spent two days in Antigua working through fisheries and sargassum.',
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
   'Keisha Baptiste', 'Founder, AgriSense SVG',
   'Started with one soil sensor on her kitchen table in Kingstown. Three years later AgriSense SVG has paying farmers on Bequia, Union Island and the mainland, and she will tell you which year nearly ended it.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000005.webp', 1),
  ('6b000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000010',
   'Camille Fontaine', 'Founder, Dominica Heritage Trails',
   'Builds augmented reality walking tours of Roseau and the Kalinago Territory for cruise visitors. Paid for the first version out of a day job, and is honest about how small the home market is.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000007.webp', 2),
  ('6b000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000010',
   'Sandra Mitchell', 'Angel investor',
   'Angel investor in Caribbean clean energy and farming businesses. She sits across the table from founders most weeks and will tell you which three slides she reads first.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000011.webp', 3),

  -- 15 · Youth Robotics Showcase
  ('6b000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000015',
   'Dr. Althea Williams', 'Programme lead, OECS Schools Robotics',
   'Marine biologist at UWI. She offered to help one school in St. George''s build an underwater drone for a term, and six terms later she was running the regional programme.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000003.webp', 1),
  ('6b000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000015',
   'Tariq Phillip', 'Student mentor, UWI',
   'Computer science student at UWI from Antigua. He competed in the programme at secondary school and now coaches two of the teams on the floor today.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000008.webp', 2),

  -- 16 · Blue Economy Founders Retreat
  ('6b000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000016',
   'Marcia Joseph', 'Programmes Director, OECS Commission',
   'Has spent fifteen years on development policy and technology transfer in the region, most of it from Castries. She opens the retreat with an honest list of what moved and what did not.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000001.webp', 1),
  ('6b000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000016',
   'Dr. Althea Williams', 'Marine biologist, UWI',
   'Studies how reefs off Grenada recover after bleaching and storms. Spends a good part of her week helping founders work out which marine data they can build a business on.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000003.webp', 2),
  ('6b000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000016',
   'James Pierre', 'Serial entrepreneur and investor',
   'Started three companies in the Caribbean. Two of them failed, and he learned more from those than from the one that worked. He leads the session on insuring an ocean venture.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000004.webp', 3),

  -- 19 · EdTech Summit (past)
  ('6b000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000019',
   'Devon Charles', 'Senior Programme Officer, OECS Commission',
   'Chaired both days and ran the working group that wrote the one-page evaluation checklist the ministries now use.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000002.webp', 1),
  ('6b000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000019',
   'Rashid Mohammed', 'Founder, EduCarib Platform',
   'Runs EduCarib Platform, online lessons written for the CSEC syllabus. Showed two years of results from schools using it, including the term when usage fell by half.',
   'https://jwvjzxqgbctttfbvrgmi.supabase.co/storage/v1/object/public/avatars/seed/people/a0000000-0000-0000-0000-000000000006.webp', 2)

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
    'Teams pick up their table numbers and get one last calibration run on the course.',
    e.start_date, e.start_date + INTERVAL '45 minutes', 'Main hall', 'other', 1
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000015'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000002'::uuid, e.id, 'Opening remarks',
    'Why the programme started, and what the last three groups of students went on to build.',
    e.start_date + INTERVAL '45 minutes', e.start_date + INTERVAL '1 hour 15 minutes', 'Main hall', 'keynote', 2
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000015'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000003'::uuid, e.id, 'Autonomous runs, round one',
    'Six teams run the course. Each gets two tries and the better score counts.',
    e.start_date + INTERVAL '1 hour 15 minutes', e.start_date + INTERVAL '2 hours 30 minutes', 'Course floor', 'session', 3
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000015'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000004'::uuid, e.id, 'Lunch and pit walk',
    'Walk through the pits and ask the teams how they built their robots. Lunch is outside.',
    e.start_date + INTERVAL '2 hours 30 minutes', e.start_date + INTERVAL '3 hours 15 minutes', 'Pit area', 'break', 4
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000015'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000005'::uuid, e.id, 'Starting a robotics club at your school',
    'For teachers. What a starter kit costs (about EC$1,500), where it fits in the timetable and how to find your first mentor.',
    e.start_date + INTERVAL '3 hours 15 minutes', e.start_date + INTERVAL '4 hours', 'Seminar room B', 'workshop', 5
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000015'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000006'::uuid, e.id, 'Finals and awards',
    'The top four teams go head to head, then we hand out the awards.',
    e.start_date + INTERVAL '4 hours', e.start_date + INTERVAL '5 hours', 'Course floor', 'session', 6
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000015'

  -- 16 · Blue Economy Founders Retreat, day one
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000007'::uuid, e.id, 'Arrival and opening dinner',
    'Introductions around the table. Everybody gets ninety seconds and nobody gets slides.',
    e.start_date + INTERVAL '9 hours', e.start_date + INTERVAL '11 hours', 'Terrace', 'networking', 1
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000016'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000008'::uuid, e.id, 'What the region has failed to solve',
    'The opening talk names the problems that have been stuck for years and sets the plan for the next two days.',
    e.start_date + INTERVAL '1 day 1 hour', e.start_date + INTERVAL '1 day 2 hours', 'Great room', 'keynote', 2
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000016'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000009'::uuid, e.id, 'Financing aquaculture at small scale',
    'Banks lend too little and funds want to put in too much. We look at why, and at the few seamoss and fish farm deals that got done anyway.',
    e.start_date + INTERVAL '1 day 2 hours 30 minutes', e.start_date + INTERVAL '1 day 4 hours', 'Great room', 'workshop', 3
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000016'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000010'::uuid, e.id, 'Marine spatial planning as a business input',
    'Where the marine planning data lives, how patchy it is, and how to build a business case on it anyway.',
    e.start_date + INTERVAL '1 day 5 hours', e.start_date + INTERVAL '1 day 6 hours 30 minutes', 'Great room', 'session', 4
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000016'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000011'::uuid, e.id, 'Insuring an ocean venture',
    'What underwriters ask for, and what to fix before you go looking for cover.',
    e.start_date + INTERVAL '2 days 1 hour', e.start_date + INTERVAL '2 days 2 hours 30 minutes', 'Great room', 'session', 5
  FROM events e WHERE e.id = 'd0000000-0000-0000-0000-000000000016'
  UNION ALL
  SELECT
    '6c000000-0000-0000-0000-000000000012'::uuid, e.id, 'Closing round and commitments',
    'Each person names one thing they will change when they get home, and someone in the room who will check on them.',
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
   'objective', 'Make ten years of shoreline data readable by someone who is not a specialist',
   'The person using it is a fisher, a hotel manager or a planning officer, and none of them are analysts. If they need a GIS course first, it has not met the objective.',
   TRUE, NULL, 1),
  ('6d000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000011',
   'objective', 'Support at least one concrete decision',
   'Say which decision your tool helps with and show someone making it. "Raises awareness" does not count as a decision.',
   TRUE, NULL, 2),
  ('6d000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000011',
   'constraint', 'Use only the published survey data and open sources',
   'No paid or private datasets. Anyone in the region should be able to rebuild this and run it themselves.',
   TRUE, NULL, 3),
  ('6d000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000011',
   'constraint', 'Must work on a mid-range phone over a weak connection',
   'Assume a three-year-old Android phone on 3G. If it only runs on a laptop on hotel wifi, it will never reach the people on the beach.',
   TRUE, NULL, 4),
  ('6d000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000011',
   'deliverable', 'Working prototype with a public URL or installable build',
   'The judges will try it on their own, without you there to explain it.',
   TRUE, NULL, 5),
  ('6d000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000011',
   'deliverable', 'Three-minute demo video',
   'Show one person using it to make one decision, from opening the app to the answer. No editing tricks.',
   TRUE, NULL, 6),
  ('6d000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000011',
   'deliverable', 'Source repository with a README a stranger can follow',
   'Optional, but it counts in the scoring. The tools that last are the ones somebody else can pick up and keep running.',
   FALSE, NULL, 7),
  ('6d000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000011',
   'judging_criterion', 'Usefulness on the ground',
   'Show us a real user would reach for this. Five conversations with fishers or planners beat a clever guess.',
   TRUE, 40.00, 8),
  ('6d000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000011',
   'judging_criterion', 'Clarity of the data presentation',
   'Some survey years have gaps and some readings are rough. We score whether the screen shows that honestly.',
   TRUE, 25.00, 9),
  ('6d000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000011',
   'judging_criterion', 'Technical execution',
   'It has to keep working on a weak phone and a slow connection, and the code has to be something another developer could take over.',
   TRUE, 20.00, 10),
  ('6d000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000011',
   'judging_criterion', 'Route to a ministry pilot',
   'A believable next step, with the name of someone in a ministry if you have one.',
   TRUE, 15.00, 11),

  -- 14 · Renewable Energy Innovation Challenge
  ('6d000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000014',
   'objective', 'Move one lever on the cost of island renewables',
   'Financing, maintenance, grid data or installation. Choose one and tell us exactly which.',
   TRUE, NULL, 1),
  ('6d000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000014',
   'objective', 'Show the demand, do not assert it',
   'Interview notes, a letter of intent from a utility or a hotel, a waiting list. We need someone outside your team saying they want it.',
   TRUE, NULL, 2),
  ('6d000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000014',
   'constraint', 'Deployable in at least two OECS member states',
   'If it only works under one country''s electricity rules, it is a consultancy job and we are looking for a business.',
   TRUE, NULL, 3),
  ('6d000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000014',
   'constraint', 'Maintainable with locally available skills and parts',
   'If the nearest technician who can fix it is in Miami, it will be broken within a year.',
   TRUE, NULL, 4),
  ('6d000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000014',
   'deliverable', 'Prototype or technical proof of concept',
   'Hardware, software or a financial model, whichever your problem calls for.',
   TRUE, NULL, 5),
  ('6d000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000014',
   'deliverable', 'Costed plan for a first installation',
   'Real costs in EC dollars, a named site and who pays for each part.',
   TRUE, NULL, 6),
  ('6d000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000014',
   'judging_criterion', 'Evidence of demand',
   'This carries the most weight on purpose. The region has plenty of ideas. It has far fewer that anyone asked for.',
   TRUE, 35.00, 7),
  ('6d000000-0000-0000-0000-000000000019', 'd0000000-0000-0000-0000-000000000014',
   'judging_criterion', 'Technical feasibility',
   'The engineering has to survive island conditions: salt air, hurricane winds and a supply that cuts out.',
   TRUE, 30.00, 8),
  ('6d000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000014',
   'judging_criterion', 'Route to first installation',
   'We score how close you are to a site, a permit and a signed agreement.',
   TRUE, 25.00, 9),
  ('6d000000-0000-0000-0000-000000000021', 'd0000000-0000-0000-0000-000000000014',
   'judging_criterion', 'Team fit',
   'Why this team should be the one to build it. Relevant trade skills count as much as degrees.',
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
--
-- a0…10 (Marcus George) is the one unverified persona, and since
-- migration 205 unverified accounts cannot RSVP, so he has no rows
-- here. His old slots went to a0…07, a0…09 and a0…05.
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
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000007', 'pending', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000006', 'pending', 'participant', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '4 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000012', 'declined', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '5 days', NOW() - INTERVAL '7 days'),

  -- 12 · Pitch Perfect — capped at 25, and the registration form is custom
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000005', 'confirmed', 'participant',
   '{"company":"AgriSense SVG","stage":"revenue","raising":"seed","deck_url":"https://example.com/agrisense-svg-deck"}'::jsonb,
   'a0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '18 days', NOW() - INTERVAL '19 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000006', 'confirmed', 'participant',
   '{"company":"EduCarib Platform","stage":"pilot","raising":"pre_seed","deck_url":"https://example.com/educarib-deck"}'::jsonb,
   'a0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '17 days', NOW() - INTERVAL '18 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000007', 'waitlisted', 'participant',
   '{"company":"Dominica Heritage Trails","stage":"prototype","raising":"grant"}'::jsonb,
   'a0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '11 days', NOW() - INTERVAL '13 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000009', 'waitlisted', 'participant',
   '{"company":"ReefWatch AI","stage":"prototype","raising":"grant"}'::jsonb,
   'a0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '10 days', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000008', 'pending', 'participant',
   '{"company":"","stage":"idea","raising":"none"}'::jsonb, NULL, NULL, NOW() - INTERVAL '2 days'),

  -- 13 · Montserrat Digital Skills Fair — open community event, all waved through
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000008', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000012', NOW() - INTERVAL '20 days', NOW() - INTERVAL '21 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000009', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000012', NOW() - INTERVAL '20 days', NOW() - INTERVAL '21 days'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000007', 'confirmed', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000012', NOW() - INTERVAL '19 days', NOW() - INTERVAL '20 days'),
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
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000005', 'checked_in', 'participant', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '130 days', NOW() - INTERVAL '142 days'),
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
-- Upcoming dates are fixed; past ones are computed at seed time.
-- `npm run seed:dates` re-applies these dates on a database seeded
-- a while ago.
-- ============================================================
