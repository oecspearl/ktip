-- ============================================================
-- Migration 049: Connection count + visibility control
-- 1. profiles.connection_count_visibility — who may see how many
--    connections a member has ('public' | 'connections' | 'private').
-- 2. get_connection_count(uuid) — single-profile count, returns
--    NULL when the viewer is not allowed to see it.
-- 3. get_connection_counts(uuid[]) — batch variant for the member
--    directory (one round trip instead of N).
-- The connections table's RLS only lets the two parties read a row,
-- so counting another member's connections is impossible from the
-- client. These SECURITY DEFINER functions are the only read path
-- and they enforce the visibility setting themselves.
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS connection_count_visibility TEXT NOT NULL DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_connection_count_visibility_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_connection_count_visibility_check
      CHECK (connection_count_visibility IN ('public', 'connections', 'private'));
  END IF;
END $$;

-- ============================================================
-- Visibility gate. Own profile always visible; 'connections'
-- requires an accepted connection between viewer and target.
-- ============================================================
CREATE OR REPLACE FUNCTION can_view_connection_count(p_user_id UUID)
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

  SELECT connection_count_visibility INTO v_visibility
  FROM profiles WHERE id = p_user_id;

  IF v_visibility IS NULL OR v_visibility = 'private' THEN
    RETURN FALSE;
  END IF;
  IF v_visibility = 'public' THEN
    RETURN TRUE;
  END IF;

  -- 'connections' — mutually connected viewers only
  IF v_viewer IS NULL THEN
    RETURN FALSE;
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
-- Single count. NULL = hidden from this viewer (distinct from 0).
-- ============================================================
CREATE OR REPLACE FUNCTION get_connection_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT can_view_connection_count(p_user_id) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_count
  FROM connections c
  WHERE c.status = 'accepted'
    AND (c.requester_id = p_user_id OR c.addressee_id = p_user_id);

  RETURN v_count;
END;
$$;

-- ============================================================
-- Batch count for the directory. Hidden users are omitted from
-- the result set rather than returned as NULL.
-- ============================================================
CREATE OR REPLACE FUNCTION get_connection_counts(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, connection_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  IF array_length(p_user_ids, 1) > 200 THEN
    RAISE EXCEPTION 'too many ids';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    (
      SELECT count(*)::INTEGER FROM connections c
      WHERE c.status = 'accepted'
        AND (c.requester_id = p.id OR c.addressee_id = p.id)
    )
  FROM profiles p
  WHERE p.id = ANY(p_user_ids)
    AND can_view_connection_count(p.id);
END;
$$;

REVOKE ALL ON FUNCTION can_view_connection_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_connection_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_connection_counts(UUID[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_connection_count(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_connection_counts(UUID[]) TO anon, authenticated;
