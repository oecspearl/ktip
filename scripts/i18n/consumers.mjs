#!/usr/bin/env node
/**
 * Find the render sites that harvested and `msg`-wrapped copy needs.
 *
 *   node scripts/i18n/consumers.mjs             # everything
 *   node scripts/i18n/consumers.mjs src/pages   # one subtree
 *
 * Reports two problems the other tools cannot see, because both are about how a
 * value is USED rather than how it is written.
 *
 * --- 1. Harvested copy rendered raw -----------------------------------------
 *
 * site-map.ts, constants.ts, the help articles and the tutorials are harvested:
 * their strings are listed in src/i18n/harvested.ts so `lingui extract` puts
 * them in the catalog, and the modules themselves are never rewritten. That is
 * deliberate — site-map.ts is imported by api/ai-search.ts and has to stay
 * React-free.
 *
 * The catch is that harvesting only gets the string INTO the catalog. Nothing
 * translates until a render site looks it up:
 *
 *     {category.label}            -> renders English forever
 *     {i18n._(category.label)}    -> renders the active language
 *
 * There is no type error either way, because both sides are `string`. Roughly a
 * thousand harvested strings are one missing call each away from doing nothing
 * at all, and the only symptom is that the page stays English.
 *
 * --- 2. A descriptor used as a string ----------------------------------------
 *
 * When the codemod converts a module-scope object value it produces a `msg`
 * descriptor, which is an object. Rendered as JSX or passed to a `string` prop,
 * TypeScript catches it. Interpolated into a template literal it does NOT:
 *
 *     `${step.title}`   ->  "[object Object]"   // compiles cleanly
 *
 * That reaches production looking like a corrupted page.
 *
 * Both checks are heuristic and report only — a name is not proof, and a
 * codemod should not guess at a render site's intent. Exit code is always 0.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative, join, sep } from 'node:path'
import ts from 'typescript'
import { EXCLUDE_PATHS, EXCLUDE_SUFFIXES } from './config.mjs'

const ROOT = process.cwd()
const posix = (p) => p.split(sep).join('/')

/**
 * Property names that carry copy in this codebase's data modules.
 *
 * Same vocabulary the harvester walks, so the two agree on what "copy" means.
 * `name` is included and is the noisiest: it is a copy field on a badge or a
 * category and a person's name on a profile. Reported anyway — a wrongly
 * flagged display_name is a line to dismiss, while a missed category label is a
 * page that silently never translates.
 */
const COPY_FIELDS = new Set([
  'label',
  'title',
  'description',
  'name',
  'hint',
  'summary',
  'question',
  'answer',
  'body',
  'heading',
  'placeholder',
  'helpText',
])

/** Already resolved, or explicitly not copy. */
const RESOLVERS = /\b(i18n\._|resolveCopy|useTranslated|t`|msg`)/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** `a.b.c` -> 'c', for any depth; null for anything that is not a plain access. */
function accessedField(node) {
  return ts.isPropertyAccessExpression(node) ? node.name.text : null
}

function inspect(relPath, text) {
  const source = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found = []
  const line = (n) => source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1

  /** Is the expression already going through something that resolves it? */
  const resolved = (node) => {
    for (let n = node.parent; n; n = n.parent) {
      if (ts.isCallExpression(n) && RESOLVERS.test(n.expression.getText(source))) return true
      // Stop at the statement boundary — a resolver further out is not this
      // expression's resolver.
      if (ts.isStatement(n)) return false
    }
    return false
  }

  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && COPY_FIELDS.has(node.name.text)) {
      const parent = node.parent

      // Rendered directly as JSX content: `<span>{cat.label}</span>`
      const asJsxChild =
        ts.isJsxExpression(parent) && parent.parent && (ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent))

      // Interpolated into a template: `${step.title}` — the silent one.
      const asTemplate = ts.isTemplateSpan(parent)

      if ((asJsxChild || asTemplate) && !resolved(node)) {
        found.push({
          line: line(node),
          kind: asTemplate ? 'template' : 'jsx',
          text: node.getText(source),
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return found
}

function main() {
  const scope = process.argv[2] ?? 'src'

  const files = walk(resolve(ROOT, scope))
    .map((f) => posix(relative(ROOT, f)))
    .filter((f) => !EXCLUDE_SUFFIXES.some((s) => f.endsWith(s)))
    .filter((f) => !EXCLUDE_PATHS.some((p) => f.startsWith(p)))

  const report = []
  let jsx = 0
  let template = 0

  for (const file of files) {
    const hits = inspect(file, readFileSync(resolve(ROOT, file), 'utf8'))
    if (!hits.length) continue
    report.push([file, hits])
    for (const h of hits) (h.kind === 'template' ? template++ : jsx++)
  }

  console.log(`\n[i18n:consumers] ${scope}`)
  console.log(`  rendered raw as JSX     ${jsx}   (translates only once wrapped in i18n._())`)
  console.log(`  inside a template       ${template}   (renders "[object Object]" if the value is a descriptor)`)
  console.log(`  across files            ${report.length}\n`)

  for (const [file, hits] of report.sort((a, b) => b[1].length - a[1].length).slice(0, 40)) {
    console.log(`  ${file}`)
    for (const h of hits.slice(0, 8)) {
      console.log(`    ${String(h.line).padStart(5)}  ${h.kind.padEnd(9)} ${h.text}`)
    }
    if (hits.length > 8) console.log(`    … and ${hits.length - 8} more`)
  }
  if (report.length > 40) console.log(`\n  … and ${report.length - 40} more files`)

  console.log(`
  Heuristic, and report-only. A hit is a place to LOOK, not a defect:
  \`{member.name}\` is a person and must stay as it is, while
  \`{category.label}\` is copy that currently never translates.
`)
}

main()
