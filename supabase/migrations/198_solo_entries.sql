-- 198: solo entries go through the Submission Desk, judging and People's Choice
--
-- 192 built the desk around teams: save_submission() refused anybody without
-- one, and submit_team_submission() was the only way to set submitted_at. A
-- solo 085 entry therefore never reached the judges or the ballot, because
-- both list submitted entries only.
--
-- Now a participant who is not on a team saves and submits their own entry
-- through the same functions. Judges, conflicts, results and the ballot
-- already handle team_id IS NULL (192), so nothing there changes.
--
-- Who may enter alone: a venue participant who is not on a team, is not a
-- judge anywhere in the event and is not running it.

CREATE OR REPLACE FUNCTION may_enter_solo(p_user UUID, p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM event_venue_members
      WHERE event_id = p_event_id AND user_id = p_user AND role = 'participant'
    )
    AND NOT EXISTS (
      SELECT 1 FROM event_team_members m JOIN event_teams t ON t.id = m.team_id
      WHERE t.event_id = p_event_id AND m.user_id = p_user
    )
    AND NOT is_event_judge(p_user, p_event_id)
    AND NOT is_venue_host(p_user, p_event_id);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION may_enter_solo(UUID, UUID) IS
  'A venue participant with no team who neither judges nor runs the event (198)';

-- The newest active solo entry this person has for the event, or an empty row.
CREATE OR REPLACE FUNCTION solo_entry_of(p_user UUID, p_event_id UUID)
RETURNS event_solutions AS $$
  SELECT * FROM event_solutions
  WHERE event_id = p_event_id AND author_id = p_user AND team_id IS NULL AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION save_submission(
  p_event_id UUID,
  p_fields JSONB,
  p_evidence JSONB DEFAULT NULL
)
RETURNS event_solutions AS $$
DECLARE
  v_user UUID := auth.uid();
  v_team event_teams;
  v_sol event_solutions;
  v_event events;
  v_item JSONB;
  v_crit UUID;
  v_note TEXT;
  v_url TEXT;
  v_path TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;
  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'fields must be an object';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF v_event.id IS NULL OR v_event.status = 'draft' THEN
    RAISE EXCEPTION 'this event is not taking entries';
  END IF;

  SELECT t.* INTO v_team
  FROM event_teams t
  JOIN event_team_members m ON m.team_id = t.id
  WHERE t.event_id = p_event_id AND m.user_id = v_user;
  IF v_team.id IS NULL AND NOT may_enter_solo(v_user, p_event_id) THEN
    RAISE EXCEPTION 'only participants who are not on a team can enter on their own';
  END IF;

  IF submissions_locked(p_event_id) THEN
    RAISE EXCEPTION 'Entries for this event are closed' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('ktip.submission_rpc', 'on', TRUE);

  IF v_team.id IS NOT NULL THEN
    INSERT INTO event_solutions (event_id, author_id, team_id, title)
    VALUES (
      p_event_id,
      v_user,
      v_team.id,
      coalesce(nullif(btrim(p_fields->>'title'), ''), v_team.name)
    )
    ON CONFLICT (team_id) WHERE team_id IS NOT NULL DO NOTHING;

    SELECT * INTO v_sol FROM event_solutions WHERE team_id = v_team.id;
  ELSE
    -- 198: a solo entry. Reuse the newest one this person already has for the
    -- event (an 085 form entry counts), else start one.
    v_sol := solo_entry_of(v_user, p_event_id);
    IF v_sol.id IS NULL THEN
      INSERT INTO event_solutions (event_id, author_id, title)
      VALUES (p_event_id, v_user, coalesce(nullif(btrim(p_fields->>'title'), ''), 'Untitled entry'))
      RETURNING * INTO v_sol;
    END IF;
  END IF;

  IF p_fields ? 'pitch_deck_path' THEN
    v_path := nullif(btrim(coalesce(p_fields->>'pitch_deck_path', '')), '');
    IF v_path IS NOT NULL AND v_path !~ ('^' || v_sol.id::text || '/[A-Za-z0-9._-]{1,160}$') THEN
      RAISE EXCEPTION 'the pitch deck must be a file uploaded to this entry';
    END IF;
  END IF;

  IF p_fields ? 'demo_video_seconds'
     AND jsonb_typeof(p_fields->'demo_video_seconds') NOT IN ('number', 'null') THEN
    RAISE EXCEPTION 'video length must be a number of seconds';
  END IF;

  UPDATE event_solutions SET
    title = CASE WHEN p_fields ? 'title'
      THEN coalesce(nullif(btrim(p_fields->>'title'), ''), title) ELSE title END,
    description = CASE WHEN p_fields ? 'description'
      THEN nullif(btrim(coalesce(p_fields->>'description', '')), '') ELSE description END,
    repo_url = CASE WHEN p_fields ? 'repo_url'
      THEN nullif(btrim(coalesce(p_fields->>'repo_url', '')), '') ELSE repo_url END,
    demo_video_url = CASE WHEN p_fields ? 'demo_video_url'
      THEN nullif(btrim(coalesce(p_fields->>'demo_video_url', '')), '') ELSE demo_video_url END,
    demo_video_seconds = CASE WHEN p_fields ? 'demo_video_seconds'
      THEN (p_fields->>'demo_video_seconds')::NUMERIC::INT ELSE demo_video_seconds END,
    pitch_deck_url = CASE WHEN p_fields ? 'pitch_deck_url'
      THEN nullif(btrim(coalesce(p_fields->>'pitch_deck_url', '')), '') ELSE pitch_deck_url END,
    pitch_deck_path = CASE WHEN p_fields ? 'pitch_deck_path' THEN v_path ELSE pitch_deck_path END,
    ai_use = CASE WHEN p_fields ? 'ai_use'
      THEN nullif(btrim(coalesce(p_fields->>'ai_use', '')), '') ELSE ai_use END,
    ai_tools = CASE WHEN p_fields ? 'ai_tools'
      THEN nullif(btrim(coalesce(p_fields->>'ai_tools', '')), '') ELSE ai_tools END
  WHERE id = v_sol.id;

  IF p_evidence IS NOT NULL THEN
    IF jsonb_typeof(p_evidence) <> 'array' THEN
      RAISE EXCEPTION 'evidence must be an array';
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_evidence)
    LOOP
      v_crit := safe_uuid(v_item->>'criterion_id');
      IF v_crit IS NULL THEN
        RAISE EXCEPTION 'every evidence item needs a criterion';
      END IF;
      v_note := nullif(btrim(coalesce(v_item->>'note', '')), '');
      v_url := nullif(btrim(coalesce(v_item->>'url', '')), '');
      IF v_note IS NULL AND v_url IS NULL THEN
        DELETE FROM event_solution_evidence WHERE solution_id = v_sol.id AND criterion_id = v_crit;
      ELSE
        INSERT INTO event_solution_evidence (solution_id, criterion_id, note, url, updated_by)
        VALUES (v_sol.id, v_crit, v_note, v_url, v_user)
        ON CONFLICT (solution_id, criterion_id) DO UPDATE SET
          note = EXCLUDED.note,
          url = EXCLUDED.url,
          updated_by = EXCLUDED.updated_by;
      END IF;
    END LOOP;
  END IF;

  PERFORM set_config('ktip.submission_rpc', 'off', TRUE);

  SELECT * INTO v_sol FROM event_solutions WHERE id = v_sol.id;
  RETURN v_sol;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION submit_team_submission(p_solution_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_sol event_solutions;
  v_event events;
  v_team event_teams;
  v_missing TEXT[];
  v_receipt UUID;
  v_now TIMESTAMPTZ := now();
  v_snapshot JSONB;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT * INTO v_sol FROM event_solutions WHERE id = p_solution_id;
  IF v_sol.id IS NULL
     OR (v_sol.team_id IS NOT NULL AND NOT is_event_team_member(v_user, v_sol.team_id))
     OR (v_sol.team_id IS NULL AND v_sol.author_id IS DISTINCT FROM v_user) THEN
    RAISE EXCEPTION 'only the team can submit this entry';
  END IF;
  -- 198: a solo entry goes in only while its author is still entering alone.
  -- Somebody who joined a team hands in the team's entry instead.
  IF v_sol.team_id IS NULL AND NOT may_enter_solo(v_user, v_sol.event_id) THEN
    RAISE EXCEPTION 'you are on a team now, so hand in the team entry instead';
  END IF;
  IF submissions_locked(v_sol.event_id) THEN
    RAISE EXCEPTION 'Entries for this event are closed' USING ERRCODE = '42501';
  END IF;

  v_missing := submission_missing(p_solution_id);
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'missing', to_jsonb(v_missing));
  END IF;

  SELECT * INTO v_event FROM events WHERE id = v_sol.event_id;
  SELECT * INTO v_team FROM event_teams WHERE id = v_sol.team_id;

  v_snapshot := jsonb_build_object(
    'team_id', v_team.id::text,
    'team', v_team.name,
    'members', (
      SELECT coalesce(jsonb_agg(coalesce(p.display_name, p.username) ORDER BY m.joined_at), '[]'::jsonb)
      FROM event_team_members m JOIN profiles p ON p.id = m.user_id
      WHERE m.team_id = v_team.id
    ),
    'solo', v_team.id IS NULL,
    'summary', v_sol.description,
    'repo_url', v_sol.repo_url,
    'video_url', v_sol.demo_video_url,
    'video_length', (v_sol.demo_video_seconds / 60)::text || ':' || lpad((v_sol.demo_video_seconds % 60)::text, 2, '0'),
    'pitch_deck', coalesce(v_sol.pitch_deck_url, regexp_replace(v_sol.pitch_deck_path, '^[^/]+/', '')),
    'ai_use', v_sol.ai_use,
    'ai_tools', v_sol.ai_tools,
    'evidence', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'criterion', c.title, 'kind', c.kind, 'note', ev.note, 'url', ev.url
      ) ORDER BY c.kind, c.sort_order), '[]'::jsonb)
      FROM event_solution_evidence ev
      JOIN event_criteria c ON c.id = ev.criterion_id
      WHERE ev.solution_id = v_sol.id
    )
  );

  -- One receipt per press of Submit. source_id is fresh each time, so 051's
  -- UNIQUE (source_table, source_id) never collides with an earlier copy.
  INSERT INTO submission_receipts (
    user_id, kind, source_table, source_id, title, subtitle,
    data, template_key, link, submitted_at
  )
  VALUES (
    v_user,
    'event_submission',
    'event_solution_submits',
    gen_random_uuid(),
    v_sol.title,
    v_event.title,
    v_snapshot,
    'event_submission_v1',
    '/events/' || v_event.id::text,
    v_now
  )
  RETURNING id INTO v_receipt;

  -- A solo receipt names its one entrant where a team's lists the members.
  IF v_team.id IS NULL THEN
    UPDATE submission_receipts
    SET data = data || jsonb_build_object('members', (
      SELECT jsonb_build_array(coalesce(p.display_name, p.username))
      FROM profiles p WHERE p.id = v_sol.author_id
    ))
    WHERE id = v_receipt;
  END IF;

  PERFORM set_config('ktip.submission_rpc', 'on', TRUE);
  UPDATE event_solutions
  SET submitted_at = v_now, receipt_id = v_receipt
  WHERE id = v_sol.id;
  PERFORM set_config('ktip.submission_rpc', 'off', TRUE);

  IF v_team.id IS NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      v_user,
      'submission_receipt',
      'Entry submitted',
      'You handed in "' || v_sol.title || '" for ' || coalesce(v_event.title, 'the event') ||
        '. A copy is saved in your dashboard.',
      '/dashboard/submissions/' || v_receipt::text
    );
  ELSE
    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT
      m.user_id,
      'submission_receipt',
      'Entry submitted',
      v_team.name || ' handed in "' || v_sol.title || '" for ' || coalesce(v_event.title, 'the event') ||
        '. A copy is saved in your dashboard.',
      '/dashboard/submissions/' || v_receipt::text
    FROM event_team_members m
    WHERE m.team_id = v_team.id;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'receipt_id', v_receipt, 'submitted_at', v_now);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION my_team_submission(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event events;
  v_team event_teams;
  v_sol event_solutions;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'event not found';
  END IF;

  SELECT t.* INTO v_team
  FROM event_teams t
  JOIN event_team_members m ON m.team_id = t.id
  WHERE t.event_id = p_event_id AND m.user_id = v_user;

  IF v_team.id IS NOT NULL THEN
    SELECT * INTO v_sol FROM event_solutions WHERE team_id = v_team.id;
  ELSIF may_enter_solo(v_user, p_event_id) THEN
    v_sol := solo_entry_of(v_user, p_event_id);
  END IF;

  RETURN jsonb_build_object(
    'deadline', v_event.submission_deadline,
    'locked', submissions_locked(p_event_id),
    'results_published_at', v_event.results_published_at,
    'solo_allowed', v_team.id IS NULL AND may_enter_solo(v_user, p_event_id),
    'criteria', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'title', c.title,
        'description', c.description, 'is_required', c.is_required
      ) ORDER BY c.kind, c.sort_order), '[]'::jsonb)
      FROM event_criteria c
      WHERE c.event_id = p_event_id AND c.kind IN ('objective', 'deliverable')
    ),
    'team', CASE WHEN v_team.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_team.id,
      'name', v_team.name,
      'members', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'user_id', m.user_id, 'role', m.role,
          'display_name', coalesce(p.display_name, p.username)
        ) ORDER BY m.joined_at), '[]'::jsonb)
        FROM event_team_members m JOIN profiles p ON p.id = m.user_id
        WHERE m.team_id = v_team.id
      )
    ) END,
    'solution', CASE WHEN v_sol.id IS NULL THEN NULL ELSE to_jsonb(v_sol) END,
    'evidence', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'criterion_id', ev.criterion_id, 'note', ev.note, 'url', ev.url
      )), '[]'::jsonb)
      FROM event_solution_evidence ev
      WHERE v_sol.id IS NOT NULL AND ev.solution_id = v_sol.id
    ),
    'missing', CASE WHEN v_sol.id IS NULL THEN NULL ELSE to_jsonb(submission_missing(v_sol.id)) END,
    'receipt', (
      SELECT to_jsonb(r) FROM submission_receipts r
      WHERE v_sol.receipt_id IS NOT NULL AND r.id = v_sol.receipt_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Internal helpers: only the SECURITY DEFINER functions above call them.
REVOKE ALL ON FUNCTION may_enter_solo(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION solo_entry_of(UUID, UUID) FROM PUBLIC, anon, authenticated;
