#!/usr/bin/env node
/**
 * Pass A of the extraction: INVENTORY ONLY. This script never edits a file.
 *
 *   npm run i18n:scan            # write i18n/manifest.json
 *   npm run i18n:scan -- --summary
 *
 * It emits a decision list — every string it found, where it is, what kind it
 * is, and whether a codemod may wrap it automatically. That list is reviewed and
 * committed on its own, and only then does the codemod act on it.
 *
 * The separation is the whole point. Five thousand strings cannot be reviewed as
 * a five-thousand-line code diff, but they can be reviewed as a table of
 * decisions, once, and the code diff that follows is then mechanical and boring.
 *
 * Uses ts.createSourceFile rather than a full Program: nothing here needs types,
 * and parsing 600 files without a type-checker is seconds rather than minutes.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative, join, sep } from 'node:path'
import ts from 'typescript'
import {
  COPY_ATTRS,
  COPY_CALLEES,
  COPY_KEYS,
  DENY_ATTRS,
  DENY_CALLEES,
  EXCLUDE_PATHS,
  EXCLUDE_SUFFIXES,
  HARVEST_PATHS,
  MACRO_COMPONENTS,
  MACRO_NAMES,
  MANIFEST_PATH,
} from './config.mjs'
import { loadTs, closeLoader } from './load-ts.mjs'

// The real predicate from src/lib/i18n/should-translate.ts, not a copy of it.
// Assigned in main() before any scanning happens.
let shouldTranslate = () => true

const ROOT = process.cwd()

function posix(p) {
  return p.split(sep).join('/')
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue
      walk(full, out)
    } else if (/\.(tsx?|mts)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const startsWithAny = (path, prefixes) => prefixes.some((p) => path.startsWith(p))

/**
 * Is this string literal rendered as JSX content?
 *
 *   <p>{cond ? 'Yes' : 'No'}</p>          -> both are copy
 *   <Foo bar={cond ? 'a' : 'b'} />        -> judged by the attribute rules
 *   const x = cond ? 'a' : 'b'            -> not JSX at all
 *
 * Walks up through the conditionals and logical operators a literal is usually
 * buried in, and stops at the first thing that decides the question. Attributes
 * are explicitly NOT this case: they have their own allow/deny lists, and
 * treating them as content would translate every className in a ternary.
 */
function isJsxChildString(node) {
  // Track which side of each operator we came up through. The position is the
  // whole question: in `variant === 'compact' ? a : b` the literal is a test,
  // and in `cond ? 'Yes' : 'No'` it is content — both sit under a
  // ConditionalExpression inside a JsxExpression, so the shape alone cannot
  // tell them apart. Reporting the first as copy is how "compact" ended up in
  // the ratchet's output.
  let child = node
  let n = node.parent

  while (n) {
    if (ts.isParenthesizedExpression(n)) {
      child = n
      n = n.parent
      continue
    }

    if (ts.isConditionalExpression(n)) {
      if (n.condition === child) return false
      child = n
      n = n.parent
      continue
    }

    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind
      // A comparison consumes its operands as values: `x === 'compact'` is a
      // slug test, never a sentence.
      const isGuard =
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      if (!isGuard) return false
      // `hasQuery && 'No results'` — the left of && is the condition.
      if (op === ts.SyntaxKind.AmpersandAmpersandToken && n.left === child) return false
      child = n
      n = n.parent
      continue
    }

    break
  }

  if (!n || !ts.isJsxExpression(n)) return false
  const host = n.parent
  return !!host && (ts.isJsxElement(host) || ts.isJsxFragment(host))
}

function classifyFile(relPath) {
  if (EXCLUDE_SUFFIXES.some((s) => relPath.endsWith(s))) return 'excluded'
  if (startsWithAny(relPath, EXCLUDE_PATHS)) return 'excluded'
  if (startsWithAny(relPath, HARVEST_PATHS)) return 'harvest'
  return 'scan'
}

// ---------------------------------------------------------------------------
// Context predicates
// ---------------------------------------------------------------------------

/** Inside cn()/clsx()/cva()/… at ANY depth — a class name nested in a ternary
 *  inside an array inside cn() is still a class name. */
function insideDeniedCall(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isCallExpression(n)) {
      const name = calleeName(n)
      if (name && DENY_CALLEES.has(name)) return true
      if (name && DENY_CALLEES.has(name.split('.').pop())) return true
    }
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return true
  }
  return false
}

function calleeName(call) {
  const e = call.expression
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) {
    const obj = ts.isIdentifier(e.expression) ? e.expression.text : ''
    return obj ? `${obj}.${e.name.text}` : e.name.text
  }
  return null
}

/** Already wrapped: inside <Trans>, or the argument of a t`…`/msg`…` macro. */
function alreadyWrapped(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isTaggedTemplateExpression(n)) {
      const tag = n.tag
      if (ts.isIdentifier(tag) && MACRO_NAMES.has(tag.text)) return true
    }
    if (ts.isCallExpression(n)) {
      const name = calleeName(n)
      if (name && MACRO_NAMES.has(name.split('.').pop())) return true
    }
    if (ts.isJsxElement(n)) {
      const tag = n.openingElement.tagName
      if (ts.isIdentifier(tag) && MACRO_COMPONENTS.has(tag.text)) return true
    }
    if (ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName
      if (ts.isIdentifier(tag) && MACRO_COMPONENTS.has(tag.text)) return true
    }
  }
  return false
}

/**
 * Is this JSX text one of several children interleaved with elements?
 *
 * `Click <b>here</b> to continue` wrapped per-text-node becomes three
 * independently-translated fragments, and French cannot reorder them. Lingui's
 * <Trans> handles it — it extracts the whole thing as `Click <0>here</0> to
 * continue` — but the codemod has to wrap the PARENT, not the text node, and
 * whether that is safe depends on what else is in there. So: flag for a human.
 */
function isFragmented(textNode) {
  const parent = textNode.parent
  if (!parent || !parent.children) return false
  let meaningful = 0
  for (const child of parent.children) {
    if (ts.isJsxText(child)) {
      if (child.text.trim()) meaningful++
    } else if (ts.isJsxExpression(child)) {
      // `{' '}` and `{' '}` are typographic glue, not content.
      const expr = child.expression
      const isGlue =
        expr && ts.isStringLiteral(expr) && !expr.text.trim()
      if (!isGlue) meaningful++
    } else {
      meaningful++
    }
  }
  return meaningful > 1
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

function zoneOf(relPath) {
  const parts = relPath.split('/')
  return parts.slice(0, 3).join('/').replace(/\.tsx?$/, '')
}

function scanFile(relPath, text) {
  const source = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found = []

  const at = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1

  const push = (node, value, kind, extra = {}) => {
    found.push({
      text: value,
      file: relPath,
      line: at(node),
      kind,
      zone: zoneOf(relPath),
      ...extra,
    })
  }

  const visit = (node) => {
    // --- JSX text -----------------------------------------------------------
    if (ts.isJsxText(node)) {
      const value = node.text.replace(/\s+/g, ' ').trim()
      if (value && !alreadyWrapped(node)) {
        push(node, value, 'jsx-text', {
          action: !shouldTranslate(value) ? 'skip' : isFragmented(node) ? 'human' : 'auto',
          reason: !shouldTranslate(value)
            ? 'not-copy'
            : isFragmented(node)
              ? 'fragmented-sentence'
              : undefined,
        })
      }
    }

    // --- string literals rendered as JSX content ----------------------------
    if (ts.isStringLiteral(node) && isJsxChildString(node) && !alreadyWrapped(node)) {
      const value = node.text.trim()
      if (value) {
        push(node, value, 'jsx-child-string', {
          action: !shouldTranslate(value) ? 'skip' : 'auto',
          reason: shouldTranslate(value) ? undefined : 'not-copy',
        })
      }
    }

    // --- JSX attributes -----------------------------------------------------
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(source)
      const init = node.initializer

      if (ts.isStringLiteral(init)) {
        const value = init.text
        if (DENY_ATTRS.has(name)) {
          // Silent: these are never copy and listing them would bury the signal.
        } else if (COPY_ATTRS.has(name)) {
          push(node, value, 'jsx-attr', {
            attr: name,
            action: shouldTranslate(value) ? 'auto' : 'skip',
            reason: shouldTranslate(value) ? undefined : 'not-copy',
          })
        }
      } else if (
        ts.isJsxExpression(init) &&
        init.expression &&
        ts.isTemplateExpression(init.expression) &&
        COPY_ATTRS.has(name)
      ) {
        // A template with substitutions needs a named slot and a human to
        // choose it; the shape of the sentence usually changes too.
        push(node, init.expression.getText(source), 'jsx-attr-template', {
          attr: name,
          action: 'human',
          reason: 'template-with-expressions',
        })
      }
    }

    // --- object literal values ---------------------------------------------
    if (ts.isPropertyAssignment(node)) {
      const key = ts.isIdentifier(node.name)
        ? node.name.text
        : ts.isStringLiteral(node.name)
          ? node.name.text
          : null
      if (key && COPY_KEYS.has(key)) {
        const init = node.initializer
        if (ts.isStringLiteral(init) && !alreadyWrapped(init) && !insideDeniedCall(init)) {
          push(node, init.text, 'object-value', {
            key,
            action: shouldTranslate(init.text) ? 'auto' : 'skip',
            reason: shouldTranslate(init.text) ? undefined : 'not-copy',
          })
        } else if (ts.isTemplateExpression(init)) {
          push(node, init.getText(source), 'object-value-template', {
            key,
            action: 'human',
            reason: 'template-with-expressions',
          })
        }
      }
    }

    // --- toast.*(), usePageTitle() -----------------------------------------
    if (ts.isCallExpression(node)) {
      const name = calleeName(node)
      if (name && COPY_CALLEES.has(name)) {
        const [first] = node.arguments
        if (first && ts.isStringLiteral(first) && !alreadyWrapped(first)) {
          push(node, first.text, name.startsWith('toast') ? 'toast' : 'page-title', {
            action: shouldTranslate(first.text) ? 'auto' : 'skip',
            reason: shouldTranslate(first.text) ? undefined : 'not-copy',
          })
        } else if (first && ts.isTemplateExpression(first)) {
          push(node, first.getText(source), 'call-template', {
            action: 'human',
            reason: 'template-with-expressions',
          })
        } else if (
          first &&
          ts.isBinaryExpression(first) &&
          first.operatorToken.kind === ts.SyntaxKind.BarBarToken
        ) {
          // `toast.error(error.message || 'Failed to create event')` — the
          // fallback is copy, the server message beside it is not, and only a
          // human should decide whether the server string is shown at all.
          push(node, first.getText(source), 'call-fallback', {
            action: 'human',
            reason: 'server-message-fallback',
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return found
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const summaryOnly = args.includes('--summary')

  ;({ shouldTranslate } = await loadTs('src/lib/i18n/should-translate.ts'))

  const files = walk(resolve(ROOT, 'src')).map((f) => posix(relative(ROOT, f)))

  const entries = []
  const harvestFiles = []
  let scanned = 0

  for (const relPath of files) {
    const kind = classifyFile(relPath)
    if (kind === 'excluded') continue
    if (kind === 'harvest') {
      harvestFiles.push(relPath)
      continue
    }
    scanned++
    entries.push(...scanFile(relPath, readFileSync(resolve(ROOT, relPath), 'utf8')))
  }

  // Stable order, so a re-scan produces a reviewable diff rather than a reshuffle.
  entries.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.text.localeCompare(b.text))

  const byAction = {}
  const byKind = {}
  const byZone = {}
  for (const e of entries) {
    byAction[e.action] = (byAction[e.action] ?? 0) + 1
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1
    if (e.action !== 'skip') byZone[e.zone] = (byZone[e.zone] ?? 0) + 1
  }

  const actionable = entries.filter((e) => e.action !== 'skip')
  const unique = new Set(actionable.map((e) => e.text))

  console.log(`\nScanned ${scanned} files (+${harvestFiles.length} harvested, not scanned)\n`)
  console.log(`  strings found     ${entries.length}`)
  console.log(`  actionable        ${actionable.length}  (${unique.size} distinct)`)
  console.log(`    auto            ${byAction.auto ?? 0}`)
  console.log(`    human            ${byAction.human ?? 0}`)
  console.log(`  skipped as tokens ${byAction.skip ?? 0}\n`)

  console.log('  by kind:')
  for (const [kind, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${kind.padEnd(22)} ${n}`)
  }

  console.log('\n  biggest zones:')
  for (const [zone, n] of Object.entries(byZone)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)) {
    console.log(`    ${zone.padEnd(38)} ${n}`)
  }
  console.log()

  if (summaryOnly) return

  mkdirSync(resolve(ROOT, 'i18n'), { recursive: true })
  writeFileSync(
    resolve(ROOT, MANIFEST_PATH),
    JSON.stringify(
      {
        // No timestamp on purpose: this file is committed and reviewed, and a
        // clock in it would make every re-scan a diff even when nothing moved.
        generatedBy: 'scripts/i18n/scan.mjs',
        counts: { total: entries.length, actionable: actionable.length, distinct: unique.size, ...byAction },
        harvestFiles,
        entries,
      },
      null,
      2
    ) + '\n'
  )
  console.log(`  wrote ${MANIFEST_PATH}\n`)
}

main()
  .then(closeLoader)
  .catch(async (error) => {
    await closeLoader()
    console.error('[i18n:scan] failed:', error)
    process.exit(1)
  })
