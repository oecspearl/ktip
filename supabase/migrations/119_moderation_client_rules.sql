-- Migration 119: Ship a subset of the moderation term list to the browser
--
-- 065 put the whole content filter behind a BEFORE INSERT trigger. That is the
-- right enforcement boundary and nothing here changes it. What it cannot do is
-- tell a member *while they are typing* that a word will get their post
-- withheld — by the time scan_content() runs, the member has already written
-- the thing, pressed send, and had it silently disappear.
--
-- So the browser needs the rules. 065's comment on the moderation_terms SELECT
-- policy says the list is "restricted to moderators so it cannot be read for
-- evasion", and that reasoning is sound for exactly one class of rule: the
-- grooming tripwires, whose value depends on the subject not knowing them.
-- For a slur, the opposite holds — the highlight IS the deterrent, and a rule
-- nobody can see deters nobody. client_visible is that distinction, made
-- explicit and left in the safety team's hands rather than decided here.
--
-- Two things this function deliberately does NOT do:
--   * It does not take a country argument. Country is derived from auth.uid().
--     A caller-supplied country makes the function an enumeration oracle: call
--     it once per OECS member state and you have every regional rule on the
--     platform, including the ones that do not apply to you.
--   * It does not return note, created_by, timestamps or country_code. The
--     note names the incident that prompted the rule, created_by names the
--     moderator who wrote it, and country_code tells the caller which rules are
--     regional and therefore which other regions are worth probing.
--
-- Idempotent — safe to re-run. Requires 065.

-- ============================================================
-- 1. The valve
-- ============================================================

ALTER TABLE moderation_terms
  ADD COLUMN IF NOT EXISTS client_visible BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN moderation_terms.client_visible IS
  'Whether this rule is shipped to browsers for live highlighting. FALSE keeps a tripwire rule server-only: it still quarantines on INSERT, but a member cannot discover it by typing. Grooming and safeguarding patterns should stay FALSE.';

-- The 065 seed's grooming patterns are precisely the rules that stop working
-- once they are known. Everything else in that seed (phone, email, address,
-- social links) loses nothing by being visible.
UPDATE moderation_terms SET client_visible = FALSE WHERE category = 'grooming_risk';

CREATE INDEX IF NOT EXISTS idx_moderation_terms_client
  ON moderation_terms (severity)
  WHERE is_active AND client_visible;

-- ============================================================
-- 2. The read-only projection
-- ============================================================

CREATE OR REPLACE FUNCTION get_client_moderation_rules()
RETURNS TABLE (
  id       UUID,
  pattern  TEXT,
  kind     TEXT,
  severity TEXT,
  category TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.pattern, t.kind, t.severity, t.category
  FROM moderation_terms t
  WHERE t.is_active
    AND t.client_visible
    AND (
      t.country_code IS NULL
      OR t.country_code = (
        SELECT NULLIF(upper(left(COALESCE(p.country, ''), 2)), '')
        FROM profiles p
        WHERE p.id = auth.uid()
      )
    )
  -- Same ordering as scan_content(), so the first rule to match names the same
  -- worst category on both sides of the wire.
  ORDER BY CASE t.severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC, t.id;
$$;

COMMENT ON FUNCTION get_client_moderation_rules() IS
  'The subset of moderation_terms the browser is allowed to scan against, scoped to the caller''s own country. Powers live highlighting only — enforcement stays in moderate_content(). Not granted to anon: signed-out visitors cannot write content, so they need no highlighting.';

REVOKE ALL ON FUNCTION get_client_moderation_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_client_moderation_rules() TO authenticated;

NOTIFY pgrst, 'reload schema';
