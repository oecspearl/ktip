-- Migration 214: small fields the room design needs
-- ============================================================================
--
--   1. venue_coffee_tables.topic   what a table is talking about ("Ocean data").
--                                  coffee_state() now returns it; an organiser
--                                  sets it with set_coffee_topic().
--   2. team_tasks.due_at           when a task on a Homebase board is due.
--                                  Written like every other task field, by the
--                                  team (190's policies cover the new column).
--
-- Idempotent: safe to re-run.

ALTER TABLE venue_coffee_tables ADD COLUMN IF NOT EXISTS topic TEXT;
ALTER TABLE venue_coffee_tables DROP CONSTRAINT IF EXISTS venue_coffee_tables_topic_len;
ALTER TABLE venue_coffee_tables ADD CONSTRAINT venue_coffee_tables_topic_len
  CHECK (topic IS NULL OR char_length(topic) <= 40);

ALTER TABLE team_tasks ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

-- 200's body, with the topic added to each table.
CREATE OR REPLACE FUNCTION coffee_state(p_room_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event UUID;
  v_host BOOLEAN;
  v_mine UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT event_id INTO v_event FROM venue_rooms WHERE id = p_room_id;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;
  v_host := is_venue_host(v_user, v_event);
  IF NOT (v_host OR is_venue_member(v_user, v_event)) THEN
    RAISE EXCEPTION 'not a member of this venue';
  END IF;

  PERFORM coffee_try_match(p_room_id);
  v_mine := my_coffee_table(v_user, v_event);

  RETURN jsonb_build_object(
    'can_join', may_take_coffee(v_user, p_room_id),
    'is_host', v_host,
    'waiting', (SELECT count(*) FROM venue_coffee_queue WHERE room_id = p_room_id),
    'in_queue', EXISTS (SELECT 1 FROM venue_coffee_queue WHERE event_id = v_event AND user_id = v_user),
    'my_table', v_mine,
    'tables', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'ends_at', t.ends_at,
        'topic', t.topic,
        'people', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'user_id', s.user_id,
            'name', coalesce(p.display_name, p.username),
            'avatar_url', p.avatar_url,
            'team', (
              SELECT et.name FROM event_team_members m JOIN event_teams et ON et.id = m.team_id
              WHERE m.user_id = s.user_id AND et.event_id = t.event_id
              LIMIT 1
            )
          ) ORDER BY p.display_name), '[]'::jsonb)
          FROM venue_coffee_seats s JOIN profiles p ON p.id = s.user_id
          WHERE s.table_id = t.id AND s.left_at IS NULL
        )
      ) ORDER BY t.created_at), '[]'::jsonb)
      FROM venue_coffee_tables t
      WHERE t.room_id = p_room_id AND t.ends_at > now()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION set_coffee_topic(p_table_id UUID, p_topic TEXT)
RETURNS VOID AS $$
DECLARE
  v_table venue_coffee_tables;
BEGIN
  SELECT * INTO v_table FROM venue_coffee_tables WHERE id = p_table_id;
  IF v_table.id IS NULL OR NOT is_venue_host(auth.uid(), v_table.event_id) THEN
    RAISE EXCEPTION 'only organisers can name a table' USING ERRCODE = '42501';
  END IF;
  UPDATE venue_coffee_tables SET topic = nullif(left(btrim(coalesce(p_topic, '')), 40), '')
  WHERE id = p_table_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION set_coffee_topic(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_coffee_topic(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
