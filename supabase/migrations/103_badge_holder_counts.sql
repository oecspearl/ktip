-- ============================================================
-- Migration 103: How many members hold each achievement
--
-- The trophy detail card can say what a badge is worth and what
-- it took, but not how unusual it is. "4 of 27 members" is the
-- one number that makes a trophy feel earned rather than issued,
-- and it is the number the card was missing.
--
-- WHY THIS IS NOT A NEW DISCLOSURE
-- user_badges has had `USING (TRUE)` public SELECT since 039, so
-- any client can already enumerate exactly who holds what. This
-- function only saves them the aggregation. It exposes strictly
-- less than the table it reads.
--
-- WHY SECURITY DEFINER
-- Not for user_badges — for the denominator. profiles is RLS
-- scoped, so a client-side COUNT(*) would count only the rows
-- that member can see and every percentage on the platform would
-- come out too high. The definer context is what makes the
-- denominator the real membership.
--
-- WHY STUDENTS ARE COUNTED
-- get_leaderboard excludes students under the 064 safeguarding
-- rule, but that rule is about ranking *individuals* in public. A
-- count with no names attached carries none of that risk, and
-- excluding them would silently skew every figure the card shows.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION get_badge_holder_counts()
RETURNS TABLE (badge_id UUID, holders BIGINT, eligible BIGINT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH members AS (
    SELECT COUNT(*) AS total
    FROM profiles
    WHERE COALESCE(is_suspended, FALSE) = FALSE
  )
  SELECT
    b.id,
    -- Suspended accounts are excluded from BOTH sides. Counting a
    -- suspended holder against a membership that does not include
    -- them can produce a percentage above 100.
    COUNT(DISTINCT ub.user_id) FILTER (
      WHERE COALESCE(p.is_suspended, FALSE) = FALSE
    ) AS holders,
    -- Repeated on every row so one round trip carries the
    -- denominator too; the client needs no second call.
    m.total
  FROM badges b
  CROSS JOIN members m
  LEFT JOIN user_badges ub ON ub.badge_id = b.id
  LEFT JOIN profiles p ON p.id = ub.user_id
  GROUP BY b.id, m.total;
$$;

-- Anonymous as well as signed-in: a shared /u/:id link renders a
-- member's showcase for a signed-out visitor, and those trophies
-- should carry the same figure as they do on the gallery.
GRANT EXECUTE ON FUNCTION get_badge_holder_counts() TO anon, authenticated;
