-- ============================================================
-- Migration 089: Trophy type remap — the artwork exists now
--
-- 067 seeded thirteen trophy types with no images, chosen before any
-- of the artwork was drawn. Forty-two renders later, four of those
-- guesses turned out wrong and the distribution was badly skewed:
--
--   rocket   carried 14 badges, a fifth of the whole system
--   anchor   carried 1
--   star     carried 0
--   scroll   meant "ancient document" but served the live collab tools
--   beaker   meant "lab experiment" but served the resource library
--   compass  served profile completion, not exploration
--
-- This points the badges at the twelve types that were actually
-- drawn. Nothing here changes what a badge means or how it is earned
-- — only which picture appears on it.
--
-- The projects split is the one real judgement call. "I built a
-- thing" (rocket) and "people liked my thing" (wave) are different
-- claims, and putting them on one ladder made a fifth of the gallery
-- look identical. 6 and 8 badges respectively.
--
-- Runs after 088, which introduces four of the badges remapped here.
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. SLOTS FOR THE NEW TYPES
--
-- The admin grid derives its columns from trophy_assets rows, so a
-- type with no rows has nowhere to upload into. Four types x four
-- tiers; 067's ON CONFLICT DO NOTHING pattern, so re-running never
-- clears an uploaded image.
-- ============================================================

INSERT INTO trophy_assets (type, tier, image_url, alt_text, sort_order)
SELECT t.type, tier.tier, NULL, '', t.ord
FROM (VALUES
  ('wave',         2),  -- project reach: likes, followers, views
  ('weave',        7),  -- collaboration: docs, whiteboards, snippets
  ('lighthouse',   8),  -- published knowledge
  ('compass-rose', 9)   -- profile and verification
) AS t(type, ord)
CROSS JOIN (VALUES ('bronze'), ('silver'), ('gold'), ('diamond')) AS tier(tier)
ON CONFLICT (type, tier) DO NOTHING;

-- Regroup the whole grid so related types sit next to each other in
-- the admin screen. Cosmetic, but the screen is 48 cells and the
-- 067 order no longer matches anything.
UPDATE trophy_assets SET sort_order = v.ord
FROM (VALUES
  ('rocket', 1), ('wave', 2), ('seedling', 3), ('podium', 4),
  ('megaphone', 5), ('handshake', 6), ('weave', 7), ('lighthouse', 8),
  ('compass-rose', 9), ('flame', 10), ('crown', 11), ('key', 12)
) AS v(type, ord)
WHERE trophy_assets.type = v.type;

-- ============================================================
-- 2. REMAP
--
-- Listed by slug rather than by category: 'projects' splits across
-- two types, so a category-wide UPDATE would be wrong, and naming
-- every badge makes the mapping reviewable against the artwork.
-- ============================================================

-- Projects, the making half. Creating, launching, joining a team.
UPDATE badges SET trophy_type = 'rocket'
WHERE slug IN (
  'first_project', 'project_builder', 'serial_innovator', 'project_luminary',
  'project_launched', 'team_player'
);

-- Projects, the reach half. Likes, followers, views — what other
-- people did with your work, rather than what you made.
UPDATE badges SET trophy_type = 'wave'
WHERE slug IN (
  'first_spark', 'popular_project', 'viral_project', 'wide_reach',
  'well_liked', 'regional_hit', 'followed_work', 'must_follow'
);

-- Collaboration. Interlaced strands: many contributions, one object.
UPDATE badges SET trophy_type = 'weave'
WHERE slug IN (
  'drafter', 'whiteboarder', 'code_slinger', 'sharer', 'collab_hub', 'collab_titan'
);

-- Published knowledge. A lighthouse is something others navigate by.
UPDATE badges SET trophy_type = 'lighthouse'
WHERE slug IN ('published', 'field_notes', 'prolific_author', 'reference_shelf');

-- Profile and verification. 'anchor' served verified_member alone —
-- four trophy renders for one badge — so it folds in here.
UPDATE badges SET trophy_type = 'compass-rose'
WHERE slug IN ('verified_member', 'all_filled_in', 'many_hats');

-- Catch-all for anything still pointing at a retired type: a badge an
-- admin added through /admin/achievements after 067, or a slug added
-- to a later migration and missed above. Better a generic rocket than
-- a permanently blank cell.
UPDATE badges SET trophy_type = 'rocket'
WHERE trophy_type IN ('scroll', 'beaker', 'anchor', 'compass', 'star');

-- ============================================================
-- 3. RETIRE THE UNUSED SLOTS
--
-- Guarded on image_url IS NULL. None of these five has ever had art
-- uploaded, but the guard is the difference between tidying up and
-- destroying someone's work — if a coordinator uploaded to one of
-- these between deploys, the row survives and the admin grid keeps
-- showing it.
-- ============================================================

DELETE FROM trophy_assets
WHERE type IN ('scroll', 'beaker', 'anchor', 'compass', 'star')
  AND image_url IS NULL;

-- ============================================================
-- 4. SANITY CHECK
--
-- A badge pointing at a type with no slot renders a fallback icon
-- forever and nothing anywhere fails. Fail the migration instead —
-- this is the only moment the mistake is cheap to fix.
-- ============================================================

DO $$
DECLARE
  v_orphans TEXT;
BEGIN
  SELECT string_agg(DISTINCT b.trophy_type, ', ')
  INTO v_orphans
  FROM badges b
  WHERE b.trophy_type IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM trophy_assets t WHERE t.type = b.trophy_type);

  IF v_orphans IS NOT NULL THEN
    RAISE EXCEPTION 'badge trophy_type(s) with no slot in trophy_assets: %', v_orphans;
  END IF;
END $$;
