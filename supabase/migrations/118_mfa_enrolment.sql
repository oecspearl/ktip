-- ============================================================================
-- 118_mfa_enrolment.sql — roles that demand a second factor
-- ============================================================================
-- Until now nothing on this platform proved that an account belonged to a real,
-- reachable person. Signup ended on a "check your email" confirmation *link*,
-- and an entrepreneur — who submits grant applications and opens direct
-- messages — could be created from a throwaway address in under a minute.
--
-- This adds a blocking second factor: a TOTP authenticator enrolled before the
-- account reaches the app. The email half of the verification is GoTrue's own
-- one-time code, which is a dashboard template change rather than a change in
-- this repo, so the whole feature costs nothing recurring. SMS was considered
-- and rejected: there is no free tier that reaches OECS carriers reliably.
--
-- WHY ROLE-AGNOSTIC. The requirement is not hard-coded to `entrepreneur`. It is
-- a column on role_definitions, so switching another role on later is a one-row
-- UPDATE and needs no code deploy. Only `entrepreneur` is TRUE here.
--
-- WHY DEFAULT FALSE. Scope is NEW ACCOUNTS ONLY, exactly as 091 scoped itself.
-- Every profile that exists when this migration runs is grandfathered, so no
-- current member is ever interrupted. Unlike 091 there IS a self-heal function
-- here that can *set* the flag, which is precisely why the grandfather column
-- exists — without it, ensure_my_mfa_status() would lock the entire existing
-- entrepreneur population out on their next sign-in. Bringing the back
-- catalogue in scope is a separate, deliberate decision; see section 12.
--
-- WHY BACKUP CODES ARE NOT A SECOND FACTOR. GoTrue owns the `aal` claim and
-- offers no way for an application to say "promote this session, I checked
-- something myself". So a backup code buys exactly one thing: the right to
-- delete a lost factor and enrol a fresh one. The user still reaches aal2
-- through a genuine TOTP verification, and the session never carries a claim it
-- did not earn.
--
-- WHAT IS DELIBERATELY NOT COVERED. Server-side enforcement here is a first
-- pass over the write paths where the threat is real — grant applications,
-- projects, and direct messages. Read paths, forums, profile edits and events
-- are untouched. An unenrolled entrepreneur who opens devtools can still read
-- whatever any signed-in member reads. Closing that is a blanket-restrictive
-- sweep across the ~55 remaining policies with its own regression pass, and
-- belongs in its own migration.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. pgcrypto
-- ---------------------------------------------------------------------------
-- First use in this project. Every call below is schema-qualified as
-- extensions.crypt(...) because the functions that use it run with
-- SET search_path = public and would otherwise fail to resolve the name at
-- RUNTIME rather than at migration time, which is the unpleasant part.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. The policy switch
-- ---------------------------------------------------------------------------
-- role_definitions already carries requires_verification, so this sits beside an
-- established idea rather than inventing a parallel one.
ALTER TABLE role_definitions
  ADD COLUMN IF NOT EXISTS requires_mfa BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN role_definitions.requires_mfa IS
  'Holders of this role must enrol a second factor before reaching the app. '
  'Defaults FALSE: switching a role on is a one-row UPDATE here and needs no '
  'code change. The role seeds in 063, 110 and 116 do not list this column in '
  'their ON CONFLICT DO UPDATE, so re-running them cannot revert an operator '
  'toggle — keep it that way if any of those seeds is ever extended.';

UPDATE role_definitions SET requires_mfa = TRUE WHERE slug = 'entrepreneur';

-- ---------------------------------------------------------------------------
-- 2. Profile-side columns
-- ---------------------------------------------------------------------------
-- Same shape as 091's is_minor and 115's requires_consent: a cache the client
-- reads to decide which screen to render, which nothing that enforces anything
-- may consult.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS requires_mfa_enrollment BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ;

-- The grandfather. Added with DEFAULT TRUE so every row that exists right now is
-- exempt, then the default is immediately flipped to FALSE so every row created
-- from here on is in scope. That ordering is what makes it idempotent: a re-run
-- skips the ADD (IF NOT EXISTS) and re-applies a default that is already FALSE,
-- so nobody is accidentally re-grandfathered.
--
-- One known edge: AuthContext.fetchProfileQuery re-creates a profile row for an
-- account whose row went missing. Re-created after this migration, that account
-- lands with mfa_grandfathered FALSE and is treated as new. That is the correct
-- default for a security control, and the state it recovers from is already
-- broken.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mfa_grandfathered BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE profiles ALTER COLUMN mfa_grandfathered SET DEFAULT FALSE;

COMMENT ON COLUMN profiles.requires_mfa_enrollment IS
  'UI hint only. ProtectedRoute holds the account on /security/set-up until it '
  'clears. Derived from role_definitions.requires_mfa and auth.mfa_factors; '
  'never written directly. Defaults FALSE so no pre-118 account is interrupted.';
COMMENT ON COLUMN profiles.mfa_enrolled_at IS
  'Cached, possibly stale. Security checks call account_mfa_satisfied().';
COMMENT ON COLUMN profiles.mfa_grandfathered IS
  'TRUE for every account that existed when 118 ran. Exempts the back catalogue '
  'from a requirement it was never told about. Clearing it for existing members '
  'is a deliberate, separately-reviewed decision — see section 12.';

CREATE INDEX IF NOT EXISTS idx_profiles_requires_mfa_enrollment
  ON profiles (id) WHERE requires_mfa_enrollment;

-- ---------------------------------------------------------------------------
-- 3. Derivation
-- ---------------------------------------------------------------------------
-- Does any role this account holds demand a second factor?
--
-- p_roles is passed explicitly by the INSERT guard, which runs BEFORE the row
-- exists and so cannot look its own roles up. Getting that wrong — reading
-- profiles.roles for a row that is not there yet — silently exempts every new
-- signup, which is the exact failure this migration exists to prevent.
CREATE OR REPLACE FUNCTION account_mfa_required(p_user UUID, p_roles TEXT[] DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT COALESCE(
      (SELECT p.mfa_grandfathered FROM profiles p WHERE p.id = p_user),
      FALSE
    )
    AND EXISTS (
      SELECT 1 FROM role_definitions rd
      WHERE rd.requires_mfa
        AND rd.slug = ANY(
          expand_roles(
            COALESCE(p_roles, (SELECT p.roles FROM profiles p WHERE p.id = p_user), ARRAY[]::TEXT[])
          )
        )
    );
$$;

GRANT EXECUTE ON FUNCTION account_mfa_required(UUID, TEXT[]) TO authenticated;

-- The authoritative check. Recomputed from auth.mfa_factors on every call, so
-- unlike profiles.requires_mfa_enrollment it can never be stale.
--
-- auth.mfa_factors is not SELECT-able by `authenticated`; SECURITY DEFINER is
-- what makes this callable at all. It returns a single boolean, so it discloses
-- nothing beyond the answer.
CREATE OR REPLACE FUNCTION account_mfa_satisfied(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT account_mfa_required(p_user)
      OR EXISTS (
        SELECT 1 FROM auth.mfa_factors f
        WHERE f.user_id = p_user AND f.status = 'verified'
      );
$$;

GRANT EXECUTE ON FUNCTION account_mfa_satisfied(UUID) TO authenticated;

-- Step-up: has the CURRENT SESSION proven the factor it holds?
--
-- Deliberately NOT folded into has_permission(). That function takes a user id
-- and is called with other people's ids all over this schema — age_permits_dm()
-- passes the adult, enforce_grant_application_sponsor() passes the sponsor.
-- Mixing an assurance level, which is a property of one connection, into a
-- question about an account would make "may Bob sponsor this?" depend on
-- Alice's session. Two predicates, kept apart on purpose.
--
-- Accepts aal1 for anyone with no verified factor. Also deliberate: demanding
-- aal2 from an unenrolled account would brick the enrolment flow itself, which
-- necessarily runs at aal1. The requirement to *have* a factor is
-- account_mfa_satisfied()'s job.
CREATE OR REPLACE FUNCTION auth_mfa_step_up_ok()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = auth.uid() AND f.status = 'verified'
    )
    OR COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

GRANT EXECUTE ON FUNCTION auth_mfa_step_up_ok() TO authenticated;

-- Opportunistic housekeeping, the pattern 056, 068 and 091 all use in place of
-- the pg_cron this project does not have. AuthContext calls it once per session.
--
-- This is the ONLY writer of the derived columns, and that is a decision rather
-- than an omission. 091 could hang a trigger on account_age because account_age
-- is ours; auth.mfa_factors belongs to GoTrue and a trigger there is not
-- guaranteed to survive an upgrade.
--
-- Being session-scoped also closes a gap the guard triggers cannot: every
-- service-role write, set_user_roles(), and vc_provision_identity() (068) set
-- ktip.bypass_profile_guard, so anything derived inside the guard is skipped for
-- them. This catches those accounts the next time they appear.
CREATE OR REPLACE FUNCTION ensure_my_mfa_status()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_owes BOOLEAN;
  v_enrolled TIMESTAMPTZ;
BEGIN
  IF v_actor IS NULL THEN
    RETURN FALSE;
  END IF;

  v_owes := NOT account_mfa_satisfied(v_actor);

  SELECT MIN(f.updated_at) INTO v_enrolled
  FROM auth.mfa_factors f
  WHERE f.user_id = v_actor AND f.status = 'verified';

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET requires_mfa_enrollment = v_owes,
      mfa_enrolled_at = v_enrolled,
      updated_at = now()
  WHERE id = v_actor
    AND (requires_mfa_enrollment IS DISTINCT FROM v_owes
         OR mfa_enrolled_at IS DISTINCT FROM v_enrolled);

  RETURN v_owes;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_my_mfa_status() TO authenticated;

-- Admin variant, for the reset endpoint: the target is not the caller, so the
-- self-heal above cannot do it, and the target may not sign in for days.
CREATE OR REPLACE FUNCTION ensure_mfa_status(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_owes BOOLEAN;
  v_enrolled TIMESTAMPTZ;
BEGIN
  IF v_actor IS NULL OR NOT has_permission(v_actor, 'members:manage') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  v_owes := NOT account_mfa_satisfied(p_user);

  SELECT MIN(f.updated_at) INTO v_enrolled
  FROM auth.mfa_factors f
  WHERE f.user_id = p_user AND f.status = 'verified';

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET requires_mfa_enrollment = v_owes,
      mfa_enrolled_at = v_enrolled,
      updated_at = now()
  WHERE id = p_user;

  RETURN jsonb_build_object('ok', TRUE, 'requires_enrollment', v_owes);
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_mfa_status(UUID) TO authenticated;

-- Service-role variant, for the recovery endpoint.
--
-- It needs its own function rather than reusing the one above, because that one
-- gates on has_permission(auth.uid(), …) and the service role has no JWT
-- subject at all — the check would refuse it. Loosening that check to "allow a
-- NULL actor" would be much worse: `anon` also has a NULL auth.uid(), so it
-- would hand every unauthenticated caller the ability to flip anyone's gate.
-- Hence a separate entry point, REVOKEd from anon and authenticated, in the
-- shape 056 uses for resolve_email_alias().
CREATE OR REPLACE FUNCTION sync_mfa_status(p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owes BOOLEAN;
  v_enrolled TIMESTAMPTZ;
BEGIN
  v_owes := NOT account_mfa_satisfied(p_user);

  SELECT MIN(f.updated_at) INTO v_enrolled
  FROM auth.mfa_factors f
  WHERE f.user_id = p_user AND f.status = 'verified';

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET requires_mfa_enrollment = v_owes,
      mfa_enrolled_at = v_enrolled,
      updated_at = now()
  WHERE id = p_user;

  RETURN v_owes;
END;
$$;

REVOKE ALL ON FUNCTION sync_mfa_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION sync_mfa_status(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_mfa_status(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Recovery codes
-- ---------------------------------------------------------------------------
-- Blocking enforcement without a recovery path is a lockout generator. Phone
-- turnover is high in the population this is aimed at, and "lost my phone" must
-- not mean "lost my account".
--
-- Only the hash is stored, so a database read discloses nothing usable. The
-- plaintext exists for exactly one HTTP response.
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  batch_id UUID NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mfa_backup_codes IS
  'Single-use recovery codes, bcrypt-hashed. A code is NOT a second factor: '
  'spending one only earns the right to delete a lost factor and enrol again.';

CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user
  ON mfa_backup_codes (user_id) WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Recovery-code RPCs
-- ---------------------------------------------------------------------------
-- Issue. Gated on the CURRENT SESSION being aal2 — only a session that has just
-- proven the factor may mint the codes that bypass it.
--
-- The rate-limit call works even though consume_auth_rate_limit is REVOKEd from
-- `authenticated` (056): a SECURITY DEFINER function executes with the owner's
-- privileges, so the grant that matters is the owner's. It looks wrong at a
-- glance, which is why this comment is here.
CREATE OR REPLACE FUNCTION issue_mfa_backup_codes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_batch UUID := gen_random_uuid();
  -- Crockford base32: no I, L, O or U. Removes both transcription ambiguity and
  -- the chance of a code that reads as a word nobody wants to type.
  v_alphabet TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_codes TEXT[] := ARRAY[]::TEXT[];
  v_code TEXT;
  v_limit JSONB;
  i INT;
  j INT;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
  END IF;

  IF COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'step_up_required');
  END IF;

  v_limit := consume_auth_rate_limit('mfa-codes:user:' || v_actor::TEXT, 86400, 5);
  IF NOT (v_limit ->> 'allowed')::BOOLEAN THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'rate_limited',
                              'retry_after', v_limit -> 'retry_after');
  END IF;

  -- Regenerating invalidates the previous sheet. The UI says so before calling.
  DELETE FROM mfa_backup_codes WHERE user_id = v_actor;

  FOR i IN 1..10 LOOP
    v_code := '';
    FOR j IN 1..10 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::INT, 1);
    END LOOP;
    v_codes := array_append(v_codes, v_code);

    INSERT INTO mfa_backup_codes (user_id, code_hash, batch_id)
    VALUES (v_actor, extensions.crypt(v_code, extensions.gen_salt('bf', 8)), v_batch);
  END LOOP;

  RETURN jsonb_build_object('ok', TRUE, 'codes', to_jsonb(v_codes), 'issued_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION issue_mfa_backup_codes() TO authenticated;

-- Spend. This is the brute-force surface, and the reason consume_auth_rate_limit
-- is in this migration at all.
--
-- The spend is a single statement, so it is atomic: two concurrent requests
-- cannot both redeem the same code.
CREATE OR REPLACE FUNCTION consume_mfa_backup_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_normalised TEXT;
  v_spent UUID;
  v_limit JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
  END IF;

  v_limit := consume_auth_rate_limit('mfa-consume:user:' || v_actor::TEXT, 3600, 10);
  IF NOT (v_limit ->> 'allowed')::BOOLEAN THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'rate_limited',
                              'retry_after', v_limit -> 'retry_after');
  END IF;

  -- These are retyped from paper. Accept the separator and any casing.
  v_normalised := upper(regexp_replace(COALESCE(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  IF length(v_normalised) <> 10 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_code');
  END IF;

  UPDATE mfa_backup_codes
  SET used_at = now()
  WHERE id = (
    SELECT c.id FROM mfa_backup_codes c
    WHERE c.user_id = v_actor
      AND c.used_at IS NULL
      AND c.code_hash = extensions.crypt(v_normalised, c.code_hash)
    LIMIT 1
  )
  RETURNING id INTO v_spent;

  IF v_spent IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_code');
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'remaining', (SELECT count(*) FROM mfa_backup_codes
                   WHERE user_id = v_actor AND used_at IS NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION consume_mfa_backup_code(TEXT) TO authenticated;

-- Counts only. The Settings card never needs to see a hash, so it never gets the
-- chance to leak one into a network tab.
CREATE OR REPLACE FUNCTION mfa_backup_code_status()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'remaining', count(*) FILTER (WHERE used_at IS NULL),
    'issued_at', min(created_at)
  )
  FROM mfa_backup_codes WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION mfa_backup_code_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Administrative audit
-- ---------------------------------------------------------------------------
-- An administrator who can silently strip anyone's second factor, leaving no
-- trace, is a worse hole than the one this migration closes.
-- role_permission_events (063) is scoped to the permission matrix and will not
-- carry this.
CREATE TABLE IF NOT EXISTS mfa_admin_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('admin_reset', 'recovery_code_used')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_admin_events_target
  ON mfa_admin_events (target_id, created_at DESC);

ALTER TABLE mfa_admin_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit viewers read mfa admin events" ON mfa_admin_events;
CREATE POLICY "Audit viewers read mfa admin events"
  ON mfa_admin_events FOR SELECT
  USING (has_permission(auth.uid(), 'audit:view'));
-- No INSERT/UPDATE/DELETE policy. Rows are written by record_mfa_admin_event()
-- or by the service role, and are never edited afterwards.

CREATE OR REPLACE FUNCTION record_mfa_admin_event(p_target UUID, p_action TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_action = 'admin_reset'
     AND (auth.uid() IS NULL OR NOT has_permission(auth.uid(), 'members:manage')) THEN
    RAISE EXCEPTION 'not permitted to record an administrative MFA reset';
  END IF;

  -- 'recovery_code_used' is self-reported: the actor IS the target, and the
  -- event has already happened by the time this is called.
  IF p_action = 'recovery_code_used' AND auth.uid() IS DISTINCT FROM p_target THEN
    RAISE EXCEPTION 'a recovery-code event can only be recorded for yourself';
  END IF;

  INSERT INTO mfa_admin_events (actor_id, target_id, action, note)
  VALUES (auth.uid(), p_target, p_action, p_note);
END;
$$;

GRANT EXECUTE ON FUNCTION record_mfa_admin_event(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Seeding from signup metadata
-- ---------------------------------------------------------------------------
-- Restated in full from 115 — NOT from 091 — for the CREATE OR REPLACE reason
-- those files give, and because restating the older text here would silently
-- drop the legal-consent tail 115 added.
--
-- The addition is the three MFA columns in the INSERT. Their values here are
-- placeholders: guard_profile_insert_roles() overwrites all three a moment
-- later from the STRIPPED role list, which is the only trustworthy source. In
-- particular the requirement is never computed from raw_user_meta_data->>'role',
-- which is unvalidated client input the insert guard is about to discard anyway.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_dob DATE;
  v_consent_keys TEXT[];
  v_consent_locale TEXT;
BEGIN
  -- Signup metadata is unvalidated user input (see 063), and a malformed date
  -- here would abort the whole INSERT and leave an auth user with no profile.
  -- A bad value is therefore treated exactly like an absent one: the account
  -- gets sent to onboarding to declare properly.
  BEGIN
    v_dob := NULLIF(NEW.raw_user_meta_data->>'date_of_birth', '')::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_dob := NULL;
  END;

  IF v_dob IS NOT NULL AND (v_dob > CURRENT_DATE
                            OR v_dob <= DATE '1900-01-01'
                            OR v_dob > (CURRENT_DATE - INTERVAL '13 years')) THEN
    v_dob := NULL;
  END IF;

  -- Same treatment for the consent list: malformed metadata is treated as
  -- absent, which leaves requires_consent TRUE and routes the account to
  -- onboarding to be asked properly. Never an exception — an unparseable array
  -- must not cost somebody their account.
  BEGIN
    SELECT array_agg(x) INTO v_consent_keys
    FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'legal_consent') AS x;
  EXCEPTION WHEN OTHERS THEN
    v_consent_keys := NULL;
  END;

  v_consent_locale := COALESCE(NULLIF(NEW.raw_user_meta_data->>'legal_consent_locale', ''), 'en');
  IF v_consent_locale NOT IN ('en', 'fr', 'es', 'pseudo') THEN
    v_consent_locale := 'en';
  END IF;

  INSERT INTO public.profiles (
    id, display_name, avatar_url, roles, bio, country, organization, industry,
    skills, interests, open_to, phone, website, languages,
    is_minor, requires_age_declaration, age_declared_at,
    requires_mfa_enrollment, mfa_enrolled_at, mfa_grandfathered
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.email
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IS NOT NULL
      THEN ARRAY[NEW.raw_user_meta_data->>'role']
      ELSE ARRAY[]::TEXT[]
    END,
    NEW.raw_user_meta_data->>'bio',
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'organization',
    NEW.raw_user_meta_data->>'industry',
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'skills') AS x),
      ARRAY[]::TEXT[]
    ),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'interests') AS x),
      ARRAY[]::TEXT[]
    ),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'open_to') AS x),
      ARRAY[]::TEXT[]
    ),
    -- 'phone_number' first: that is the OIDC claim name the Virtual Campus
    -- callback forwards, and api/auth/vc/callback.ts sets it verbatim.
    COALESCE(
      NEW.raw_user_meta_data->>'phone_number',
      NEW.raw_user_meta_data->>'phone'
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'website',
      NEW.raw_user_meta_data->>'profile_url'
    ),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'languages') AS x),
      ARRAY[]::TEXT[]
    ),
    COALESCE(v_dob > (CURRENT_DATE - INTERVAL '18 years'), FALSE),
    v_dob IS NULL,
    CASE WHEN v_dob IS NOT NULL THEN now() END,
    FALSE,
    NULL,
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_dob IS NOT NULL THEN
    INSERT INTO public.account_age (user_id, date_of_birth, source)
    VALUES (NEW.id, v_dob, 'signup')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- The version comes from the register, never from the metadata, for the same
  -- reason record_consent() refuses a client-supplied one.
  IF v_consent_keys IS NOT NULL AND array_length(v_consent_keys, 1) > 0 THEN
    INSERT INTO public.user_consents (user_id, document_key, version, locale, context)
    SELECT NEW.id, d.key, d.version, v_consent_locale, 'signup'
    FROM public.legal_documents d
    WHERE d.is_current
      AND d.bundle = 'account'
      AND d.key = ANY(v_consent_keys)
    ON CONFLICT (user_id, document_key, version) DO NOTHING;
  END IF;

  PERFORM public.refresh_consent_state(NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------------
-- 8. Derive at INSERT
-- ---------------------------------------------------------------------------
-- Restated in full from 115. Two additions: mfa_grandfathered is forced FALSE so
-- a hand-rolled INSERT cannot exempt itself, and the requirement is derived from
-- the STRIPPED role list.
--
-- The role membership test is inlined rather than calling account_mfa_required()
-- because the profiles row does not exist yet at BEFORE INSERT: that function
-- would find no row, read mfa_grandfathered as absent, and the whole predicate
-- would collapse to FALSE — quietly exempting every new signup.
CREATE OR REPLACE FUNCTION guard_profile_insert_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.roles := COALESCE(ARRAY(
    SELECT slug FROM unnest(COALESCE(NEW.roles, ARRAY[]::TEXT[])) AS slug
    WHERE EXISTS (
      SELECT 1 FROM role_definitions rd WHERE rd.slug = slug AND rd.is_self_assignable
    )
  ), ARRAY[]::TEXT[]);

  NEW.is_verified := FALSE;
  NEW.is_suspended := FALSE;

  NEW.is_minor := account_is_minor(NEW.id);
  NEW.requires_age_declaration := NOT EXISTS (SELECT 1 FROM account_age WHERE user_id = NEW.id);
  NEW.age_declared_at := (SELECT declared_at FROM account_age WHERE user_id = NEW.id);

  -- Derived from user_consents rather than from the submitted row, so it cannot
  -- be spoofed by whoever is doing the inserting.
  NEW.requires_consent := account_owes_consent(NEW.id);
  NEW.consent_recorded_at := (SELECT MAX(accepted_at) FROM user_consents WHERE user_id = NEW.id);

  NEW.mfa_grandfathered := FALSE;
  NEW.requires_mfa_enrollment :=
    EXISTS (
      SELECT 1 FROM role_definitions rd
      WHERE rd.requires_mfa AND rd.slug = ANY(expand_roles(NEW.roles))
    )
    AND NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = NEW.id AND f.status = 'verified'
    );
  NEW.mfa_enrolled_at := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_insert_roles_trigger ON profiles;
CREATE TRIGGER guard_profile_insert_roles_trigger
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profile_insert_roles();

-- ---------------------------------------------------------------------------
-- 9. Guard the derived columns against self-service
-- ---------------------------------------------------------------------------
-- Restated in full from 117 (which restated 116, which restated 115, which
-- restated 091). IMPORTANT, and inherited from 117's own note: the suspension
-- and verification branches below are the capability-keyed versions 116
-- introduced, not 115's role-keyed ones. Restating the older text here would
-- silently revoke the People supervisor's Verify button.
--
-- Two additions, and their ORDER matters:
--
--   * The RAISE block runs first and rejects a client-supplied delta. The
--     profiles self-UPDATE policy is column-agnostic, so without it a member
--     PATCHes `requires_mfa_enrollment: false` and walks past the gate in one
--     call. mfa_grandfathered sits in the same block for the same reason — it is
--     an even shorter route to the same bypass.
--
--   * The derive block runs after the role validation, on the server's own
--     recomputation rather than on anything the client sent. A member who adds
--     `entrepreneur` to an account they already hold starts owing enrolment from
--     that update, not from signup.
--
-- The is_platform_admin() early return above means an administrator editing
-- someone's roles skips the derive. ensure_my_mfa_status() corrects that target
-- on their next sign-in, which is acceptable for a UI hint.
CREATE OR REPLACE FUNCTION guard_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_added TEXT[];
  v_illegal TEXT[];
BEGIN
  IF v_actor IS NULL OR current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  IF is_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
      OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
      OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason)
     AND NOT has_permission(v_actor, 'moderation:escalate') THEN
    RAISE EXCEPTION 'suspension state can only be changed by a platform admin';
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     AND NOT has_permission(v_actor, 'verification:review') THEN
    RAISE EXCEPTION 'verification state can only be changed by a platform admin';
  END IF;

  IF NEW.is_minor IS DISTINCT FROM OLD.is_minor
     OR NEW.requires_age_declaration IS DISTINCT FROM OLD.requires_age_declaration
     OR NEW.age_declared_at IS DISTINCT FROM OLD.age_declared_at THEN
    RAISE EXCEPTION 'age status is derived from the declared date of birth and cannot be set directly';
  END IF;

  IF NEW.requires_consent IS DISTINCT FROM OLD.requires_consent
     OR NEW.consent_recorded_at IS DISTINCT FROM OLD.consent_recorded_at THEN
    RAISE EXCEPTION 'consent state is derived from recorded acceptances and cannot be set directly';
  END IF;

  -- Strikes are derived from actioned, unreversed notices. The only way to
  -- clear one is a counter-notice that succeeds.
  IF NEW.copyright_strikes IS DISTINCT FROM OLD.copyright_strikes
     OR NEW.copyright_strike_at IS DISTINCT FROM OLD.copyright_strike_at THEN
    RAISE EXCEPTION 'copyright strike state is derived from takedown notices and cannot be set directly';
  END IF;

  -- MFA state is derived from role_definitions.requires_mfa and auth.mfa_factors.
  IF NEW.requires_mfa_enrollment IS DISTINCT FROM OLD.requires_mfa_enrollment
     OR NEW.mfa_enrolled_at IS DISTINCT FROM OLD.mfa_enrolled_at
     OR NEW.mfa_grandfathered IS DISTINCT FROM OLD.mfa_grandfathered THEN
    RAISE EXCEPTION 'mfa enrolment state is derived and cannot be set directly';
  END IF;

  IF NEW.roles IS DISTINCT FROM OLD.roles THEN
    v_added := ARRAY(
      SELECT unnest(COALESCE(NEW.roles, ARRAY[]::TEXT[]))
      EXCEPT
      SELECT unnest(COALESCE(OLD.roles, ARRAY[]::TEXT[]))
    );

    SELECT ARRAY_AGG(slug) INTO v_illegal
    FROM unnest(v_added) AS slug
    WHERE NOT EXISTS (
      SELECT 1 FROM role_definitions rd
      WHERE rd.slug = slug AND rd.is_self_assignable
    );

    IF v_illegal IS NOT NULL AND array_length(v_illegal, 1) > 0 THEN
      RAISE EXCEPTION 'role(s) % require verification or an administrator', array_to_string(v_illegal, ', ');
    END IF;

    -- See the header note on ordering. Grandfathered accounts stay exempt:
    -- taking on a new role is not the moment to spring a requirement on a member
    -- who predates it.
    IF NOT COALESCE(NEW.mfa_grandfathered, FALSE) THEN
      NEW.requires_mfa_enrollment :=
        EXISTS (
          SELECT 1 FROM role_definitions rd
          WHERE rd.requires_mfa AND rd.slug = ANY(expand_roles(NEW.roles))
        )
        AND NOT EXISTS (
          SELECT 1 FROM auth.mfa_factors f
          WHERE f.user_id = NEW.id AND f.status = 'verified'
        );
    END IF;
  END IF;

  IF NEW.active_role IS NOT NULL AND NOT (NEW.active_role = ANY(COALESCE(NEW.roles, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION 'active_role % is not held by this account', NEW.active_role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_privileged_columns_trigger ON profiles;
CREATE TRIGGER guard_profile_privileged_columns_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- 10. RLS on the recovery codes
-- ---------------------------------------------------------------------------
ALTER TABLE mfa_backup_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members see their own recovery code rows" ON mfa_backup_codes;
CREATE POLICY "Members see their own recovery code rows"
  ON mfa_backup_codes FOR SELECT
  USING (auth.uid() = user_id);
-- No INSERT, UPDATE or DELETE policy at all — every write is one of the
-- SECURITY DEFINER functions in section 5. Same shape as account_age (091).
-- The SELECT policy exists only so a member can be told how many codes remain
-- without the client needing a service-role key; the hash it can read is bcrypt
-- and discloses nothing.

-- ---------------------------------------------------------------------------
-- 11. Server-side enforcement, first pass
-- ---------------------------------------------------------------------------
-- A client-side redirect is not a security control. These are the write paths
-- where the threat is real enough to be worth the regression risk: money, the
-- primary create action, and reaching other members.
--
-- TWO FOOTGUNS, both load-bearing:
--
--   1. A RESTRICTIVE policy ANDs with EVERY other policy on the table, admin
--      ones included. Without the is_platform_admin() escape an unenrolled
--      administrator loses their own tools on deploy — and cannot reach the
--      admin UI to fix it. Every predicate below carries it.
--
--   2. SECURITY DEFINER RPCs bypass RLS entirely, so a restrictive policy does
--      nothing about a write that arrives through one. That is why the grant
--      check below is also duplicated into a TRIGGER, which fires regardless of
--      who is calling.

DROP POLICY IF EXISTS "MFA required to apply for grants" ON grant_applications;
CREATE POLICY "MFA required to apply for grants"
  ON grant_applications AS RESTRICTIVE FOR INSERT
  WITH CHECK (account_mfa_satisfied(auth.uid()) OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "MFA required to edit grant applications" ON grant_applications;
CREATE POLICY "MFA required to edit grant applications"
  ON grant_applications AS RESTRICTIVE FOR UPDATE
  USING (account_mfa_satisfied(auth.uid()) OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "MFA required to create projects" ON projects;
CREATE POLICY "MFA required to create projects"
  ON projects AS RESTRICTIVE FOR INSERT
  WITH CHECK (account_mfa_satisfied(auth.uid()) OR is_platform_admin(auth.uid()));

-- Restated in full from 111_org_member_engagement (whose body was 110's plus the
-- organisation gate). The addition is the enrolment check — placed here as well
-- as in the policy above because this trigger is what catches the SECURITY
-- DEFINER paths RLS cannot see, and because RLS gives an opaque 42501 while this
-- is the one place in the stack that can say why in words.
CREATE OR REPLACE FUNCTION enforce_grant_application_sponsor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT has_permission(NEW.user_id, 'grant:apply') THEN
    RAISE EXCEPTION 'this account is not permitted to submit grant applications';
  END IF;

  -- New in 111.
  IF NOT COALESCE(can_engage_with_grant(NEW.grant_id, NEW.user_id), FALSE) THEN
    RAISE EXCEPTION 'your organisation has turned off grant applications for its members';
  END IF;

  -- New in 118: an account that owes a second factor may hold a draft, but may
  -- not submit. Checked against the application's owner rather than auth.uid(),
  -- so an administrator acting on someone's behalf cannot launder the
  -- requirement.
  IF NOT account_mfa_satisfied(NEW.user_id) THEN
    RAISE EXCEPTION 'this account must finish setting up two-factor authentication before submitting';
  END IF;

  -- A nominated sponsor still has to be one. An application naming a sponsor
  -- who cannot sponsor would carry an endorsement that means nothing.
  IF NEW.sponsor_id IS NOT NULL
     AND NEW.sponsor_approved_at IS NOT NULL
     AND NOT has_permission(NEW.sponsor_id, 'grant:sponsor') THEN
    RAISE EXCEPTION 'the nominated sponsor is not permitted to sponsor applications';
  END IF;

  RETURN NEW;
END;
$$;

-- Messaging. Restated in full from 091, which is still the live version of both
-- policies — every existing clause verbatim, the addition is the last one on
-- each. An account that owes enrolment may read the threads it is already in; it
-- may not open one or send into one.
DROP POLICY IF EXISTS "Authenticated users can add participants" ON conversation_participants;
CREATE POLICY "Authenticated users can add participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    (
      user_id = auth.uid()
      OR is_conversation_creator(conversation_id, auth.uid())
      OR is_conversation_admin(conversation_id, auth.uid())
    )
    AND (
      -- Safeguarding (064): a 1-to-1 thread may never hold a student.
      EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.is_group)
      OR (
        NOT EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = conversation_participants.user_id AND 'student' = ANY(p.roles)
        )
        AND NOT conversation_has_student(conversation_id)
      )
    )
    AND (
      -- Privacy (083): a private member is reachable only by a connection.
      EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.is_group)
      OR can_dm(auth.uid(), conversation_participants.user_id)
    )
    AND (
      -- Age (091): a 1-to-1 thread may not pair an adult with a minor.
      EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.is_group)
      OR NOT EXISTS (
        SELECT 1 FROM conversation_participants existing
        WHERE existing.conversation_id = conversation_participants.conversation_id
          AND existing.user_id <> conversation_participants.user_id
          AND NOT age_permits_dm(existing.user_id, conversation_participants.user_id)
      )
    )
    AND (
      -- MFA (118): an account that owes enrolment does not start conversations.
      account_mfa_satisfied(auth.uid()) OR is_platform_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can send messages to own conversations" ON messages;
CREATE POLICY "Users can send messages to own conversations"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
      AND user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE c.id = messages.conversation_id
        AND c.is_group = FALSE
        AND cp.user_id <> auth.uid()
        AND NOT age_permits_dm(auth.uid(), cp.user_id)
    )
    -- MFA (118).
    AND (account_mfa_satisfied(auth.uid()) OR is_platform_admin(auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 12. Enforcing the back catalogue — DELIBERATELY NOT RUN
-- ---------------------------------------------------------------------------
-- Everything above applies to accounts created from 118 onwards. Existing
-- entrepreneurs stay exempt via profiles.mfa_grandfathered.
--
-- Bringing them in scope is one statement. It is left commented out because it
-- is a product decision with an operational tail, not a schema change:
--
--   * members must be told, with notice, before their next sign-in becomes a
--     wall;
--   * api/admin/reset-mfa.ts must be deployed and somebody must be on call for
--     the "lost my phone, lost my codes" tickets it exists to answer;
--   * a support runbook has to exist before the first ticket, not after it.
--
-- Uncomment, review, and ship as its own migration when those three are true.
--
--   UPDATE profiles p
--   SET mfa_grandfathered = FALSE
--   WHERE p.mfa_grandfathered
--     AND EXISTS (
--       SELECT 1 FROM role_definitions rd
--       WHERE rd.requires_mfa AND rd.slug = ANY(expand_roles(p.roles))
--     );

-- ============================================================================
-- Verification
--
--   SELECT slug, requires_mfa FROM role_definitions WHERE requires_mfa;
--   -- entrepreneur only
--
--   SELECT count(*) FILTER (WHERE mfa_grandfathered) AS grandfathered,
--          count(*) FILTER (WHERE requires_mfa_enrollment) AS owing
--     FROM profiles;
--   -- `owing` must be 0 immediately after this migration
--
--   SELECT account_mfa_required('<a post-118 entrepreneur uuid>');  -- true
--   SELECT account_mfa_required('<a pre-118 entrepreneur uuid>');   -- false
-- ============================================================================

NOTIFY pgrst, 'reload schema';
