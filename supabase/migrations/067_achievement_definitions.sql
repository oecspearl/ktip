-- ============================================================
-- Migration 067: Achievement definitions, collections, trophy slots
--
-- Data only — the engine lives in 066. Split deliberately: tuning a
-- threshold or adding a badge should never mean re-reading engine SQL,
-- and the admin screen writes the same rows through admin_upsert_badge().
--
-- Every INSERT is ON CONFLICT DO UPDATE, so re-running this file
-- re-syncs definitions to whatever is written here. That means it will
-- overwrite admin edits made through /admin/achievements — intentional,
-- this file is the source of truth for the shipped set.
--
-- The six badges seeded by 039 are updated in place rather than
-- replaced, so existing user_badges rows keep pointing at them.
-- Their meanings are preserved exactly: popular_project still means
-- "one project reached 25 likes" (top_project_likes), not a lifetime
-- total, and community_voice still counts posts + replies combined.
--
-- Points are never written by hand — rarity_points(rarity) derives
-- them, so the rarity/points relationship cannot drift.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. TROPHY SLOTS
-- 13 types x 4 tiers = 52 rows seeded with no image. The admin grid
-- renders one cell per row, so an empty grid is visibly complete
-- rather than looking broken, and each cell has somewhere to upload
-- into. Badges with no trophy_type fall back to the 'star' type.
-- ============================================================

INSERT INTO trophy_assets (type, tier, image_url, alt_text, sort_order)
SELECT t.type, tier.tier, NULL, '', t.ord
FROM (VALUES
  ('rocket',    1),  -- projects
  ('seedling',  2),  -- grants and funding
  ('podium',    3),  -- events
  ('megaphone', 4),  -- forums and community
  ('handshake', 5),  -- connections and messaging
  ('scroll',    6),  -- collaboration: docs, whiteboards, snippets
  ('compass',   7),  -- profile and onboarding
  ('flame',     8),  -- streaks and dedication
  ('beaker',    9),  -- research and published resources
  ('anchor',   10),  -- identity, verification, regional standing
  ('crown',    11),  -- points, rank, meta
  ('key',      12),  -- hidden achievements
  ('star',     13)   -- generic fallback for anything unmapped
) AS t(type, ord)
CROSS JOIN (VALUES ('bronze'), ('silver'), ('gold'), ('diamond')) AS tier(tier)
ON CONFLICT (type, tier) DO NOTHING;

-- ============================================================
-- 2. BADGE DEFINITIONS
--
-- Columns, in order:
--   slug, name, description, icon, color, category, rarity,
--   tier, tier_group, check_key, check_value, is_hidden,
--   sort_order, trophy_type
--
-- `color` maps to a pill style in AchievementBadge.tsx. 039 used
-- 'ocean' | 'tropical' | 'sand'; 'sun' is added here for the highest
-- tiers, and the component gains the matching entry. All four are
-- existing OECS primitives — no new colour is invented, and the
-- shades chosen respect the contrast rule in index.css (green and
-- yellow need 700+ to be legible as text on white).
-- ============================================================

INSERT INTO badges (
  slug, name, description, icon, color, category, rarity, points,
  tier, tier_group, check_key, check_value, is_hidden, sort_order, trophy_type
)
SELECT
  d.slug, d.name, d.description, d.icon, d.color, d.category, d.rarity,
  rarity_points(d.rarity),
  d.tier, d.tier_group, d.check_key, d.check_value, d.is_hidden, d.sort_order, d.trophy_type
FROM (VALUES
  -- ---------- Projects ----------
  ('first_project',      'Innovator',          'Created your first project',                          'rocket',         'ocean',    'projects', 'common',    'bronze',  'projects',      'projects_created',       1,   FALSE, 10,  'rocket'),
  ('project_builder',    'Project Builder',    'Created 5 projects',                                  'rocket',         'ocean',    'projects', 'uncommon',  'silver',  'projects',      'projects_created',       5,   FALSE, 11,  'rocket'),
  ('serial_innovator',   'Serial Innovator',   'Created 15 projects',                                 'rocket',         'ocean',    'projects', 'rare',      'gold',    'projects',      'projects_created',       15,  FALSE, 12,  'rocket'),
  ('project_luminary',   'Project Luminary',   'Created 40 projects',                                 'rocket',         'ocean',    'projects', 'epic',      'diamond', 'projects',      'projects_created',       40,  FALSE, 13,  'rocket'),
  ('first_spark',        'First Spark',        'Your projects earned their first 5 likes',            'heart',          'tropical', 'projects', 'common',    'bronze',  'project_likes', 'project_likes_received', 5,   FALSE, 14,  'rocket'),
  -- Unchanged rule from 039: 25 likes on a single project.
  ('popular_project',    'Crowd Favourite',    'One of your projects reached 25 likes',               'heart',          'tropical', 'projects', 'uncommon',  'silver',  'project_likes', 'top_project_likes',      25,  FALSE, 15,  'rocket'),
  ('viral_project',      'Runaway Success',    'One of your projects reached 100 likes',              'heart',          'tropical', 'projects', 'rare',      'gold',    'project_likes', 'top_project_likes',      100, FALSE, 16,  'rocket'),
  ('project_launched',   'Launch Day',         'Took a project all the way to launch',                'rocket',         'sand',     'projects', 'rare',      NULL,      NULL,            'projects_launched',      1,   FALSE, 17,  'rocket'),
  ('wide_reach',         'Wide Reach',         'Your projects have been viewed 1,000 times',          'eye',            'sand',     'projects', 'rare',      NULL,      NULL,            'project_views',          1000,FALSE, 18,  'rocket'),
  ('team_player',        'Team Player',        'Joined 3 project teams',                              'users',          'ocean',    'projects', 'uncommon',  NULL,      NULL,            'project_collaborations', 3,   FALSE, 19,  'rocket'),

  -- ---------- Grants and funding ----------
  ('first_application',  'First Ask',          'Submitted your first grant application',              'file-text',      'sand',     'grants',   'common',    'bronze',  'grants',        'grant_applications',     1,   FALSE, 20,  'seedling'),
  ('persistent_applicant','Persistent',        'Submitted 5 grant applications',                      'file-text',      'sand',     'grants',   'uncommon',  'silver',  'grants',        'grant_applications',     5,   FALSE, 21,  'seedling'),
  ('funded',             'Funded',             'Had a grant application approved',                    'wallet',         'tropical', 'grants',   'epic',      'gold',    'grants',        'grants_approved',        1,   FALSE, 22,  'seedling'),
  ('multi_funded',       'Multi-Funded',       'Had 3 grant applications approved',                   'wallet',         'tropical', 'grants',   'legendary', 'diamond', 'grants',        'grants_approved',        3,   FALSE, 23,  'seedling'),
  ('sponsor',            'Sponsor',            'Sponsored a student grant application',               'graduation-cap', 'ocean',    'grants',   'rare',      NULL,      NULL,            'sponsorships_given',     1,   FALSE, 24,  'seedling'),
  ('student_champion',   'Champion of Students','Sponsored 5 student grant applications',             'graduation-cap', 'ocean',    'grants',   'epic',      NULL,      NULL,            'sponsorships_given',     5,   FALSE, 25,  'seedling'),

  -- ---------- Events ----------
  ('event_goer',         'Event Goer',         'RSVP''d to your first event',                         'calendar',       'sand',     'events',   'common',    'bronze',  'events',        'events_rsvpd',           1,   FALSE, 30,  'podium'),
  ('regular_attendee',   'Regular',            'RSVP''d to 5 events',                                 'calendar',       'sand',     'events',   'uncommon',  'silver',  'events',        'events_rsvpd',           5,   FALSE, 31,  'podium'),
  -- Turning up counts for more than signing up.
  ('showed_up',          'Showed Up',          'Checked in at an event',                              'check-circle',   'tropical', 'events',   'uncommon',  NULL,      NULL,            'events_attended',        1,   FALSE, 32,  'podium'),
  ('front_row',          'Front Row',          'Checked in at 5 events',                              'check-circle',   'tropical', 'events',   'rare',      'gold',    'events',        'events_attended',        5,   FALSE, 33,  'podium'),
  ('event_host',         'Host',               'Organized an event',                                  'megaphone',      'ocean',    'events',   'rare',      NULL,      NULL,            'events_organized',       1,   FALSE, 34,  'podium'),
  ('convener',           'Convener',           'Organized 5 events',                                  'megaphone',      'ocean',    'events',   'epic',      'diamond', 'events',        'events_organized',       5,   FALSE, 35,  'podium'),

  -- ---------- Community ----------
  ('first_post',         'First Word',         'Made your first forum post or reply',                 'message-square', 'sand',     'community','common',    'bronze',  'forums',        'forum_activity',         1,   FALSE, 40,  'megaphone'),
  ('community_voice',    'Community Voice',    'Posted 10 times in the forums',                       'message-square', 'sand',     'community','uncommon',  'silver',  'forums',        'forum_activity',         10,  FALSE, 41,  'megaphone'),
  ('forum_pillar',       'Forum Pillar',       'Posted 50 times in the forums',                       'message-square', 'sand',     'community','rare',      'gold',    'forums',        'forum_activity',         50,  FALSE, 42,  'megaphone'),
  ('forum_legend',       'Forum Legend',       'Posted 200 times in the forums',                      'message-square', 'sand',     'community','epic',      'diamond', 'forums',        'forum_activity',         200, FALSE, 43,  'megaphone'),
  ('commentator',        'Commentator',        'Left 10 comments on projects',                        'message-circle', 'sand',     'community','uncommon',  NULL,      NULL,            'project_comments_made',  10,  FALSE, 44,  'megaphone'),

  -- ---------- Network ----------
  ('first_connection',   'Networker',          'Made your first connection',                          'users',          'ocean',    'network',  'common',    'bronze',  'network',       'connections_accepted',   1,   FALSE, 50,  'handshake'),
  ('well_connected',     'Well Connected',     'Made 10 connections',                                 'users',          'ocean',    'network',  'uncommon',  'silver',  'network',       'connections_accepted',   10,  FALSE, 51,  'handshake'),
  ('super_connector',    'Super Connector',    'Made 50 connections',                                 'users',          'ocean',    'network',  'rare',      'gold',    'network',       'connections_accepted',   50,  FALSE, 52,  'handshake'),
  ('conversationalist',  'Conversationalist',  'Sent 50 messages',                                    'send',           'ocean',    'network',  'uncommon',  NULL,      NULL,            'messages_sent',          50,  FALSE, 53,  'handshake'),
  ('open_line',          'Open Line',          'Held conversations with 10 different members',        'send',           'ocean',    'network',  'uncommon',  NULL,      NULL,            'distinct_conversations', 10,  FALSE, 54,  'handshake'),

  -- ---------- Collaboration ----------
  ('drafter',            'Drafter',            'Created your first document',                         'file-text',      'sand',     'collaboration','common',   'bronze','collaboration','documents_created',      1,   FALSE, 60,  'scroll'),
  ('whiteboarder',       'Whiteboarder',       'Created your first whiteboard',                       'pen-tool',       'sand',     'collaboration','common',   NULL,    NULL,           'whiteboards_created',    1,   FALSE, 61,  'scroll'),
  ('code_slinger',       'Code Slinger',       'Created your first code snippet',                     'code',           'sand',     'collaboration','common',   NULL,    NULL,           'snippets_created',       1,   FALSE, 62,  'scroll'),
  ('sharer',             'Sharer',             'Shared collaborative work 5 times',                   'share-2',        'tropical', 'collaboration','uncommon', 'silver','collaboration','collab_shares',          5,   FALSE, 63,  'scroll'),
  ('collab_hub',         'Collaboration Hub',  'Shared collaborative work 25 times',                  'share-2',        'tropical', 'collaboration','rare',     'gold',  'collaboration','collab_shares',          25,  FALSE, 64,  'scroll'),

  -- ---------- Knowledge ----------
  ('published',          'Published',          'Published a resource to the library',                 'book-open',      'ocean',    'knowledge','rare',      NULL,      NULL,            'resources_published',    1,   FALSE, 70,  'beaker'),
  ('prolific_author',    'Prolific Author',    'Published 10 resources to the library',               'book-open',      'ocean',    'knowledge','epic',      NULL,      NULL,            'resources_published',    10,  FALSE, 71,  'beaker'),

  -- ---------- Profile ----------
  ('verified_member',    'Verified Member',    'Completed identity verification',                     'shield-check',   'tropical', 'profile',  'uncommon',  NULL,      NULL,            'is_verified',            1,   FALSE, 80,  'anchor'),
  ('all_filled_in',      'All Filled In',      'Completed every part of your profile',                'user-check',     'ocean',    'profile',  'common',    NULL,      NULL,            'profile_complete',       1,   FALSE, 81,  'compass'),
  ('many_hats',          'Many Hats',          'Hold more than one role on the platform',             'layers',         'sand',     'profile',  'uncommon',  NULL,      NULL,            'roles_held',             2,   FALSE, 82,  'compass'),

  -- ---------- Dedication ----------
  ('streak_3',           'Warming Up',         'Active 3 days in a row',                              'flame',          'sand',     'dedication','common',   'bronze',  'streak',        'streak_days',            3,   FALSE, 90,  'flame'),
  ('streak_7',           'On a Roll',          'Active 7 days in a row',                              'flame',          'sand',     'dedication','uncommon', 'silver',  'streak',        'streak_days',            7,   FALSE, 91,  'flame'),
  ('streak_30',          'Unstoppable',        'Active 30 days in a row',                             'flame',          'sun',      'dedication','rare',     'gold',    'streak',        'streak_days',            30,  FALSE, 92,  'flame'),
  ('streak_100',         'Century',            'Active 100 days in a row',                            'flame',          'sun',      'dedication','legendary','diamond', 'streak',        'streak_days',            100, FALSE, 93,  'flame'),
  ('regular_visitor',    'Regular Visitor',    'Active on 30 separate days',                          'calendar-check', 'sand',     'dedication','uncommon', NULL,      NULL,            'total_active_days',      30,  FALSE, 94,  'flame'),

  -- ---------- Meta ----------
  -- These key off totals injected on the engine's second pass, so
  -- crossing a threshold fires in the same call, not the next one.
  ('points_100',         'Rising',             'Earned 100 achievement points',                       'trending-up',    'ocean',    'meta',     'uncommon',  'bronze',  'points',        'total_points',           100, FALSE, 100, 'crown'),
  ('points_500',         'Established',        'Earned 500 achievement points',                       'trending-up',    'ocean',    'meta',     'rare',      'silver',  'points',        'total_points',           500, FALSE, 101, 'crown'),
  ('points_1000',        'Distinguished',      'Earned 1,000 achievement points',                     'trending-up',    'sun',      'meta',     'epic',      'gold',    'points',        'total_points',           1000,FALSE, 102, 'crown'),
  ('collector',          'Collector',          'Earned 25 achievements',                              'award',          'sun',      'meta',     'epic',      'diamond', 'points',        'badges_earned',          25,  FALSE, 103, 'crown'),

  -- ---------- Hidden ----------
  -- Masked in the gallery until earned; the client shows only a count.
  ('curious',            'Curious',            'Opened the achievements gallery 10 times',            'eye',            'sand',     'hidden',   'common',    NULL,      NULL,            'achievements_views',     10,  TRUE,  110, 'key'),
  ('scoreboard_watcher', 'Scoreboard Watcher', 'Checked the leaderboard 10 times',                    'eye',            'sand',     'hidden',   'common',    NULL,      NULL,            'leaderboard_views',      10,  TRUE,  111, 'key'),
  ('explorer',           'Explorer',           'Browsed 20 member profiles',                          'compass',        'ocean',    'hidden',   'uncommon',  NULL,      NULL,            'directory_views',        20,  TRUE,  112, 'key'),
  ('secret_hunter',      'Secret Hunter',      'Found 3 hidden achievements',                         'key',            'sun',      'hidden',   'legendary', NULL,      NULL,            'hidden_earned',          3,   TRUE,  113, 'key')
) AS d(
  slug, name, description, icon, color, category, rarity,
  tier, tier_group, check_key, check_value, is_hidden, sort_order, trophy_type
)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  color       = EXCLUDED.color,
  category    = EXCLUDED.category,
  rarity      = EXCLUDED.rarity,
  points      = EXCLUDED.points,
  tier        = EXCLUDED.tier,
  tier_group  = EXCLUDED.tier_group,
  check_key   = EXCLUDED.check_key,
  check_value = EXCLUDED.check_value,
  is_hidden   = EXCLUDED.is_hidden,
  sort_order  = EXCLUDED.sort_order,
  trophy_type = EXCLUDED.trophy_type;

-- ============================================================
-- 3. COLLECTIONS
-- Themed sets. Progress is computed by the engine from badge_slugs,
-- so a collection needs no schema of its own beyond the list.
-- ============================================================

INSERT INTO achievement_collections (slug, name, description, icon, badge_slugs, sort_order)
VALUES
  ('innovators_path', 'Innovator''s Path', 'Build and grow projects on KTIP', 'rocket',
   ARRAY['first_project','project_builder','serial_innovator','project_luminary','project_launched'], 1),
  ('funding_journey', 'Funding Journey', 'Apply for, win, and sponsor funding', 'wallet',
   ARRAY['first_application','persistent_applicant','funded','multi_funded','sponsor'], 2),
  ('event_circuit', 'Event Circuit', 'Attend and run events across the region', 'calendar',
   ARRAY['event_goer','regular_attendee','showed_up','front_row','event_host'], 3),
  ('community_builder', 'Community Builder', 'Show up for the conversation', 'message-square',
   ARRAY['first_post','community_voice','forum_pillar','forum_legend','commentator'], 4),
  ('the_connector', 'The Connector', 'Build a regional network', 'users',
   ARRAY['first_connection','well_connected','super_connector','conversationalist','open_line'], 5),
  ('co_creator', 'Co-Creator', 'Work with others in shared tools', 'share-2',
   ARRAY['drafter','whiteboarder','code_slinger','sharer','collab_hub'], 6),
  ('the_regular', 'The Regular', 'Keep coming back', 'flame',
   ARRAY['streak_3','streak_7','streak_30','streak_100','regular_visitor'], 7)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  badge_slugs = EXCLUDED.badge_slugs,
  sort_order  = EXCLUDED.sort_order;

-- ============================================================
-- 4. BACKFILL
--
-- The pull engine is retroactive, so a member's first check would
-- award everything they already qualify for anyway. Running it here
-- with p_notify = FALSE matters because of what it prevents: without
-- this pass, a long-standing member opens the app after deploy and
-- receives thirty notifications at once. 039 took the same care.
--
-- Suspended accounts are skipped — nothing about this should reach them.
-- ============================================================

DO $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN
    SELECT id FROM profiles WHERE COALESCE(is_suspended, FALSE) = FALSE
  LOOP
    -- One bad row must not abort the whole deploy; the member's next
    -- check picks them up regardless.
    BEGIN
      PERFORM check_achievements_for(v_user.id, FALSE);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'achievement backfill skipped for %: %', v_user.id, SQLERRM;
    END;
  END LOOP;
END $$;

-- The backfill marks today active for every member it touches, which
-- would hand everyone a free day-one streak. Clear those rows: streaks
-- should start from real usage, not from the deploy.
DELETE FROM user_activity_days WHERE activity_date = CURRENT_DATE;
