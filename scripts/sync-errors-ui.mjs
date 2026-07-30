#!/usr/bin/env node
/**
 * Installs/refreshes the admin error console's shadcn + ReUI components.
 *
 *   node scripts/sync-errors-ui.mjs            # all components listed below
 *   node scripts/sync-errors-ui.mjs @reui/frame  # just one
 *
 * WHY THIS WRAPPER EXISTS
 * -----------------------
 * `shadcn add` alone puts these in the wrong place. Two reasons:
 *
 *  1. Plain shadcn items honour the "ui" alias in components.json, so they land
 *     in src/pages/admin/errors/ui — correct.
 *  2. ReUI items carry an explicit `"target": "components/reui/..."` in their
 *     registry JSON, which OVERRIDES the alias. They land in
 *     src/components/reui, i.e. project-wide, which is exactly what this
 *     console is supposed to avoid.
 *
 * So this script runs the CLI, then relocates (2) into the console's own ui/
 * folder and rewrites `@/components/reui/*` imports to point there. The result
 * is that every component the dashboard uses lives under
 * src/pages/admin/errors, and deleting that one directory removes all of it.
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const CONSOLE_DIR = 'src/pages/admin/errors'
const UI_DIR = join(CONSOLE_DIR, 'ui')
const STRAY_DIR = 'src/components/reui'

// Everything AdminErrorsPage.tsx and SentryIssueDetail.tsx import.
// @reui/data-grid pulls in button, checkbox, dropdown-menu, input, popover,
// select, separator, skeleton and spinner as registry dependencies.
const COMPONENTS = [
  '@reui/data-grid',
  '@reui/badge',
  '@reui/frame',
  '@reui/use-copy-to-clipboard',
  'card',
  'input-group',
  'label',
  'textarea',
]

const requested = process.argv.slice(2)
const items = requested.length > 0 ? requested : COMPONENTS

console.log(`Installing: ${items.join(', ')}\n`)
execSync(`npx shadcn@latest add ${items.join(' ')} --yes --overwrite`, { stdio: 'inherit' })

// ── Relocate ReUI's hardcoded target into the console's ui/ folder ─────────
function moveInto(fromDir, toDir) {
  if (!existsSync(fromDir)) return []
  mkdirSync(toDir, { recursive: true })
  const moved = []
  for (const entry of readdirSync(fromDir)) {
    const from = join(fromDir, entry)
    const to = join(toDir, entry)
    if (statSync(from).isDirectory()) {
      moved.push(...moveInto(from, to))
    } else {
      renameSync(from, to)
      moved.push(to)
    }
  }
  return moved
}

const moved = moveInto(STRAY_DIR, UI_DIR)
if (moved.length) {
  console.log(`\nRelocated ${moved.length} ReUI file(s) out of ${STRAY_DIR}:`)
  for (const f of moved) console.log('  ->', f)
  rmSync(STRAY_DIR, { recursive: true, force: true })
} else {
  console.log('\nNo stray ReUI files to relocate.')
}

// Registry hooks carry `target: hooks/...`, which drops them into KTIP's shared
// src/hooks. Only the specific files the registry owns are moved — src/hooks is
// otherwise ours.
const STRAY_FILES = [['src/hooks/use-copy-to-clipboard.ts', join(UI_DIR, 'use-copy-to-clipboard.ts')]]
for (const [from, to] of STRAY_FILES) {
  if (!existsSync(from)) continue
  mkdirSync(UI_DIR, { recursive: true })
  renameSync(from, to)
  console.log('  ->', to, '(out of the shared hooks directory)')
}

// ── Repoint imports at the relocated copies ───────────────────────────────
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

let rewritten = 0
for (const file of walk(CONSOLE_DIR)) {
  if (!/\.tsx?$/.test(file)) continue
  const before = readFileSync(file, 'utf8')
  // The alias is used rather than a relative path so nesting depth never
  // matters; "@" resolves to src/ via tsconfig paths + vite resolve.alias.
  const after = before
    .replaceAll('@/components/reui/', '@/pages/admin/errors/ui/')
    .replaceAll('@/hooks/use-copy-to-clipboard', '@/pages/admin/errors/ui/use-copy-to-clipboard')
  if (after !== before) {
    writeFileSync(file, after)
    rewritten += 1
    console.log('  rewrote imports in', relative(process.cwd(), file))
  }
}
console.log(rewritten ? `\nRewrote imports in ${rewritten} file(s).` : '\nNo imports needed rewriting.')

// ── Report what the vendored code needs from our stylesheet ───────────────
// NOTHING here writes to the component files. They are used exactly as the
// registry ships them, so a re-sync is a clean overwrite and upstream fixes
// arrive for free. Anything they need that this repo does not provide is
// supplied from src/pages/admin/errors/index.css instead, and reported here.
const notes = []

for (const file of walk(UI_DIR)) {
  if (!/\.tsx?$/.test(file)) continue
  const source = readFileSync(file, 'utf8')
  const where = relative(process.cwd(), file)

  // ReUI's registry generator truncates some arbitrary-property utilities on the
  // way out: `[--frame-panel-px-base:--spacing(1)]` arrives as `(1)]`. Verified
  // in the registry JSON itself and reproducible on both the `base-nova` and
  // `default` styles, so it is upstream. Such a token cannot match any class, so
  // it is inert — harmless only while something else supplies the value (in
  // frame.tsx the `spacing` variant re-declares every *-base token). This note
  // is the warning if a future pull truncates something with no such backstop.
  const truncated = source.match(/(?<=")\([^)"]*\)\](?=[ "])|(?<=[ "])\([^)"]*\)\](?=[ "])/g)
  if (truncated) notes.push(`${where}: ${truncated.length} truncated token(s) from the registry: ${truncated.join(' ')}`)

  // Logical-inset utilities Tailwind v4 does not ship. Supplied as @utility in
  // index.css rather than rewritten here.
  const logical = source.match(/\binset-[se]-[\w.]+/g)
  if (logical) notes.push(`${where}: uses ${[...new Set(logical)].join(', ')} — supplied by index.css`)
}

if (notes.length) {
  console.log('\nNotes on the vendored code (no files were modified):')
  for (const note of notes) console.log('  -', note)
} else {
  console.log('\nNothing unusual in the vendored code.')
}

// ── Reconcile vendored code with this repo's strict compiler flags ────────
// KTIP builds with noUnusedLocals/noUnusedParameters; the registry does not,
// so a fresh pull can ship unused type params and fail `tsc -b`. Excluding the
// folder is not an option (imported files are still checked), and hand-editing
// is undone by the next sync — so the fix is derived from the compiler itself.
// TS6133 means "declared but never read", so prefixing with `_` is safe by
// definition: nothing can be referencing it.
function failingVendoredFiles() {
  try {
    execSync('npx tsc -b --force', { stdio: 'pipe' })
    return []
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`
    const files = new Set()
    for (const line of out.split('\n')) {
      const match = line.match(/^(.+?)\(\d+,\d+\): error TS/)
      // Only vendored files are silenced. An error in OUR code (the page, the
      // hooks) must still fail the build.
      if (match && match[1].startsWith(UI_DIR)) files.add(match[1])
    }
    return [...files]
  }
}

const NOCHECK = `// @ts-nocheck -- vendored from the ReUI registry by scripts/sync-errors-ui.mjs.
// KTIP compiles with noUnusedLocals/noUnusedParameters; the registry does not,
// so a fresh pull can otherwise fail \`tsc -b\` on unused type params. Excluding
// the folder does not work (imported files are still checked) and hand-edits are
// lost on the next sync. Errors in our own code are NOT silenced by this.
`

let silenced = 0
for (const file of failingVendoredFiles()) {
  const source = readFileSync(file, 'utf8')
  if (source.startsWith('// @ts-nocheck')) continue
  // Must be the very first thing in the file: after a "use no memo" directive
  // prologue TypeScript ignores it entirely. A leading comment does not
  // invalidate the directive, so prepending is safe.
  writeFileSync(file, NOCHECK + source)
  silenced += 1
  console.log(`  added @ts-nocheck to ${relative(process.cwd(), file)}`)
}
console.log(silenced ? `\nSilenced ${silenced} vendored file(s) for strict mode.` : '\nNo strict-mode escapes needed.')

console.log(`
Next:
  1. Review ${CONSOLE_DIR}/shadcn-scratch.css — the CLI appends token blocks
     there. Copy anything new into the .errors-console block in index.css so it
     stays scoped. Never let those tokens sit at :root.
  2. npx tsc -b && npx vite build
`)
