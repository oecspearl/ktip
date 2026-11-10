import { describe, it, expect } from 'vitest'
import {
  parsePo,
  serializePo,
  formatMsgstr,
  parseIcu,
  splitMessage,
  normaliseUnit,
  checkTranslation,
  repairApostrophes,
  responseSchema,
  parseDuration,
  // @ts-expect-error — a plain .mjs script module with no types; this file is
  // checked by tsconfig.node.json, which does not allowJs.
} from '../../../scripts/i18n/catalog-core.mjs'

/**
 * The rules scripts/i18n/translate-catalogs.mjs uses to decide what it may
 * write into the French and Spanish catalogs. A wrong answer here is silent in
 * the app — a placeholder printed as "{nom}", a link that vanishes, a plural
 * that always says "1 jours" — so each rule is pinned.
 */

describe('plural messages', () => {
  const source = '{count, plural, one {# day left} other {# days left}}'

  it('are split into one unit per case, keeping the skeleton out of the text', () => {
    const split = splitMessage(source)
    expect(split.units).toEqual([
      { key: 'one', text: '# day left' },
      { key: 'other', text: '# days left' },
    ])
    expect(split.source).toBe(source)
  })

  it('reassemble with the source variable, keyword and exactly its case keys', () => {
    const split = splitMessage(source)
    const message = split.assemble(
      new Map([
        ['one', '# jour restant'],
        ['other', '# jours restants'],
      ])
    )
    expect(message).toBe('{count, plural, one {# jour restant} other {# jours restants}}')
    expect(checkTranslation(split.source, message)).toBeNull()
  })

  it('fold surrounding text into every case so each is a whole sentence', () => {
    const split = splitMessage('Showing {n, plural, one {# result} other {# results}} for {query}')
    expect(split.units.map((u: { text: string }) => u.text)).toEqual([
      'Showing # result for {query}',
      'Showing # results for {query}',
    ])
    expect(split.source).toBe(
      '{n, plural, one {Showing # result for {query}} other {Showing # results for {query}}}'
    )
  })

  it('keep exact-number cases and offsets', () => {
    const split = splitMessage('{n, plural, offset:1 =0 {Nobody} one {You} other {You and # others}}')
    expect(split.units.map((u: { key: string }) => u.key)).toEqual(['=0', 'one', 'other'])
    const back = split.assemble(new Map(split.units.map((u: { key: string; text: string }) => [u.key, u.text])))
    expect(back).toBe('{n, plural, offset:1 =0 {Nobody} one {You} other {You and # others}}')
  })

  it('are refused when a case is added, dropped or renamed', () => {
    expect(checkTranslation(source, '{count, plural, one {# jour} many {# jours} other {# jours}}')).toMatch(/plural/)
    expect(checkTranslation(source, '{count, plural, other {# jours}}')).toMatch(/plural/)
    expect(checkTranslation(source, '{nombre, plural, one {# jour} other {# jours}}')).toMatch(/plural/)
    expect(checkTranslation(source, '{count, pluriel, one {# jour} other {# jours}}')).not.toBeNull()
  })

  it('are refused when "#" goes missing from a case', () => {
    expect(checkTranslation(source, '{count, plural, one {un jour} other {# jours}}')).toMatch(/plural/)
  })

  it('that this does not take apart are reported, not guessed at', () => {
    expect(splitMessage('{a, plural, one {x} other {y}} and {b, plural, one {x} other {y}}').error).toBeTruthy()
    expect(splitMessage('{a, plural, one {{b, select, x {1} other {2}}} other {y}}').error).toBeTruthy()
    expect(splitMessage('#{n, plural, one {x} other {y}}').error).toBeTruthy()
  })
})

describe('placeholders and tags', () => {
  it('pass when every placeholder and tag survives, in any order', () => {
    expect(checkTranslation('Hello {name}, you have {0} messages', 'Vous avez {0} messages, {name}')).toBeNull()
    expect(checkTranslation('Read the <0>guide</0> or <1>ask</1>', 'Posez une <1>question</1> ou lisez le <0>guide</0>')).toBeNull()
    expect(checkTranslation('Line one<0/>Line two', 'Ligne un<0/>Ligne deux')).toBeNull()
  })

  it('fail when a placeholder is translated, dropped or invented', () => {
    expect(checkTranslation('Hello {name}', 'Bonjour {nom}')).toMatch(/placeholders/)
    expect(checkTranslation('Hello {name}', 'Bonjour')).toMatch(/placeholders/)
    expect(checkTranslation('Hello', 'Bonjour {name}')).toMatch(/placeholders/)
  })

  it('fail when a tag is lost, renumbered, made self-closing or broken', () => {
    expect(checkTranslation('Read the <0>guide</0>', 'Lisez le guide')).toMatch(/tags/)
    expect(checkTranslation('Read the <0>guide</0>', 'Lisez le <1>guide</1>')).toMatch(/tags/)
    expect(checkTranslation('Read the <0>guide</0>', 'Lisez le <0/>guide')).toMatch(/tags/)
    expect(checkTranslation('Read the <0>guide</0>', 'Lisez le < 0 >guide</0>')).toMatch(/tags/)
  })

  it('fail when tags no longer nest', () => {
    expect(checkTranslation('<0>a <1>b</1></0>', '<0>a <1>b</0></1>')).toBe('tags do not nest')
  })

  it('fail when the translation does not parse as ICU', () => {
    expect(checkTranslation('Hello {name}', 'Bonjour {name')).toMatch(/does not parse/)
  })
})

describe('apostrophes', () => {
  it('before a brace are read by ICU as a quote — exactly as lingui compile reads them', () => {
    // A quote opened by "'{" runs to the next apostrophe, so in
    // "l'{name} de l'équipe" the placeholder becomes literal text.
    expect(parseIcu("l'{name} de l'équipe")).toEqual([{ type: 'content', value: 'l{name} de léquipe' }])
    expect(checkTranslation('the {name} of the team', "l'{name} de l'équipe")).toMatch(/placeholders/)
    // With no later apostrophe there is no quote, exactly as in @messageformat/parser.
    expect(checkTranslation('the {name}', "l'{name}")).toBeNull()
  })

  it('are doubled where ICU would read them as quotes, and left alone elsewhere', () => {
    expect(repairApostrophes("l'{name} d'#")).toBe("l''{name} d''#")
    expect(repairApostrophes("l'événement d''{x}")).toBe("l'événement d''{x}")
    expect(checkTranslation('the {name} of the team', repairApostrophes("l'{name} de l'équipe"))).toBeNull()
  })

  it('in French come back straight, with the house spacing, whatever the model sends', () => {
    expect(normaliseUnit('Ready?', 'Prêt ?', 'fr')).toBe('Prêt ?')
    expect(normaliseUnit('It is here', 'C’est ici', 'fr')).toBe("C'est ici")
    expect(normaliseUnit('Re-run', 'Re‑lancer', 'es')).toBe('Re-lancer')
    expect(normaliseUnit('{n} for the {name}', 'pour l’{name}', 'fr')).toBe("pour l''{name}")
  })

  it('keep the source’s leading and trailing whitespace', () => {
    expect(normaliseUnit('Submissions close ', ' Clôture des soumissions', 'fr')).toBe('Clôture des soumissions ')
  })
})

describe('other refusals', () => {
  it('reject a translation that drops paragraphs', () => {
    expect(checkTranslation('First.\n\nSecond.', 'Premier.')).toBe('line breaks differ')
    const long = 'A long help text that goes on for a while. '.repeat(4)
    expect(checkTranslation(long, 'Court.')).toBe('looks truncated')
  })

  it('reject a bare language code in place of a sentence', () => {
    expect(checkTranslation('Save changes', 'fr')).toMatch(/language code/)
  })

  it('reject an empty answer', () => {
    expect(checkTranslation('Save', '  ')).toBe('empty')
  })
})

describe('the .po round trip', () => {
  const po = [
    'msgid ""',
    'msgstr ""',
    '"Language: fr\\n"',
    '',
    '#. placeholder {0}: user.name',
    '#: src/components/A.tsx',
    'msgid "Hi {0}"',
    'msgstr ""',
    '',
    '#: src/components/B.tsx',
    'msgid "Kept"',
    'msgstr "Conservé"',
    '',
    'msgid "Two\\n"',
    '"lines"',
    'msgstr ""',
    '',
  ].join('\r\n')

  it('reads entries, comments and references, on CRLF input', () => {
    const { entries } = parsePo(po)
    expect(entries.map((e: { msgid: string }) => e.msgid)).toEqual(['', 'Hi {0}', 'Kept', 'Two\nlines'])
    expect(entries[1].comments).toEqual(['placeholder {0}: user.name'])
    expect(entries[1].references).toEqual(['src/components/A.tsx'])
    expect(entries[2].msgstr).toBe('Conservé')
  })

  it('writes only msgstr lines, as LF, in the layout lingui extract uses', () => {
    const parsed = parsePo(po)
    const out = serializePo(parsed, new Map([[1, 'Salut {0}'], [3, 'Deux\nlignes']]))
    expect(out).toBe(
      po
        .replace(/\r\n/g, '\n')
        .replace('msgid "Hi {0}"\nmsgstr ""', 'msgid "Hi {0}"\nmsgstr "Salut {0}"')
        .replace('"lines"\nmsgstr ""', '"lines"\nmsgstr "Deux\\n"\n"lignes"')
    )
  })

  it('formats multi-line strings like pofile-ts, quotes and backslashes escaped', () => {
    expect(formatMsgstr('a "b" \\ c')).toEqual(['msgstr "a \\"b\\" \\\\ c"'])
    expect(formatMsgstr('a\n')).toEqual(['msgstr "a\\n"', '""'])
    expect(formatMsgstr('\nb')).toEqual(['msgstr ""', '"\\n"', '"b"'])
  })
})

describe('the request plumbing', () => {
  it('asks for exactly the batch ids, all required, nothing else', () => {
    expect(responseSchema(['k0', 'k1'])).toEqual({
      type: 'object',
      properties: { k0: { type: 'string' }, k1: { type: 'string' } },
      required: ['k0', 'k1'],
      additionalProperties: false,
    })
  })

  it('reads Groq reset durations', () => {
    expect(parseDuration('2m52.8s')).toBeCloseTo(172.8)
    expect(parseDuration('5.13s')).toBeCloseTo(5.13)
    expect(parseDuration('120ms')).toBeCloseTo(0.12)
    expect(parseDuration('1h2m')).toBe(3720)
    expect(parseDuration('30')).toBe(30)
    expect(parseDuration(null)).toBeNull()
  })
})
