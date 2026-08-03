#!/usr/bin/env node
/**
 * Harvest copy out of the pure-data modules, without editing them.
 *
 *   npm run i18n:harvest      # writes src/i18n/harvested.ts
 *
 * site-map.ts, constants.ts, the help articles and the 33 tutorial modules are
 * string tables with no JSX — roughly 5,700 lines of copy. Rewriting them would
 * be the single riskiest part of the migration for no benefit, and site-map.ts
 * cannot be rewritten at all: api/ai-search.ts imports it, so it has to stay
 * React-free and edge-safe.
 *
 * So instead of editing them, this walks their exported values along an
 * allowlist of copy paths and writes ONE generated module full of `msg`
 * descriptors. `lingui extract` then picks those up like any other source, and
 * the string is translated at the RENDER site with `i18n._(entry.label)` — one
 * edit per consumer instead of hundreds per data file.
 *
 * The modules are loaded and their real values read, rather than parsed: a
 * table built by a `.map()` or spread into from another constant is invisible to
 * a parser and obvious to an evaluator. ROLE_LABELS in constants.ts is exactly
 * that shape — `Object.fromEntries(ROLE_DEFINITIONS.map(…))` — and a parser
 * would find nothing in it at all.
 *
 * The output IS COMMITTED, and `i18n:extract` runs this first. Both matter:
 * `lingui extract --clean` deletes any message it cannot find in the source, so
 * a missing or stale harvested.ts would silently wipe ~1,000 already-translated
 * entries out of the .po files.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadTs, closeLoader } from './load-ts.mjs'

const OUT = 'src/i18n/harvested.ts'

/**
 * Which exported values are copy.
 *
 * Each rule names a module and the property names, at any depth, whose string
 * values are shown to a member. Everything else in those modules — route paths,
 * icon names, permission keys, category slugs — is left alone.
 *
 * Deliberately an allowlist. These files are full of strings that look like copy
 * and are not: `value: 'climate-tech'` sits directly beside `label: 'Climate
 * Tech'` in the same object.
 */
const RULES = [
  { module: 'src/lib/constants.ts', keys: ['label', 'description', 'name', 'title', 'hint'] },
  {
    module: 'src/lib/site-map.ts',
    keys: ['title', 'description', 'howTo'],
    // `keywords` is search-matching vocabulary, not prose. Translating it would
    // silently change what the site search matches on.
    skipKeys: ['keywords', 'path', 'id', 'area'],
  },
  { module: 'src/lib/faq-content.ts', keys: ['question', 'answer', 'label', 'title'] },
  { module: 'src/lib/event-blueprints.ts', keys: ['label', 'description', 'title', 'hint'] },
  { module: 'src/lib/hero-details.ts', keys: ['title', 'description', 'label'] },
  // `content` is the field HelpArticle actually stores its body in — the rule
  // originally listed `body`, harvested nothing from it, and nobody noticed
  // because the fallback renders the English source.
  { module: 'src/lib/help-content.ts', keys: ['title', 'description', 'body', 'label', 'summary', 'content'] },
  // Rarity/tier display names, consumed by TrophyCard and the achievements
  // filter chips. Singular `_LABEL` exports, so the record pattern below
  // needs its singular forms to see them.
  { module: 'src/lib/achievement-style.ts', keys: ['label'] },
]

/** Every tutorial module, discovered rather than listed — there are 33 and more get added. */
const TUTORIAL_GLOB = 'src/data/tutorials'
const TUTORIAL_KEYS = ['title', 'description', 'body', 'label', 'content']

/**
 * Whole-record label maps: `Record<string, string>` where the KEY is a database
 * enum and EVERY value is display copy.
 *
 *   export const ROLE_LABELS: Record<string, string> = { student: 'Student', … }
 *
 * The key-allowlist walk above cannot see these — the keys are `student` and
 * `mentor`, not `label` — and there are ~30 of them in constants.ts alone. The
 * naming convention is the signal, and it is one this codebase already follows
 * consistently.
 *
 * Deliberately narrow. `*_OPTIONS` and `*_CATEGORIES` are arrays of
 * `{ value, label }`, where the key walk already picks the label and correctly
 * leaves the slug alone; sweeping those wholesale would translate the values.
 */
const RECORD_EXPORT_PATTERN = /_(LABELS?|NAMES?|TITLES?|HINTS?|DESCRIPTIONS?)$/

/**
 * Top-level `string[]` exports whose every element is display copy —
 * FAQ_CATEGORIES is the motivating case: `['Getting Started', 'Accounts', …]`
 * rendered directly as filter chips. Deliberately NOT the record pattern:
 * `*_CATEGORIES` as a RECORD is usually enum slugs (GRIEVANCE_CATEGORIES),
 * which is why this only ever matches plain arrays of strings.
 */
const STRING_ARRAY_EXPORT_PATTERN = /_(CATEGORIES|LABELS|NAMES|TITLES)$/

const MIN_LENGTH = 2

/**
 * A compiled `msg` descriptor — `{ id, message }` — reached by evaluating a
 * module the macro transform has already processed. Its string is ALREADY in
 * the catalog via `lingui extract` on the module that defines it; harvesting
 * `.message` here would duplicate the entry under a second id.
 */
function isDescriptor(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.id === 'string' &&
    typeof value.message === 'string'
  )
}

function collect(value, rule, seen, path = '') {
  if (value == null) return
  if (isDescriptor(value)) return
  if (Array.isArray(value)) {
    for (const item of value) collect(item, rule, seen, path)
    return
  }
  if (typeof value !== 'object') return

  for (const [key, child] of Object.entries(value)) {
    if (rule.skipKeys?.includes(key)) continue

    if (typeof child === 'string') {
      if (rule.keys.includes(key) && child.trim().length >= MIN_LENGTH) {
        seen.add(child.trim())
      }
      continue
    }
    if (Array.isArray(child) && rule.keys.includes(key) && child.every((c) => typeof c === 'string')) {
      // e.g. site-map's `howTo: string[]` — a list of instruction lines.
      for (const line of child) if (line.trim().length >= MIN_LENGTH) seen.add(line.trim())
      continue
    }
    collect(child, rule, seen, `${path}.${key}`)
  }
}

function escapeTemplate(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

async function main() {
  const { shouldTranslate } = await loadTs('src/lib/i18n/should-translate.ts')

  const { readdirSync } = await import('node:fs')
  const tutorialModules = readdirSync(resolve(process.cwd(), TUTORIAL_GLOB))
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.d.ts'))
    // Test files execute their describe/it on import and blow up outside a
    // vitest runner. Admin tutorials are excluded for the same reason the admin
    // pages are: staff-only, and agreed out of scope.
    .filter((f) => !/\.test\.tsx?$/.test(f) && !/admin/i.test(f))
    .map((f) => `${TUTORIAL_GLOB}/${f}`)

  const rules = [...RULES, ...tutorialModules.map((module) => ({ module, keys: TUTORIAL_KEYS }))]

  const seen = new Set()
  const perModule = []

  for (const rule of rules) {
    let mod
    try {
      mod = await loadTs(rule.module)
    } catch (error) {
      console.warn(`[i18n:harvest] skipped ${rule.module}: ${error.message.split('\n')[0]}`)
      continue
    }
    const before = seen.size
    for (const [name, exported] of Object.entries(mod)) {
      // A `Record<string, string>` label map: every value is copy, whatever the
      // key is called. ROLE_LABELS is assembled by Object.fromEntries at import
      // time, so this is also the case a parser could never have found.
      // Values may be plain strings OR compiled msg descriptors — ROLE_LABELS
      // became exactly that mix when permissions.ts migrated its labels to
      // msg``. Harvest the strings; descriptors are already extracted from
      // the module that defines them. Requiring all-strings here would make
      // one migrated entry silently un-harvest the rest of the table.
      if (
        RECORD_EXPORT_PATTERN.test(name) &&
        exported &&
        typeof exported === 'object' &&
        !Array.isArray(exported) &&
        Object.values(exported).length > 0 &&
        Object.values(exported).every((v) => typeof v === 'string' || isDescriptor(v))
      ) {
        for (const value of Object.values(exported)) {
          if (typeof value === 'string' && value.trim().length >= MIN_LENGTH) seen.add(value.trim())
        }
        continue
      }
      if (
        STRING_ARRAY_EXPORT_PATTERN.test(name) &&
        Array.isArray(exported) &&
        exported.length > 0 &&
        exported.every((v) => typeof v === 'string')
      ) {
        for (const value of exported) {
          if (value.trim().length >= MIN_LENGTH) seen.add(value.trim())
        }
        continue
      }
      collect(exported, rule, seen)
    }
    perModule.push([rule.module, seen.size - before])
  }

  // The shared predicate again, so a harvested slug can never reach a catalog.
  const messages = [...seen].filter((text) => shouldTranslate(text)).sort()

  const body = messages.map((text) => `  msg\`${escapeTemplate(text)}\`,`).join('\n')

  mkdirSync(resolve(process.cwd(), 'src/i18n'), { recursive: true })
  writeFileSync(
    resolve(process.cwd(), OUT),
    `/* eslint-disable */
// GENERATED by scripts/i18n/harvest.mjs — do not edit.
// Run \`npm run i18n:harvest\` after changing any of the pure-data copy modules.
//
// Why this file exists: site-map.ts, constants.ts, the help articles and the
// tutorial modules are string tables with no JSX. They are read, never
// rewritten — site-map.ts in particular is imported by api/ai-search.ts and has
// to stay React-free. Listing their strings here is what makes
// \`lingui extract\` see them, so they can be translated at the render site with
// \`i18n._(entry.label)\` rather than by editing ${rules.length} data files.
//
// Nothing imports the array. Its only job is to exist where the extractor looks.
import { msg } from '@lingui/core/macro'

export const harvested = [
${body}
]
`
  )

  console.log(`\n[i18n:harvest] ${messages.length} strings from ${rules.length} modules -> ${OUT}\n`)
  for (const [module, n] of perModule.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(n).padStart(5)}  ${module}`)
  }
  console.log()
}

main()
  .then(closeLoader)
  .catch(async (error) => {
    await closeLoader()
    console.error('[i18n:harvest] failed:', error)
    process.exit(1)
  })
