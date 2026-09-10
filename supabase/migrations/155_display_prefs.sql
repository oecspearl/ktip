-- ============================================================================
-- 155_display_prefs.sql — theme, readable font, text size, brightness, motion
--                          follow the member across devices
-- ============================================================================
-- Every display preference lived in localStorage: ktip_theme, ktip_readable,
-- ktip_a11y. Language (097) and the privacy switches (049, 066, 083) were on
-- the profile, so a member who set dark mode and a larger text size on their
-- laptop opened their phone to a bright, small site — while their language
-- and privacy choices had followed them. This column ends the split.
--
-- One JSONB column, not five: the shape is owned by src/hooks/useDisplayPrefs
-- and DisplayPrefsSync.tsx, every key is optional, and a new preference is a
-- client change rather than a migration. Same reasoning as avatar_style (148).
--
--   { "theme": "dark" | "light",
--     "readable": boolean,
--     "fontScale": 0.9..1.4,
--     "brightness": 0.6..1.6,
--     "reducedMotion": boolean }
--
-- localStorage stays as the instant cache — the inline script in index.html
-- still applies it before first paint — and the profile is the source of
-- truth once it loads. The device wins while a member is signed out.
--
-- Self-read only: never selected by get_profile_view(), so no restatement of
-- that function. The self-UPDATE policy on profiles is column-agnostic and
-- guard_profile_privileged_columns() (063) guards a denylist this column is
-- deliberately not on.
--
-- Idempotent — safe to re-run.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_prefs JSONB;

COMMENT ON COLUMN profiles.display_prefs IS
  'Display preferences that follow the member across devices (155): theme, readable, fontScale, brightness, reducedMotion. Shape owned by src/hooks/useDisplayPrefs.ts. NULL = never set; the device''s own storage stands.';

NOTIFY pgrst, 'reload schema';
