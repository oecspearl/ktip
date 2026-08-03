#!/usr/bin/env node
/**
 * Pass B of the extraction: apply the manifest's `auto` decisions.
 *
 *   npm run i18n:apply -- --glob 'src/components/ui/**' --dry-run
 *   npm run i18n:apply -- --glob 'src/components/ui/**'
 *
 * Only entries the COMMITTED manifest marked `action: "auto"` are touched.
 * Anything marked `human` — a fragmented sentence, a template with
 * substitutions, a server-message fallback — is reported and left alone. That is
 * the boundary between what a script may decide and what a person must.
 *
 * ts-morph rather than the TypeScript printer: the printer reformats the whole
 * file, which turns a 30-file slice into an unreviewable 40k-line diff. ts-morph
 * replaces node text in place, so every line the codemod did not touch stays
 * byte-identical and the diff is exactly the change.
 *
 * Idempotent. Running it twice produces no second diff, and CI asserts that.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { Project, SyntaxKind, QuoteKind } from 'ts-morph'
import {
  globToRegExp,
  HARVEST_PATHS,
  MACRO_COMPONENTS,
  MACRO_NAMES,
  MANIFEST_PATH,
  MIGRATED_PATHS,
} from './config.mjs'

const ROOT = process.cwd()
const posix = (p) => p.split(sep).join('/')

function parseArgs(argv) {
  const args = { glob: null, dryRun: false, limit: Infinity }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--glob') args.glob = argv[++i]
    else if (argv[i] === '--dry-run') args.dryRun = true
    else if (argv[i] === '--limit') args.limit = Number(argv[++i])
  }
  return args
}

// ---------------------------------------------------------------------------
// Imports and the hook
// ---------------------------------------------------------------------------

function ensureImport(sourceFile, moduleSpecifier, names) {
  const existing = sourceFile.getImportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier)
  if (existing) {
    const already = new Set(existing.getNamedImports().map((n) => n.getName()))
    const missing = names.filter((n) => !already.has(n))
    if (missing.length) existing.addNamedImports(missing)
    return
  }
  // After the last existing import, so the codemod never lands above a
  // side-effecting import that has to run first.
  const imports = sourceFile.getImportDeclarations()
  sourceFile.insertImportDeclaration(imports.length, { moduleSpecifier, namedImports: names })
  // ts-morph's structure printer always emits a semicolon. This codebase does
  // not use them, so the one line the codemod adds would be the only one in the
  // file that does.
  const added = sourceFile.getImportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier)
  if (added?.getText().endsWith(';')) {
    sourceFile.replaceText([added.getEnd() - 1, added.getEnd()], '')
  }
}

const FUNCTION_KINDS = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionExpression,
])

/** The declared name of a function-ish node, however it was declared. */
function functionName(node) {
  const kind = node.getKind()
  return (
    (kind === SyntaxKind.FunctionDeclaration && node.getName?.()) ||
    node.getFirstAncestorByKind?.(SyntaxKind.VariableDeclaration)?.getName?.() ||
    null
  )
}

/** React's own rule, plus hooks — which may also hold a `useLingui()` call. */
const isComponentName = (name) => !!name && (/^[A-Z]/.test(name) || /^use[A-Z]/.test(name))

/**
 * The NAME of the React component a node lives in, or null.
 *
 * Only a component may gain a `useLingui()` call, so this is what decides
 * between `t` (evaluated where it stands) and `msg` (a descriptor resolved later
 * at a render site).
 *
 * It keeps walking past nested lowercase functions rather than stopping at them.
 * A click handler declared inside a component — `const handleSignOut = async
 * () => { toast.success('Signed out') }` — cannot hold a hook itself, but it
 * closes over the component's `t` perfectly well, and that is where most toast
 * strings in this codebase live. Stopping at the first non-component function
 * would push every one of them to a human for no reason.
 *
 * null means genuinely module scope, where `t` would be evaluated once at import
 * — before any language has been chosen — and then never change again.
 */
function enclosingComponentName(node) {
  for (let n = node.getParent(); n; n = n.getParent()) {
    if (!FUNCTION_KINDS.has(n.getKind())) continue
    const name = functionName(n)
    if (isComponentName(name)) return name
  }
  return null
}

/**
 * Find a component by name, from scratch.
 *
 * Names, not node references. **Every text edit forgets the nodes that were
 * live before it** — the first `replaceText` in a file invalidated the component
 * node collected alongside it, and `getBody()` later threw
 * "Attempted to get information from a node that was removed or forgotten".
 * That only surfaced on the first file carrying more than one string; every
 * earlier slice had exactly one and got away with it.
 *
 * A name survives arbitrary edits, so the fix is to re-query for one instead of
 * holding a pointer across a mutation.
 */
function findComponentByName(sourceFile, name) {
  for (const kind of FUNCTION_KINDS) {
    for (const node of sourceFile.getDescendantsOfKind(kind)) {
      if (functionName(node) === name) return node
    }
  }
  return null
}

/**
 * Give one component a `t` binding. Returns whether the file was edited.
 *
 * Only the component's own top-level statements are considered, not every
 * descendant: a `useLingui()` inside a nested component is not this component's
 * binding, and treating it as one leaves `t` undefined at runtime.
 */
function ensureUseLingui(component) {
  const body = component.getBody?.()
  if (!body || body.getKind() !== SyntaxKind.Block) return false

  for (const statement of body.getStatements()) {
    if (statement.getKind() !== SyntaxKind.VariableStatement) continue
    const decl = statement
      .getDeclarations()
      .find((d) => d.getInitializer()?.getText().startsWith('useLingui('))
    if (!decl) continue

    // Already there. If it destructures only `i18n`, widening the binding
    // pattern is a text edit rather than a second hook call.
    const binding = decl.getNameNode()
    if (binding.getKind() !== SyntaxKind.ObjectBindingPattern) return false
    if (/\bt\b/.test(binding.getText())) return false
    binding.replaceWithText(binding.getText().replace(/\}\s*$/, ', t }'))
    return true
  }

  // First statement in the body: before any early return, and before any other
  // hook that might itself be conditional further down.
  //
  // Raw text at the opening brace rather than `insertStatements(0, …)`, for the
  // same reason the JSX rewrite avoids `replaceWithText`: ts-morph re-indents
  // what it inserts, using its own configured indent rather than the file's, and
  // every inserted hook came out at 4 spaces inside 2-space bodies. It also puts
  // the line ABOVE any leading comment on the old first statement, which is
  // where it belongs — a comment explaining `const auth = useAuth()` should
  // stay attached to it.
  const brace = body.getFirstChildByKind(SyntaxKind.OpenBraceToken)
  if (!brace) return false
  const indent = body.getStatements()[0]?.getIndentationText() ?? `${body.getIndentationText()}  `
  component.getSourceFile().insertText(brace.getEnd(), `\n${indent}const { t } = useLingui()`)
  return true
}

/**
 * After the rewrites: give every component that now uses `t` its binding.
 *
 * Driven by the `t` macros actually present in the file rather than by a list
 * built during the rewrite, so it is correct even if a rewrite was skipped, and
 * self-correcting when run against a file someone has already hand-edited.
 *
 * One component per iteration, re-querying between each, because the insertion
 * itself is a text edit that forgets everything found before it.
 */
function wireUseLingui(sourceFile) {
  const names = new Set()
  for (const tagged of sourceFile.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression)) {
    if (tagged.getTag().getText() !== 't') continue
    const name = enclosingComponentName(tagged)
    if (name) names.add(name)
  }

  let edited = false
  for (const name of names) {
    const component = findComponentByName(sourceFile, name)
    if (component && ensureUseLingui(component)) edited = true
  }
  return edited || names.size > 0
}

/**
 * `t` macros that a nearer binding has shadowed.
 *
 * This codebase names callback parameters `t` fairly often — `selected.filter(
 * (t) => options.includes(t))` — and an inserted `const { t } = useLingui()`
 * loses to any of them inside their own scope. The failure is not a type error
 * (the parameter is usually a `string`, and a tagged template on a string is a
 * runtime crash rather than a compile one) and not a visible one either, so it
 * is worth naming out loud rather than discovering in production.
 *
 * Reported, not repaired: renaming someone else's parameter is not a decision a
 * codemod should make silently.
 */
function shadowedTMacros(sourceFile) {
  const hits = []
  for (const tagged of sourceFile.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression)) {
    if (tagged.getTag().getText() !== 't') continue
    for (let n = tagged.getParent(); n; n = n.getParent()) {
      if (!FUNCTION_KINDS.has(n.getKind())) continue
      // Reaching the component means nothing in between rebound `t`.
      if (isComponentName(functionName(n))) break
      if ((n.getParameters?.() ?? []).some((p) => p.getName() === 't')) {
        hits.push(`${posix(sourceFile.getFilePath())}:${tagged.getStartLineNumber()}`)
        break
      }
    }
  }
  return hits
}

// ---------------------------------------------------------------------------
// The rewrites
// ---------------------------------------------------------------------------

const escapeTemplate = (text) =>
  text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

/**
 * Is this node already inside a macro?
 *
 * The scanner applies the same test, so in the normal flow this never fires. It
 * is here because the codemod must be safe against a STALE manifest — one
 * committed before someone hand-wrapped a string, or simply run twice. Without
 * it, a second run produces `<Trans><Trans>…</Trans></Trans>`, which is exactly
 * what the idempotence assertion in CI is there to catch, and it is much better
 * to be unable to produce it at all.
 */
function alreadyWrapped(node) {
  for (const ancestor of node.getAncestors()) {
    const kind = ancestor.getKind()
    if (kind === SyntaxKind.TaggedTemplateExpression) {
      const tag = ancestor.getTag().getText()
      if (MACRO_NAMES.has(tag)) return true
    }
    if (kind === SyntaxKind.CallExpression) {
      const name = ancestor.getExpression().getText().split('.').pop()
      if (MACRO_NAMES.has(name)) return true
    }
    if (kind === SyntaxKind.JsxElement) {
      const tag = ancestor.getOpeningElement().getTagNameNode().getText()
      if (MACRO_COMPONENTS.has(tag)) return true
    }
    if (kind === SyntaxKind.JsxSelfClosingElement) {
      if (MACRO_COMPONENTS.has(ancestor.getTagNameNode().getText())) return true
    }
  }
  return false
}

function applyEntry(sourceFile, entry, state) {
  const line = entry.line
  const wanted = entry.text

  /**
   * A string literal rendered as JSX content: `{cond ? 'Yes' : 'No'}`.
   *
   * `t`, not `<Trans>` — the literal sits in an expression position where a
   * component cannot go. Both branches of a ternary get wrapped individually,
   * which is correct: they are two independent messages, and a translator
   * should never see them welded together.
   */
  if (entry.kind === 'jsx-child-string') {
    const node = sourceFile
      .getDescendantsOfKind(SyntaxKind.StringLiteral)
      .find((n) => n.getStartLineNumber() === line && n.getLiteralValue() === wanted)
    if (!node) return 'not-found'
    if (alreadyWrapped(node)) return 'already-wrapped'
    if (!enclosingComponentName(node)) return 'no-component'
    node.replaceWithText(`t\`${escapeTemplate(wanted)}\``)
    return 'ok'
  }

  if (entry.kind === 'jsx-text') {
    const node = sourceFile
      .getDescendantsOfKind(SyntaxKind.JsxText)
      .find((n) => n.getStartLineNumber() === line && n.getText().replace(/\s+/g, ' ').trim() === wanted)
    if (!node) return 'not-found'
    if (alreadyWrapped(node)) return 'already-wrapped'
    // Replace the TRIMMED span only, by absolute offset.
    //
    // Not replaceWithText: given a replacement containing newlines, ts-morph
    // re-indents it, and the surrounding whitespace of a JsxText node is the
    // indentation of the lines around it. Handing it back its own leading and
    // trailing whitespace makes it reflow the closing tag — the observed symptom
    // was `</Link>` landing 40 columns to the right. A raw text-span replacement
    // is left exactly as written, which is the whole reason for using ts-morph.
    const raw = node.getText()
    const start = node.getStart()
    const lead = raw.length - raw.trimStart().length
    const trimmedLength = raw.trim().length
    sourceFile.replaceText(
      [start + lead, start + lead + trimmedLength],
      `<Trans>${wanted}</Trans>`
    )
    state.needsTrans = true
    return 'ok'
  }

  if (entry.kind === 'jsx-attr') {
    const attr = sourceFile
      .getDescendantsOfKind(SyntaxKind.JsxAttribute)
      .find(
        (n) =>
          n.getStartLineNumber() === line &&
          n.getNameNode().getText() === entry.attr &&
          n.getInitializer()?.getKind() === SyntaxKind.StringLiteral &&
          n.getInitializer().getLiteralValue() === wanted
      )
    if (!attr) return 'not-found'
    if (alreadyWrapped(attr)) return 'already-wrapped'
    if (!enclosingComponentName(attr)) return 'no-component'
    attr.getInitializer().replaceWithText(`{t\`${escapeTemplate(wanted)}\`}`)
    return 'ok'
  }

  if (entry.kind === 'object-value') {
    const prop = sourceFile
      .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
      .find(
        (n) =>
          n.getStartLineNumber() === line &&
          n.getNameNode().getText().replace(/['"]/g, '') === entry.key &&
          n.getInitializer()?.getKind() === SyntaxKind.StringLiteral &&
          n.getInitializer().getLiteralValue() === wanted
      )
    if (!prop) return 'not-found'
    if (alreadyWrapped(prop.getInitializer())) return 'already-wrapped'
    const inComponent = !!enclosingComponentName(prop)
    // Module scope -> `msg` descriptor, resolved at the render site. Inside a
    // component -> `t`, evaluated right there. Getting this backwards is the
    // classic Lingui bug: a `t` at module scope is evaluated once, at import,
    // before any language has been chosen, and then never changes again.
    if (inComponent) {
      prop.getInitializer().replaceWithText(`t\`${escapeTemplate(wanted)}\``)
    } else {
      prop.getInitializer().replaceWithText(`msg\`${escapeTemplate(wanted)}\``)
      state.needsMsg = true
    }
    return 'ok'
  }

  if (entry.kind === 'toast' || entry.kind === 'page-title') {
    const call = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find(
        (n) =>
          n.getStartLineNumber() === line &&
          n.getArguments()[0]?.getKind() === SyntaxKind.StringLiteral &&
          n.getArguments()[0].getLiteralValue() === wanted
      )
    if (!call) return 'not-found'
    if (alreadyWrapped(call)) return 'already-wrapped'
    if (!enclosingComponentName(call)) return 'no-component'
    call.getArguments()[0].replaceWithText(`t\`${escapeTemplate(wanted)}\``)
    return 'ok'
  }

  return 'unsupported'
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.glob) {
    console.error('Usage: npm run i18n:apply -- --glob "src/components/ui/**" [--dry-run]')
    console.error('\nA glob is required on purpose. This runs one reviewable slice at a time;')
    console.error('rewriting 460 files in one commit is how a migration becomes unmergeable.')
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(resolve(ROOT, MANIFEST_PATH), 'utf8'))
  const match = globToRegExp(args.glob)

  /**
   * Harvested modules are read, never rewritten — refuse them here rather than
   * trusting every future caller's glob.
   *
   * `--glob 'src/lib/**'` is an entirely reasonable thing to type, and it would
   * rewrite site-map.ts. api/ai-search.ts imports that file from the Edge
   * runtime, so a `@lingui/core/macro` import in it breaks the deployed search
   * API — at build time if you are lucky, and at request time if you are not.
   * constants.ts and the tutorials are the same decision for a milder reason:
   * they are already in the catalog via the harvester, and rewriting them would
   * duplicate every string under a second id.
   */
  const harvested = (file) => HARVEST_PATHS.some((p) => file === p || file.startsWith(p))

  const matched = manifest.entries.filter((e) => match.test(e.file))
  const blocked = [...new Set(matched.filter((e) => e.action !== 'skip' && harvested(e.file)).map((e) => e.file))]
  if (blocked.length) {
    console.log(`\n  Skipping ${blocked.length} harvested module(s) — these are read, never rewritten:\n`)
    for (const f of blocked) console.log(`    ${f}`)
    console.log(`\n  Their strings are already in the catalog via scripts/i18n/harvest.mjs.`)
    console.log(`  Translate them at the RENDER site with i18n._(…) instead.\n`)
  }

  const targets = matched.filter((e) => e.action === 'auto' && !harvested(e.file))
  const deferred = matched.filter((e) => e.action === 'human' && !harvested(e.file))

  if (targets.length === 0) {
    console.log(`No auto entries match ${args.glob}.`)
    if (deferred.length) console.log(`(${deferred.length} entries in that glob are marked "human".)`)
    return
  }

  const byFile = new Map()
  for (const entry of targets) {
    if (!byFile.has(entry.file)) byFile.set(entry.file, [])
    byFile.get(entry.file).push(entry)
  }

  const project = new Project({
    tsConfigFilePath: resolve(ROOT, 'tsconfig.app.json'),
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: { quoteKind: QuoteKind.Single },
  })

  const results = { ok: 0, 'not-found': 0, 'no-component': 0, unsupported: 0, 'already-wrapped': 0 }
  const changedFiles = []
  const shadowed = []
  let filesDone = 0

  for (const [file, entries] of byFile) {
    if (filesDone >= args.limit) break
    const sourceFile = project.addSourceFileAtPath(resolve(ROOT, file))
    const state = { needsTrans: false, needsMsg: false }

    // Bottom of the file upward: a replacement changes the text below it, and
    // entries are located by line number.
    for (const entry of [...entries].sort((a, b) => b.line - a.line)) {
      results[applyEntry(sourceFile, entry, state)]++
    }

    // After every rewrite, never during: this walks the file as it now stands.
    const usesT = wireUseLingui(sourceFile)
    shadowed.push(...shadowedTMacros(sourceFile))

    const reactMacro = []
    if (state.needsTrans) reactMacro.push('Trans')
    if (usesT) reactMacro.push('useLingui')
    if (reactMacro.length) ensureImport(sourceFile, '@lingui/react/macro', reactMacro)
    if (state.needsMsg) ensureImport(sourceFile, '@lingui/core/macro', ['msg'])

    // Preserve the file's own line endings.
    //
    // Most of this repo is CRLF, and ts-morph emits LF for the lines it
    // inserts. Left alone that yields a file with mixed endings: git renders
    // the whole thing as changed, and — worse — every subsequent multi-line
    // search-and-replace against it silently fails to match, because the text
    // on disk has \r\n where the pattern has \n. That cost most of an hour
    // today before anyone looked at the bytes.
    const before = readFileSync(resolve(ROOT, file), 'utf8')
    const crlf = (before.match(/\r\n/g) ?? []).length > before.split('\n').length / 2
    const after = crlf
      ? sourceFile.getFullText().replace(/\r?\n/g, '\r\n')
      : sourceFile.getFullText().replace(/\r\n/g, '\n')

    if (args.dryRun) {
      if (before !== after) changedFiles.push(file)
    } else {
      writeFileSync(resolve(ROOT, file), after)
      changedFiles.push(file)
    }
    filesDone++
  }

  console.log(`\n${args.dryRun ? '[dry run] ' : ''}${args.glob}`)
  console.log(`  files touched     ${changedFiles.length}`)
  console.log(`  strings wrapped   ${results.ok}`)
  if (results['already-wrapped'])
    console.log(`  already wrapped   ${results['already-wrapped']}  (safe no-op — the manifest predates the fix)`)
  if (results['not-found']) console.log(`  stale manifest    ${results['not-found']}  (re-run i18n:scan)`)
  if (results['no-component']) console.log(`  outside component ${results['no-component']}  (needs msg + a render site — human)`)
  if (results.unsupported) console.log(`  unsupported kind  ${results.unsupported}`)
  if (deferred.length) console.log(`  left for a human  ${deferred.length}`)

  if (shadowed.length) {
    console.log(`\n  A nearer binding named 't' shadows the macro at:\n`)
    for (const where of shadowed) console.log(`    ${where}`)
    console.log(`\n  Rename that parameter — otherwise the template tag resolves`)
    console.log(`  to it at runtime, and TypeScript will not tell you.`)
  }

  if (!args.dryRun && changedFiles.length) {
    const unlisted = [...new Set(changedFiles)].filter(
      (f) => !MIGRATED_PATHS.some((p) => f === p || f.startsWith(p))
    )
    if (unlisted.length) {
      console.log(`\n  Add these to MIGRATED_PATHS in scripts/i18n/config.mjs so the`)
      console.log(`  ratchet starts guarding them:\n`)
      for (const f of unlisted.slice(0, 40)) console.log(`    '${posix(f)}',`)
      if (unlisted.length > 40) console.log(`    … and ${unlisted.length - 40} more`)
    }
  }
  console.log()
}

main()
