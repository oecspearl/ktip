-- ============================================================================
-- 168_profiles_column_privileges.sql — the profiles table stops answering for
-- columns its readers may not see
-- ============================================================================
-- Until now anon and authenticated held table-wide SELECT on profiles under a
-- USING (true) policy (000), so the anon key read every column of every row:
-- the fields a member closed with 162's section switches, and operational
-- columns nobody else should see at all (suspension_reason, mfa_method,
-- is_minor, purge_after, display_prefs, ...).
--
-- RLS is per row and section privacy is per column, so this is done with
-- column privileges: SELECT is revoked table-wide and granted back on the
-- columns a card, an author chip or the DM gate reads on someone else's row.
-- Everything else is read through 167:
--
--   own row          get_my_profile()
--   other members    member_profiles (section fields gated per caller)
--   admin users list admin_member_rows()
--
-- Consequences for any client query on profiles:
--   * select=* fails outright (42501; PostgREST answers 401/403), and so does
--     a whole-row reference in SQL run as the caller: to_jsonb(p), p.*,
--     profiles%ROWTYPE. 164's get_session_bootstrap() does this and must read
--     get_my_profile() before this is applied — its owner is handling that.
--   * Naming, filtering on or ordering by a revoked column fails.
--   * UPDATE still works on every column (UPDATE privilege is untouched and
--     RLS still limits it to the member's own row), but RETURNING a revoked
--     column fails, so .update().select() must name granted columns only.
--
-- A column added to profiles later is unreadable by clients until a
-- migration grants it. That is deliberate; profile-columns.test.ts pins the
-- grant list against PROFILE_PUBLIC_COLUMNS in src/lib/profile-columns.ts.
--
-- Idempotent — safe to re-run. Apply only AFTER the client that stopped
-- reading these columns is live. Rollback, if needed, is one statement:
--   GRANT SELECT ON profiles TO anon, authenticated;
-- ============================================================================

REVOKE SELECT ON profiles FROM anon, authenticated;

-- A table-level REVOKE leaves explicit column-level grants in place, so clear
-- those too on every column that must stay closed. Named rather than "every
-- column not granted below": a later migration that adds a column and grants
-- it (169 may) keeps its grant whichever order the two are applied in, while
-- a later column that is never granted is closed by the table-level REVOKE.
REVOKE SELECT (
  bio, skills, interests, languages, open_to,
  organization, industry, phone, website,
  suspended_until, suspension_reason, moderation_severity,
  copyright_strikes, copyright_strike_at,
  requires_mfa_enrollment, mfa_enrolled_at, mfa_grandfathered, mfa_method,
  purge_after, purge_warned_at, status_changed_at, verified_via,
  is_minor, requires_age_declaration, age_declared_at,
  requires_consent, consent_recorded_at,
  preferred_language, content_language, auto_translate, display_prefs,
  connection_count_visibility, leaderboard_visibility
) ON profiles FROM anon, authenticated;

GRANT SELECT (
  id,
  username,
  display_name,
  avatar_url,
  avatar_style,
  banner,
  country,
  roles,
  active_role,
  is_verified,
  verified_at,
  created_at,
  updated_at,
  profile_visibility,
  section_visibility,
  is_suspended,
  account_status
) ON profiles TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
