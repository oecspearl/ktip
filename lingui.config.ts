import { defineConfig } from '@lingui/cli'
import { formatter } from '@lingui/format-po'

/**
 * Static UI copy: extraction, catalogs, compilation.
 *
 * This covers the app's OWN text — buttons, nav, form labels, validation
 * messages. Anything a member writes is a different system entirely: it goes
 * through /api/translate and the shared cache in migration 096, because it does
 * not exist at build time.
 *
 * Two choices here are load-bearing:
 *
 * 1. `compileNamespace: 'es'` writes catalogs as ES modules under src/locales.
 *    They are then imported with a dynamic `import()`, so Rollup emits them as
 *    hashed chunks under /assets. That is not a preference — VitePWA's
 *    `globPatterns` precaches js/css/html/ico/svg/woff2 and NOT json, and
 *    vercel.json marks /assets immutable for a year. A .json catalog would be
 *    un-precached (so the app would lose its language offline) and, if it ever
 *    landed under /assets unhashed, permanently stale. JS modules get both
 *    properties for free.
 *
 * 2. A missing translation renders correct English rather than a raw key like
 *    "nav.projects.title" — which matters a great deal for a ~5,000-string
 *    migration that lands in slices over weeks.
 *
 *    That property comes from the macro keeping the `message` field, NOT from
 *    the ids: `explicitIdAsDefault: false` (the default) generates CONTENT
 *    HASHES, so the catalog is keyed `"-0B-ue": ["Projects"]` and an id is not
 *    readable text. This file was previously commented as though the id were
 *    the source string; it never was. The fallback is real only because
 *    vite.config.ts passes `descriptorFields: 'message'` to the Babel macro —
 *    without it, production strips `message` and a missing catalog renders the
 *    hash. See the note there before changing either.
 *
 *    Keeping `message` is also why English ships no catalog at all: the source
 *    strings are already inline in the chunk that uses them.
 */
export default defineConfig({
  sourceLocale: 'en',
  // `pseudo` has to be listed here as well as named below, or the CLI never
  // generates its catalog and the switch silently does nothing.
  locales: ['en', 'fr', 'es', 'pseudo'],

  // Dev-only. `?lang=pseudo` renders accented, bracketed, ~30% longer text, so
  // an unwrapped string stands out as plain English and any layout that cannot
  // survive French's extra length breaks visibly — before a single character has
  // been paid for.
  pseudoLocale: 'pseudo',
  fallbackLocales: { default: 'en' },

  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}/messages',
      include: ['src'],
      exclude: [
        '**/node_modules/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '<rootDir>/src/test/**',
        '<rootDir>/src/types/**',
        // SAFE_MESSAGES are Sentry-facing developer strings. They are documented
        // as having to stay constant and PII-free; translating them would make
        // error grouping depend on the reporter's language.
        '<rootDir>/src/lib/app-error.ts',
        // Staff-only, and explicitly out of scope: 62 files and ~21k lines that
        // no member ever sees.
        '<rootDir>/src/pages/admin/**',
        // The admin chrome, which sits in components/layout rather than under
        // pages/admin. Must match EXCLUDE_PATHS in scripts/i18n/config.mjs — if
        // the two disagree, the extractor pulls in copy the scanner never
        // reports and every "missing" count stops meaning anything.
        '<rootDir>/src/components/layout/AdminLayout.tsx',
      ],
    },
  ],

  // Line numbers off: a catalog that churns because a component moved down four
  // lines makes every slice's diff unreadable and every merge a conflict.
  format: formatter({ lineNumbers: false }),
  compileNamespace: 'es',

  // Sorted by message, so a catalog diff shows what changed rather than where
  // the extractor happened to walk the file tree.
  orderBy: 'messageId',
})
