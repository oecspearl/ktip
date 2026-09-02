/**
 * Exports the fourteen published legal documents to editable Markdown and Word.
 *
 * The documents live as typed data in `src/lib/legal/*.ts` because that is the
 * only shape `lingui extract`, the SpyRail and site search can all read. That
 * shape is hostile to a lawyer with a red pen, so this script flattens it to one
 * .md and one .docx per document under docs/legal-review/.
 *
 * Round trip: `scripts/legal/import-legal.mjs` reads the edited files back and
 * rewrites the changed strings in place in the .ts sources. It matches blocks by
 * the `@`-marker lines this script emits, so the markers must survive editing —
 * they are code spans, which Word renders in a monospace style and pandoc hands
 * back unchanged.
 *
 *   node scripts/legal/export-legal.mjs            # markdown + docx
 *   node scripts/legal/export-legal.mjs --md-only  # skip pandoc
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const OUT = join(ROOT, 'docs', 'legal-review')
const MD_DIR = join(OUT, 'markdown')
const DOCX_DIR = join(OUT, 'word')
const SNAPSHOT = join(OUT, '.baseline.json')

const mdOnly = process.argv.includes('--md-only')

/** Bundles the legal module through esbuild so this script can import the .ts data. */
async function loadLegal() {
  const tmp = join(ROOT, 'node_modules', '.cache', 'legal-export')
  mkdirSync(tmp, { recursive: true })
  const bundle = join(tmp, `legal.${Date.now()}.mjs`)
  const esbuild = await import('esbuild')
  await esbuild.build({
    entryPoints: [join(ROOT, 'src', 'lib', 'legal', 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundle,
    logLevel: 'error',
  })
  return import(pathToFileURL(bundle).href)
}

/** Escapes a cell so a pipe inside prose cannot break the table's column count. */
const cell = (s) => String(s).replace(/\|/g, '\\|')

function renderBlock(block, lines) {
  switch (block.kind) {
    case 'para':
      lines.push(block.text, '')
      break
    case 'list': {
      lines.push(block.ordered ? '`@list ordered`' : '`@list`', '')
      block.items.forEach((item, i) => lines.push(`${block.ordered ? `${i + 1}.` : '-'} ${item}`))
      lines.push('')
      break
    }
    case 'note':
      lines.push(`\`@note ${block.tone ?? 'info'}\``, '', `> ${block.text}`, '')
      break
    case 'defs':
      lines.push('`@defs`', '')
      for (const d of block.items) lines.push(`- **${d.term}** — ${d.def}`)
      lines.push('')
      break
    case 'table': {
      lines.push('`@table`', '')
      lines.push(`| ${block.columns.map(cell).join(' | ')} |`)
      lines.push(`| ${block.columns.map(() => '---').join(' | ')} |`)
      for (const row of block.rows) lines.push(`| ${row.cells.map(cell).join(' | ')} |`)
      lines.push('')
      break
    }
    default:
      throw new Error(`Unknown block kind: ${JSON.stringify(block)}`)
  }
}

function renderDocument(doc) {
  const lines = []
  lines.push(`# ${doc.title}`, '')
  lines.push(
    `\`@doc key=${doc.key} version=${doc.version} bundle=${doc.bundle} effective=${doc.effectiveDate}\``,
    ''
  )
  lines.push('`@summary`', '', doc.summary, '')
  if (doc.relatedKeys?.length) lines.push(`\`@related\``, '', doc.relatedKeys.join(', '), '')
  lines.push('---', '')

  for (const section of doc.sections) {
    lines.push(`## ${section.heading}`, '')
    lines.push(
      `\`@sec id=${section.id}${section.railLabel ? ` rail=${section.railLabel}` : ''}\``,
      ''
    )
    if (section.summary) lines.push('`@summary`', '', section.summary, '')
    for (const block of section.body) renderBlock(block, lines)
    if (section.actions?.length) {
      lines.push('`@actions`', '')
      for (const a of section.actions) lines.push(`- ${a.label} — ${a.href}`)
      lines.push('')
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function renderTokenLegend(tokens) {
  const lines = [
    '# Placeholder tokens',
    '',
    'Every `%token%` in the documents is substituted at render time from',
    '`src/lib/legal/parties.ts`. Leave them written exactly as they appear —',
    'a token that is edited or deleted silently removes the subject of a clause.',
    '',
    '| Token | Renders as |',
    '| --- | --- |',
  ]
  for (const [k, v] of Object.entries(tokens)) lines.push(`| \`%${k}%\` | ${cell(v)} |`)
  return lines.join('\n') + '\n'
}

function renderReadme(docs) {
  const lines = [
    '# Legal document review folder',
    '',
    'Working copies of the fourteen published legal documents. The live text lives',
    'in `src/lib/legal/*.ts`; these are exports for editing.',
    '',
    '- `word/` — edit these. One .docx per document.',
    '- `markdown/` — the same content as Markdown, and what the importer reads.',
    '- `TOKENS.md` — the `%token%` placeholders and what they render as.',
    '- `.baseline.json` — the exported state, used to detect what you changed. Do not edit.',
    '',
    '## Round trip',
    '',
    '```',
    'node scripts/legal/export-legal.mjs   # source .ts  ->  markdown/ + word/',
    'node scripts/legal/import-legal.mjs   # your edits  ->  source .ts',
    '```',
    '',
    'The import converts each edited .docx back to Markdown with pandoc, compares it',
    'against `.baseline.json`, and rewrites only the strings that actually changed.',
    '',
    '## Editing rules',
    '',
    '1. Do not delete the monospace `@` marker lines (`@doc`, `@sec`, `@list`,',
    '   `@note`, `@defs`, `@table`, `@summary`, `@actions`). They tell the importer',
    '   what each block is. Prose between them is yours to rewrite freely.',
    '2. Leave `%token%` placeholders intact — see `TOKENS.md`.',
    '3. Heading levels are structural: `#` is the document title, `##` a section.',
    '4. Adding or removing whole sections is fine, but flag it — the importer',
    '   reports structural changes rather than guessing at them.',
    '5. A change to legally operative text should also bump the document `version`',
    '   in the `@doc` line, which forces re-consent. Say so and it will be handled',
    '   together with migration 115 and the effective date.',
    '',
    '## Documents',
    '',
    '| # | Title | Key | Bundle | Version | Sections |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  docs.forEach((d, i) =>
    lines.push(
      `| ${i + 1} | ${cell(d.title)} | \`${d.key}\` | ${d.bundle} | ${d.version} | ${d.sections.length} |`
    )
  )
  return lines.join('\n') + '\n'
}

const legal = await loadLegal()
const docs = legal.LEGAL_DOCUMENTS

rmSync(MD_DIR, { recursive: true, force: true })
mkdirSync(MD_DIR, { recursive: true })
if (!mdOnly) mkdirSync(DOCX_DIR, { recursive: true })

const pad = (n) => String(n).padStart(2, '0')
const baseline = {}

docs.forEach((doc, i) => {
  const base = `${pad(i + 1)}-${doc.key}`
  const md = renderDocument(doc)
  writeFileSync(join(MD_DIR, `${base}.md`), md, 'utf8')
  baseline[doc.key] = { file: `src/lib/legal/${doc.key}.ts`, order: i, doc }
  if (!mdOnly) {
    execFileSync('pandoc', [
      join(MD_DIR, `${base}.md`),
      '-f',
      'markdown',
      '-t',
      'docx',
      '-o',
      join(DOCX_DIR, `${base}.docx`),
    ])
  }
  process.stdout.write(`  ${base}  ${doc.sections.length} sections\n`)
})

writeFileSync(join(MD_DIR, 'TOKENS.md'), renderTokenLegend(legal.LEGAL_TOKENS), 'utf8')
writeFileSync(join(OUT, 'README.md'), renderReadme(docs), 'utf8')
writeFileSync(SNAPSHOT, JSON.stringify(baseline, null, 2), 'utf8')
if (!mdOnly) {
  execFileSync('pandoc', [
    join(MD_DIR, 'TOKENS.md'),
    '-f',
    'markdown',
    '-t',
    'docx',
    '-o',
    join(DOCX_DIR, '00-TOKENS.docx'),
  ])
}

// Every source file the importer will write back to must exist under the name
// derived from the document key, or the round trip has nowhere to land.
const missing = docs.filter((d) => !existsSync(join(ROOT, 'src', 'lib', 'legal', `${d.key}.ts`)))
if (missing.length) {
  console.error(`\nNo source file for: ${missing.map((d) => d.key).join(', ')}`)
  process.exit(1)
}

const words = docs.reduce(
  (n, d) => n + JSON.stringify(d).split(/\s+/).length,
  0
)
console.log(
  `\n${docs.length} documents -> ${MD_DIR.replace(ROOT + '\\', '')}` +
    (mdOnly ? '' : ` and ${DOCX_DIR.replace(ROOT + '\\', '')}`) +
    `\n~${words.toLocaleString()} words. Baseline written to docs/legal-review/.baseline.json`
)
