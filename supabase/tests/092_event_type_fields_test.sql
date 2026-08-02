-- ============================================================
-- Hand-run test for migration 092 (per-type event fields).
--
-- Same workflow as 089's test: paste into the Supabase SQL editor
-- and run. It seeds fixtures, asserts, and ROLLBACKs — nothing is
-- left behind. A failing ASSERT aborts with the message shown;
-- silence at the end means every assertion held.
--
-- What is actually being defended here:
--   1. registration_closes_at refuses late RSVPs. The column is
--      pointless if the only thing stopping a late sign-up is the
--      button being hidden in the UI.
--   2. Closing registration is not the same as being full — the two
--      refusals must not shadow each other.
--   3. team_size_max below team_size_min is rejected at the database,
--      because the form is not the only thing that writes events.
--
-- Requires 002 and 092 to be applied first. Run it as a role that can
-- write auth.users (the SQL editor's default is fine) — profiles.id is a
-- FK to that table, so the fixtures cannot exist without it.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_host    UUID := '00000000-0000-4000-8000-000000000921';
  v_person  UUID := '00000000-0000-4000-8000-000000000922';
  v_open    UUID := '00000000-0000-4000-8000-0000000009e1';
  v_closed  UUID := '00000000-0000-4000-8000-0000000009e2';
  v_n       INT;
  v_failed  BOOLEAN;
  v_message TEXT;
BEGIN
  -- profiles.id is a FK to auth.users (000), so the users have to exist before
  -- the profiles do. Inserting here also fires on_auth_user_created (091),
  -- which creates the profile row itself — the UPSERT below only sets the
  -- roles that trigger cannot know about. Everything is rolled back at the end,
  -- so nothing is left in the auth schema.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_host, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'host-092@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Host 092', 'country', 'Saint Lucia')),
    (v_person, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'person-092@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Person 092', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_host,   'Host 092',   ARRAY['oecs'], 'Saint Lucia'),
         (v_person, 'Person 092', ARRAY[]::TEXT[], 'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  INSERT INTO events (id, title, event_type, start_date, organizer_id, status, registration_closes_at)
  VALUES
    (v_open,   'Open 092',   'workshop', NOW() + INTERVAL '10 days', v_host, 'published', NOW() + INTERVAL '5 days'),
    (v_closed, 'Closed 092', 'workshop', NOW() + INTERVAL '10 days', v_host, 'published', NOW() - INTERVAL '1 hour');

  -- ------------------------------------------------------------
  -- 1. A deadline in the future does not get in the way
  -- ------------------------------------------------------------
  INSERT INTO event_rsvps (event_id, user_id) VALUES (v_open, v_person);

  SELECT COUNT(*) INTO v_n FROM event_rsvps WHERE event_id = v_open AND user_id = v_person;
  ASSERT v_n = 1, 'registration_closes_at: an RSVP before the deadline was refused';

  -- ------------------------------------------------------------
  -- 2. A deadline in the past refuses the RSVP, and says why
  -- ------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    INSERT INTO event_rsvps (event_id, user_id) VALUES (v_closed, v_person);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    v_message := SQLERRM;
  END;
  ASSERT v_failed, 'registration_closes_at: an RSVP after the deadline was accepted';
  ASSERT v_message LIKE '%closed%',
    'registration_closes_at: refused for the wrong reason — ' || COALESCE(v_message, '(none)');

  -- ------------------------------------------------------------
  -- 3. Full still reports full, not closed
  --
  -- The capacity check must survive the deadline check being added in
  -- front of it, and must not be mislabelled as a closed registration.
  -- ------------------------------------------------------------
  UPDATE events SET capacity = 1, registration_closes_at = NULL WHERE id = v_open;

  v_failed := FALSE;
  BEGIN
    INSERT INTO event_rsvps (event_id, user_id) VALUES (v_open, v_host);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    v_message := SQLERRM;
  END;
  ASSERT v_failed, 'capacity: an RSVP to a full event was accepted';
  ASSERT v_message LIKE '%full%',
    'capacity: refused for the wrong reason — ' || COALESCE(v_message, '(none)');

  -- ------------------------------------------------------------
  -- 4. NULL deadline means open
  -- ------------------------------------------------------------
  UPDATE events SET capacity = NULL WHERE id = v_open;
  INSERT INTO event_rsvps (event_id, user_id) VALUES (v_open, v_host);

  SELECT COUNT(*) INTO v_n FROM event_rsvps WHERE event_id = v_open;
  ASSERT v_n = 2, 'registration_closes_at: NULL should mean no deadline';

  -- ------------------------------------------------------------
  -- 5. Team size range is enforced
  -- ------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    UPDATE events SET team_size_min = 4, team_size_max = 2 WHERE id = v_open;
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'team_size: a max below the min was accepted';

  v_failed := FALSE;
  BEGIN
    UPDATE events SET team_size_min = 0 WHERE id = v_open;
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'team_size: a min of zero was accepted';

  -- A max on its own is a legitimate "teams of up to 5"
  UPDATE events SET team_size_min = NULL, team_size_max = 5 WHERE id = v_open;

  SELECT team_size_max INTO v_n FROM events WHERE id = v_open;
  ASSERT v_n = 5, 'team_size: a max without a min should be allowed';

  RAISE NOTICE 'Migration 092 assertions all held.';
END $$;

ROLLBACK;
