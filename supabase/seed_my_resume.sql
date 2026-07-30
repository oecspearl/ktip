-- ============================================================================
-- seed_my_resume.sql — give one account a filled-in CV
-- ============================================================================
-- Not a migration. A development seed you run by hand against a database where
-- an account exists but has nothing to draw: /cv renders correctly and shows
-- almost nothing, because `resumes` has no row and the profile fallback has no
-- bio, skills or interests to seed from.
--
-- Everything below is PLACEHOLDER TEXT. It is shaped like a real CV so the three
-- designs can be judged against a full page, not so it can be sent to anybody.
-- Edit it at /cv/edit, or edit this file before running it.
--
-- Idempotent: re-running replaces the document and leaves profile fields that
-- already have content alone.
--
-- Run it in the Supabase SQL editor, or:
--   psql "$DATABASE_URL" -f supabase/seed_my_resume.sql
-- ============================================================================

-- ── The account. Change this one line to seed somebody else. ────────────────
-- A temp table rather than psql's \set, so the same file works pasted into the
-- Supabase SQL editor, which does not process backslash commands.
DROP TABLE IF EXISTS seed_target;
CREATE TEMP TABLE seed_target(email TEXT);
INSERT INTO seed_target VALUES ('delonpierre758@gmail.com');

DO $$
DECLARE
  v_email TEXT;
  v_user  UUID;
  v_name  TEXT;
BEGIN
  SELECT email INTO v_email FROM seed_target LIMIT 1;

  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No auth user with email %. Sign in once first.', v_email;
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), 'Delon Pierre') INTO v_name
  FROM profiles WHERE id = v_user;

  -- ── Profile: only the blanks ──────────────────────────────────────────────
  -- The member drawer, the directory card and the CV fallback all read these,
  -- so filling them fixes the empty CV in every surface at once. COALESCE +
  -- NULLIF means anything already written is kept.
  UPDATE profiles SET
    bio = COALESCE(NULLIF(bio, ''),
      'Education and training specialist at the OECS Commission, working on '
      || 'regional skills programmes and the digital delivery of learning '
      || 'across the Eastern Caribbean.'),
    country = COALESCE(NULLIF(country, ''), 'Saint Lucia'),
    organization = COALESCE(NULLIF(organization, ''), 'OECS Commission'),
    industry = COALESCE(NULLIF(industry, ''), 'Education & Training'),
    skills = CASE
      WHEN skills IS NULL OR cardinality(skills) = 0
      THEN ARRAY['Programme Management', 'Curriculum Design', 'Monitoring & Evaluation',
                 'Digital Learning', 'Stakeholder Engagement']
      ELSE skills END,
    interests = CASE
      WHEN interests IS NULL OR cardinality(interests) = 0
      THEN ARRAY['Education Technology', 'Youth Development', 'Regional Integration']
      ELSE interests END,
    open_to = CASE
      WHEN open_to IS NULL OR cardinality(open_to) = 0
      THEN ARRAY['mentoring', 'partnerships', 'speaking']
      ELSE open_to END
  WHERE id = v_user;

  -- ── The CV document ───────────────────────────────────────────────────────
  -- `template` is the row key and stays 'viridion' (migration 078); the look is
  -- `design`, set separately below so this file still runs on a database where
  -- 078 has not been applied.
  --
  -- `sources` is left empty on purpose: every path counts as 'vc'-owned, so a
  -- later Virtual Campus sync is free to replace this placeholder text. Stamping
  -- it 'manual' would freeze the seed in place permanently.
  INSERT INTO resumes (user_id, template, data, sources, is_public)
  VALUES (
    v_user,
    'viridion',
    jsonb_build_object(
      'profile', jsonb_build_object(
        'name', v_name,
        'role', 'Education & Training · OECS Commission',
        'motto', 'Skills that travel across the region.',
        'location', 'Saint Lucia',
        'email', v_email,
        'phone', '+1 758 555 0142',
        'socials', jsonb_build_array(
          jsonb_build_object('label', 'LinkedIn', 'href', 'https://www.linkedin.com/in/'),
          jsonb_build_object('label', 'OECS', 'href', 'https://www.oecs.int')
        ),
        'about', jsonb_build_array(
          'Education and training specialist working on regional skills programmes and the digital delivery of learning across the Eastern Caribbean.',
          'Interested in what makes a qualification portable between member states, and in the systems that let a learner carry their record with them.'
        )
      ),
      'roles', jsonb_build_array(
        jsonb_build_object(
          'org', 'OECS Commission', 'title', 'Education & Training Specialist',
          'period', '2023 — now', 'location', 'Castries, Saint Lucia',
          'points', jsonb_build_array(
            'Coordinate regional skills programmes across the nine member states.',
            'Lead the digital delivery workstream for the OECS Virtual Campus.',
            'Run monitoring and evaluation for donor-funded training projects.'
          )
        ),
        jsonb_build_object(
          'org', 'Ministry of Education', 'title', 'Programme Officer',
          'period', '2019 — 2023', 'location', 'Saint Lucia',
          'points', jsonb_build_array(
            'Designed and rolled out a national teacher training curriculum.',
            'Managed reporting for three multi-year education grants.'
          )
        )
      ),
      'education', jsonb_build_array(
        jsonb_build_object('credential', 'MSc Education Policy', 'school', 'University of the West Indies', 'year', '2019'),
        jsonb_build_object('credential', 'BA Social Sciences', 'school', 'Sir Arthur Lewis Community College', 'year', '2015')
      ),
      'courses', jsonb_build_array(
        jsonb_build_object(
          'courseId', 'seed-vc-01', 'title', 'Designing Blended Learning',
          'provider', 'OECS Virtual Campus', 'subjectArea', 'Education',
          'gradeLevel', NULL, 'difficulty', 'Intermediate',
          'status', 'completed', 'progressPercentage', 100,
          'enrolledAt', NULL, 'completedAt', NULL, 'courseUrl', NULL
        ),
        jsonb_build_object(
          'courseId', 'seed-vc-02', 'title', 'Monitoring & Evaluation Fundamentals',
          'provider', 'OECS Virtual Campus', 'subjectArea', 'Development',
          'gradeLevel', NULL, 'difficulty', 'Beginner',
          'status', 'completed', 'progressPercentage', 100,
          'enrolledAt', NULL, 'completedAt', NULL, 'courseUrl', NULL
        ),
        jsonb_build_object(
          'courseId', 'seed-vc-03', 'title', 'Climate Resilience in the Caribbean',
          'provider', 'OECS Virtual Campus', 'subjectArea', 'Climate',
          'gradeLevel', NULL, 'difficulty', 'Intermediate',
          'status', 'in_progress', 'progressPercentage', 45,
          'enrolledAt', NULL, 'completedAt', NULL, 'courseUrl', NULL
        )
      ),
      -- `abbr` is the two characters inside the Signature design's circles.
      'skills', jsonb_build_array(
        jsonb_build_object('area', 'Programme', 'abbr', 'Pm',
          'skills', jsonb_build_array('Planning', 'Budgets', 'Reporting')),
        jsonb_build_object('area', 'Learning', 'abbr', 'Ld',
          'skills', jsonb_build_array('Curriculum design', 'Blended delivery', 'Assessment')),
        jsonb_build_object('area', 'Data', 'abbr', 'Da',
          'skills', jsonb_build_array('M&E frameworks', 'Survey design', 'Dashboards')),
        jsonb_build_object('area', 'Partnerships', 'abbr', 'Pa',
          'skills', jsonb_build_array('Donor relations', 'Member states', 'Facilitation'))
      ),
      'languages', jsonb_build_array('English', 'French', 'Kwéyòl'),
      'professionalSkills', jsonb_build_array(
        'Public speaking', 'Grant writing', 'Team leadership', 'Workshop facilitation'
      ),
      'academic', jsonb_build_array(
        jsonb_build_object('subject', 'Education Policy', 'skills', 'Comparative policy analysis, qualifications frameworks'),
        jsonb_build_object('subject', 'Research Methods', 'skills', 'Mixed methods, survey instruments, focus groups'),
        jsonb_build_object('subject', 'Development Economics', 'skills', 'Small-island economies, labour market analysis')
      ),
      'interests', 'Education technology, youth development and regional integration. Sailing when the weather allows.'
    ),
    '{}'::jsonb,
    FALSE
  )
  ON CONFLICT (user_id, template) DO UPDATE
    SET data = EXCLUDED.data,
        updated_at = now();

  RAISE NOTICE 'Seeded CV for % (%).', v_name, v_email;
END $$;

-- The design column only exists once migration 078 has been applied. Guarded so
-- this seed is still usable before then — the CV simply draws in the default.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resumes' AND column_name = 'design'
  ) THEN
    EXECUTE $q$
      UPDATE resumes r SET design = COALESCE(NULLIF(r.design, ''), 'signature')
      WHERE r.user_id = (
        SELECT u.id FROM auth.users u
        JOIN seed_target t ON lower(u.email) = lower(t.email)
      )
    $q$;
  ELSE
    RAISE NOTICE 'resumes.design missing — apply migration 078 to switch designs.';
  END IF;
END $$;

DROP TABLE IF EXISTS seed_target;
