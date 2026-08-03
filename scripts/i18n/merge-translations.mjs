#!/usr/bin/env node
/**
 * Merge translation JSON into the .po catalogs.
 *
 *   node scripts/i18n/merge-translations.mjs <dir-of-json-files>
 *
 * Input files are `{ "<source string>": { "fr": "…", "es": "…" }, … }`. Several
 * translators work in parallel and each writes its own file; nothing but this
 * script touches a .po, because a .po is not a mergeable format and two writers
 * would silently clobber each other.
 *
 * REFUSES TO WRITE ANYTHING if any entry fails validation. A partial merge is
 * worse than none: the catalog would be half-translated in a way that looks
 * deliberate, and the failures would be invisible until a reader hit them.
 *
 * What it validates, and why each one is a real failure rather than a nit:
 *
 *   placeholders   `Hello {name}` translated as `Bonjour {nom}` renders the
 *                  literal text "{nom}" to a reader. Lingui does not warn.
 *   tag indices    `<0>Ctrl</0>` renumbered or dropped throws at render, because
 *                  the index is how the runtime finds the React element.
 *   plural #       `#` is the count in a plural form. Losing it leaves a French
 *                  reader looking at "projets" with no number.
 *   empty          A blank translation is indistinguishable from untranslated,
 *                  so it would be silently retried forever.
 *
 * Only fills entries whose msgstr is currently EMPTY — an existing translation,
 * hand-written or corrected by an admin, is never overwritten.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const LOCALES = ['fr', 'es']

const unquote = (line) => {
  const m = line.match(/^(?:msgid|msgstr)\s+"((?:[^"\\]|\\.)*)"\s*$/)
  return m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\') : null
}
const quote = (v) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')

/** Lingui tag markers, e.g. `<0>…</0>`. */
const TAG = /<\/?\d+>/g

/**
 * The ARGUMENT NAMES a message interpolates, sorted.
 *
 * Brace-depth aware, because ICU plurals nest and a flat `/\{[^}]*\}/` cannot
 * read them:
 *
 *     {0, plural, one {# project} other {# projects}}
 *
 * A naive match splits that into `{0, plural, one {# project}` and
 * `{# projects}`, so a perfectly correct French translation compares unequal
 * and is rejected. That is what happened to all 49 plurals on the first run —
 * the validator was wrong, not the translations.
 *
 * Only depth-0 braces name an argument. A `{…}` inside a plural is a branch
 * BODY: its text is supposed to differ between languages, and so is the NUMBER
 * of branches, because French and Spanish do not share English's plural
 * categories. Comparing those would forbid the very thing plurals exist for.
 */
function signature(text) {
  const names = []
  let depth = 0

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '}') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (ch !== '{') continue

    if (depth === 0) {
      // The name runs to the first ',' (a formatted argument) or '}' (a plain one).
      let j = i + 1
      while (j < text.length && text[j] !== ',' && text[j] !== '}') j++
      names.push(text.slice(i + 1, j).trim())
    }
    depth++
  }

  return [...names.sort(), ...(text.match(TAG) ?? []).sort()].join('|')
}

function problems(source, translation) {
  const out = []
  if (typeof translation !== 'string' || translation.trim() === '') {
    out.push('empty')
    return out
  }
  if (signature(source) !== signature(translation)) {
    out.push(`placeholders: ${signature(source) || '(none)'} -> ${signature(translation) || '(none)'}`)
  }
  // `#` is the count, but ONLY inside a plural or selectordinal. Elsewhere it is
  // just a number sign — `You are #{0} of {1}` — and dropping it is correct,
  // because French writes "5e" and Spanish "n.º 5" rather than "#5".
  //
  // Presence, not position: in English it opens the branch ("# projects"), and
  // other languages put it elsewhere.
  const isPlural = /\{[^}]*,\s*(?:plural|selectordinal)\s*,/.test(source)
  if (isPlural && source.includes('#') && !translation.includes('#')) {
    out.push('lost the plural count (#)')
  }
  return out
}

function main() {
  const dir = process.argv[2]
  if (!dir) {
    console.error('Usage: node scripts/i18n/merge-translations.mjs <dir-of-json-files>')
    process.exit(1)
  }

  const files = readdirSync(dir).filter((f) => /^out-.*\.json$/.test(f))
  if (!files.length) {
    console.error(`No out-*.json files in ${dir}`)
    process.exit(1)
  }

  // --- collect ---------------------------------------------------------------
  const table = new Map()
  const collisions = []

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    for (const [source, langs] of Object.entries(data)) {
      if (table.has(source)) {
        const existing = table.get(source)
        if (LOCALES.some((l) => existing[l] !== langs[l])) {
          collisions.push({ source, a: existing, b: langs, file })
        }
        continue
      }
      table.set(source, langs)
    }
  }

  // --- validate --------------------------------------------------------------
  const rejected = []
  for (const [source, langs] of table) {
    for (const locale of LOCALES) {
      for (const problem of problems(source, langs?.[locale])) {
        rejected.push(`${locale}  ${JSON.stringify(source).slice(0, 70)}  ${problem}`)
      }
    }
  }

  console.log(`\n[i18n:merge] ${files.length} files, ${table.size} distinct entries`)

  if (collisions.length) {
    console.log(`\n  ${collisions.length} entry(ies) translated differently in two batches — kept the first:`)
    for (const c of collisions.slice(0, 10)) console.log(`    ${JSON.stringify(c.source).slice(0, 70)}`)
  }

  if (rejected.length) {
    console.error(`\n  ${rejected.length} entry(ies) failed validation. NOTHING was written.\n`)
    for (const r of rejected.slice(0, 40)) console.error(`    ${r}`)
    if (rejected.length > 40) console.error(`    … and ${rejected.length - 40} more`)
    console.error(`
  A placeholder that changed name renders its own braces to a reader, and a
  renumbered tag throws. Fix the source JSON and run again.
`)
    process.exit(1)
  }

  // --- write -----------------------------------------------------------------
  for (const locale of LOCALES) {
    const path = resolve(process.cwd(), 'src/locales', locale, 'messages.po')
    const raw = readFileSync(path, 'utf8')
    const crlf = (raw.match(/\r\n/g) ?? []).length > raw.split('\n').length / 2
    const lines = raw.split(/\r?\n/)

    let msgid = null
    let filled = 0

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('msgid ')) {
        msgid = unquote(lines[i])
      } else if (lines[i].startsWith('msgstr ')) {
        // Empty only: never overwrite a translation someone already has.
        if (msgid && unquote(lines[i]) === '' && table.has(msgid)) {
          lines[i] = `msgstr "${quote(table.get(msgid)[locale])}"`
          filled++
        }
      }
    }

    writeFileSync(path, lines.join(crlf ? '\r\n' : '\n'))
    console.log(`  ${locale}: filled ${filled}`)
  }

  const unused = [...table.keys()].filter((k) => !readFileSync(resolve(process.cwd(), 'src/locales/fr/messages.po'), 'utf8').includes(quote(k)))
  if (unused.length) {
    console.log(`\n  ${unused.length} translated entry(ies) matched no catalog id — the source drifted:`)
    for (const u of unused.slice(0, 10)) console.log(`    ${JSON.stringify(u).slice(0, 70)}`)
  }
  console.log()
}

main()
