-- ============================================================
-- KTIP — Association review demo seed (pairs with migration 186)
--
-- Run AFTER migrations (186 included) and after
-- scripts/seed-test-accounts.mjs has created the test logins, in the
-- Supabase SQL editor, which runs as postgres (RLS bypassed, no auth.uid()).
--
-- The same six businesses the seed script creates:
--   three pending in Saint Lucia, submitted 2, 6 and 15 days ago
--   one verified and one not accepted in Saint Lucia
--   one pending in Grenada, which has no test association, so the
--   admin queue at /admin/association shows it as Unassigned
--
-- Owners are looked up by email (test.assoc-owner-1@ktip.test …). A
-- business whose owner does not exist is skipped with a NOTICE: this file
-- never creates auth users. Run the script first, or change v_domain.
--
-- Also links test.chamber-admin to the ktip-test-chamber association (LC)
-- if both exist, which is what makes /association/review show anything.
--
-- Idempotent: upserts by slug, events inserted once per decision. Re-running
-- moves the submission dates back to the offsets above.
-- ============================================================

DO $$
DECLARE
  v_domain TEXT := 'ktip.test';
  v_reviewer UUID;
  v_association UUID;
  v_owner UUID;
  v_employer UUID;
  v_reviewed BOOLEAN;
  b RECORD;
BEGIN
  SELECT u.id INTO v_reviewer FROM auth.users u
  WHERE lower(u.email) = 'test.chamber-admin@' || v_domain;

  SELECT i.id INTO v_association FROM institutions i
  WHERE i.slug = 'ktip-test-chamber';

  IF v_reviewer IS NULL THEN
    RAISE NOTICE 'test.chamber-admin@% not found: decisions are seeded with no reviewer', v_domain;
  END IF;
  IF v_association IS NULL THEN
    RAISE NOTICE 'ktip-test-chamber not found: run scripts/seed-test-accounts.mjs first for the LC association';
  END IF;

  -- The association admin row, approved. chamber_countries() reads this.
  IF v_reviewer IS NOT NULL AND v_association IS NOT NULL THEN
    INSERT INTO institution_members (institution_id, user_id, role, status, approved_by, approved_at)
    VALUES (v_association, v_reviewer, 'admin', 'approved', v_reviewer, now())
    ON CONFLICT (institution_id, user_id)
    DO UPDATE SET role = 'admin', status = 'approved', approved_at = COALESCE(institution_members.approved_at, now());
  END IF;

  FOR b IN
    SELECT * FROM (VALUES
      (1, 'ktip-test-assoc-breadfruit-lc', 'Test Breadfruit Bakery Ltd',      'LC', 'pending',  2,  NULL::INT, 'Food and beverage',   'LC-C-2026-0412', NULL::TEXT),
      (2, 'ktip-test-assoc-pitons-lc',     'Test Pitons Solar Installers Inc', 'LC', 'pending',  6,  NULL,      'Renewable energy',    'LC-C-2025-1187', NULL),
      (3, 'ktip-test-assoc-soufriere-lc',  'Test Soufriere Craft Collective',  'LC', 'pending',  15, NULL,      'Creative industries', NULL,             NULL),
      (4, 'ktip-test-assoc-castries-lc',   'Test Castries Code Studio Ltd',    'LC', 'verified', 40, 30,        'Software',            'LC-C-2024-0098', NULL),
      (5, 'ktip-test-assoc-vieux-fort-lc', 'Test Vieux Fort Freight Ltd',      'LC', 'rejected', 20, 10,        'Logistics',           'LC-C-2023-7741',
         'The registration number does not match what the Registry of Companies has on file. Check the number on your certificate of incorporation and send it in again.'),
      (6, 'ktip-test-assoc-spice-gd',      'Test Spice Isle Agro Ltd',         'GD', 'pending',  9,  NULL,      'Agriculture',         'GD-2026-3310',   NULL)
    ) AS t(n, slug, legal_name, country, status, days_ago, reviewed_days_ago, industry, reg, note)
  LOOP
    SELECT u.id INTO v_owner FROM auth.users u
    WHERE lower(u.email) = 'test.assoc-owner-' || b.n || '@' || v_domain;

    IF v_owner IS NULL THEN
      RAISE NOTICE 'skipping %: owner test.assoc-owner-%@% does not exist', b.slug, b.n, v_domain;
      CONTINUE;
    END IF;

    v_reviewed := b.reviewed_days_ago IS NOT NULL;

    INSERT INTO employers (
      slug, legal_name, industry, country_code, contact_email, registration_number, description,
      verification_status, verification_method, verified_at, verified_by, verification_note,
      chamber_institution_id, chamber_reviewed_by, chamber_reviewed_at,
      share_externally, created_by, created_at, updated_at
    )
    VALUES (
      b.slug, b.legal_name, b.industry, b.country,
      'test.assoc-owner-' || b.n || '@' || v_domain,
      b.reg,
      CASE b.n
        WHEN 1 THEN 'Small bakery off Jeremie Street in Castries. Breadfruit loaves, cassava bread and coconut drops, sold to three supermarkets in the north of the island.'
        WHEN 2 THEN 'Fits rooftop solar and battery backup for homes and guesthouses from Soufriere down to Laborie. Four installers and a van.'
        WHEN 3 THEN 'Twelve craftspeople in Soufriere selling woven baskets, carved calabash and pottery to visitors and to hotel gift shops.'
        WHEN 4 THEN 'Five developers in Castries building booking systems and mobile apps for hotels, clinics and small shops around the region.'
        WHEN 5 THEN 'Clears and moves containers between the port at Vieux Fort and businesses in the south. Two trucks and a small warehouse near Hewanorra.'
        WHEN 6 THEN 'Buys nutmeg, mace and cocoa from farmers in St. Andrew and St. Patrick and packs them for export from St. George''s.'
      END || ' Test business for the association review demo; none of it is real.',
      b.status,
      CASE WHEN b.status = 'verified' THEN 'chamber_attestation' END,
      CASE WHEN b.status = 'verified' THEN now() - make_interval(days => b.reviewed_days_ago) END,
      CASE WHEN b.status = 'verified' THEN v_reviewer END,
      b.note,
      CASE WHEN v_reviewed THEN v_association END,
      CASE WHEN v_reviewed THEN v_reviewer END,
      CASE WHEN v_reviewed THEN now() - make_interval(days => b.reviewed_days_ago) END,
      FALSE, v_owner,
      now() - make_interval(days => b.days_ago),
      now() - make_interval(days => COALESCE(b.reviewed_days_ago, b.days_ago))
    )
    ON CONFLICT (slug) DO UPDATE SET
      legal_name = EXCLUDED.legal_name,
      industry = EXCLUDED.industry,
      country_code = EXCLUDED.country_code,
      contact_email = EXCLUDED.contact_email,
      registration_number = EXCLUDED.registration_number,
      description = EXCLUDED.description,
      verification_status = EXCLUDED.verification_status,
      verification_method = EXCLUDED.verification_method,
      verified_at = EXCLUDED.verified_at,
      verified_by = EXCLUDED.verified_by,
      verification_note = EXCLUDED.verification_note,
      chamber_institution_id = EXCLUDED.chamber_institution_id,
      chamber_reviewed_by = EXCLUDED.chamber_reviewed_by,
      chamber_reviewed_at = EXCLUDED.chamber_reviewed_at,
      share_externally = FALSE,
      created_by = EXCLUDED.created_by,
      created_at = EXCLUDED.created_at
    RETURNING id INTO v_employer;

    IF v_reviewed AND NOT EXISTS (
      SELECT 1 FROM employer_verification_events ev
      WHERE ev.employer_id = v_employer AND ev.to_status = b.status
    ) THEN
      INSERT INTO employer_verification_events (employer_id, from_status, to_status, method, note, actor_id, created_at)
      VALUES (v_employer, 'pending', b.status, 'chamber_attestation', b.note, v_reviewer,
              now() - make_interval(days => b.reviewed_days_ago));
    END IF;

    -- The owner follows the business (186). Runs with no auth.uid(), so the
    -- provenance guards let it through and 174's trigger logs the change.
    IF b.status = 'verified' THEN
      PERFORM set_config('ktip.verification_evidence',
        jsonb_build_object('label', b.legal_name, 'employer_id', v_employer, 'by', 'association', 'seed', TRUE)::TEXT, TRUE);
      UPDATE profiles
      SET is_verified = TRUE,
          verified_via = 'association',
          verified_at = COALESCE(verified_at, now() - make_interval(days => b.reviewed_days_ago)),
          updated_at = now()
      WHERE id = v_owner
        AND (is_verified IS DISTINCT FROM TRUE OR verified_via IS DISTINCT FROM 'association');
      PERFORM set_config('ktip.verification_evidence', '', TRUE);
    END IF;
  END LOOP;
END;
$$;

-- Check:
--   SELECT legal_name, country_code, waiting_days, assigned_institution_name
--   FROM association_review_queue();   -- as an admin, from the app or with a JWT
--   SELECT slug, verification_status, created_at::date FROM employers
--   WHERE slug LIKE 'ktip-test-assoc-%' ORDER BY slug;
