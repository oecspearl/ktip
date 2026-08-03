#!/usr/bin/env node
/**
 * Give every component that uses `i18n` or `resolveCopy` the binding and imports
 * it needs.
 *
 *   node scripts/i18n/wire-i18n.mjs src/pages/admin/roles/AdminRolesPage.tsx …
 *   node scripts/i18n/wire-i18n.mjs --all
 *
 * The companion to apply.mjs. That one wires `t`, which it introduces itself.
 * This one wires `i18n`, which appears whenever a `msg` descriptor has to be
 * resolved at a render site — and that happens in files the codemod never
 * touched, because the descriptor was created in a DIFFERENT file. A module-scope
 * table converted in lib/permissions.ts breaks the components that print it, and
 * those components are somebody else's slice.
 *
 * Same design as apply.mjs for the same reason: identify components by name and
 * re-query after every edit, because a text edit forgets every ts-morph node
 * that was live before it.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, relative, dirname, sep } from 'node:path'
import { Project, SyntaxKind, QuoteKind } from 'ts-morph'

const ROOT = process.cwd()
const posix = (p) => p.split(sep).join('/')

const FUNCTION_KINDS = [
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionExpression,
]

function functionName(node) {
  const kind = node.getKind()
  return (
    (kind === SyntaxKind.FunctionDeclaration && node.getName?.()) ||
    node.getFirstAncestorByKind?.(SyntaxKind.VariableDeclaration)?.getName?.() ||
    null
  )
}

const isComponentName = (name) => !!name && (/^[A-Z]/.test(name) || /^use[A-Z]/.test(name))

function enclosingComponentName(node) {
  for (let n = node.getParent(); n; n = n.getParent()) {
    if (!FUNCTION_KINDS.includes(n.getKind())) continue
    const name = functionName(n)
    if (isComponentName(name)) return name
  }
  return null
}

function findComponentByName(sourceFile, name) {
  for (const kind of FUNCTION_KINDS) {
    for (const node of sourceFile.getDescendantsOfKind(kind)) {
      if (functionName(node) === name) return node
    }
  }
  return null
}

/** Components that mention `i18n` but do not bind it. */
function componentsNeedingI18n(sourceFile) {
  const names = new Set()
  for (const id of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() !== 'i18n') continue
    // Skip the binding itself and any import of the singleton.
    const parent = id.getParent()
    if (parent?.getKind() === SyntaxKind.BindingElement) continue
    if (id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) continue
    const name = enclosingComponentName(id)
    if (name) names.add(name)
  }
  return names
}

function bindsI18n(component) {
  const body = component.getBody?.()
  if (!body || body.getKind() !== SyntaxKind.Block) return true
  for (const statement of body.getStatements()) {
    if (statement.getKind() !== SyntaxKind.VariableStatement) continue
    const decl = statement
      .getDeclarations()
      .find((d) => d.getInitializer()?.getText().startsWith('useLingui('))
    if (!decl) continue
    const binding = decl.getNameNode()
    if (binding.getKind() !== SyntaxKind.ObjectBindingPattern) return true
    return /\bi18n\b/.test(binding.getText())
  }
  return false
}

/** Add `i18n` to an existing destructure, or insert the whole hook call. */
function wire(component) {
  const body = component.getBody?.()
  if (!body || body.getKind() !== SyntaxKind.Block) return false

  for (const statement of body.getStatements()) {
    if (statement.getKind() !== SyntaxKind.VariableStatement) continue
    const decl = statement
      .getDeclarations()
      .find((d) => d.getInitializer()?.getText().startsWith('useLingui('))
    if (!decl) continue
    const binding = decl.getNameNode()
    if (binding.getKind() !== SyntaxKind.ObjectBindingPattern) return false
    if (/\bi18n\b/.test(binding.getText())) return false
    binding.replaceWithText(binding.getText().replace(/\}\s*$/, ', i18n }'))
    return true
  }

  const brace = body.getFirstChildByKind(SyntaxKind.OpenBraceToken)
  if (!brace) return false
  const indent = body.getStatements()[0]?.getIndentationText() ?? `${body.getIndentationText()}  `
  component.getSourceFile().insertText(brace.getEnd(), `\n${indent}const { i18n } = useLingui()`)
  return true
}

function ensureImport(sourceFile, moduleSpecifier, names, typeOnly = false) {
  const existing = sourceFile.getImportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier)
  if (existing) {
    const already = new Set(existing.getNamedImports().map((n) => n.getName()))
    const missing = names.filter((n) => !already.has(n))
    if (missing.length) existing.addNamedImports(missing)
    return
  }
  const imports = sourceFile.getImportDeclarations()
  sourceFile.insertImportDeclaration(imports.length, {
    moduleSpecifier,
    namedImports: names,
    isTypeOnly: typeOnly,
  })
  const added = sourceFile.getImportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier)
  if (added?.getText().endsWith(';')) sourceFile.replaceText([added.getEnd() - 1, added.getEnd()], '')
}

/** Relative specifier from a file to src/i18n/copy. */
function copyPath(file) {
  const rel = posix(relative(dirname(resolve(ROOT, file)), resolve(ROOT, 'src/i18n/copy')))
  return rel.startsWith('.') ? rel : `./${rel}`
}

function main() {
  const files = process.argv.slice(2)
  if (!files.length) {
    console.error('Usage: node scripts/i18n/wire-i18n.mjs <file> [file …]')
    process.exit(1)
  }

  const project = new Project({
    tsConfigFilePath: resolve(ROOT, 'tsconfig.app.json'),
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: { quoteKind: QuoteKind.Single },
  })

  let touched = 0

  for (const file of files) {
    const sourceFile = project.addSourceFileAtPath(resolve(ROOT, file))
    const original = readFileSync(resolve(ROOT, file), 'utf8')

    const usesResolveCopy = /\bresolveCopy\s*\(/.test(original)
    const usesCopyType = /\bCopy\b/.test(original.replace(/resolveCopy/g, ''))

    // One component per pass, re-querying between each: the insertion is a text
    // edit that forgets every node found before it.
    for (const name of componentsNeedingI18n(sourceFile)) {
      const component = findComponentByName(sourceFile, name)
      if (component && !bindsI18n(component)) wire(component)
    }

    const needsHook = /useLingui\s*\(/.test(sourceFile.getFullText())
    if (needsHook) ensureImport(sourceFile, '@lingui/react/macro', ['useLingui'])
    if (usesResolveCopy) ensureImport(sourceFile, copyPath(file), ['resolveCopy'])
    if (usesCopyType && !/import type \{[^}]*\bCopy\b/.test(sourceFile.getFullText())) {
      ensureImport(sourceFile, copyPath(file), ['Copy'], true)
    }

    // Preserve the file's line endings — most of this repo is CRLF, and a
    // mixed-ending file breaks every later search-and-replace against it.
    const crlf = (original.match(/\r\n/g) ?? []).length > original.split('\n').length / 2
    const next = crlf
      ? sourceFile.getFullText().replace(/\r?\n/g, '\r\n')
      : sourceFile.getFullText().replace(/\r\n/g, '\n')

    if (next !== original) {
      writeFileSync(resolve(ROOT, file), next)
      touched++
      console.log(`  wired ${file}`)
    }
  }

  console.log(`\n[i18n:wire] ${touched} file(s) changed\n`)
}

main()
