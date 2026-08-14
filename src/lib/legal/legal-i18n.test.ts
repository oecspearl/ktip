import { describe, it, expect } from 'vitest'
import { LEGAL_DOCUMENTS, extractTokens, type LegalBlock, type LegalDocument } from './index'

/**
 * Catalogs read through Vite's `?raw`, not node:fs — the same trick
 * src/design/tokens.test.ts uses and for the same reason: this project's
 * tsconfig.app.json pulls in vite/client types only, so `node:fs` does not
 * typecheck here even though it would run fine under vitest.
 */
const catalogs = import.meta.glob('/src/locales/*/messages.po', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Guards the one way a translation can silently break a legal document.
 *
 * `%entity%` and friends are substituted after the catalog lookup, so a French
 * translation that drops, renames or mistypes one produces a clause with no
 * subject — "You grant  a non-exclusive licence" — or, worse, a contact address
 * that goes nowhere. Neither errors, neither is visible in review unless
 * somebody reads the French, and both are exactly the kind of thing an
 * automatic translation pass gets wrong.
 *
 * Reads the .po files directly rather than the compiled catalogs: the compiled
 * form is generated, gitignored in some setups, and a mismatch there is a build
 * problem rather than a translation problem.
 */

const LOCALES = ['fr', 'es'] as const

function stringsInBlock(block: LegalBlock): string[] {
  switch (block.kind) {
    case 'para':
    case 'note':
      return [block.text]
    case 'list':
      return block.items
    case 'defs':
      return block.items.flatMap((i) => [i.term, i.def])
    case 'table':
      return [...block.columns, ...block.rows.flatMap((r) => r.cells)]
  }
}

function tokenBearingStrings(doc: LegalDocument): string[] {
  const out: string[] = [doc.title, doc.summary]
  for (const section of doc.sections) {
    out.push(section.heading)
    if (section.railLabel) out.push(section.railLabel)
    if (section.summary) out.push(section.summary)
    for (const block of section.body) out.push(...stringsInBlock(block))
    for (const action of section.actions ?? []) out.push(action.label)
  }
  return out.filter((text) => extractTokens(text).length > 0)
}

/**
 * Minimal .po reader: msgid → msgstr, both possibly split across continuation
 * lines. Deliberately not a dependency — the format in play here is the narrow
 * subset lingui writes, and a parser for it is fifteen lines.
 */
function readCatalog(locale: string): Map<string, string> {
  const source = catalogs[`/src/locales/${locale}/messages.po`]
  const catalog = new Map<string, string>()
  if (!source) return catalog

  let key: string | null = null
  let value: string | null = null
  let mode: 'id' | 'str' | null = null

  const unquote = (line: string): string => {
    const match = line.match(/"((?:[^"\\]|\\.)*)"/)
    return match ? match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\') : ''
  }

  const flush = () => {
    if (key !== null && value !== null) catalog.set(key, value)
    key = null
    value = null
    mode = null
  }

  for (const line of source.split('\n')) {
    if (line.startsWith('msgid ')) {
      flush()
      key = unquote(line)
      mode = 'id'
    } else if (line.startsWith('msgstr ')) {
      value = unquote(line)
      mode = 'str'
    } else if (line.startsWith('"')) {
      if (mode === 'id' && key !== null) key += unquote(line)
      else if (mode === 'str' && value !== null) value += unquote(line)
    } else if (line.trim() === '') {
      flush()
    }
  }
  flush()

  return catalog
}

/** Token counts, so a translation cannot drop one of two occurrences either. */
function tokenMultiset(text: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const token of extractTokens(text)) counts[token] = (counts[token] ?? 0) + 1
  return counts
}

describe('legal translations preserve their placeholders', () => {
  for (const locale of LOCALES) {
    it(`${locale} keeps every %token% from the English source`, () => {
      const catalog = readCatalog(locale)
      // An empty catalog means the locale has not been translated yet, which is
      // a valid state — the English source renders. Nothing to check.
      if (catalog.size === 0) return

      const failures: string[] = []

      for (const doc of LEGAL_DOCUMENTS) {
        for (const source of tokenBearingStrings(doc)) {
          const translated = catalog.get(source)
          // Untranslated is fine: lingui falls back to the source string, which
          // still carries its tokens.
          if (!translated) continue

          const expected = tokenMultiset(source)
          const actual = tokenMultiset(translated)

          for (const [token, count] of Object.entries(expected)) {
            if (actual[token] !== count) {
              failures.push(
                `${doc.key}: expected ${count}×%${token}%, found ${actual[token] ?? 0} — "${translated.slice(0, 60)}…"`
              )
            }
          }
          for (const token of Object.keys(actual)) {
            if (!(token in expected)) {
              failures.push(`${doc.key}: translation invented %${token}%`)
            }
          }
        }
      }

      expect(failures, failures.join('\n')).toEqual([])
    })
  }
})
