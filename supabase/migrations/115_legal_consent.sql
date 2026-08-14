-- ============================================================================
-- 115_legal_consent.sql — a versioned record of what each member agreed to
-- ============================================================================
--
-- The platform publishes fourteen legal documents (src/lib/legal). Four of them
-- are accepted at sign-up, two before publishing, one before entering a
-- competition, one before submitting a grant application. Until now none of that
-- was recorded anywhere: there was no acceptance checkbox, no timestamp, and no
-- way to answer "which version of the Terms was this member shown?".
--
-- The design follows 091_account_age almost exactly, for the same reason. The
-- value of a consent record is entirely in its trustworthiness, so:
--
--   * user_consents has NO insert policy at all. The only way a row appears is
--     record_consent(), which is SECURITY DEFINER.
--   * The VERSION IS NOT A PARAMETER. The client names which documents it
--     displayed; the server reads which version those documents were at. A
--     client-supplied version is a client's claim about what it rendered, and
--     that claim is precisely what this table exists not to rely on.
--   * profiles.requires_consent is derived, guarded, and never directly
--     writable — otherwise a member PATCHes it to false and walks past the gate.
--   * Rows are append-only: no UPDATE policy, no DELETE policy.
--
-- CREATE OR REPLACE keeps grants but resets every property not restated, so
-- handle_new_user(), guard_profile_privileged_columns() and
-- guard_profile_insert_roles() are all carried across from 091 in full. Editing
-- them in place there instead would leave this migration unable to run on a
-- database that had already applied it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The register of published documents
-- ---------------------------------------------------------------------------
-- A deployment artefact, not admin data: a version arrives by migration,
-- alongside the code that renders it. There is deliberately no admin screen and
-- no write policy, because a version row that can be edited without shipping the
-- corresponding text is a row that can disagree with what members actually read.
CREATE TABLE IF NOT EXISTS legal_documents (
  key            TEXT    NOT NULL,
  version        INTEGER NOT NULL CHECK (version > 0),
  effective_date DATE    NOT NULL,
  -- Which gate asks for it. 'informational' is published but never prompted.
  bundle         TEXT    NOT NULL DEFAULT 'informational'
                 CHECK (bundle IN ('account', 'publishing', 'competition', 'application', 'informational')),
  is_current     BOOLEAN NOT NULL DEFAULT FALSE,
  -- English title. The rendered copy lives in src/lib/legal; this is for admin
  -- reads and for anything querying the register directly.
  title          TEXT    NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (key, version)
);

-- Exactly one current version per key. A partial unique index rather than a
-- trigger: the invariant IS the constraint, and a trigger would have to be
-- restated by every later migration that touched this table.
CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_documents_current
  ON legal_documents(key) WHERE is_current;

-- ---------------------------------------------------------------------------
-- 2. The acceptances
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_consents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_key TEXT NOT NULL,
  version      INTEGER NOT NULL,
  accepted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The catalog the member was READING, not a preference. Evidence of which
  -- text was in front of them, which matters because the English version is the
  -- authoritative one and a French reader accepted a translation of it.
  locale       TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'fr', 'es', 'pseudo')),
  -- Where it was collected. Rendered in Settings as plain English ("at
  -- sign-up", "when publishing a project").
  context      TEXT NOT NULL DEFAULT 'signup' CHECK (context IN (
    'signup', 'onboarding', 'reconsent', 'settings',
    'project', 'event', 'forum_post', 'cv_publish', 'org_publish',
    'event_solution', 'grant_application'
  )),
  user_agent   TEXT,
  -- Present, never written from the RPC path, and that is deliberate. The
  -- Privacy Policy already promises IPs are salted-hashed before storage (the
  -- translation throttle is the precedent); a raw IP on a consent row would be
  -- new personal data collected in order to evidence permission to collect
  -- personal data; and Postgres cannot see the caller's address anyway — only a
  -- Vercel edge function sees x-forwarded-for. Left here so a later hardening
  -- pass has somewhere to put a hash written by an api/ function.
  ip_hash      TEXT,
  FOREIGN KEY (document_key, version) REFERENCES legal_documents(key, version),
  -- One row per member per document version. This constraint, plus ON CONFLICT
  -- DO NOTHING below, is what makes "prompt once per version" a property of the
  -- data rather than something the UI has to remember — and it is why creating a
  -- second project does not write a second row.
  UNIQUE (user_id, document_key, version)
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user ON user_consents(user_id);

-- ---------------------------------------------------------------------------
-- 3. Profile-side flag
-- ---------------------------------------------------------------------------
-- Derived, but stored: ProtectedRoute has to decide whether to redirect during
-- the same render that reads the profile, and a second async source there
-- reopens exactly the loading-order bug AuthContext documents. Defaults FALSE,
-- so this migration interrupts nobody who already has an account — existing
-- members are asked through the re-consent banner instead.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS requires_consent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consent_recorded_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 4. Derivation
-- ---------------------------------------------------------------------------
-- Does this account still owe an account-bundle acceptance?
CREATE OR REPLACE FUNCTION account_owes_consent(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM legal_documents d
    WHERE d.is_current
      AND d.bundle = 'account'
      AND NOT EXISTS (
        SELECT 1 FROM user_consents c
        WHERE c.user_id = p_user
          AND c.document_key = d.key
          AND c.version = d.version
      )
  );
$$;

-- Recompute the cached flag. Uses the same bypass handshake as
-- sync_profile_minor_status(), because the guard below would otherwise reject
-- this write as an attempt to set a derived column.
CREATE OR REPLACE FUNCTION refresh_consent_state(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owes BOOLEAN;
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;

  v_owes := account_owes_consent(p_user);

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET requires_consent = v_owes,
      consent_recorded_at = CASE
        WHEN v_owes THEN consent_recorded_at
        ELSE COALESCE(
          consent_recorded_at,
          (SELECT MAX(accepted_at) FROM user_consents WHERE user_id = p_user)
        )
      END,
      updated_at = now()
  WHERE id = p_user
    AND (requires_consent IS DISTINCT FROM v_owes OR consent_recorded_at IS NULL);
END;
$$;

-- Opportunistic housekeeping, the pattern 056, 068 and 091 all use in place of
-- the pg_cron this project does not have. AuthContext calls it once per session,
-- so a member whose outstanding set changed because a NEW VERSION SHIPPED finds
-- out on their next sign-in without any scheduled job.
CREATE OR REPLACE FUNCTION ensure_my_consent_state()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM refresh_consent_state(v_actor);
  RETURN account_owes_consent(v_actor);
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_my_consent_state() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Recording an acceptance
-- ---------------------------------------------------------------------------
-- p_keys says which documents were displayed. p_expected_version is a
-- CROSS-CHECK, not an input: if the client's bundled copy is a version behind
-- the register — a browser holding a stale chunk after a deploy — this fails
-- loudly rather than recording consent to text nobody was shown. The version
-- actually stored always comes from legal_documents.
CREATE OR REPLACE FUNCTION record_consent(
  p_keys             TEXT[],
  p_locale           TEXT    DEFAULT 'en',
  p_context          TEXT    DEFAULT 'signup',
  p_user_agent       TEXT    DEFAULT NULL,
  p_expected_version INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_written INTEGER := 0;
  v_matched INTEGER := 0;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
  END IF;

  IF p_keys IS NULL OR array_length(p_keys, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_documents');
  END IF;

  SELECT COUNT(*) INTO v_matched
  FROM legal_documents d
  WHERE d.is_current AND d.key = ANY(p_keys);

  IF v_matched <> array_length(p_keys, 1) THEN
    -- A key the register does not know, or one with no current version. Almost
    -- always a deploy that ran ahead of its migration.
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unknown_document');
  END IF;

  IF p_expected_version IS NOT NULL AND EXISTS (
       SELECT 1 FROM legal_documents d
       WHERE d.is_current AND d.key = ANY(p_keys) AND d.version <> p_expected_version
     ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'version_mismatch');
  END IF;

  INSERT INTO user_consents (user_id, document_key, version, locale, context, user_agent)
  SELECT
    v_actor,
    d.key,
    d.version,
    CASE WHEN p_locale IN ('en', 'fr', 'es', 'pseudo') THEN p_locale ELSE 'en' END,
    COALESCE(NULLIF(p_context, ''), 'signup'),
    left(p_user_agent, 400)
  FROM legal_documents d
  WHERE d.is_current AND d.key = ANY(p_keys)
  ON CONFLICT (user_id, document_key, version) DO NOTHING;

  GET DIAGNOSTICS v_written = ROW_COUNT;

  PERFORM refresh_consent_state(v_actor);

  RETURN jsonb_build_object('ok', TRUE, 'recorded', v_written);
END;
$$;

GRANT EXECUTE ON FUNCTION record_consent(TEXT[], TEXT, TEXT, TEXT, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Reading consent state
-- ---------------------------------------------------------------------------
-- One round trip answers all three questions the UI has: what exists, what I
-- accepted, and what I still owe. The publishing gate, the Settings tab and the
-- re-consent banner all read this same result out of one cached query.
CREATE OR REPLACE FUNCTION get_my_consents()
RETURNS TABLE (
  document_key     TEXT,
  title            TEXT,
  bundle           TEXT,
  current_version  INTEGER,
  effective_date   DATE,
  accepted_version INTEGER,
  accepted_at      TIMESTAMPTZ,
  locale           TEXT,
  context          TEXT,
  is_outstanding   BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.key,
    d.title,
    d.bundle,
    d.version,
    d.effective_date,
    c.version,
    c.accepted_at,
    c.locale,
    c.context,
    (d.bundle <> 'informational' AND c.version IS NULL)
  FROM legal_documents d
  LEFT JOIN user_consents c
    ON c.user_id = auth.uid()
   AND c.document_key = d.key
   AND c.version = d.version
  WHERE d.is_current
  ORDER BY d.bundle, d.key;
$$;

GRANT EXECUTE ON FUNCTION get_my_consents() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;

-- The register of what is in force is public: a signed-out visitor reading
-- /legal must be able to see which version they are looking at.
DROP POLICY IF EXISTS "Legal documents are public" ON legal_documents;
CREATE POLICY "Legal documents are public" ON legal_documents
  FOR SELECT USING (TRUE);

GRANT SELECT ON legal_documents TO anon, authenticated;

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their own consents" ON user_consents;
CREATE POLICY "Members read their own consents" ON user_consents
  FOR SELECT USING (
    user_id = auth.uid()
    OR has_permission(auth.uid(), 'moderation:view')
  );

-- No INSERT policy, exactly as 091 does for account_age: record_consent() is the
-- only way in, and that is what makes the stored version trustworthy. No UPDATE
-- and no DELETE either — a consent record is append-only evidence, and the point
-- of evidence is that it cannot be revised after the fact.
GRANT SELECT ON user_consents TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Seed the register
-- ---------------------------------------------------------------------------
-- Mirrors src/lib/legal/*.ts. The version and effective_date here MUST match the
-- document module of the same key — legal-content.test.ts guards the module
-- side, and record_consent's p_expected_version catches a mismatch at runtime.
INSERT INTO legal_documents (key, version, effective_date, bundle, is_current, title) VALUES
  ('terms',                       1, DATE '2026-09-01', 'account',       TRUE, 'Terms of Use'),
  ('privacy',                     1, DATE '2026-09-01', 'account',       TRUE, 'Privacy Policy'),
  ('acceptable-use',              1, DATE '2026-09-01', 'account',       TRUE, 'Acceptable Use & Community Guidelines'),
  ('safeguarding',                1, DATE '2026-09-01', 'account',       TRUE, 'Minor Safeguarding Statement'),
  ('content-licence',             1, DATE '2026-09-01', 'publishing',    TRUE, 'IP, Content & Licensing Policy'),
  ('copyright',                   1, DATE '2026-09-01', 'publishing',    TRUE, 'Copyright & Takedown Policy'),
  ('competition-ip',              1, DATE '2026-09-01', 'competition',   TRUE, 'Submission & Competition IP Terms'),
  ('application-confidentiality', 1, DATE '2026-09-01', 'application',   TRUE, 'Grant Application Confidentiality & IP'),
  ('cookies',                     1, DATE '2026-09-01', 'informational', TRUE, 'Cookie & Storage Notice'),
  ('ai-disclosure',               1, DATE '2026-09-01', 'informational', TRUE, 'AI Use Disclosure'),
  ('funding-disclaimer',          1, DATE '2026-09-01', 'informational', TRUE, 'Grant & Funding Disclaimer'),
  ('trademark',                   1, DATE '2026-09-01', 'informational', TRUE, 'Trademark & Brand Use'),
  ('code-contribution',           1, DATE '2026-09-01', 'informational', TRUE, 'Open-Source & Code Contribution Terms'),
  ('partner-api',                 1, DATE '2026-09-01', 'informational', TRUE, 'Partner API Terms')
ON CONFLICT (key, version) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. Seed consent from signup metadata
-- ---------------------------------------------------------------------------
-- Restated in full from 091 for the CREATE OR REPLACE reason given at the top.
-- The addition is the consent tail.
--
-- Why metadata and not an RPC call from the client: with email confirmation
-- enabled, supabase.auth.signUp() returns with NO SESSION. auth.uid() is null,
-- so record_consent() would refuse — while the auth user and its profile
-- already exist, because this trigger has already fired. An account would sit
-- there confirmed-pending with no consent on file for as long as the email went
-- unread. Writing it here puts the consent rows in the same transaction as the
-- profile, which is exactly what 091 does with the date of birth.
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
    is_minor, requires_age_declaration, age_declared_at
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
    CASE WHEN v_dob IS NOT NULL THEN now() END
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
-- 10. Guard the derived columns against self-service
-- ---------------------------------------------------------------------------
-- Restated in full from 091. The addition is the requires_consent /
-- consent_recorded_at block: the profiles self-UPDATE policy is column-agnostic,
-- so without this a member PATCHes requires_consent to false and walks straight
-- past the gate — the same hole 091 closed for minor mode.
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
  -- service_role has no JWT subject; trusted RPCs opt in explicitly.
  IF v_actor IS NULL OR current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  IF is_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
     OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
     OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
    RAISE EXCEPTION 'suspension state can only be changed by a platform admin';
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'verification state can only be changed by a platform admin';
  END IF;

  -- Age state is derived from account_age and is never a direct write. Even a
  -- platform admin goes through set_account_date_of_birth() so the declaration
  -- and the flag cannot disagree.
  IF NEW.is_minor IS DISTINCT FROM OLD.is_minor
     OR NEW.requires_age_declaration IS DISTINCT FROM OLD.requires_age_declaration
     OR NEW.age_declared_at IS DISTINCT FROM OLD.age_declared_at THEN
    RAISE EXCEPTION 'age status is derived from the declared date of birth and cannot be set directly';
  END IF;

  -- Consent state is derived from user_consents the same way, and for a
  -- stronger reason: this flag is the only thing standing between an account
  -- and the content it has not agreed to publish under.
  IF NEW.requires_consent IS DISTINCT FROM OLD.requires_consent
     OR NEW.consent_recorded_at IS DISTINCT FROM OLD.consent_recorded_at THEN
    RAISE EXCEPTION 'consent state is derived from recorded acceptances and cannot be set directly';
  END IF;

  -- Only newly ADDED roles are validated. Removing a role from yourself is
  -- always allowed, and existing rows are never re-checked — which is what
  -- keeps accounts that already hold faculty/student slugs editable.
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
  END IF;

  -- The active context must be a role the account actually holds.
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

-- The same at INSERT, restated from 091. AuthContext.fetchProfileQuery still has
-- a client-side fallback insert for accounts whose trigger never ran, and
-- without this that path would create a profile that owes no consent and is
-- never asked for any.
--
-- handle_new_user() inserts the profile before the consent rows, so its own
-- insert lands here with requires_consent TRUE and is corrected a statement
-- later by refresh_consent_state(). Both orders arrive at the same state.
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_insert_roles_trigger ON profiles;
CREATE TRIGGER guard_profile_insert_roles_trigger
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profile_insert_roles();

NOTIFY pgrst, 'reload schema';
