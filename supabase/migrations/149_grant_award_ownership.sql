-- Migration 149: record_grant_award() checks whose call it is.
--
-- 133 added the award columns and this function, and gated it on
-- `grant:manage_funds` alone. That was survivable for as long as it held: no
-- client code called the function, no screen read the columns, and the only way
-- to reach it was the SQL editor. The permission check was the whole door
-- because nobody was walking through it.
--
-- That changes now. The funder's application inbox is growing an amount field
-- on the approve action, which makes this the first reachable write path to the
-- award figure — and `grant:manage_funds` is held platform-wide by investor,
-- government, diaspora, igo, mentor and programme_supervisor (063, re-keyed
-- through 125). Held platform-wide, not per call: without an ownership test any
-- one of them could stamp an award on an application to somebody else's call,
-- flip it to approved, and fire the applicant a notification saying so.
--
-- The pair used here is the one 130 already settled on for deciding an
-- application: is_grant_funder() — the creator, while they still hold
-- grant:post — OR grant:manage for the administrator. Two permissions are
-- therefore required to record an award and always were: manage_funds says you
-- may move money, this says whose money.
--
-- Everything else about the function is unchanged, including the forced
-- transition to 'approved' and the notification.
--
-- Idempotent — safe to re-run.

CREATE OR REPLACE FUNCTION public.record_grant_award(
  p_application UUID,
  p_amount      NUMERIC,
  p_currency    TEXT DEFAULT 'XCD'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_applicant UUID;
  v_grant     TEXT;
  v_grant_id  UUID;
BEGIN
  IF NOT has_permission(auth.uid(), 'grant:manage_funds') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_amount');
  END IF;

  SELECT ga.user_id, g.title, g.id INTO v_applicant, v_grant, v_grant_id
  FROM grant_applications ga
  JOIN grants g ON g.id = ga.grant_id
  WHERE ga.id = p_application;

  IF v_applicant IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  -- Whose call. Distinct from 'forbidden' above so the inbox can tell a member
  -- who may not record awards at all from one aiming at the wrong call.
  IF NOT (is_grant_funder(v_grant_id, auth.uid())
          OR has_permission(auth.uid(), 'grant:manage')) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_your_call');
  END IF;

  UPDATE grant_applications SET
    awarded_amount   = p_amount,
    awarded_currency = COALESCE(p_currency, 'XCD'),
    awarded_at       = now(),
    awarded_by       = auth.uid(),
    -- Recording an award on an application still marked pending would leave the
    -- pipeline chart contradicting the economic-impact figure.
    status           = 'approved',
    updated_at       = now()
  WHERE id = p_application;

  PERFORM send_notification(
    v_applicant, 'grant_awarded', 'Funding awarded',
    'Your application to "' || v_grant || '" has been awarded.',
    '/grants/applications'
  );

  RETURN jsonb_build_object('ok', TRUE, 'awarded_amount', p_amount);
END; $fn$;

COMMENT ON FUNCTION public.record_grant_award(UUID, NUMERIC, TEXT) IS
  'Record what was awarded on one application. Requires grant:manage_funds AND either being the call''s funder or holding grant:manage. Forces the application to approved.';

REVOKE ALL ON FUNCTION public.record_grant_award(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_grant_award(UUID, NUMERIC, TEXT) TO authenticated;
