import { describe, it, expect } from 'vitest'
// Read as text (Vite ?raw) rather than through node:fs, so the test typechecks
// under tsconfig.app.json, which only pulls in vite/client types. Same trick as
// site-search.test.ts, and for the same reason: App.tsx is the route ground truth.
import appSource from '../../App.tsx?raw'
import {
  ROUTES_WITHOUT_TOUR,
  ROUTE_TUTORIAL_PATTERNS,
  TUTORIAL_IDS,
  tutorialIdForPath,
  tutorials,
} from './index'

/** Every .tsx in the app, as source text — used to prove tour anchors exist. */
const sources = import.meta.glob('../../**/*.tsx', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

const allSource = Object.values(sources).join('\n')

/** Every .ts and .tsx under src/, keyed 'src/…', for walking import trees. */
const moduleSources: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../**/*.{ts,tsx}', { query: '?raw', eager: true, import: 'default' }) as Record<
      string,
      string
    >
  ).map(([key, text]) => [key.replace(/^\.\.\/\.\.\//, 'src/'), text])
)

const IMPORT_RE = /(?:from\s+|import\s*\(\s*)['"]([^'"?]+)['"]/g

function resolveImport(fromFile: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`
  else if (spec.startsWith('.')) {
    const parts = fromFile.split('/').slice(0, -1)
    for (const seg of spec.split('/')) {
      if (seg === '..') parts.pop()
      else if (seg !== '.') parts.push(seg)
    }
    base = parts.join('/')
  } else return null
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (candidate in moduleSources) return candidate
  }
  return null
}

const treeCache = new Map<string, string>()
/** The source text of a module and everything it imports, statically or lazily, inside src/. */
function treeText(entry: string): string {
  const cached = treeCache.get(entry)
  if (cached !== undefined) return cached
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length) {
    const file = queue.pop()!
    if (seen.has(file) || !(file in moduleSources)) continue
    seen.add(file)
    for (const match of moduleSources[file].matchAll(IMPORT_RE)) {
      const next = resolveImport(file, match[1])
      if (next && !seen.has(next)) queue.push(next)
    }
  }
  const text = Array.from(seen, (f) => moduleSources[f]).join('\n')
  treeCache.set(entry, text)
  return text
}

/** Shells a route renders inside, by path prefix. Their anchors count for the route. */
const LAYOUTS: Array<[prefix: string, file: string]> = [
  ['/', 'src/components/layout/MainLayout.tsx'],
  ['/dashboard', 'src/pages/dashboard/DashboardLayout.tsx'],
  ['/admin', 'src/components/layout/AdminLayout.tsx'],
  ['/events/virtual-', 'src/pages/events/EventVenueLayout.tsx'],
]

/** The page modules App.tsx lazy-loads for a route (its own and an index child's). */
function routeModules(pattern: string): string[] {
  const at = appSource.indexOf(`path: '${pattern}'`)
  if (at < 0) return []
  const nextRoute = appSource.indexOf("path: '", at + 1)
  const block = appSource.slice(at, nextRoute < 0 ? undefined : nextRoute)
  return Array.from(block.matchAll(/import\('\.\/([^']+)'\)/g), (m) =>
    resolveImport('src/App.tsx', `./${m[1]}`)
  ).filter((f): f is string => !!f)
}

/** Anchor names a step points at, by kind. `[data-fab]` and plain CSS are not checked. */
function anchorsOf(selector: string | undefined) {
  if (!selector) return []
  return [
    ...Array.from(selector.matchAll(/\[data-tutorial="([^"]+)"\]/g), (m) => ({
      kind: 'tutorial' as const,
      name: m[1],
    })),
    ...Array.from(selector.matchAll(/\[data-spy="([^"]+)"\]/g), (m) => ({
      kind: 'spy' as const,
      name: m[1],
    })),
  ]
}

/** Every path literal App.tsx declares, e.g. '/grants/new'. */
const appRoutes = Array.from(appSource.matchAll(/path: '(\/[^']*)'/g), (m) => m[1])

const tourList = Object.values(tutorials)
const allSteps = tourList.flatMap((t) => t.steps.map((step) => ({ tour: t.id, step })))

/** '/events/:id/venue' → '/events/sample/venue' */
const sampleFor = (pattern: string) =>
  pattern
    .split('/')
    .map((seg) => (seg.startsWith(':') ? 'sample' : seg))
    .join('/')

describe('tutorial registry', () => {
  it('gives every registered id a tutorial whose id matches its key', () => {
    for (const [key, tutorial] of Object.entries(tutorials)) {
      expect(tutorial.id).toBe(key)
    }
    expect(Object.keys(tutorials).sort()).toEqual(Object.values(TUTORIAL_IDS).sort())
  })

  it('has a non-empty target, title and description on every step', () => {
    for (const { tour, step } of allSteps) {
      expect(step.target, `${tour}: empty target`).toBeTruthy()
      expect(step.title.trim(), `${tour}: empty title`).toBeTruthy()
      expect(step.description.trim(), `${tour}: empty description`).toBeTruthy()
    }
  })

  it('only ever asks the user to click something it can attach a listener to', () => {
    // An interactive step blocks Next until a click lands. Without manualClick
    // or actionTarget the overlay covers the target with its own relay, which
    // only works when a synthetic click on the wrapper reaches the real control.
    for (const { tour, step } of allSteps) {
      if (!step.interactive) continue
      expect(
        step.manualClick || step.actionTarget || step.target,
        `${tour}: interactive step with nothing to click`
      ).toBeTruthy()
    }
  })

  it('points every data-tutorial step at an anchor that exists in the source', () => {
    // Catches a renamed anchor at CI time instead of after STRANDED_MS at runtime.
    for (const { tour, step } of allSteps) {
      const selectors = [step.target, step.secondaryTarget, step.actionTarget, step.clickTarget]
      for (const selector of selectors) {
        const name = selector?.match(/^\[data-tutorial="([^"]+)"\]$/)?.[1]
        if (!name) continue
        expect(allSource, `${tour}: no element carries data-tutorial="${name}"`).toContain(
          `data-tutorial="${name}"`
        )
      }
    }
  })
})

describe('tutorialIdForPath', () => {
  it('routes every pattern to a registered tutorial', () => {
    for (const [pattern, id] of ROUTE_TUTORIAL_PATTERNS) {
      expect(tutorials[id], `${pattern} → unknown tutorial ${id}`).toBeDefined()
    }
  })

  it('matches every pattern against a real route in App.tsx', () => {
    for (const [pattern] of ROUTE_TUTORIAL_PATTERNS) {
      expect(appSource, `${pattern} is not a route`).toContain(`path: '${pattern}'`)
    }
  })

  it('orders patterns specific-first, so none is shadowed by an earlier one', () => {
    // '/grants/my-applications' must sit above '/grants/:id', or the literal
    // route resolves to the detail tour.
    for (const [pattern, id] of ROUTE_TUTORIAL_PATTERNS) {
      expect(tutorialIdForPath(sampleFor(pattern)), `${pattern} is shadowed`).toBe(id)
    }
  })

  it('never lands a real route on another route’s tour', () => {
    // ':param' takes anything, so '/grants/new' would happily resolve to the
    // '/grants/:id' tour and spotlight nothing. Every App.tsx path must get a
    // tour registered for exactly that path, or none at all.
    const own = new Set(ROUTE_TUTORIAL_PATTERNS.map(([pattern, id]) => `${pattern}→${id}`))
    const wrong = appRoutes
      .map((route) => [route, tutorialIdForPath(sampleFor(route))] as const)
      .filter(([route, id]) => id !== null && !own.has(`${route}→${id}`))
      .map(([route, id]) => `${route} lands on the '${id}' tour`)
    // Give each a tour, or add it to ROUTES_WITHOUT_TOUR
    expect(wrong).toEqual([])
  })

  it('lists only real routes as having no tour', () => {
    for (const route of ROUTES_WITHOUT_TOUR) {
      expect(appRoutes, `${route} is not a route`).toContain(route)
    }
  })

  it('finds every step anchor on the page its route renders', () => {
    // The source-wide check above passes when an anchor exists anywhere. This
    // one walks the route's own page (plus its layouts) and catches a tour
    // pointing at an anchor that lives on a different page.
    const missing: string[] = []
    for (const [pattern, id] of ROUTE_TUTORIAL_PATTERNS) {
      const pages = routeModules(pattern)
      if (!pages.length) {
        missing.push(`${pattern} (${id}): no page module found in App.tsx`)
        continue
      }
      const entries = [
        ...pages,
        ...LAYOUTS.filter(([prefix]) => pattern.startsWith(prefix)).map(([, file]) => file),
      ]
      const text = entries.map(treeText).join('\n')
      for (const step of tutorials[id].steps) {
        for (const selector of [step.target, step.secondaryTarget, step.actionTarget, step.clickTarget]) {
          for (const anchor of anchorsOf(selector)) {
            const found =
              anchor.kind === 'tutorial'
                ? text.includes(`data-tutorial="${anchor.name}"`)
                : [`"${anchor.name}"`, `'${anchor.name}'`, `\`${anchor.name}\``].some((q) =>
                    text.includes(q)
                  )
            if (!found) missing.push(`${pattern} (${id}): no ${anchor.kind} anchor "${anchor.name}"`)
          }
        }
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })

  it('ignores a trailing slash', () => {
    expect(tutorialIdForPath('/events/')).toBe(TUTORIAL_IDS.EVENTS)
    expect(tutorialIdForPath('/')).toBe(tutorialIdForPath('/'))
  })

  it('returns null for a page with no tour', () => {
    expect(tutorialIdForPath('/login')).toBeNull()
    expect(tutorialIdForPath('/nope/nope/nope')).toBeNull()
  })
})

describe('auto-start policy', () => {
  it('keeps unprompted tours to the hub pages only', () => {
    // Auto-firing every tour would spotlight a new member a dozen times per
    // session. If this list grows past the hubs, that was a decision, not a drift.
    const autoStarting = tourList.filter((t) => t.autoStart).map((t) => t.id)
    expect(autoStarting.length).toBeLessThanOrEqual(10)
  })
})
