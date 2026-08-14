-- Migration 120: Seed the content filter's term list
--
-- 065 shipped the machinery with PII and grooming patterns only, and left the
-- word list to the safety team on the grounds that it is regional and it
-- changes. Both are still true, and this does not replace that judgement — it
-- gives them a floor to edit rather than an empty table, because an empty table
-- means the live highlighting added in 119 shows a member nothing at all.
--
-- Three decisions worth stating, because they are easy to get wrong later:
--
-- 1. Severity is graded by CONSEQUENCE, not by offensiveness. `high` runs
--    moderate_content()'s escalation branch: it quarantines, suspends the
--    author, and notifies their school. That is the right response to a
--    credible threat of violence and to telling a member to kill themselves.
--    It is not the right response to a slur typed in anger in a forum reply,
--    which belongs in the moderation queue for a person to look at. So slurs
--    are `medium` — withheld immediately, reported, reviewed — and `high` is
--    reserved for threats and self-harm encouragement.
--
-- 2. Ambiguity is excluded, deliberately and by name. Words omitted here that
--    a stricter list would include: "negro" (ordinary Spanish, and Spanish is
--    a platform language), "dyke" (a flood-control embankment, and flood
--    resilience is a live project category in the OECS), "cracker", "guinea",
--    "cock", "hoe", "homo", "queer". Each would fire constantly on legitimate
--    content, and a filter that cries wolf is a filter members learn to
--    ignore. Add them scoped to a country if a member state needs them.
--
-- 3. Regional slurs are seeded UNSCOPED (country_code NULL) where they are
--    understood across the OECS, but 065's country_code column exists so the
--    safety team can narrow any of them to the one member state where a word
--    is a slur without flagging it in a country where it is not. That
--    narrowing is a judgement for people who live there, not for a migration.
--
-- Everything here is client_visible: for a slur, the strikethrough IS the
-- deterrent, and a rule nobody can see deters nobody. The grooming tripwires
-- from 065 stay hidden — see 119.
--
-- Idempotent — safe to re-run. Requires 065 and 119.

-- ============================================================
-- Profanity — low. Warns the author, never blocks a submit.
-- ============================================================

INSERT INTO moderation_terms (pattern, kind, severity, category, note) VALUES
  ('fuck',          'term', 'low', NULL, 'Profanity'),
  ('fucking',       'term', 'low', NULL, 'Profanity'),
  ('fucked',        'term', 'low', NULL, 'Profanity'),
  ('fuckin',        'term', 'low', NULL, 'Profanity'),
  ('motherfucker',  'term', 'low', NULL, 'Profanity'),
  ('shit',          'term', 'low', NULL, 'Profanity'),
  ('shite',         'term', 'low', NULL, 'Profanity'),
  ('bullshit',      'term', 'low', NULL, 'Profanity'),
  ('horseshit',     'term', 'low', NULL, 'Profanity'),
  ('crap',          'term', 'low', NULL, 'Profanity'),
  ('piss',          'term', 'low', NULL, 'Profanity'),
  ('pissed',        'term', 'low', NULL, 'Profanity'),
  ('damn',          'term', 'low', NULL, 'Profanity'),
  ('dammit',        'term', 'low', NULL, 'Profanity'),
  ('goddamn',       'term', 'low', NULL, 'Profanity'),
  ('bollocks',      'term', 'low', NULL, 'Profanity'),
  ('bugger',        'term', 'low', NULL, 'Profanity'),
  ('arse',          'term', 'low', NULL, 'Profanity'),
  ('arsehole',      'term', 'low', NULL, 'Profanity'),
  ('asshole',       'term', 'low', NULL, 'Profanity'),
  ('dickhead',      'term', 'low', NULL, 'Profanity'),
  ('jackass',       'term', 'low', NULL, 'Profanity'),
  ('dumbass',       'term', 'low', NULL, 'Profanity'),
  ('smartass',      'term', 'low', NULL, 'Profanity'),
  ('douchebag',     'term', 'low', NULL, 'Profanity'),
  ('prick',         'term', 'low', NULL, 'Profanity'),
  ('wanker',        'term', 'low', NULL, 'Profanity'),
  ('tosser',        'term', 'low', NULL, 'Profanity'),
  ('bastard',       'term', 'low', NULL, 'Profanity')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Hate and harassment — medium. Withheld on sight, queued for review.
-- ============================================================

INSERT INTO moderation_terms (pattern, kind, severity, category, note) VALUES
  -- Racial and ethnic
  ('nigger',        'term', 'medium', 'hate_harassment', 'Racial slur'),
  ('niggers',       'term', 'medium', 'hate_harassment', 'Racial slur'),
  ('nigga',         'term', 'medium', 'hate_harassment', 'Racial slur'),
  ('niggas',        'term', 'medium', 'hate_harassment', 'Racial slur'),
  ('jigaboo',       'term', 'medium', 'hate_harassment', 'Racial slur'),
  ('spearchucker',  'term', 'medium', 'hate_harassment', 'Racial slur'),
  ('porch monkey',  'term', 'medium', 'hate_harassment', 'Racial slur'),
  ('wetback',       'term', 'medium', 'hate_harassment', 'Ethnic slur'),
  ('spic',          'term', 'medium', 'hate_harassment', 'Ethnic slur'),
  ('beaner',        'term', 'medium', 'hate_harassment', 'Ethnic slur'),
  ('chink',         'term', 'medium', 'hate_harassment', 'Ethnic slur'),
  ('gook',          'term', 'medium', 'hate_harassment', 'Ethnic slur'),
  ('paki',          'term', 'medium', 'hate_harassment', 'Ethnic slur'),
  ('raghead',       'term', 'medium', 'hate_harassment', 'Ethnic slur'),
  ('towelhead',     'term', 'medium', 'hate_harassment', 'Ethnic slur'),
  ('sandnigger',    'term', 'medium', 'hate_harassment', 'Ethnic slur'),
  ('kike',          'term', 'medium', 'hate_harassment', 'Antisemitic slur'),
  ('hymie',         'term', 'medium', 'hate_harassment', 'Antisemitic slur'),
  ('dago',          'term', 'medium', 'hate_harassment', 'Ethnic slur'),
  ('honky',         'term', 'medium', 'hate_harassment', 'Racial slur'),
  ('redskin',       'term', 'medium', 'hate_harassment', 'Racial slur'),
  ('injun',         'term', 'medium', 'hate_harassment', 'Racial slur'),
  ('halfbreed',     'term', 'medium', 'hate_harassment', 'Racial slur'),
  ('mulatto',       'term', 'medium', 'hate_harassment', 'Racial slur'),
  ('coolie',        'term', 'medium', 'hate_harassment', 'Caribbean: slur for Indo-Caribbean people. Scope by country if a member state disagrees.'),

  -- Homophobic and transphobic. The Caribbean-specific entries are the ones a
  -- generic imported word list would miss entirely.
  ('faggot',        'term', 'medium', 'hate_harassment', 'Homophobic slur'),
  ('faggots',       'term', 'medium', 'hate_harassment', 'Homophobic slur'),
  ('fag',           'term', 'medium', 'hate_harassment', 'Homophobic slur'),
  ('batty boy',     'term', 'medium', 'hate_harassment', 'Caribbean homophobic slur'),
  ('batty man',     'term', 'medium', 'hate_harassment', 'Caribbean homophobic slur'),
  ('chi chi man',   'term', 'medium', 'hate_harassment', 'Caribbean homophobic slur'),
  ('buller man',    'term', 'medium', 'hate_harassment', 'Caribbean homophobic slur'),
  ('tranny',        'term', 'medium', 'hate_harassment', 'Transphobic slur'),
  ('shemale',       'term', 'medium', 'hate_harassment', 'Transphobic slur'),

  -- Ableist
  ('retard',        'term', 'medium', 'hate_harassment', 'Ableist slur'),
  ('retarded',      'term', 'medium', 'hate_harassment', 'Ableist slur'),
  ('mongoloid',     'term', 'medium', 'hate_harassment', 'Ableist slur'),
  ('spastic',       'term', 'medium', 'hate_harassment', 'Ableist slur'),

  -- Misogynist
  ('cunt',          'term', 'medium', 'hate_harassment', 'Misogynist slur'),
  ('bitch',         'term', 'medium', 'bullying', 'Gendered insult'),
  ('bitches',       'term', 'medium', 'bullying', 'Gendered insult'),
  ('slut',          'term', 'medium', 'bullying', 'Gendered insult'),
  ('whore',         'term', 'medium', 'bullying', 'Gendered insult'),
  ('skank',         'term', 'medium', 'bullying', 'Gendered insult'),
  ('thot',          'term', 'medium', 'bullying', 'Gendered insult'),
  ('twat',          'term', 'medium', 'bullying', 'Gendered insult')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Sexual content — medium. This is a platform with verified minors on it.
-- ============================================================

INSERT INTO moderation_terms (pattern, kind, severity, category, note) VALUES
  ('porn',          'term', 'medium', 'nsfw', 'Sexual content'),
  ('porno',         'term', 'medium', 'nsfw', 'Sexual content'),
  ('pornography',   'term', 'medium', 'nsfw', 'Sexual content'),
  ('pornhub',       'term', 'medium', 'nsfw', 'Sexual content'),
  ('onlyfans',      'term', 'medium', 'nsfw', 'Sexual content'),
  ('hentai',        'term', 'medium', 'nsfw', 'Sexual content'),
  ('nudes',         'term', 'medium', 'nsfw', 'Sexual content'),
  ('blowjob',       'term', 'medium', 'nsfw', 'Sexual content'),
  ('handjob',       'term', 'medium', 'nsfw', 'Sexual content'),
  ('deepthroat',    'term', 'medium', 'nsfw', 'Sexual content'),
  ('gangbang',      'term', 'medium', 'nsfw', 'Sexual content'),
  ('bukkake',       'term', 'medium', 'nsfw', 'Sexual content'),
  ('cumshot',       'term', 'medium', 'nsfw', 'Sexual content'),
  ('masturbate',    'term', 'medium', 'nsfw', 'Sexual content'),
  ('masturbating',  'term', 'medium', 'nsfw', 'Sexual content'),
  ('camgirl',       'term', 'medium', 'nsfw', 'Sexual content'),
  ('sexting',       'term', 'medium', 'nsfw', 'Sexual content'),
  ('milf',          'term', 'medium', 'nsfw', 'Sexual content'),
  ('(send|show) (me )?(your |ur )?(nudes|nude pics?|naked pics?)', 'regex', 'medium', 'nsfw', 'Solicitation'),
  ('(d1ck|dick|cock) ?pics?',                                     'regex', 'medium', 'nsfw', 'Solicitation')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Threats and self-harm — high. Suspends and escalates to the safety team
-- and, for a school-verified student, to their institution.
-- ============================================================

INSERT INTO moderation_terms (pattern, kind, severity, category, note) VALUES
  ('kys',                                                                  'term',  'high', 'bullying', 'Self-harm encouragement'),
  ('(kill|hang|hurt) your ?self',                                          'regex', 'high', 'bullying', 'Self-harm encouragement'),
  ('(you|u) should (just )?(die|kill your ?self)',                         'regex', 'high', 'bullying', 'Self-harm encouragement'),
  ('(go|just) (die|kill your ?self)',                                      'regex', 'high', 'bullying', 'Self-harm encouragement'),
  ('(the world|everyone) (would be|is) better off without (you|u)',        'regex', 'high', 'bullying', 'Self-harm encouragement'),
  ('(i''?m going to|i will|imma|i''?ma|gonna) (kill|murder|shoot|stab|rape) (you|u|him|her|them)',
                                                                           'regex', 'high', 'hate_harassment', 'Threat of violence'),
  ('(i know where|i''?ll find) (you|u) (live|sleep)',                      'regex', 'high', 'hate_harassment', 'Threat'),
  ('(burn|bomb|shoot up) (your |the )?(house|school|office|building)',     'regex', 'high', 'hate_harassment', 'Threat of violence')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Bullying — medium.
-- ============================================================

INSERT INTO moderation_terms (pattern, kind, severity, category, note) VALUES
  ('(nobody|no one) (likes|wants) (you|u)',        'regex', 'medium', 'bullying', 'Targeted abuse'),
  ('(you|u)(''| a)?re (worthless|pathetic|garbage|trash|a waste of space)',
                                                   'regex', 'medium', 'bullying', 'Targeted abuse'),
  ('(shut|stfu) (the )?(fuck )?up',                'regex', 'medium', 'bullying', 'Targeted abuse')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Spam and scams — graded medium where money moves, low where it is only
-- noise. Under the client policy these warn on public forms and block in
-- direct messages, which is where a scam actually lands on someone.
-- ============================================================

INSERT INTO moderation_terms (pattern, kind, severity, category, note) VALUES
  ('(bitcoin|btc|crypto|forex).{0,40}(double|guaranteed|profit|invest)',    'regex', 'medium', 'spam_scam', 'Investment scam'),
  ('(gift ?card|itunes card|steam card).{0,30}(code|number|redeem)',        'regex', 'medium', 'spam_scam', 'Gift-card scam'),
  ('(next of kin|inheritance fund|nigerian prince)',                        'regex', 'medium', 'spam_scam', 'Advance-fee scam'),
  ('(western union|money ?gram).{0,30}(send|transfer|wire)',                'regex', 'medium', 'spam_scam', 'Untraceable transfer'),
  ('(make|earn) \$? ?\d{2,}.{0,25}(a|per) (day|week)',                      'regex', 'medium', 'spam_scam', 'Income scam'),
  ('(claim|collect) (your )?(prize|reward|winnings)',                       'regex', 'low',    'spam_scam', 'Prize bait'),
  ('(work from home).{0,30}(no experience|start today|earn)',               'regex', 'low',    'spam_scam', 'Job-offer spam'),
  ('(click|tap) (here|this link).{0,30}(to )?(claim|win|verify|receive)',   'regex', 'low',    'spam_scam', 'Link bait')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
