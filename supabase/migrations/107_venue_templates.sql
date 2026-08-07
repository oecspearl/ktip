-- ============================================================
-- 107: venue templates — save a building, use it again
-- ============================================================
--
-- The editor ships four built-in buildings (src/lib/venue-templates.ts). This
-- adds the host's own: "save this venue as a template" snapshots the drawn map
-- and its rooms into one row, and applying it later is done entirely client
-- side — the editor loads the snapshot as draft rooms and the host presses the
-- ordinary Save, so save_venue_map() remains the single write path with the
-- single set of validations (host gate, room caps, the ≤40 sections CHECK).
-- There is deliberately no apply RPC to keep those rules in one place.
--
-- What a snapshot excludes, on purpose:
--   - team rooms: a team pod belongs to one event's teams; save_venue_map()
--     never touches kind='team' either.
--   - sponsor_name / sponsor_url / sponsor_logo_url / svg_zone_id: sponsors
--     are per-event deals, and the zone id is meaningless off its own SVG.
--
-- Idempotent — safe to re-run.

-- ------------------------------------------------------------
-- 1. The table
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS venue_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  -- Provenance only. The template must survive its source event being deleted.
  source_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  -- events.venue_map as it stood: {v, cols, rows, floors[], stairs}.
  map JSONB NOT NULL,
  -- The rooms, one object each: key, name, kind, description, color,
  -- wall_height, capacity, audio_mode, recording_enabled, allowed_roles,
  -- floor, cells, sections.
  rooms JSONB NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_templates_owner
  ON venue_templates(owner_id, created_at DESC);

COMMENT ON TABLE venue_templates IS
  'Host-saved venue buildings. A snapshot of events.venue_map plus its rooms, minus '
  'team pods and sponsor fields. Applied client-side through the editor and '
  'save_venue_map() — there is no apply RPC on purpose, so the save path stays single.';

-- ------------------------------------------------------------
-- 2. RLS
-- ------------------------------------------------------------

ALTER TABLE venue_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_templates_select ON venue_templates;
CREATE POLICY venue_templates_select ON venue_templates FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR is_shared
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS venue_templates_update ON venue_templates;
CREATE POLICY venue_templates_update ON venue_templates FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS venue_templates_delete ON venue_templates;
CREATE POLICY venue_templates_delete ON venue_templates FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- No INSERT policy: rows are only ever created by save_venue_template(), which
-- is SECURITY DEFINER and stamps owner_id itself.

-- ------------------------------------------------------------
-- 3. The snapshot function
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION save_venue_template(
  p_event_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_user UUID := auth.uid();
  v_map JSONB;
  v_rooms JSONB;
  v_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT is_venue_host(v_user, p_event_id) THEN
    RAISE EXCEPTION 'only the organizer may save this venue as a template';
  END IF;

  SELECT venue_map INTO v_map FROM events WHERE id = p_event_id;
  IF v_map IS NULL THEN
    RAISE EXCEPTION 'this event has no drawn venue to save';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key', r.key,
    'name', r.name,
    'kind', r.kind,
    'description', r.description,
    'color', r.color,
    'wall_height', r.wall_height,
    'capacity', r.capacity,
    'audio_mode', r.audio_mode,
    'recording_enabled', r.recording_enabled,
    'allowed_roles', to_jsonb(r.allowed_roles),
    'floor', r.floor,
    'cells', r.cells,
    'sections', r.sections
  ) ORDER BY r.sort_order, r.created_at), '[]'::jsonb)
  INTO v_rooms
  FROM venue_rooms r
  WHERE r.event_id = p_event_id
    AND r.kind <> 'team';

  IF v_rooms = '[]'::jsonb THEN
    RAISE EXCEPTION 'this venue has no rooms to save';
  END IF;

  INSERT INTO venue_templates (owner_id, name, description, source_event_id, map, rooms)
  VALUES (v_user, trim(p_name), NULLIF(trim(COALESCE(p_description, '')), ''), p_event_id, v_map, v_rooms)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION save_venue_template(UUID, TEXT, TEXT) IS
  'Snapshot an event''s drawn venue (map + non-team rooms, sponsor fields stripped) '
  'into venue_templates, owned by the caller. Host-gated by is_venue_host().';

REVOKE ALL ON FUNCTION save_venue_template(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_venue_template(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
