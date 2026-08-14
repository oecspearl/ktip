import { describe, it, expect } from 'vitest'
import {
  LEGAL_DOCUMENTS,
  CONSENT_BUNDLES,
  PROMPTED_BUNDLES,
  getLegalDocument,
  bundleVersion,
  extractTokens,
  fillTokens,
  LEGAL_TOKENS,
  type LegalBlock,
  type LegalDocument,
} from './index'
import { shouldTranslate, MAX_TRANSLATABLE } from '../i18n/should-translate'

/** Every translatable string in a document, in render order. */
function stringsIn(doc: LegalDocument): string[] {
  const out: string[] = [doc.title, doc.summary]
  for (const section of doc.sections) {
    out.push(section.heading)
    if (section.railLabel) out.push(section.railLabel)
    if (section.summary) out.push(section.summary)
    for (const block of section.body) out.push(...stringsInBlock(block))
    for (const action of section.actions ?? []) out.push(action.label)
  }
  return out
}

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

describe('legal content', () => {
  it('has a unique key per document', () => {
    const keys = LEGAL_DOCUMENTS.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('resolves every key through getLegalDocument', () => {
    for (const doc of LEGAL_DOCUMENTS) {
      expect(getLegalDocument(doc.key)).toBe(doc)
    }
  })

  it('gives every document a positive integer version and an ISO effective date', () => {
    for (const doc of LEGAL_DOCUMENTS) {
      expect(Number.isInteger(doc.version), `${doc.key} version`).toBe(true)
      expect(doc.version, `${doc.key} version`).toBeGreaterThan(0)
      expect(doc.effectiveDate, `${doc.key} effectiveDate`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(doc.effectiveDate)), `${doc.key} effectiveDate`).toBe(false)
    }
  })

  it('gives every document at least one section, and every section a body', () => {
    for (const doc of LEGAL_DOCUMENTS) {
      expect(doc.sections.length, `${doc.key}`).toBeGreaterThan(0)
      for (const section of doc.sections) {
        expect(section.body.length, `${doc.key}#${section.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('uses URL-safe section ids, unique within a document', () => {
    for (const doc of LEGAL_DOCUMENTS) {
      const ids = doc.sections.map((s) => s.id)
      expect(new Set(ids).size, `${doc.key} duplicate section id`).toBe(ids.length)
      for (const id of ids) {
        // Deep links into legal documents get pasted into emails and pleadings.
        // A section id is a permanent address, so it may not carry anything a
        // URL would escape.
        expect(id, `${doc.key}#${id}`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      }
    }
  })

  it('points relatedKeys at documents that exist, and never at itself', () => {
    for (const doc of LEGAL_DOCUMENTS) {
      for (const key of doc.relatedKeys ?? []) {
        expect(key, `${doc.key} relatedKeys`).not.toBe(doc.key)
        expect(getLegalDocument(key), `${doc.key} -> ${key}`).toBeDefined()
      }
    }
  })

  it('links only to routes this codebase serves', () => {
    // A dead link in a legal document is not a broken link, it is an
    // unreachable obligation — "as set out in the policy you cannot open".
    for (const doc of LEGAL_DOCUMENTS) {
      for (const section of doc.sections) {
        for (const action of section.actions ?? []) {
          expect(action.href, `${doc.key}#${section.id}`).toMatch(/^(\/|mailto:|https:\/\/)/)
          const [path, hash] = action.href.split('#')
          if (!path.startsWith('/legal/')) continue
          const key = path.replace('/legal/', '')
          // /legal/copyright/report is a form, not a document.
          if (key === 'copyright/report') continue
          const target = getLegalDocument(key as never)
          expect(target, `${doc.key}#${section.id} -> ${path}`).toBeDefined()
          if (hash && target) {
            expect(
              target.sections.some((s) => s.id === hash),
              `${doc.key}#${section.id} -> ${action.href}`
            ).toBe(true)
          }
        }
      }
    }
  })
})

describe('legal tokens', () => {
  it('only uses tokens that are defined', () => {
    for (const doc of LEGAL_DOCUMENTS) {
      for (const text of stringsIn(doc)) {
        for (const token of extractTokens(text)) {
          expect(token in LEGAL_TOKENS, `${doc.key}: unknown token %${token}%`).toBe(true)
        }
      }
    }
  })

  it('leaves nothing unsubstituted after filling', () => {
    for (const doc of LEGAL_DOCUMENTS) {
      for (const text of stringsIn(doc)) {
        expect(extractTokens(fillTokens(text)), `${doc.key}`).toEqual([])
      }
    }
  })

  it('never uses braces, which ICU would read as a placeholder', () => {
    // A harvested string reaches i18n._() as an ICU message. `{entity}` there is
    // a placeholder with no value, which renders empty and silently removes the
    // subject of a clause. Percent delimiters have no ICU meaning.
    for (const doc of LEGAL_DOCUMENTS) {
      for (const text of stringsIn(doc)) {
        expect(text, `${doc.key}`).not.toMatch(/[{}]/)
      }
    }
  })
})

describe('legal i18n readiness', () => {
  it('has no prose the translator would silently drop', () => {
    // shouldTranslate() returning false is not an error anywhere else in the
    // codebase — the English source renders and nobody notices. In a legal
    // document that means a clause that is English forever in every locale, so
    // here it is a failure.
    //
    // Scoped to strings with whitespace. A bare single token in this content is
    // always a product or organisation name in the processors and AI tables —
    // "Supabase", "Vercel", "Sentry" — which shouldTranslate() correctly
    // declines, and which must not be translated anyway.
    for (const doc of LEGAL_DOCUMENTS) {
      for (const text of stringsIn(doc)) {
        if (!/\s/.test(text.trim())) continue
        expect(
          shouldTranslate(text),
          `${doc.key}: not translatable (${text.length} chars): ${text.slice(0, 80)}…`
        ).toBe(true)
      }
    }
  })

  it('keeps every string well under the translation ceiling', () => {
    for (const doc of LEGAL_DOCUMENTS) {
      for (const text of stringsIn(doc)) {
        expect(text.length, `${doc.key}`).toBeLessThan(MAX_TRANSLATABLE)
      }
    }
  })
})

describe('consent bundles', () => {
  it('places every document in exactly one bundle', () => {
    const counted = Object.values(CONSENT_BUNDLES).flat()
    expect(counted.length).toBe(LEGAL_DOCUMENTS.length)
    expect(new Set(counted).size).toBe(LEGAL_DOCUMENTS.length)
  })

  it('gives every prompted bundle at least one document', () => {
    for (const bundle of PROMPTED_BUNDLES) {
      expect(CONSENT_BUNDLES[bundle].length, bundle).toBeGreaterThan(0)
    }
  })

  it('keeps every document in a bundle on the same version', () => {
    // A bundle is accepted as one act and recorded against one version, and
    // `record_consent` is called with a single p_expected_version. Two versions
    // inside one bundle would make that call meaningless.
    for (const bundle of PROMPTED_BUNDLES) {
      const versions = new Set(
        CONSENT_BUNDLES[bundle].map((key) => getLegalDocument(key)!.version)
      )
      expect(versions.size, `${bundle} spans versions ${[...versions].join(', ')}`).toBe(1)
      expect(bundleVersion(bundle)).toBe([...versions][0])
    }
  })

  it('requires acceptance of both IP documents before publishing', () => {
    // The whole point of the publishing gate. If either drops out of the bundle
    // the gate still fires and silently stops covering the licence grant.
    expect(CONSENT_BUNDLES.publishing).toContain('content-licence')
    expect(CONSENT_BUNDLES.publishing).toContain('copyright')
  })

  it('requires the core four at sign-up', () => {
    expect(CONSENT_BUNDLES.account.sort()).toEqual(
      ['acceptable-use', 'privacy', 'safeguarding', 'terms'].sort()
    )
  })
})
