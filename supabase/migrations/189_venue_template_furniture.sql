-- Migration 189: Saved venue templates keep each room's furniture
--
-- 188 gave rooms a furniture preset. save_venue_template (107) lists the
-- columns it snapshots one by one, so without this a building saved as a
-- template and reused next year would arrive with every room on its kind's
-- default furniture. Same body as 107 plus one key.
--
-- Needs 188 (venue_rooms.furniture). Idempotent: safe to re-run.

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
    'sections', r.sections,
    'furniture', r.furniture
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

REVOKE ALL ON FUNCTION save_venue_template(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_venue_template(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
