-- ============================================================
-- Migration 083: Profile visibility (public / private)
--
-- A member can now close their profile. Private means: only an
-- accepted connection sees the detail, and only an accepted
-- connection can open a direct message. Everyone still sees the
-- teaser — name, avatar, roles, country — because a member who
-- cannot be found cannot be asked, and the whole point of the
-- request flow is that it is possible to send one.
--
-- The request mechanism is the connections table (033). There is
-- no separate "profile access request": accepting a connection is
-- the grant. One inbox, one state machine, nothing new to learn.
--
-- 1. profiles.profile_visibility — 'public' | 'private'
-- 2. can_view_profile(uuid)      — the gate
-- 3. can_dm(uuid, uuid)          — the messaging gate
-- 4. get_profile_view(uuid)      — teaser always, detail when allowed
-- 5. conversation_participants INSERT policy — enforces can_dm
-- 6. public_resume() — a private member's CV follows the profile
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_visibility TEXT NOT NULL DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_profile_visibility_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_profile_visibility_check
      CHECK (profile_visibility IN ('public', 'private'));
  END IF;
END $$;

COMMENT ON COLUMN profiles.profile_visibility IS
  'public = any signed-in member sees the full profile and may DM. private = connections only. Not enforced by RLS on this table (see get_profile_view) because profile rows are embedded across the schema.';

-- The guard trigger from 063 is a denylist, so this column is
-- self-editable without any further change.

-- ============================================================
-- The gate. Deliberately FALSE for anonymous callers: /u/:id is a
-- protected route now, and a signed-out visitor has no identity to
-- be connected to.
-- ============================================================
CREATE OR REPLACE FUNCTION can_view_profile(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visibility TEXT;
  v_viewer UUID := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  IF v_viewer = p_user_id THEN
    RETURN TRUE;
  END IF;
  IF v_viewer IS NULL THEN
    RETURN FALSE;
  END IF;
  -- Moderation has to keep working on a closed profile, or going
  -- private becomes a way to hide from a grievance report.
  IF is_platform_admin(v_viewer) THEN
    RETURN TRUE;
  END IF;

  SELECT profile_visibility INTO v_visibility
  FROM profiles WHERE id = p_user_id;

  IF v_visibility IS NULL THEN
    RETURN FALSE;
  END IF;
  IF v_visibility = 'public' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM connections c
    WHERE c.status = 'accepted'
      AND (
        (c.requester_id = v_viewer AND c.addressee_id = p_user_id) OR
        (c.requester_id = p_user_id AND c.addressee_id = v_viewer)
      )
  );
END;
$$;

-- ============================================================
-- The messaging gate. Same rule, expressed for an explicit pair so
-- it can be called from an RLS policy where auth.uid() is the
-- sender and the row being inserted names the recipient.
-- ============================================================
CREATE OR REPLACE FUNCTION can_dm(p_sender UUID, p_recipient UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visibility TEXT;
BEGIN
  IF p_sender IS NULL OR p_recipient IS NULL THEN
    RETURN FALSE;
  END IF;
  IF p_sender = p_recipient THEN
    RETURN TRUE;
  END IF;

  SELECT profile_visibility INTO v_visibility
  FROM profiles WHERE id = p_recipient;

  IF v_visibility IS NULL THEN
    RETURN FALSE;
  END IF;
  IF v_visibility = 'public' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM connections c
    WHERE c.status = 'accepted'
      AND (
        (c.requester_id = p_sender AND c.addressee_id = p_recipient) OR
        (c.requester_id = p_recipient AND c.addressee_id = p_sender)
      )
  );
END;
$$;

-- ============================================================
-- The read path for a member page. Returns the teaser unconditionally
-- and NULLs the detail when the viewer is not allowed it, so the UI
-- can render one shape and decide what to show from can_view rather
-- than juggling a missing row against a private one.
--
-- No row at all for a suspended account, matching get_profile_stats.
-- ============================================================
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
  languages TEXT[]
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
    CASE WHEN v_allowed THEN p.languages END
  FROM profiles p
  WHERE p.id = p_user_id
    AND (p.id = auth.uid() OR NOT is_suspended(p.id));
END;
$$;

REVOKE ALL ON FUNCTION can_view_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_dm(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_profile_view(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION can_view_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_dm(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_profile_view(UUID) TO authenticated;

-- ============================================================
-- Messaging. Restates the policy from 064 in full — every existing
-- clause is preserved — and adds the private-profile gate.
--
-- The gate is on joining a thread, not on sending into one. A member
-- who goes private keeps the conversations they already have; the
-- alternative is severing live threads as a side effect of a
-- settings toggle, which nobody would predict from the wording.
-- Group threads are unchanged: membership there is decided by the
-- group's admin, not by each member's profile setting.
-- ============================================================
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
  );

-- ============================================================
-- A published CV follows the profile it belongs to. Public member:
-- still opens for a signed-out visitor, which is the entire point of
-- a CV link. Private member: connections only.
-- ============================================================
CREATE OR REPLACE FUNCTION public_resume(p_user UUID, p_template TEXT DEFAULT 'viridion')
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'template', r.template,
    'data', r.data,
    'updated_at', r.updated_at,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url
  )
  FROM resumes r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.user_id = p_user
    AND r.template = p_template
    AND r.is_public = TRUE
    AND NOT is_suspended(r.user_id)
    AND (p.profile_visibility = 'public' OR can_view_profile(r.user_id))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public_resume(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_resume(UUID, TEXT) TO anon, authenticated, service_role;
