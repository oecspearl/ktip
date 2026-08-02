import { describe, expect, it } from 'vitest'
// Read as text (Vite ?raw) rather than through node:fs, so this typechecks
// under tsconfig.app.json, which only pulls in vite/client types.
import appCss from '../index.css?raw'

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
 * Ratchet baselines, measured 2026-08-02, lowered through phase 3. Lower these as each phase lands;
 * every one becomes 0 at the end of the migration. A raised number is a
 * regression, not a new baseline.
 */
const BASELINE = {
  /** Arbitrary font sizes: text-[10px], text-[0.6875rem], text-[0.75em]… */
  rawTextSize: 183,
  /**
   * Hand-picked z-index instead of a semantic layer token.
   *
   * Every arbitrary value is gone; what remains is z-0/10/20 used for local
   * stacking INSIDE a component that already opens its own context, where a
   * global layer name would say less than the number does.
   */
  rawZIndex: 40,
  /** The copied `max-w-[calc(50vw+Nrem)]` page container. */
  rawContainer: 0,
  /** Pre-container-token page widths: max-w-3xl, max-w-7xl… */
  legacyMaxWidth: 57,
  /**
   * Pixel-literal lucide icon sizes, immune to both the ramps and a11y scale.
   *
   * Recorded but NOT enforced — see the skipped assertion below.
   */
  iconSizeProp: 1292,
  /** 100vh is taller than the visible viewport on mobile; 100svh is not. */
  fullViewportHeight: 1,
  /** Fixed widths at or above 400px — these force horizontal page scroll. */
  wideFixedWidth: 5,
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

  // Deliberately not enforced yet. A ratchet only works when the better option
  // exists, and `size={16}` is still the only way to size a lucide icon until
  // the icon phase swaps them for the size-icon-* utilities. Enforcing it now
  // just fails the suite every time anyone builds a feature, which trains
  // people to raise the number — the exact habit a ratchet is meant to prevent.
  // Re-enable (as `it`) the moment that phase lands; the swap takes the count
  // to zero in one pass, so there is no intermediate baseline worth defending.
  it.skip('does not add pixel-literal icon sizes', () => {
    expect(countOf(/size=\{[0-9]+\}/g)).toBeLessThanOrEqual(BASELINE.iconSizeProp)
  })

  it('does not add 100vh heights', () => {
    // Mobile browser chrome overlays the bottom of a 100vh box, so the last row
    // of content sits under the URL bar. 100svh measures the visible viewport.
    expect(countOf(/\b100vh\b/g)).toBeLessThanOrEqual(BASELINE.fullViewportHeight)
  })

  it('does not add unconditional min-widths that overflow a phone', () => {
    // Only `min-w-` forces a box wider than the viewport; `max-w-` is a cap and
    // can never overflow. A variant prefix (`sm:min-w-…`) does not apply at
    // phone widths, so it cannot either — the first audit counted all three
    // and reported eight phone-breaking widths where there were none.
    //
    // What is left are data tables that genuinely need a minimum measure. They
    // are correct as long as an ancestor scrolls, which a static regex cannot
    // see; the real check is the page-overflow readout in pages/design, which
    // measures scrollWidth against clientWidth in a live frame at each width.
    const wide = findAll(/(?<![\w:-])min-w-\[([0-9.]+)(px|rem)\]/g).filter((hit) => {
      const [, value, unit] = /([0-9.]+)(px|rem)/.exec(hit.match)!
      return (unit === 'rem' ? Number(value) * 16 : Number(value)) >= 400
    })
    expect(wide.length).toBeLessThanOrEqual(BASELINE.wideFixedWidth)
  })
})

describe('the scale ramps survive the build', () => {
  /** Strips comments so prose about a rule is not mistaken for the rule. */
  const css = appCss.replace(/\/\*[\s\S]*?\*\//g, '')

  it('declares all three ramps', () => {
    for (const ramp of ['--scale-display', '--scale-layout', '--scale-text']) {
      expect(css, `${ramp} must be declared`).toMatch(new RegExp(`${ramp}\\s*:`))
    }
  })

  it('rescales the global spacing unit off the layout ramp', () => {
    // This one line is what makes every bare-numeric p-*/gap-*/w-* responsive.
    expect(css).toMatch(/--spacing:\s*calc\(0\.25rem \* var\(--scale-layout\)\)/)
  })

  it('steps the ramps by media query, not by clamp()', () => {
    // Per-property clamp() gives each property its own curve and the layout
    // drifts out of proportion; see hooks/useViewportScale.ts.
    const rampBlock = css.slice(css.indexOf('--scale-display'))
    expect(rampBlock).not.toMatch(/--scale-(display|layout|text):\s*clamp\(/)
    expect(css).toMatch(/@media \(min-width: 90rem\)/)
  })

  it('never overrides the Tailwind breakpoints', () => {
    // Those are inlined at build time; making one dynamic silently freezes
    // every sm:/md:/lg: class and the --nav-h query at its authored value.
    expect(css).not.toMatch(/--breakpoint-/)
  })

  it('resets the ramps for print and the vendored console', () => {
    for (const selector of ['.resume-sheet', '.errors-console']) {
      const block = css.slice(css.indexOf(selector))
      expect(block, `${selector} must pin --spacing`).toMatch(/--spacing:\s*0\.25rem/)
    }
    expect(css).toMatch(/@media print[\s\S]{0,300}--scale-layout:\s*1/)
  })

  it('pins the 13px type floor literally', () => {
    // Written as 0.8125rem rather than a computed value precisely so that the
    // floor can be read off the stylesheet instead of derived. This is the
    // reason the ramps normalise at 1440 and not at the 2560 design target.
    expect(css).toMatch(/--text-micro:\s*calc\(0\.8125rem \* var\(--scale-text\)\)/)
  })

  it('drives every type token from a ramp, never a frozen number', () => {
    const declarations = css.match(/--text-(?!shadow)[a-z-]+:\s*[^;]+;/g) ?? []
    // The --*--line-height / --*--letter-spacing companions are plain numbers.
    const sizes = declarations.filter((d) => !/--(line-height|letter-spacing):/.test(d))
    expect(sizes.length).toBeGreaterThanOrEqual(12)
    for (const declaration of sizes) {
      expect(declaration, `${declaration} must reference a ramp`).toMatch(/var\(--scale-/)
    }
  })

  it('floors the touch targets on a coarse pointer', () => {
    // 44px minimum hit area. --scale-layout is 0.88 on a phone, so the
    // computed control height would otherwise land at 42.2px.
    expect(css).toMatch(/@media \(pointer: coarse\)[\s\S]{0,220}--spacing-control-md:\s*2\.75rem/)
    // any-pointer would match a touchscreen laptop being driven by a mouse.
    expect(css).not.toMatch(/any-pointer: coarse/)
  })

  it('keeps the ramps out of @theme', () => {
    // @theme tree-shakes unused variables and @theme inline resolves var() at
    // build time — either one would freeze the ramp at a single value.
    const theme = css.slice(css.indexOf('@theme'), css.indexOf('@layer base'))
    expect(theme).not.toMatch(/--scale-(display|layout|text)\s*:/)
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
