/**
 * One definition of "what counts as copy", shared by the scanner, the codemod
 * and the CI ratchet.
 *
 * They MUST agree. A scanner that finds a string the codemod refuses to wrap
 * produces a manifest full of entries that never resolve; a ratchet stricter
 * than the scanner fails the build on strings nobody can fix.
 */

// ---------------------------------------------------------------------------
// Where to look
// ---------------------------------------------------------------------------

export const INCLUDE_GLOBS = ['src/**/*.tsx', 'src/**/*.ts']

/**
 * Never scanned, never edited.
 *
 * Each entry is a decision, not a convenience:
 *   - admin/ is 62 files and ~21k lines that only OECS staff ever open. Out of
 *     scope by agreement, and it is a third of the whole job.
 *   - app-error.ts holds SAFE_MESSAGES, which are Sentry-facing developer
 *     strings. Translating them would make error grouping depend on the
 *     reporter's language.
 *   - types/ and *.d.ts have no runtime strings at all.
 *   - the i18n plumbing itself must not be fed to its own scanner.
 */
export const EXCLUDE_PATHS = [
  'src/pages/admin/',
  // The admin chrome, which does not live under pages/admin/ and so was not
  // caught by the rule above — 22 strings that only OECS staff ever read.
  'src/components/layout/AdminLayout.tsx',
  'src/lib/app-error.ts',
  'src/types/',
  'src/test/',
  'src/i18n/',
  'src/lib/i18n/',
  'src/locales/',
  'src/vite-env.d.ts',
]

export const EXCLUDE_SUFFIXES = ['.test.ts', '.test.tsx', '.d.ts']

/**
 * Pure-data copy modules: HARVESTED, never rewritten.
 *
 * These are string tables with no JSX. Editing them in place is pure risk for no
 * gain — and site-map.ts cannot be edited at all, because api/ai-search.ts
 * imports it and it has to stay React-free and edge-safe.
 *
 * The harvester reads their exported values along an allowlist of copy paths and
 * emits `msg` descriptors into a generated module, so `lingui extract` picks
 * them up. Translation then happens at the RENDER site: one edit per consumer
 * instead of hundreds per data file.
 */
export const HARVEST_PATHS = [
  'src/lib/site-map.ts',
  'src/lib/constants.ts',
  'src/lib/faq-content.ts',
  'src/lib/event-blueprints.ts',
  'src/lib/hero-details.ts',
  'src/lib/help/',
  'src/data/tutorials/',
]

// ---------------------------------------------------------------------------
// The ratchet
// ---------------------------------------------------------------------------

/**
 * Directories already migrated. `npm run i18n:check` FAILS if a file in one of
 * these still contains an unwrapped literal the scanner classifies as copy.
 *
 * This list grows by exactly one entry per merged slice, and that is the whole
 * mechanism: without it, 5,000 strings become 5,300 within a month and the
 * migration never finishes.
 */
export const MIGRATED_PATHS = [
  'src/components/projects/ProjectCard.tsx',

  // Slice 2 — src/components/layout. Directory-level, like ui: AdminLayout.tsx
  // is filtered out earlier by EXCLUDE_PATHS, so this does not pull staff-only
  // chrome back into scope.
  'src/components/layout/',

  // Slice 1 — src/components/ui. The whole directory, not a file list: these are
  // the shared primitives, so a new one added here without wrapping its copy
  // would silently leak English into every screen that adopts it. Guarding the
  // directory is the point.
  'src/components/ui/',

  // Slices 3+ — swept and verified. Directory-level throughout, for the same
  // reason: a file added to any of these later cannot ship English.
  'src/pages/projects/',
  'src/components/projects/',
  'src/pages/events/',
  'src/components/events/',
  'src/components/venue/',
  'src/lib/venue-room-sections.ts',
  'src/pages/settings/',
  'src/pages/collaborate/',
  'src/components/collaboration/',
  'src/pages/grants/',
  'src/components/grants/',
  'src/pages/auth/',
  'src/pages/dashboard/',
  'src/pages/sme/',
  'src/pages/cv/',
  'src/components/resume/',
  'src/components/documents/',
  'src/components/notes/',
  'src/components/messages/',
  'src/pages/resources/',
  'src/pages/forums/',
  'src/pages/directory/',
  'src/pages/leaderboard/',
  'src/lib/permissions.ts',
  'src/lib/grant-application-template.ts',

  // Slice — UAT/feedback/moderation/safeguarding/grievances. Directory-level:
  // the GRIEVANCE_CATEGORY_LABELS / GRIEVANCE_STATUS_LABELS consumers in
  // grievances were the only unwrapped strings left; everything else in these
  // five directories was already migrated.
  'src/components/uat/',
  'src/components/feedback/',
  'src/components/moderation/',
  'src/components/safeguarding/',
  'src/pages/grievances/',

  // Slice — achievements/help/hackathons/invites. Directory-level throughout,
  // including src/components/help (help-specific rendering for
  // src/pages/help, not a shared primitive) and the single invite-related
  // page, JoinInvitePage.tsx.
  'src/pages/achievements/',
  'src/components/achievements/',
  'src/pages/help/',
  'src/components/help/',
  'src/pages/hackathons/',
  'src/pages/JoinInvitePage.tsx',

  // Slice — discover/onboarding/profile. DiscoverPage.tsx was reverted after a
  // killed agent half-migrated it and was migrated fresh here; onboarding and
  // most of the public profile page were already done and only the remaining
  // gaps (fallback names, counted labels, the private-profile notice) needed
  // wrapping.
  'src/pages/discover/',
  'src/pages/onboarding/',
  'src/pages/profile/',

  // DELIBERATELY ABSENT — these slices were interrupted partway and are only
  // half migrated. Guarding them now would fail the build on work that is
  // genuinely still outstanding rather than on a regression, and a ratchet that
  // cries wolf gets switched off within a week:
  //
  //   src/components/directory, src/components/personalization,
  //   src/components/shared, src/components/calendar, src/components/gantt,
  //   src/hooks
  //
  // Add each one here as its sweep finishes.
]

// ---------------------------------------------------------------------------
// What is copy, and what merely looks like it
// ---------------------------------------------------------------------------

/** JSX attributes whose string value is shown to, or read out to, a human. */
export const COPY_ATTRS = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'ariaLabel',
  'cta',
  'description',
  'emptyText',
  'eyebrow',
  'heading',
  'helpText',
  'hint',
  'label',
  'placeholder',
  'subtitle',
  'title',
  'tooltip',
])

/**
 * Attributes that are never copy, whatever they contain.
 *
 * `title` is deliberately absent from this list and present above — it is a
 * tooltip on a DOM element. But note it is ALSO the name of a data field, which
 * is why object values are judged by a separate allowlist below rather than by
 * this one.
 */
export const DENY_ATTRS = new Set([
  'as',
  'accept',
  'autoComplete',
  'className',
  'class',
  'color',
  'd',
  'data-tutorial',
  'data-spy',
  'data-testid',
  'fill',
  'for',
  'href',
  'htmlFor',
  'icon',
  'id',
  'key',
  'lang',
  'name',
  'path',
  'pattern',
  'rel',
  'role',
  'src',
  'srcSet',
  'stroke',
  'style',
  'target',
  'testId',
  'to',
  'type',
  'value',
  'variant',
  'size',
  'tone',
  'width',
  'height',
])

/**
 * Object-literal KEYS whose string value is copy.
 *
 * Values only, and only for these keys. An object key is never itself
 * translated — a key is an identifier even when it reads like a word.
 */
export const COPY_KEYS = new Set([
  'answer',
  'blurb',
  'body',
  'caption',
  'cta',
  'description',
  'detail',
  'empty',
  'emptyText',
  'eyebrow',
  'heading',
  'helpText',
  'hint',
  'label',
  'message',
  'placeholder',
  'question',
  'subtitle',
  'summary',
  'text',
  'title',
  'tooltip',
])

/**
 * Calls whose string arguments are never copy.
 *
 * `cn`/`clsx`/`cva`/`twMerge` take Tailwind classes at any nesting depth, and a
 * wrapped class name is an invisible styling bug rather than a visible one.
 */
export const DENY_CALLEES = new Set([
  'cn',
  'clsx',
  'cva',
  'twMerge',
  'twMergeKtip',
  'require',
  'import',
  'format',
  'formatDate',
  'captureException',
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'setAttribute',
  'getAttribute',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'setItem',
  'getItem',
  'removeItem',
  'from',
  'rpc',
  'eq',
  'select',
  'order',
  'match',
  'test',
])

/** Calls whose FIRST string argument is copy shown to a member. */
export const COPY_CALLEES = new Set([
  'usePageTitle',
  'toast.success',
  'toast.error',
  'toast.warning',
  'toast.info',
])

/** Already wrapped — these mean a string is done, not pending. */
export const MACRO_NAMES = new Set(['t', 'msg', 'plural', 'select', 'selectOrdinal', 'defineMessage'])
export const MACRO_COMPONENTS = new Set(['Trans', 'Plural', 'Select', 'SelectOrdinal'])

export const MANIFEST_PATH = 'i18n/manifest.json'

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

/**
 * Minimal glob -> RegExp. `**` spans directories, `*` stays inside one segment.
 *
 * Lives here, and is tested, because a glob that silently matches NOTHING is the
 * worst failure this toolchain has: `--glob 'src/components/ui/**'` printed
 * "No auto entries match" and exited 0, which reads exactly like "that slice is
 * already done" rather than "your filter is broken". It cost a slice.
 *
 * The three forms are genuinely different and a single rule cannot serve them:
 *
 *   'src/components/ui/**'  must match  src/components/ui/Modal.tsx   (rest of path)
 *   'src/**\/*.tsx'          must match  src/a/b/C.tsx and src/C.tsx   (zero or more dirs)
 *   'src/*.ts'              must NOT match  src/lib/x.ts              (one segment)
 *
 * Sentinels rather than one pass, because `*` is a prefix of `**` and a naive
 * ordering lets the single-star rule eat the output of the double-star rule.
 */
export function globToRegExp(glob) {
  const DIRS = String.fromCharCode(1) // '**/' — zero or more whole segments
  const REST = String.fromCharCode(2) // a trailing '**' — everything left, slashes included
  const SEG = String.fromCharCode(3) // '*' — within one segment

  const body = glob
    .replace(/\*\*\//g, DIRS)
    .replace(/\*\*/g, REST)
    .replace(/\*/g, SEG)
    .replace(/[.+^${}()|[\]\\?]/g, '\\$&')
    .split(DIRS)
    .join('(?:[^/]*/)*')
    .split(REST)
    .join('.*')
    .split(SEG)
    .join('[^/]*')

  return new RegExp(`^${body}$`)
}
