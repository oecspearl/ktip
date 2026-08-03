#!/usr/bin/env node
/**
 * The ratchet. Fails if a file in an already-migrated directory has grown a new
 * unwrapped string.
 *
 *   npm run i18n:check
 *
 * This is the difference between a migration that finishes and one that does
 * not. Without it, every feature merged during the sweep adds English back into
 * directories that were already done, and the total never falls. With it, a
 * directory only has to be cleaned once.
 *
 * It deliberately does NOT fail on unmigrated directories. Those are known work,
 * tracked in the manifest; failing on them would make the check useless on day
 * one and it would be switched off within a week.
 *
 * Exit codes: 0 clean, 1 regression found.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative, join, sep } from 'node:path'
import ts from 'typescript'
import {
  COPY_ATTRS,
  COPY_CALLEES,
  COPY_KEYS,
  DENY_ATTRS,
  EXCLUDE_PATHS,
  EXCLUDE_SUFFIXES,
  MACRO_COMPONENTS,
  MACRO_NAMES,
  MIGRATED_PATHS,
} from './config.mjs'
import { loadTs, closeLoader } from './load-ts.mjs'

const ROOT = process.cwd()
const posix = (p) => p.split(sep).join('/')

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

function calleeName(call) {
  const e = call.expression
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) {
    const obj = ts.isIdentifier(e.expression) ? e.expression.text : ''
    return obj ? `${obj}.${e.name.text}` : e.name.text
  }
  return null
}

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
    if (ts.isJsxSelfClosingElement(n) && ts.isIdentifier(n.tagName) && MACRO_COMPONENTS.has(n.tagName.text)) {
      return true
    }
  }
  return false
}

/**
 * The literal prose inside a template, with the substitutions removed.
 *
 * `\`Search (${SHORTCUT_HINT})\`` -> "Search ( )", which reads as copy.
 * `\`${count}%\``               -> "%",           which does not.
 *
 * Without this the ratchet only ever looked at string literals, so a migrated
 * file could quietly regain English the moment someone interpolated anything
 * into it — and that is the single most common shape in this codebase after the
 * plain literal. Navbar.tsx had exactly one sitting in it.
 */
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

function templateProse(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (!ts.isTemplateExpression(node)) return null
  const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
  return parts.join(' ').trim()
}

function findUnwrapped(relPath, text, shouldTranslate) {
  const source = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const offences = []
  const at = (n) => source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const value = node.text.replace(/\s+/g, ' ').trim()
      if (value && shouldTranslate(value) && !alreadyWrapped(node)) {
        offences.push({ line: at(node), text: value, kind: 'jsx-text' })
      }
    }

    if (ts.isStringLiteral(node) && isJsxChildString(node) && !alreadyWrapped(node)) {
      const value = node.text.trim()
      if (value && shouldTranslate(value)) {
        offences.push({ line: at(node), text: value, kind: 'jsx-child' })
      }
    }

    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(source)
      // `foo="bar"`, and `foo={\`bar ${x}\`}` — an expression container wrapping
      // a template counts too.
      const init = ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer
      const value = init
        ? ts.isStringLiteral(init)
          ? init.text
          : templateProse(init)
        : null
      if (
        value &&
        !DENY_ATTRS.has(name) &&
        COPY_ATTRS.has(name) &&
        shouldTranslate(value) &&
        !alreadyWrapped(init)
      ) {
        offences.push({ line: at(node), text: value, kind: `attr ${name}` })
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const key = ts.isIdentifier(node.name)
        ? node.name.text
        : ts.isStringLiteral(node.name)
          ? node.name.text
          : null
      const init = node.initializer
      const value = ts.isStringLiteral(init) ? init.text : templateProse(init)
      if (key && COPY_KEYS.has(key) && value && shouldTranslate(value) && !alreadyWrapped(init)) {
        offences.push({ line: at(node), text: value, kind: `key ${key}` })
      }
    }

    if (ts.isCallExpression(node)) {
      const name = calleeName(node)
      const [first] = node.arguments
      const value = first ? (ts.isStringLiteral(first) ? first.text : templateProse(first)) : null
      if (name && COPY_CALLEES.has(name) && value && shouldTranslate(value) && !alreadyWrapped(first)) {
        offences.push({ line: at(node), text: value, kind: name })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return offences
}

async function main() {
  const { shouldTranslate } = await loadTs('src/lib/i18n/should-translate.ts')

  const guarded = walk(resolve(ROOT, 'src'))
    .map((f) => posix(relative(ROOT, f)))
    .filter((f) => !EXCLUDE_SUFFIXES.some((s) => f.endsWith(s)))
    .filter((f) => !EXCLUDE_PATHS.some((p) => f.startsWith(p)))
    .filter((f) => MIGRATED_PATHS.some((p) => f === p || f.startsWith(p)))

  if (guarded.length === 0) {
    console.log('[i18n:check] MIGRATED_PATHS is empty — nothing guarded yet.')
    return 0
  }

  let total = 0
  const report = []

  for (const file of guarded) {
    const offences = findUnwrapped(file, readFileSync(resolve(ROOT, file), 'utf8'), shouldTranslate)
    if (offences.length) {
      total += offences.length
      report.push([file, offences])
    }
  }

  if (total === 0) {
    console.log(`[i18n:check] ${guarded.length} guarded files clean.`)
    return 0
  }

  console.error(`\n[i18n:check] ${total} unwrapped string(s) in already-migrated files:\n`)
  for (const [file, offences] of report) {
    console.error(`  ${file}`)
    for (const o of offences.slice(0, 12)) {
      console.error(`    ${String(o.line).padStart(5)}  ${o.kind.padEnd(16)} ${JSON.stringify(o.text).slice(0, 70)}`)
    }
    if (offences.length > 12) console.error(`    … and ${offences.length - 12} more`)
  }
  console.error(`
  These directories were already translated, so a new English string here is a
  regression rather than outstanding work.

  Wrap JSX text in <Trans>, attributes and calls in t\`…\`, and module-scope
  object values in msg\`…\` resolved with i18n._() at the render site.
  Then run: npm run i18n:extract
`)
  return 1
}

main()
  .then(async (code) => {
    await closeLoader()
    process.exit(code)
  })
  .catch(async (error) => {
    await closeLoader()
    console.error('[i18n:check] failed:', error)
    process.exit(1)
  })
