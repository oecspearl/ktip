#!/usr/bin/env node
/**
 * Add SOURCE-TEXT aliases to the compiled catalogs, so `i18n._('Technology')`
 * resolves at runtime.
 *
 *   npm run i18n:compile   (runs `lingui compile` and then this)
 *
 * Why this exists: the compiled catalogs are keyed by Lingui's generated hash
 * ids. Every `msg` descriptor carries its hash, so descriptor lookups work —
 * but the harvested data modules (constants.ts, site-map.ts, the tutorials…)
 * still hold PLAIN STRINGS, and `i18n._('Technology')` looks up the literal
 * key 'Technology', misses, and silently renders English forever. That was the
 * bug behind untranslated category chips and role cards: not missing
 * translations, translations present in the catalog under a key the render
 * site could never produce.
 *
 * The fix: for every harvested source string, compute the same hash id lingui
 * generates (via @lingui/message-utils), find the compiled entry, and write a
 * second key — the source text itself — pointing at the same value. One pass
 * here makes `resolveCopy(i18n, value)` correct for BOTH halves of the
 * `Copy = string | MessageDescriptor` union, everywhere, with no edits to the
 * data modules and no per-consumer plumbing.
 *
 * `lingui compile` regenerates the catalogs WITHOUT aliases, which is why this
 * is chained into the i18n:compile script rather than run by hand. Idempotent:
 * re-running rewrites the same aliases.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { generateMessageId } from '@lingui/message-utils/generateMessageId'

const LOCALES = ['en', 'fr', 'es', 'pseudo']

/**
 * The harvested source strings, read from the generated module the same way
 * the toolchain test does — unescaping the template-literal escapes the
 * harvester wrote.
 */
function harvestedSources() {
  const source = readFileSync(resolve(process.cwd(), 'src/i18n/harvested.ts'), 'utf8')
  return [...source.matchAll(/^ {2}msg`([\s\S]*?)`,$/gm)].map((m) =>
    m[1].replace(/\\`/g, '`').replace(/\\\$\{/g, '${').replace(/\\\\/g, '\\')
  )
}

async function main() {
  const sources = harvestedSources()
  if (sources.length === 0) {
    console.error('[i18n:alias] harvested.ts yielded 0 strings — refusing to run against nothing.')
    process.exit(1)
  }

  for (const locale of LOCALES) {
    const path = resolve(process.cwd(), `src/locales/${locale}/messages.mjs`)
    if (!existsSync(path)) {
      console.warn(`[i18n:alias] no compiled catalog for ${locale}, skipped`)
      continue
    }

    // Cache-busting query: node caches ESM imports by URL, and i18n:compile
    // may run twice in one process during tests.
    const { messages } = await import(`${pathToFileURL(path).href}?t=${Date.now()}`)

    let aliased = 0
    for (const text of sources) {
      const id = generateMessageId(text)
      // The alias must never SHADOW a real entry: if the source text is itself
      // a valid key (it never is, today — ids are hashes), leave it alone.
      if (!(id in messages) || text in messages) continue
      const value = messages[id]
      // An empty msgstr compiles to an empty value; aliasing it would turn the
      // "fall back to the id" behaviour into "render an empty string". For the
      // en catalog the id IS the English source, so the miss already renders
      // correctly; for fr/es an empty entry means untranslated — same fallback.
      if (value === '' || value == null) continue
      messages[text] = value
      aliased++
    }

    // Same shape lingui itself emits (a JSON.parse of a string literal is both
    // smaller and faster to parse than an object literal at this size).
    writeFileSync(
      path,
      `/*eslint-disable*/export const messages=JSON.parse(${JSON.stringify(JSON.stringify(messages))})`
    )
    console.log(`[i18n:alias] ${locale}: ${aliased} source-text aliases over ${Object.keys(messages).length - aliased} entries`)
  }
}

main().catch((error) => {
  console.error('[i18n:alias] failed:', error)
  process.exit(1)
})
