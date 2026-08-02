-- ============================================================================
-- 091_account_age.sql — every new account declares a date of birth
-- ============================================================================
-- Until now no signup path asked how old anyone was. Email signup, Google and
-- Microsoft OAuth, and the Virtual Campus SSO all created a usable account with
-- no age on file at all. `student_safeguarding` (064) held a birth *year*, but
-- only for students who had already verified with an institution, only if they
-- later typed it into Settings, and its `is_minor` flag was never read by
-- anything — the "supervised channels only" promise in StudentVerificationCard
-- was copy with no enforcement behind it.
--
-- This migration adds the declaration, and makes the resulting minor status
-- actually gate something.
--
-- Scope is deliberately NEW ACCOUNTS ONLY. `requires_age_declaration` defaults
-- to FALSE, so every row that already exists is untouched and no current member
-- is ever interrupted. Only handle_new_user() sets it TRUE, and only for
-- accounts created from here on.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The declaration itself
-- ---------------------------------------------------------------------------
-- Full date of birth, not the year-only shape 064 used. That is a deliberate
-- reversal, so the value is quarantined: it lives in its own table behind its
-- own RLS, is never copied onto `profiles`, and nothing in the app reads it
-- back. Everything downstream consumes the derived boolean instead.
--
-- Write-once by design. There is no self-UPDATE policy: an account that could
-- edit its own date of birth is an account that can leave minor mode, so a
-- correction is an admin action (set_account_date_of_birth below).
CREATE TABLE IF NOT EXISTS account_age (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  date_of_birth DATE NOT NULL
    CHECK (date_of_birth > DATE '1900-01-01' AND date_of_birth <= CURRENT_DATE),
  declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Where the value came from, for audit. Not a trust level.
  source TEXT NOT NULL DEFAULT 'signup'
    CHECK (source IN ('signup', 'onboarding', 'vc_sso', 'admin'))
);

COMMENT ON TABLE account_age IS
  'Declared date of birth. Restricted: the member and moderation staff only. '
  'Read it through account_is_minor() — never join it into a public query.';

-- ---------------------------------------------------------------------------
-- 2. Profile-side columns (public, non-sensitive)
-- ---------------------------------------------------------------------------
-- `is_minor` is a UI hint and nothing more: it tells the client which affordances
-- to render. It is a cache of a value that changes on a birthday, so it can be a
-- day stale, and NOTHING that enforces safety may read it. See section 3.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_minor BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS requires_age_declaration BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_declared_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.is_minor IS
  'Cached, possibly one day stale. UI hint only — security checks call account_is_minor().';
COMMENT ON COLUMN profiles.requires_age_declaration IS
  'Set by handle_new_user() when a signup arrived with no date of birth (every OAuth signup). '
  'ProtectedRoute holds the account on /onboarding until it clears. Defaults FALSE so '
  'pre-091 accounts are out of scope.';

-- Directory and messaging lists filter on this.
CREATE INDEX IF NOT EXISTS idx_profiles_is_minor ON profiles(is_minor) WHERE is_minor;

-- ---------------------------------------------------------------------------
-- 3. Derivation
-- ---------------------------------------------------------------------------
-- The authoritative check. Computed from CURRENT_DATE on every call, so unlike
-- profiles.is_minor it cannot be stale — which matters because this project has
-- no pg_cron (see 068) and therefore nothing to sweep the cached column at
-- midnight.
--
-- SECURITY DEFINER so callers get the answer without being able to SELECT the
-- date of birth it came from. It returns a single boolean and leaks nothing
-- else, which is what makes it safe to grant broadly.
--
-- Unknown age is treated as adult. That is the honest reading: pre-091 accounts
-- never declared anything, and flagging them all as children would lock the
-- existing membership out of their own conversations.
CREATE OR REPLACE FUNCTION account_is_minor(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT date_of_birth > (CURRENT_DATE - INTERVAL '18 years')
       FROM account_age WHERE user_id = p_user),
    FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION account_is_minor(UUID) TO authenticated;

-- Keep the cached column in step whenever the declaration is written.
CREATE OR REPLACE FUNCTION sync_profile_minor_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET is_minor = (NEW.date_of_birth > (CURRENT_DATE - INTERVAL '18 years')),
      requires_age_declaration = FALSE,
      age_declared_at = COALESCE(age_declared_at, NEW.declared_at),
      updated_at = now()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_minor_status_trigger ON account_age;
CREATE TRIGGER sync_profile_minor_status_trigger
  AFTER INSERT OR UPDATE ON account_age
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_minor_status();

-- Opportunistic housekeeping, the same pattern 056 and 068 use in place of the
-- pg_cron this project does not have. AuthContext calls this once per session,
-- so an account that had a birthday since its last sign-in gets its cached flag
-- corrected the next time it appears. Cheap: one row, and a no-op write is
-- skipped entirely.
CREATE OR REPLACE FUNCTION ensure_my_minor_status()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actual BOOLEAN;
BEGIN
  IF v_actor IS NULL THEN
    RETURN FALSE;
  END IF;

  v_actual := account_is_minor(v_actor);

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET is_minor = v_actual, updated_at = now()
  WHERE id = v_actor AND is_minor IS DISTINCT FROM v_actual;

  RETURN v_actual;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_my_minor_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Writing a declaration
-- ---------------------------------------------------------------------------
-- The OAuth path. A Google or Microsoft account arrives with no birthday claim
-- at the scopes GoTrue asks for, so the value can only come from the onboarding
-- form — which means it arrives as ordinary client input and has to be
-- validated here rather than trusted.
--
-- Refuses a second call. Combined with the absent UPDATE policy, a date of
-- birth is settled once and then only an administrator can move it.
CREATE OR REPLACE FUNCTION declare_date_of_birth(p_dob DATE, p_source TEXT DEFAULT 'onboarding')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
  END IF;

  IF p_dob IS NULL OR p_dob > CURRENT_DATE OR p_dob <= DATE '1900-01-01' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_date');
  END IF;

  -- Mirrors dateOfBirthSchema in src/lib/validation.ts. Under 13 is refused
  -- outright rather than admitted to minor mode.
  IF p_dob > (CURRENT_DATE - INTERVAL '13 years') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'under_minimum_age');
  END IF;

  IF EXISTS (SELECT 1 FROM account_age WHERE user_id = v_actor) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'already_declared');
  END IF;

  INSERT INTO account_age (user_id, date_of_birth, source)
  VALUES (v_actor, p_dob, CASE WHEN p_source IN ('signup', 'onboarding', 'vc_sso') THEN p_source ELSE 'onboarding' END);

  RETURN jsonb_build_object('ok', TRUE, 'is_minor', account_is_minor(v_actor));
END;
$$;

GRANT EXECUTE ON FUNCTION declare_date_of_birth(DATE, TEXT) TO authenticated;

-- Corrections. Someone will mistype a year, and without this the only remedy is
-- deleting the account.
CREATE OR REPLACE FUNCTION set_account_date_of_birth(p_user UUID, p_dob DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT has_permission(v_actor, 'moderation:view') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_dob IS NULL OR p_dob > CURRENT_DATE OR p_dob <= DATE '1900-01-01' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_date');
  END IF;

  INSERT INTO account_age (user_id, date_of_birth, source)
  VALUES (p_user, p_dob, 'admin')
  ON CONFLICT (user_id) DO UPDATE
    SET date_of_birth = EXCLUDED.date_of_birth,
        source = 'admin',
        declared_at = now();

  RETURN jsonb_build_object('ok', TRUE, 'is_minor', account_is_minor(p_user));
END;
$$;

GRANT EXECUTE ON FUNCTION set_account_date_of_birth(UUID, DATE) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Seeding from signup metadata
-- ---------------------------------------------------------------------------
-- Restated in full from 082 for the reason that file gives: CREATE OR REPLACE
-- keeps grants but resets every property not restated, so SECURITY DEFINER has
-- to be repeated or the trigger loses the privilege it needs.
--
-- The addition is the tail: seed account_age when the signup carried a date of
-- birth, and otherwise mark the profile as owing one.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_dob DATE;
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------------
-- 6. Guard the derived columns against self-service
-- ---------------------------------------------------------------------------
-- Restated in full from 063 for the same CREATE OR REPLACE reason. The addition
-- is the is_minor / requires_age_declaration / age_declared_at block: the
-- profiles self-UPDATE policy is column-agnostic, so without this a member can
-- PATCH themselves out of minor mode and past the onboarding gate in one call.
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

-- The same at INSERT, restated from 063. AuthContext.fetchProfileQuery still has
-- a client-side fallback insert for accounts whose trigger never ran, and
-- without this that path would create a profile that owes no declaration and is
-- never asked for one. Derived from account_age rather than from the submitted
-- row, so it cannot be spoofed by whoever is doing the inserting.
--
-- handle_new_user() inserts the profile before the account_age row, so its own
-- insert lands here with the flag TRUE and is then cleared a statement later by
-- sync_profile_minor_status(). Both orders arrive at the same state.
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_insert_roles_trigger ON profiles;
CREATE TRIGGER guard_profile_insert_roles_trigger
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profile_insert_roles();

-- ---------------------------------------------------------------------------
-- 7. Minor-safe mode: no adult/minor one-to-one DM
-- ---------------------------------------------------------------------------
-- The restriction StudentVerificationCard has been promising since 064 and
-- nothing has ever enforced. Group conversations stay open — that is the
-- "supervised group channel" the copy describes, and it is supervised precisely
-- because it has other people in it. It is the private pair that is blocked.
--
-- Institution staff are the exception: a minor has to be able to talk to their
-- own school, and an educator has to be able to answer.
--
-- Named apart from can_dm() (083), which answers a different question — whether
-- a private member is reachable — and is composed with this one rather than
-- replaced by it.
CREATE OR REPLACE FUNCTION age_permits_dm(p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a_minor BOOLEAN;
  v_b_minor BOOLEAN;
  v_minor UUID;
  v_adult UUID;
BEGIN
  IF p_a IS NULL OR p_b IS NULL OR p_a = p_b THEN
    RETURN TRUE;
  END IF;

  v_a_minor := account_is_minor(p_a);
  v_b_minor := account_is_minor(p_b);

  -- Two adults, or two minors talking to each other: unchanged.
  IF v_a_minor = v_b_minor THEN
    RETURN TRUE;
  END IF;

  IF v_a_minor THEN
    v_minor := p_a; v_adult := p_b;
  ELSE
    v_minor := p_b; v_adult := p_a;
  END IF;

  -- Staff at an institution the minor belongs to, or a moderator.
  RETURN EXISTS (
    SELECT 1
    FROM institution_members im
    WHERE im.user_id = v_minor
      AND im.status = 'approved'
      AND is_institution_admin(im.institution_id, v_adult)
  ) OR has_permission(v_adult, 'moderation:view');
END;
$$;

REVOKE ALL ON FUNCTION age_permits_dm(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION age_permits_dm(UUID, UUID) TO authenticated;

-- Enforced where 064 and 083 already enforce their own messaging rules: the
-- participants INSERT policy, restated in full because that is how each of
-- those layers was added. Every existing clause is preserved verbatim; the
-- addition is the last one.
--
-- Checked against the participants already on the thread, not against the
-- inserting user: a 1-to-1 conversation is created by inserting two rows, and
-- the second one is where the pair actually forms.
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
  );

-- And again at send time, which 083 deliberately did NOT do for privacy: it
-- reasoned that a member who goes private should keep their live threads rather
-- than have them severed by a settings toggle.
--
-- Age is the case where that reasoning inverts. Two 17-year-olds may message
-- each other, and one of them turns 18 without doing anything at all — the pair
-- becomes an adult and a minor while the thread sits there. Nothing fires on a
-- birthday, so the join-time check can never catch it and the send-time one has
-- to.
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
  );

-- ---------------------------------------------------------------------------
-- 7b. Surface the derived flag on the member read path
-- ---------------------------------------------------------------------------
-- Restated in full from 083 — the only change is the trailing is_minor column.
-- PublicProfilePage renders its Message button from this row and from nothing
-- else, so without it the one surface built specifically for contacting a
-- member is the one surface that cannot tell it must not offer to.
--
-- Returned unconditionally rather than behind `v_allowed`: it is a boolean that
-- says "do not offer to message this person", which is exactly as useful to a
-- viewer who cannot see the rest of the profile.
DROP FUNCTION IF EXISTS get_profile_view(UUID);
CREATE FUNCTION get_profile_view(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  roles TEXT[],
  country TEXT,
  is_verified BOOLEAN,
  created_at TIMESTAMPTZ,
  profile_visibility TEXT,
  can_view BOOLEAN,
  bio TEXT,
  skills TEXT[],
  interests TEXT[],
  open_to TEXT[],
  organization TEXT,
  industry TEXT,
  phone TEXT,
  website TEXT,
  languages TEXT[],
  is_minor BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  v_allowed := can_view_profile(p_user_id);

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.roles,
    p.country,
    p.is_verified,
    p.created_at,
    p.profile_visibility,
    v_allowed,
    CASE WHEN v_allowed THEN p.bio END,
    CASE WHEN v_allowed THEN p.skills END,
    CASE WHEN v_allowed THEN p.interests END,
    CASE WHEN v_allowed THEN p.open_to END,
    CASE WHEN v_allowed THEN p.organization END,
    CASE WHEN v_allowed THEN p.industry END,
    CASE WHEN v_allowed THEN p.phone END,
    CASE WHEN v_allowed THEN p.website END,
    CASE WHEN v_allowed THEN p.languages END,
    -- Authoritative, not the cached column: this one is read to decide whether
    -- to render a button, and a stale answer renders one that fails.
    account_is_minor(p.id)
  FROM profiles p
  WHERE p.id = p_user_id
    AND (p.id = auth.uid() OR NOT is_suspended(p.id));
END;
$$;

REVOKE ALL ON FUNCTION get_profile_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_profile_view(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. RLS on the declaration
-- ---------------------------------------------------------------------------
ALTER TABLE account_age ENABLE ROW LEVEL SECURITY;

-- Same restriction the safeguarding records get in 064: the member themselves
-- and safety staff, nobody else — including platform admins without the
-- moderation permission.
DROP POLICY IF EXISTS "Age declarations are restricted" ON account_age;
CREATE POLICY "Age declarations are restricted"
  ON account_age FOR SELECT
  USING (
    user_id = auth.uid()
    OR has_permission(auth.uid(), 'moderation:view')
  );

-- No INSERT or UPDATE policy at all. Both routes in are SECURITY DEFINER
-- functions (declare_date_of_birth, set_account_date_of_birth) which is what
-- makes "write once, corrected only by staff" hold.

-- ---------------------------------------------------------------------------
-- 9. Fold student_safeguarding.birth_year into the declaration
-- ---------------------------------------------------------------------------
-- 064 gave verified students their own age record: a birth YEAR, typed into
-- Settings, with its own is_minor derived from it. Leaving that alongside
-- account_age would mean two age records per verified student, maintained
-- independently, free to disagree — and a disagreement here decides whether a
-- child is treated as a child.
--
-- So birth_year stops being an independent value and becomes a projection of
-- the declaration. The column stays: it is what a school's designated staff can
-- read (the safeguarding RLS lets them; account_age does not), and dropping it
-- would take that away. What changes is that nothing writes it by hand any more.
--
-- The year-only shape is kept on purpose. Institution staff get the coarser
-- value; the full date stays behind account_age's own policy.

-- Backfill both directions of what already exists.
UPDATE student_safeguarding s
SET birth_year = EXTRACT(YEAR FROM a.date_of_birth)::INTEGER,
    updated_at = now()
FROM account_age a
WHERE a.user_id = s.user_id
  AND s.birth_year IS DISTINCT FROM EXTRACT(YEAR FROM a.date_of_birth)::INTEGER;

-- A student who typed a year into Settings before 091 has an age on file, and
-- making them declare it again would be asking a question we already know the
-- answer to. 1 July is the midpoint of the year: it cannot be their real
-- birthday, but it is the least wrong single date derivable from a year alone,
-- and `source` records that it was inferred rather than declared.
--
-- It is deliberately NOT enough to clear requires_age_declaration on its own —
-- that flag is only ever set for accounts created after this migration, and
-- these are all older.
INSERT INTO account_age (user_id, date_of_birth, source)
SELECT s.user_id, make_date(s.birth_year, 7, 1), 'admin'
FROM student_safeguarding s
WHERE s.birth_year IS NOT NULL
  -- A year set to the current one lands in the future if this runs before July.
  AND make_date(s.birth_year, 7, 1) <= CURRENT_DATE
ON CONFLICT (user_id) DO NOTHING;

-- Keep the projection true from here on.
CREATE OR REPLACE FUNCTION sync_safeguarding_birth_year()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE student_safeguarding
  SET birth_year = EXTRACT(YEAR FROM NEW.date_of_birth)::INTEGER,
      updated_at = now()
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_safeguarding_birth_year_trigger ON account_age;
CREATE TRIGGER sync_safeguarding_birth_year_trigger
  AFTER INSERT OR UPDATE ON account_age
  FOR EACH ROW
  EXECUTE FUNCTION sync_safeguarding_birth_year();

-- And the other order: the safeguarding row is created when a student verifies,
-- which is usually long after they declared. Restated from 064 rather than
-- patched — the addition is the account_age lookup and the account_is_minor
-- call.
--
-- account_is_minor() rather than the year subtraction 064 used: the year form
-- is wrong for anyone whose birthday has not yet passed this year, and it was
-- only ever used because a year was all the row had.
CREATE OR REPLACE FUNCTION derive_student_minor_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- The declaration wins. A hand-set year is only honoured for an account that
  -- never made one, which after this migration means none.
  NEW.birth_year := COALESCE(
    (SELECT EXTRACT(YEAR FROM date_of_birth)::INTEGER FROM account_age WHERE user_id = NEW.user_id),
    NEW.birth_year
  );

  NEW.is_minor := CASE
    WHEN EXISTS (SELECT 1 FROM account_age WHERE user_id = NEW.user_id)
      THEN account_is_minor(NEW.user_id)
    ELSE NEW.birth_year IS NOT NULL
      AND (EXTRACT(YEAR FROM now())::INTEGER - NEW.birth_year) < 18
  END;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS derive_student_minor_status_trigger ON student_safeguarding;
CREATE TRIGGER derive_student_minor_status_trigger
  BEFORE INSERT OR UPDATE ON student_safeguarding
  FOR EACH ROW
  EXECUTE FUNCTION derive_student_minor_status();

-- Students can no longer type a year at all. The UPDATE policy 064 gave them
-- existed for exactly one field, which is now derived; leaving it would let a
-- minor set their own year and, before the trigger above, their own is_minor.
DROP POLICY IF EXISTS "Students can maintain their own safeguarding record" ON student_safeguarding;

COMMENT ON COLUMN student_safeguarding.birth_year IS
  'Projection of account_age.date_of_birth (091), kept in sync by trigger. '
  'Not written by hand — it exists so institution staff, who cannot read '
  'account_age, still get the coarse value.';

NOTIFY pgrst, 'reload schema';
