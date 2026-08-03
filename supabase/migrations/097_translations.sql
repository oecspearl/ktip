-- ============================================================================
-- 097_translations.sql — shared, content-addressed machine-translation cache
-- ============================================================================
-- The site is written in English. Members across the OECS read French and
-- Spanish. Everything a member publishes — a project summary, a grant's
-- eligibility text, an event description — is stored in whatever language they
-- typed, and translated on first view. This table is where that translation
-- lands, so the SECOND viewer, and every viewer after them, costs nothing.
--
-- Content-addressed on purpose. The key is a hash of the normalised source text,
-- not a (table, row, column) triple. Three consequences, all deliberate:
--
--   * a new feature with new free-text fields needs no schema change here and no
--     per-feature wiring — it translates the moment something renders it. This
--     is the whole reason for the design: nobody has to remember to register a
--     column, so nothing a member creates can silently stay English;
--   * editing a description invalidates nothing. It simply hashes differently,
--     so it is a new row and the old one ages out through prune_translations();
--   * the same sentence written by two different people is translated once.
--
-- NOT PUBLIC. RLS is enabled with no policy for anon or authenticated, so the
-- only way in is the service key held by api/translate.ts. That is not
-- belt-and-braces. This table would otherwise be a way to read the translated
-- bio of a member whose profile_visibility is 'private' — put here in good faith
-- by someone who could legitimately see it — bypassing the policies that protect
-- the source row. Reads already funnel through one batched POST, so closing the
-- table costs nothing architecturally, and a cache HIT still costs zero provider
-- characters, which is the actual promise being made.
--
-- What must never be written here: direct messages, grievances, grant
-- application data, submission receipts (frozen by design — translating one
-- defeats its purpose), moderation logs, resumes, and sticky notes. The server
-- cannot tell those apart from anything else, so this is enforced by not calling
-- the translation hooks on those surfaces, and by `store: false` on the DM path.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS translations (
  -- Lowercase hex SHA-256 of `${format}<US>${normalized_source}`, where <US> is
  -- U+001F and the normalisation is defined once in src/lib/i18n/hash.ts.
  -- Computed by the server from the text it received — never accepted from the
  -- client, so a client bug can waste a lookup but can never poison an entry.
  hash TEXT NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),

  target_lang TEXT NOT NULL CHECK (target_lang IN ('fr', 'es')),

  -- 'html' rows went through the provider's HTML mode and keep their markup.
  -- In the key because the same bytes translated as text and as html are two
  -- genuinely different answers.
  format TEXT NOT NULL DEFAULT 'text' CHECK (format IN ('text', 'html')),

  -- What the provider detected. Not trusted for anything; kept so an admin can
  -- see why a "translation" came back identical to its source.
  source_lang TEXT,

  -- Kept so the override screen can show what was translated and so a bad entry
  -- can be found by searching its English. This is the one place public member
  -- content is duplicated; the cap keeps a pathological document body from
  -- turning the cache into a second copy of the documents table. It matches
  -- MAX_TRANSLATABLE in src/lib/i18n/should-translate.ts — change both together.
  source_text TEXT NOT NULL CHECK (length(source_text) <= 20000),
  translated_text TEXT NOT NULL,

  provider TEXT NOT NULL DEFAULT 'azure',
  char_count INTEGER NOT NULL DEFAULT 0,

  -- A human correction. Overrides are never overwritten by a later machine run
  -- and are never pruned: losing one to an LRU sweep would silently reintroduce
  -- the bad machine translation somebody already took the trouble to report.
  is_override BOOLEAN NOT NULL DEFAULT FALSE,
  overridden_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hit_count BIGINT NOT NULL DEFAULT 0,

  PRIMARY KEY (hash, target_lang, format)
);

COMMENT ON TABLE translations IS
  'Shared machine-translation cache keyed by a hash of the source text. Service '
  'key only — reads and writes both go through api/translate.ts. Never insert '
  'content from a private surface (DMs, grievances, applications, receipts).';

-- Drives the eviction sweep.
CREATE INDEX IF NOT EXISTS idx_translations_lru
  ON translations(last_used_at) WHERE NOT is_override;

-- Orders the admin override screen by how much a bad entry actually costs.
CREATE INDEX IF NOT EXISTS idx_translations_popular
  ON translations(target_lang, hit_count DESC);

-- ---------------------------------------------------------------------------
-- 2. Metering
-- ---------------------------------------------------------------------------
-- The provider's free tier is 2,000,000 characters a month. Going over does not
-- degrade gracefully on their side — it either bills or hard-refuses — so the
-- cap is enforced HERE, before the call, and the app falls back to English
-- instead. Cache hits are counted but never charged, which is what keeps
-- everything already translated still translated after the budget is gone.
CREATE TABLE IF NOT EXISTS translation_usage (
  period DATE NOT NULL,                  -- first day of the month, UTC
  provider TEXT NOT NULL DEFAULT 'azure',
  chars_translated BIGINT NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  cache_hits BIGINT NOT NULL DEFAULT 0,
  cache_misses BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (period, provider)
);

COMMENT ON TABLE translation_usage IS
  'Monthly provider spend and cache effectiveness. If cache_misses ever exceeds '
  'roughly 10% of (hits + misses), suspect a normalisation drift or a missing '
  'skip rule rather than genuine new content.';

-- Per-caller throttle. /api/translate is reachable anonymously from public pages
-- and spends a SHARED monthly budget, so an unthrottled caller could exhaust
-- everyone's French in an afternoon.
--
-- The IP is stored salted-and-hashed, never raw: this table would otherwise be
-- an access log of every reader of every page, which is not a thing this
-- application should be keeping.
CREATE TABLE IF NOT EXISTS translation_rate_limit (
  ip_hash TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  chars BIGINT NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- 3. Budget and throttle, claimed atomically
-- ---------------------------------------------------------------------------
-- One round trip that answers "may I spend p_chars?" and, if yes, spends them.
--
-- Atomic because two readers landing on the same brand-new project WILL race,
-- and a check-then-increment would let both through against a nearly-full cap.
-- Only MISSES are ever passed here.
CREATE OR REPLACE FUNCTION claim_translation_budget(
  p_ip_hash TEXT,
  p_chars INTEGER,
  p_cap BIGINT DEFAULT NULL,
  p_authenticated BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE := date_trunc('month', now() AT TIME ZONE 'UTC')::DATE;
  -- Hard ceiling regardless of what the caller passes. The free tier is 2M;
  -- 1.8M leaves room for the requests already in flight when the cap is reached.
  v_cap BIGINT := LEAST(COALESCE(p_cap, 1800000), 1800000);
  v_window CONSTANT INTERVAL := INTERVAL '5 minutes';
  v_ip_cap CONSTANT BIGINT := 20000;   -- characters per window, signed in
  v_anon_cap CONSTANT BIGINT := 4000;  -- characters per window, signed out
  v_used BIGINT;
  v_ip_used BIGINT;
BEGIN
  IF p_chars IS NULL OR p_chars <= 0 THEN
    RETURN jsonb_build_object('allowed', TRUE, 'remaining', v_cap);
  END IF;

  -- Throttle first. An abusive caller must not be able to burn the shared
  -- monthly budget on its way to being refused.
  INSERT INTO translation_rate_limit AS rl (ip_hash, window_start, chars, requests)
  VALUES (p_ip_hash, now(), 0, 0)
  ON CONFLICT (ip_hash) DO UPDATE
    SET window_start = CASE WHEN rl.window_start < now() - v_window THEN now() ELSE rl.window_start END,
        chars        = CASE WHEN rl.window_start < now() - v_window THEN 0     ELSE rl.chars END,
        requests     = CASE WHEN rl.window_start < now() - v_window THEN 0     ELSE rl.requests END
  RETURNING rl.chars INTO v_ip_used;

  IF COALESCE(v_ip_used, 0) + p_chars > (CASE WHEN p_authenticated THEN v_ip_cap ELSE v_anon_cap END) THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'rate_limited', 'retry_after', 300);
  END IF;

  SELECT chars_translated INTO v_used
  FROM translation_usage
  WHERE period = v_period AND provider = 'azure'
  FOR UPDATE;

  IF COALESCE(v_used, 0) + p_chars > v_cap THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'over_budget',
      'remaining', GREATEST(v_cap - COALESCE(v_used, 0), 0)
    );
  END IF;

  INSERT INTO translation_usage (period, provider, chars_translated, requests)
  VALUES (v_period, 'azure', p_chars, 1)
  ON CONFLICT (period, provider) DO UPDATE
    SET chars_translated = translation_usage.chars_translated + EXCLUDED.chars_translated,
        requests = translation_usage.requests + 1;

  UPDATE translation_rate_limit
  SET chars = chars + p_chars, requests = requests + 1
  WHERE ip_hash = p_ip_hash;

  RETURN jsonb_build_object('allowed', TRUE, 'remaining', v_cap - COALESCE(v_used, 0) - p_chars);
END;
$$;

COMMENT ON FUNCTION claim_translation_budget(TEXT, INTEGER, BIGINT, BOOLEAN) IS
  'Atomically checks and spends the monthly provider budget plus a per-IP window. '
  'Called only for cache misses. Service key only.';

REVOKE ALL ON FUNCTION claim_translation_budget(TEXT, INTEGER, BIGINT, BOOLEAN) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4. Recording hits
-- ---------------------------------------------------------------------------
-- Bumping last_used_at on every read would turn every cache HIT into a write —
-- the one path that has to stay cheap. So api/translate.ts calls this once per
-- request with the whole batch. Accuracy buys nothing here: the value is only
-- ever compared against an interval measured in months.
CREATE OR REPLACE FUNCTION touch_translations(
  p_hashes TEXT[],
  p_lang TEXT,
  p_hits INTEGER DEFAULT 0,
  p_misses INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE := date_trunc('month', now() AT TIME ZONE 'UTC')::DATE;
BEGIN
  IF p_hashes IS NOT NULL AND array_length(p_hashes, 1) > 0 THEN
    UPDATE translations
    SET last_used_at = now(), hit_count = hit_count + 1
    WHERE hash = ANY(p_hashes) AND target_lang = p_lang;
  END IF;

  INSERT INTO translation_usage (period, provider, cache_hits, cache_misses)
  VALUES (v_period, 'azure', GREATEST(COALESCE(p_hits, 0), 0), GREATEST(COALESCE(p_misses, 0), 0))
  ON CONFLICT (period, provider) DO UPDATE
    SET cache_hits = translation_usage.cache_hits + EXCLUDED.cache_hits,
        cache_misses = translation_usage.cache_misses + EXCLUDED.cache_misses;
END;
$$;

REVOKE ALL ON FUNCTION touch_translations(TEXT[], TEXT, INTEGER, INTEGER) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 5. Eviction
-- ---------------------------------------------------------------------------
-- Content-addressing means an edited description leaves its old row behind
-- forever. This project has no pg_cron, so housekeeping is opportunistic — the
-- same pattern 056, 068 and 091 use: the edge function calls this on a small
-- fraction of requests, and the admin page exposes it as a button.
CREATE OR REPLACE FUNCTION prune_translations(p_older_than INTERVAL DEFAULT INTERVAL '180 days')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM translations
  WHERE last_used_at < now() - p_older_than
    AND NOT is_override;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Rate-limit windows are five minutes long; rows older than a day are dead
  -- weight and the table would otherwise grow one row per reader forever.
  DELETE FROM translation_rate_limit WHERE window_start < now() - INTERVAL '1 day';

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION prune_translations(INTERVAL) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 6. Admin override
-- ---------------------------------------------------------------------------
-- The correction path for a translation that is wrong. Goes through a function
-- rather than an UPDATE policy so that is_override and overridden_by cannot be
-- set independently of the text they justify.
CREATE OR REPLACE FUNCTION set_translation_override(
  p_hash TEXT,
  p_lang TEXT,
  p_format TEXT,
  p_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_oecs_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_text IS NULL OR length(btrim(p_text)) = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'empty');
  END IF;

  UPDATE translations
  SET translated_text = p_text,
      is_override = TRUE,
      overridden_by = auth.uid()
  WHERE hash = p_hash AND target_lang = p_lang AND format = p_format;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION set_translation_override(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_translation_override(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- "Retranslate" is just a delete: the next view re-fetches from the provider.
-- Overrides are excluded, so this cannot be used to quietly undo a correction.
CREATE OR REPLACE FUNCTION clear_translation(p_hash TEXT, p_lang TEXT, p_format TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_oecs_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  DELETE FROM translations
  WHERE hash = p_hash AND target_lang = p_lang AND format = p_format AND NOT is_override;

  RETURN jsonb_build_object('ok', FOUND);
END;
$$;

REVOKE ALL ON FUNCTION clear_translation(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clear_translation(TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_rate_limit ENABLE ROW LEVEL SECURITY;

-- No policy for anon or authenticated on any of the three. The service key
-- bypasses RLS and is the only intended way in. The single exception is the
-- admin override screen, which has to read what it is about to correct.
DROP POLICY IF EXISTS "Admins can read the translation cache" ON translations;
CREATE POLICY "Admins can read the translation cache"
  ON translations FOR SELECT
  USING (is_oecs_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can read translation usage" ON translation_usage;
CREATE POLICY "Admins can read translation usage"
  ON translation_usage FOR SELECT
  USING (is_oecs_admin(auth.uid()));

-- translation_rate_limit gets no policy at all, not even for admins: it is
-- pseudonymised reader traffic and nothing in the product needs to read it.

-- ---------------------------------------------------------------------------
-- 8. The reader's own preference
-- ---------------------------------------------------------------------------
-- NULL means "never chosen", which is materially different from "chose English":
-- only the NULL case lets the client guess from the Virtual Campus locale claim
-- or navigator.languages. Once a member picks explicitly this is written and
-- wins on every device they sign in from.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_preferred_language_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_preferred_language_check
      CHECK (preferred_language IS NULL OR preferred_language IN ('en', 'fr', 'es'));
  END IF;
END $$;

COMMENT ON COLUMN profiles.preferred_language IS
  'Explicit UI language choice. NULL = never chosen, so the client guesses from '
  'the Virtual Campus OIDC locale claim, then navigator.languages, then English. '
  'Self-service, like bio — no privileged-column guard applies.';

NOTIFY pgrst, 'reload schema';
