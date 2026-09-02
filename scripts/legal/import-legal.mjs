/**
 * Folds edits made in docs/legal-review/ back into `src/lib/legal/*.ts`.
 *
 * Surgical, not regenerative: it parses the edited document, diffs it against
 * the baseline written by `export-legal.mjs`, and rewrites only the string
 * literals that actually changed. The .ts sources carry a lot of rationale in
 * comments — regenerating them would throw that away, and would also reformat
 * fourteen files on a one-word edit, which makes the review diff useless.
 *
 * Structural edits (a section added, a block removed, a list that gained an
 * item) are reported rather than applied. Those need a decision about section
 * ids, harvested-string churn and consent versioning that a text diff cannot make.
 *
 *   node scripts/legal/import-legal.mjs           # dry run: report only
 *   node scripts/legal/import-legal.mjs --apply   # write the .ts files
 *   node scripts/legal/import-legal.mjs --from=md # ignore Word, read markdown/
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const OUT = join(ROOT, 'docs', 'legal-review')
const MD_DIR = join(OUT, 'markdown')
const DOCX_DIR = join(OUT, 'word')
const SNAPSHOT = join(OUT, '.baseline.json')
const TMP = join(ROOT, 'node_modules', '.cache', 'legal-import')

const apply = process.argv.includes('--apply')
const forceMd = process.argv.includes('--from=md')
const forceDocx = process.argv.includes('--from=docx')

/**
 * Word and pandoc both rewrite punctuation on the way through — straight quotes
 * become curly, an em dash becomes `---`, an ellipsis becomes `...`. None of
 * that is an edit, so both sides of every comparison pass through here and the
 * source form is what gets written back.
 */
function normalize(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/(^|[^-])---(?!-)/g, '$1—')
    .replace(/(^|[^-])--(?!-)/g, '$1–')
    .replace(/\.\.\./g, '…')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** Undoes the backslash escaping pandoc applies to markdown punctuation. */
const unescapeMd = (s) => s.replace(/\\([\\`*_{}[\]()#+\-.!<>~|"'$@%^&:;,/?=])/g, '$1')

/** Strips the inline markup pandoc may reintroduce around unchanged prose. */
function stripInline(s) {
  let out = unescapeMd(s)
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> label
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1')
  out = out.replace(/(^|\W)\*([^*]+)\*(?=\W|$)/g, '$1$2')
  out = out.replace(/`([^`]+)`/g, '$1')
  return out
}

// ---------------------------------------------------------------- md -> blocks

const MARKER = /^`@(\w+)([^`]*)`$/

/** Groups the markdown into headings, markers, paragraphs, lists, quotes and tables. */
function tokenize(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const tokens = []
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) {
      i++
      continue
    }
    // Pandoc's docx reader emits fenced divs and header attributes; drop both.
    if (/^:::/.test(line)) {
      i++
      continue
    }
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line)) {
      tokens.push({ t: 'hr' })
      i++
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*(\{[^}]*\})?$/)
    if (heading) {
      tokens.push({ t: 'heading', level: heading[1].length, text: stripInline(heading[2]) })
      i++
      continue
    }
    const marker = line.match(MARKER)
    if (marker) {
      tokens.push({ t: 'marker', name: marker[1], args: marker[2].trim() })
      i++
      continue
    }
    if (/^>/.test(line)) {
      const parts = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        parts.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      tokens.push({ t: 'quote', text: stripInline(parts.join(' ')) })
      continue
    }
    if (/^\|/.test(line) || /^\+[-=+]+\+$/.test(line)) {
      const rows = []
      while (i < lines.length && /^\s*(\||\+[-=+ ]*\+)/.test(lines[i])) {
        const r = lines[i].trim()
        i++
        if (/^\+/.test(r)) continue
        const cells = r
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split(/(?<!\\)\|/)
          .map((c) => stripInline(c.trim().replace(/\\\|/g, '|')))
        if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) continue
        rows.push(cells)
      }
      tokens.push({ t: 'table', rows })
      continue
    }
    const bullet = line.match(/^([-*+]|\d+[.)])\s+/)
    if (bullet) {
      const items = []
      let ordered = /\d/.test(bullet[1])
      while (i < lines.length) {
        const m = lines[i].trim().match(/^([-*+]|\d+[.)])\s+(.*)$/)
        if (m) {
          items.push(m[2])
          i++
          // Continuation lines of the same item, indented or plain, until a blank.
          while (i < lines.length && lines[i].trim() && !lines[i].trim().match(/^([-*+]|\d+[.)])\s+/) && !lines[i].trim().match(MARKER) && !/^#/.test(lines[i].trim())) {
            items[items.length - 1] += ' ' + lines[i].trim()
            i++
          }
          continue
        }
        if (!lines[i].trim()) {
          // A blank line ends the list unless another bullet follows immediately.
          const next = lines[i + 1]?.trim() ?? ''
          if (next.match(/^([-*+]|\d+[.)])\s+/)) {
            i++
            continue
          }
        }
        break
      }
      tokens.push({ t: 'list', ordered, items: items.map(stripInline) })
      continue
    }
    // Paragraph: run of non-blank lines that start nothing else.
    const parts = []
    while (i < lines.length) {
      const l = lines[i].trim()
      if (!l || l.match(MARKER) || /^#/.test(l) || /^>/.test(l) || /^\|/.test(l) || /^:::/.test(l)) break
      if (/^([-*+]|\d+[.)])\s+/.test(l)) break
      if (/^(-{3,}|_{3,}|\*{3,})$/.test(l)) break
      parts.push(l)
      i++
    }
    tokens.push({ t: 'para', text: stripInline(parts.join(' ')) })
  }
  return tokens
}

/** Rebuilds a LegalDocument-shaped object from the tokens. */
function parseDocument(md, fileLabel) {
  const tokens = tokenize(md)
  const doc = { key: null, version: null, effectiveDate: null, bundle: null, title: null, summary: '', relatedKeys: [], sections: [] }
  const problems = []
  let section = null
  let pending = null

  const attrs = (args) =>
    Object.fromEntries(
      Array.from(args.matchAll(/(\w+)=([^=]*?)(?=\s+\w+=|$)/g), (m) => [m[1], m[2].trim()])
    )

  const push = (block) => {
    if (section) section.body.push(block)
    else problems.push(`${fileLabel}: block before the first section heading`)
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.t === 'hr') continue
    if (tok.t === 'heading' && tok.level === 1) {
      doc.title = tok.text
      pending = null
      continue
    }
    if (tok.t === 'heading') {
      section = { id: null, heading: tok.text, railLabel: undefined, summary: undefined, body: [], actions: [] }
      doc.sections.push(section)
      pending = null
      continue
    }
    if (tok.t === 'marker') {
      if (tok.name === 'doc') {
        const a = attrs(tok.args)
        doc.key = a.key
        doc.version = Number(a.version)
        doc.bundle = a.bundle
        doc.effectiveDate = a.effective
      } else if (tok.name === 'sec') {
        const a = attrs(tok.args)
        if (!section) {
          problems.push(`${fileLabel}: @sec marker with no heading above it`)
          continue
        }
        section.id = a.id
        section.railLabel = a.rail
      } else {
        pending = tok
      }
      continue
    }

    const marker = pending
    pending = null

    if (marker?.name === 'summary') {
      const text = tok.t === 'para' ? tok.text : ''
      if (section) section.summary = text
      else doc.summary = text
      continue
    }
    if (marker?.name === 'related') {
      doc.relatedKeys = (tok.text ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      continue
    }
    if (marker?.name === 'actions') {
      if (tok.t !== 'list') {
        problems.push(`${fileLabel}: @actions is not followed by a list`)
        continue
      }
      section.actions = tok.items.map((item) => {
        const [label, ...rest] = item.split(/\s+[—–-]\s+/)
        return { label: label.trim(), href: rest.join(' — ').trim() }
      })
      continue
    }
    if (marker?.name === 'defs') {
      if (tok.t !== 'list') {
        problems.push(`${fileLabel}: @defs is not followed by a list`)
        continue
      }
      push({
        kind: 'defs',
        items: tok.items.map((item) => {
          const [term, ...rest] = item.split(/\s+[—–]\s+/)
          return { term: term.trim(), def: rest.join(' — ').trim() }
        }),
      })
      continue
    }
    if (marker?.name === 'note') {
      const tone = /warn/i.test(marker.args) ? 'warn' : 'info'
      const text = tok.t === 'quote' || tok.t === 'para' ? tok.text : ''
      push({ kind: 'note', tone, text })
      continue
    }
    if (marker?.name === 'list') {
      if (tok.t !== 'list') {
        problems.push(`${fileLabel}: @list is not followed by a list`)
        continue
      }
      const ordered = /ordered/.test(marker.args) || tok.ordered
      push(ordered ? { kind: 'list', ordered: true, items: tok.items } : { kind: 'list', items: tok.items })
      continue
    }
    if (marker?.name === 'table') {
      if (tok.t !== 'table' || !tok.rows.length) {
        problems.push(`${fileLabel}: @table is not followed by a table`)
        continue
      }
      const [columns, ...rows] = tok.rows
      push({ kind: 'table', columns, rows: rows.map((cells) => ({ cells })) })
      continue
    }

    // No marker: prose, or a stray block the writer left unlabelled.
    if (tok.t === 'para') push({ kind: 'para', text: tok.text })
    else if (tok.t === 'quote') push({ kind: 'note', tone: 'info', text: tok.text })
    else if (tok.t === 'list') {
      problems.push(`${fileLabel}: a list with no \`@list\` marker above it — "${tok.items[0]?.slice(0, 50)}…"`)
    } else if (tok.t === 'table') {
      problems.push(`${fileLabel}: a table with no \`@table\` marker above it`)
    }
  }

  for (const s of doc.sections) if (!s.actions.length) delete s.actions
  return { doc, problems }
}

// ------------------------------------------------------------------ diffing

/** Every editable string in a document, addressed by a stable path. */
function fields(doc) {
  const out = []
  const add = (path, value) => out.push({ path, value })
  add('title', doc.title)
  add('summary', doc.summary)
  doc.sections.forEach((s, si) => {
    add(`§${si}.heading`, s.heading)
    if (s.railLabel != null) add(`§${si}.railLabel`, s.railLabel)
    if (s.summary != null) add(`§${si}.summary`, s.summary)
    s.body.forEach((b, bi) => {
      const at = `§${si}.body[${bi}]`
      if (b.kind === 'para' || b.kind === 'note') add(`${at}.text`, b.text)
      else if (b.kind === 'list') b.items.forEach((it, k) => add(`${at}.items[${k}]`, it))
      else if (b.kind === 'defs')
        b.items.forEach((d, k) => {
          add(`${at}.items[${k}].term`, d.term)
          add(`${at}.items[${k}].def`, d.def)
        })
      else if (b.kind === 'table') {
        b.columns.forEach((c, k) => add(`${at}.columns[${k}]`, c))
        b.rows.forEach((r, ri) => r.cells.forEach((c, k) => add(`${at}.rows[${ri}].cells[${k}]`, c)))
      }
    })
    ;(s.actions ?? []).forEach((a, ai) => {
      add(`§${si}.actions[${ai}].label`, a.label)
      add(`§${si}.actions[${ai}].href`, a.href)
    })
  })
  return out
}

/** A one-line shape signature, so a structural edit is caught before any text is written. */
function shape(doc) {
  return doc.sections
    .map((s) => `${s.id ?? '?'}:${s.body.map((b) => (b.kind === 'list' || b.kind === 'defs' ? `${b.kind}${b.items.length}` : b.kind === 'table' ? `table${b.columns.length}x${b.rows.length}` : b.kind)).join(',')}`)
    .join(' | ')
}

// --------------------------------------------------------------- writing back

const escapeSingle = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/**
 * Replaces one string literal in the source. Refuses on an ambiguous match
 * rather than picking one, because the wrong pick silently edits a different
 * clause and nothing downstream would catch it.
 */
function replaceLiteral(source, oldText, newText, occurrence) {
  const needle = `'${escapeSingle(oldText)}'`
  const hits = []
  let at = source.indexOf(needle)
  while (at !== -1) {
    hits.push(at)
    at = source.indexOf(needle, at + 1)
  }
  if (!hits.length) return { ok: false, reason: 'literal not found in source' }
  const idx = hits.length === 1 ? 0 : occurrence
  if (idx == null || idx >= hits.length)
    return { ok: false, reason: `${hits.length} identical literals, cannot tell which` }
  const pos = hits[idx]
  return {
    ok: true,
    source: source.slice(0, pos) + `'${escapeSingle(newText)}'` + source.slice(pos + needle.length),
  }
}

// --------------------------------------------------------------------- driver

function sourceFor(key, order) {
  const base = `${String(order + 1).padStart(2, '0')}-${key}`
  const md = join(MD_DIR, `${base}.md`)
  const docx = join(DOCX_DIR, `${base}.docx`)
  const mdTime = statSync(md, { throwIfNoEntry: false })?.mtimeMs ?? 0
  const docxTime = statSync(docx, { throwIfNoEntry: false })?.mtimeMs ?? 0
  if (forceMd || (!forceDocx && mdTime >= docxTime && mdTime > 0)) {
    return { via: 'markdown', md: readFileSync(md, 'utf8') }
  }
  if (!docxTime) throw new Error(`no ${base}.md or ${base}.docx to read`)
  mkdirSync(TMP, { recursive: true })
  const converted = join(TMP, `${base}.md`)
  execFileSync('pandoc', [
    docx,
    '-f',
    'docx',
    '-t',
    'markdown-smart-simple_tables-multiline_tables-grid_tables+pipe_tables',
    '--wrap=none',
    '-o',
    converted,
  ])
  return { via: 'word', md: readFileSync(converted, 'utf8') }
}

const baseline = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
let totalChanges = 0
let totalBlocked = 0
const report = []

for (const [key, entry] of Object.entries(baseline)) {
  const { via, md } = sourceFor(key, entry.order)
  const { doc: edited, problems } = parseDocument(md, key)
  const before = entry.doc
  const lines = []

  if (shape(before) !== shape(edited)) {
    lines.push(`  ! structure changed — sections or blocks were added, removed or reordered`)
    const b = before.sections.map((s) => s.id)
    const a = edited.sections.map((s) => s.id ?? '(no @sec marker)')
    const added = a.filter((x) => !b.includes(x))
    const removed = b.filter((x) => !a.includes(x))
    if (added.length) lines.push(`    added sections:   ${added.join(', ')}`)
    if (removed.length) lines.push(`    removed sections: ${removed.join(', ')}`)
    if (!added.length && !removed.length) lines.push(`    block counts differ within a section`)
    totalBlocked++
    report.push({ key, via, lines, skipped: true, problems })
    continue
  }

  const oldFields = fields(before)
  const newFields = fields(edited)
  const byPath = new Map(newFields.map((f) => [f.path, f.value]))
  const changed = []
  for (const f of oldFields) {
    const now = byPath.get(f.path)
    if (now == null) continue
    if (normalize(f.value) !== normalize(now)) changed.push({ path: f.path, from: f.value, to: now })
  }

  if (before.version !== edited.version)
    lines.push(`  version ${before.version} -> ${edited.version}`)
  if (before.effectiveDate !== edited.effectiveDate)
    lines.push(`  effectiveDate ${before.effectiveDate} -> ${edited.effectiveDate}`)
  if (before.bundle !== edited.bundle)
    lines.push(`  ! bundle ${before.bundle} -> ${edited.bundle} (changes what Accept covers — not applied)`)

  const file = join(ROOT, entry.file)
  let source = readFileSync(file, 'utf8')
  const failed = []

  for (const c of changed) {
    // Where the same literal appears more than once in a file, its ordinal
    // among equal values in field order picks the right one.
    const equals = oldFields.filter((f) => f.value === c.from)
    const occurrence = equals.findIndex((f) => f.path === c.path)
    const res = replaceLiteral(source, c.from, c.to, occurrence)
    if (!res.ok) {
      failed.push(`    ${c.path}: ${res.reason}`)
      continue
    }
    source = res.source
    lines.push(`  ${c.path}`)
    lines.push(`    - ${c.from.slice(0, 110)}${c.from.length > 110 ? '…' : ''}`)
    lines.push(`    + ${c.to.slice(0, 110)}${c.to.length > 110 ? '…' : ''}`)
  }

  if (before.version !== edited.version && Number.isInteger(edited.version)) {
    const re = new RegExp(`(\\bversion:\\s*)${before.version}\\b`)
    if (re.test(source)) source = source.replace(re, `$1${edited.version}`)
    else failed.push(`    version: could not find "version: ${before.version}" in source`)
  }
  if (before.effectiveDate !== edited.effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(edited.effectiveDate ?? '')) {
    const r = replaceLiteral(source, before.effectiveDate, edited.effectiveDate, 0)
    if (r.ok) source = r.source
    else failed.push(`    effectiveDate: ${r.reason}`)
  }

  if (failed.length) {
    lines.push('  ! could not apply:')
    lines.push(...failed)
    totalBlocked += failed.length
  }

  const hasWrite = changed.length > 0 || before.version !== edited.version || before.effectiveDate !== edited.effectiveDate
  if (apply && hasWrite && !failed.length) writeFileSync(file, source, 'utf8')

  totalChanges += changed.length
  report.push({ key, via, lines, problems })
}

for (const r of report) {
  if (!r.lines.length && !r.problems.length) continue
  console.log(`\n${r.key}  (read from ${r.via})`)
  for (const p of r.problems) console.log(`  ? ${p}`)
  for (const l of r.lines) console.log(l)
}

console.log(
  `\n${totalChanges} text change${totalChanges === 1 ? '' : 's'}` +
    (totalBlocked ? `, ${totalBlocked} needing a decision` : '') +
    (apply
      ? `\nWritten to src/lib/legal/. Now run: npx vitest run src/lib/legal && npm run i18n:extract`
      : `\nDry run — nothing written. Re-run with --apply to write the .ts files.`)
)
