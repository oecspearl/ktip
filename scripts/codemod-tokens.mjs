#!/usr/bin/env node
/**
 * Design-token codemod.
 *
 * Rewrites hand-typed Tailwind sizes to the semantic tokens declared in
 * src/index.css. Runs one named rule set at a time so each migration phase is
 * a reviewable diff rather than a repo-wide sweep.
 *
 *   node scripts/codemod-tokens.mjs <rule> [--dry] [--only <glob-substring>]
 *
 * Substitutions apply only inside string literals ('…', "…", `…`), never in
 * comments or identifiers — a rule that rewrote `text-sm` in prose would
 * corrupt the help copy, which is full of sentences about badges and cards.
 *
 * Two directories are never touched:
 *   components/resume/  — a 210x296mm sheet authored in mm and pt
 *   pages/admin/errors/ — vendored shadcn, scoped by its own test
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { readdirSync, statSync } from 'node:fs'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

const IGNORED = [
  join('components', 'resume'),
  join('pages', 'admin', 'errors'),
]

/**
 * Each rule is an ordered list of [pattern, replacement]. Patterns are matched
 * against the contents of a string literal only. Order matters: longer class
 * names must come before the prefixes they contain.
 */
const RULES = {
  /** Phase 4 — the copied page container becomes a --container-* token. */
  containers: [
    // Lossless: these four have an exact token.
    [/max-w-\[calc\(50vw\+48rem\)\]/g, 'max-w-page'],
    [/max-w-\[calc\(50vw\+36rem\)\]/g, 'max-w-page-mid'],
    [/max-w-\[calc\(50vw\+32rem\)\]/g, 'max-w-page-narrow'],
    [/max-w-\[calc\(50vw\+24rem\)\]/g, 'max-w-page-tight'],
    // Consolidating: 28rem and 40rem were one-or-two-off widths with no design
    // rule behind them. 28 joins the dominant narrow (32rem, 18 sites); 40 is
    // the admin shell, which wants the widest measure it can get for tables.
    [/max-w-\[calc\(50vw\+28rem\)\]/g, 'max-w-page-narrow'],
    [/max-w-\[calc\(50vw\+40rem\)\]/g, 'max-w-page'],
  ],
}

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out)
    } else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) {
      out.push(full)
    }
  }
  return out
}

/** Applies `subs` inside every string literal, leaving all other code alone. */
function rewrite(source, subs) {
  // Alternation over the three literal forms; the body of each excludes its own
  // quote and a newline so an unterminated quote cannot swallow the file.
  const LITERAL = /"[^"\n]*"|'[^'\n]*'|`[^`]*`/g
  let count = 0
  const out = source.replace(LITERAL, (literal) => {
    let next = literal
    for (const [pattern, replacement] of subs) {
      next = next.replace(pattern, () => {
        count++
        return replacement
      })
    }
    return next
  })
  return { out, count }
}

const [rule, ...rest] = process.argv.slice(2)
const dry = rest.includes('--dry')
const onlyAt = rest.indexOf('--only')
const only = onlyAt === -1 ? null : rest[onlyAt + 1]

if (!rule || !RULES[rule]) {
  console.error(`usage: codemod-tokens.mjs <${Object.keys(RULES).join('|')}> [--dry] [--only <substring>]`)
  process.exit(1)
}

let files = 0
let total = 0
for (const file of sourceFiles(SRC)) {
  const rel = relative(SRC, file)
  if (IGNORED.some((dir) => rel.startsWith(dir + sep))) continue
  if (only && !rel.includes(only)) continue

  const source = readFileSync(file, 'utf8')
  const { out, count } = rewrite(source, RULES[rule])
  if (!count) continue

  files++
  total += count
  console.log(`${count.toString().padStart(3)}  ${rel.split(sep).join('/')}`)
  if (!dry) writeFileSync(file, out)
}

console.log(`\n${dry ? '[dry] would rewrite' : 'rewrote'} ${total} occurrence(s) in ${files} file(s)`)
