import { describe, expect, it } from 'vitest'
// Read as text (Vite ?raw) rather than through node:fs, so this typechecks under
// tsconfig.app.json, which only pulls in vite/client types.
import appCss from '../../../index.css?raw'
import consoleCss from './index.css?raw'

/**
 * Guards the one invariant the admin error console must never break: the
 * shadcn/ReUI styling applies to /admin/errors and nowhere else.
 *
 * This is enforced by a test rather than by convention because `shadcn init`
 * and `shadcn add` both actively try to break it — they write token values to
 * `:root`, add a second `@custom-variant dark`, override `--font-sans`, and
 * `@apply` shadcn surfaces onto `body` and `*`. Each of those restyles the whole
 * application, and the damage is easy to miss in review.
 */

/** Source of every file under src/, keyed by path. */
const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const CONSOLE_DIR = '/src/pages/admin/errors/'
const outsideConsole = Object.entries(sources).filter(
  ([path]) => !path.startsWith(CONSOLE_DIR) && !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'),
)

/** Strips comments so prose about a rule is not mistaken for the rule. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('global stylesheet stays free of shadcn tokens', () => {
  const css = stripComments(appCss)

  it('pulls the console stylesheet in exactly once', () => {
    const imports = css.match(/@import\s+["']\.\/pages\/admin\/errors\/index\.css["']/g) ?? []
    expect(imports).toHaveLength(1)
  })

  it('declares no shadcn token values of its own', () => {
    // The values belong on .errors-console. At :root they would theme the app.
    for (const token of ['--background', '--foreground', '--card', '--popover', '--muted', '--accent']) {
      expect(css, `${token} must not be declared globally`).not.toMatch(
        new RegExp(`^\\s*${token}\\s*:`, 'm'),
      )
    }
  })

  it('does not let shadcn own the base layer', () => {
    // `shadcn init` adds these; they recolour every surface and border.
    expect(css).not.toMatch(/@apply[^;]*\bbg-background\b/)
    expect(css).not.toMatch(/@apply[^;]*\bborder-border\b/)
    expect(css).not.toMatch(/@apply[^;]*\btext-foreground\b/)
  })

  it('keeps KTIP typography', () => {
    expect(css).toMatch(/--font-sans:\s*'Mulish'/)
    expect(css).not.toMatch(/Figtree|Roboto Slab/)
  })

  it('defines the dark variant exactly once', () => {
    // A second `@custom-variant dark` from the CLI silently changes which
    // elements `dark:` matches.
    const variants = css.match(/@custom-variant\s+dark\b/g) ?? []
    expect(variants).toHaveLength(1)
  })
})

describe('console stylesheet scopes its own tokens', () => {
  const css = stripComments(consoleCss)

  it('declares token values only inside .errors-console', () => {
    const scoped = css.slice(css.indexOf('.errors-console'))
    for (const token of ['--background', '--foreground', '--border', '--input', '--ring', '--radius']) {
      expect(css, `${token} must be declared`).toMatch(new RegExp(`${token}\\s*:`))
      expect(scoped, `${token} must sit inside .errors-console`).toMatch(
        new RegExp(`${token}\\s*:`),
      )
    }
  })

  it('never declares tokens at :root or on .dark', () => {
    // Either selector is global, no matter which directory the file lives in.
    expect(css).not.toMatch(/(^|\})\s*:root\s*\{/)
    expect(css).not.toMatch(/(^|\})\s*\.dark\s*\{/)
  })

  it('registers token names without giving them global values', () => {
    // @theme inline maps --color-* onto var(--*); the var() must stay undefined
    // at this level so the utilities are inert outside the container.
    expect(css).toMatch(/@theme inline\s*\{/)
    expect(css).toMatch(/--color-background:\s*var\(--background\)/)
  })

  it('does not redefine the dark variant', () => {
    expect(css).not.toMatch(/@custom-variant\s+dark\b/)
  })
})

describe('no other part of the app depends on the console UI', () => {
  it('nothing outside the console imports its vendored components', () => {
    const offenders = outsideConsole
      .filter(([, source]) => /pages\/admin\/errors\/ui|components\/reui/.test(source))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('nothing outside the console uses the shadcn semantic utilities', () => {
    // These resolve to var(--background) etc., which are only defined inside
    // .errors-console — so using them elsewhere yields an unstyled element.
    const classes = [
      'bg-background',
      'text-foreground',
      'text-muted-foreground',
      'border-input',
      'bg-card',
      'bg-popover',
      'ring-ring',
    ]
    const pattern = new RegExp(`\\b(${classes.join('|')})\\b`)
    const offenders = outsideConsole
      .filter(([, source]) => pattern.test(source))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
