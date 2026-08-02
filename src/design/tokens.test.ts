import { describe, expect, it } from 'vitest'

/**
 * The design-token ratchet.
 *
 * The app sizes everything with hand-typed Tailwind classes: 42 distinct type
 * sizes across four unit systems, 19 z-index values, six page-container widths
 * copied by hand, and over a thousand pixel-literal icon sizes. The migration
 * to `--text-*` / `--spacing-*` / `--z-index-*` / `--container-*` tokens runs
 * over many phases, so the counts below cannot go to zero in one step.
 *
 * What they can do is never rise. Each phase lowers a baseline; nothing may
 * push one back up. This is enforced by a test rather than by review because
 * review already failed once: the venue subsystem (30 components) landed after
 * the audit that motivated this work and on its own nearly doubled the number
 * of sub-13px labels in the codebase.
 *
 * Modelled on pages/admin/errors/scoping.test.ts, which reads every source file
 * the same way. `css: true` in vitest.config.ts is what makes `?raw` imports
 * return real text instead of an empty stub.
 */

/** Source of every file under src/, keyed by path with forward slashes. */
const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Directories the token system deliberately does not govern.
 *
 * - resume/  renders a physical 210×296mm sheet. Its `pt` sizes and `mm`
 *   lengths are correct; rem would make a printed CV depend on window width.
 * - admin/errors/  is vendored shadcn/ReUI authored against stock Tailwind and
 *   scoped by pages/admin/errors/scoping.test.ts.
 */
const EXEMPT_DIRS = [/^\/src\/components\/resume\//, /^\/src\/pages\/admin\/errors\//]

const isTest = (path: string) => path.endsWith('.test.ts') || path.endsWith('.test.tsx')

const app = Object.entries(sources).filter(
  ([path]) => !isTest(path) && !EXEMPT_DIRS.some((dir) => dir.test(path)),
)

/** Every match of `pattern` across the governed files, with its file path. */
function findAll(pattern: RegExp): Array<{ path: string; match: string }> {
  const hits: Array<{ path: string; match: string }> = []
  for (const [path, source] of app) {
    for (const match of source.match(pattern) ?? []) hits.push({ path, match })
  }
  return hits
}

const countOf = (pattern: RegExp) => findAll(pattern).length

/**
 * Ratchet baselines, measured 2026-08-02. Lower these as each phase lands;
 * every one becomes 0 at the end of the migration. A raised number is a
 * regression, not a new baseline.
 */
const BASELINE = {
  /** Arbitrary font sizes: text-[10px], text-[0.6875rem], text-[0.75em]… */
  rawTextSize: 183,
  /** Hand-picked z-index instead of a semantic layer token. */
  rawZIndex: 76,
  /** The copied `max-w-[calc(50vw+Nrem)]` page container. */
  rawContainer: 63,
  /** Pre-container-token page widths: max-w-3xl, max-w-7xl… */
  legacyMaxWidth: 57,
  /** Pixel-literal lucide icon sizes, immune to both the ramps and a11y scale. */
  iconSizeProp: 1284,
  /** 100vh is taller than the visible viewport on mobile; 100svh is not. */
  fullViewportHeight: 13,
  /** Fixed widths at or above 400px — these force horizontal page scroll. */
  wideFixedWidth: 8,
} as const

describe('design token ratchet', () => {
  it('does not add arbitrary font sizes', () => {
    expect(countOf(/text-\[[0-9.]+(?:px|pt|rem|em|vw)\]/g)).toBeLessThanOrEqual(
      BASELINE.rawTextSize,
    )
  })

  it('does not add hand-picked z-index values', () => {
    expect(countOf(/z-(?:\[[0-9]+\]|0|10|15|20|30|40|50)(?![a-z0-9-])/g)).toBeLessThanOrEqual(
      BASELINE.rawZIndex,
    )
  })

  it('does not add hand-rolled page containers', () => {
    expect(countOf(/max-w-\[calc\(50vw\+[0-9.]+rem\)\]/g)).toBeLessThanOrEqual(
      BASELINE.rawContainer,
    )
  })

  it('does not add legacy page widths', () => {
    expect(countOf(/max-w-[0-9]?xl(?![a-z0-9-])/g)).toBeLessThanOrEqual(BASELINE.legacyMaxWidth)
  })

  it('does not add pixel-literal icon sizes', () => {
    expect(countOf(/size=\{[0-9]+\}/g)).toBeLessThanOrEqual(BASELINE.iconSizeProp)
  })

  it('does not add 100vh heights', () => {
    // Mobile browser chrome overlays the bottom of a 100vh box, so the last row
    // of content sits under the URL bar. 100svh measures the visible viewport.
    expect(countOf(/\b100vh\b/g)).toBeLessThanOrEqual(BASELINE.fullViewportHeight)
  })

  it('does not add fixed widths that overflow a phone', () => {
    const wide = findAll(/\b(?:min-)?w-\[([0-9.]+)(px|rem)\]/g).filter((hit) => {
      const [, value, unit] = /([0-9.]+)(px|rem)/.exec(hit.match)!
      return (unit === 'rem' ? Number(value) * 16 : Number(value)) >= 400
    })
    expect(wide.length).toBeLessThanOrEqual(BASELINE.wideFixedWidth)
  })
})

describe('class strings stay unambiguous', () => {
  it('never puts two unconditional max-w utilities in one class string', () => {
    // A literal class string never reaches cn(), so tailwind-merge cannot
    // deduplicate it and both widths land on the element. Which one wins is
    // then decided by CSS source order — and Tailwind emits arbitrary values
    // after named ones, so `max-w-[calc(50vw+48rem)] … max-w-3xl` silently
    // renders wide and the narrower width the author asked for is dead.
    //
    // Variants are not conflicts: `max-w-4xl print:max-w-none` is two rules
    // that apply at different times, so only unprefixed tokens are counted.
    const offenders: string[] = []
    for (const [path, source] of app) {
      for (const [, classes] of source.matchAll(/class(?:Name)?="([^"]*)"/g)) {
        const unconditional = classes
          .split(/\s+/)
          .filter((token) => token.startsWith('max-w-'))
        if (unconditional.length > 1) offenders.push(path)
      }
    }
    expect([...new Set(offenders)]).toEqual([])
  })
})
