import { describe, it, expect } from 'vitest'
// Read as text (Vite ?raw) rather than through node:fs, so the test typechecks
// under tsconfig.app.json, which only pulls in vite/client types. Same trick as
// site-search.test.ts, and for the same reason: App.tsx is the route ground truth.
import appSource from '../../App.tsx?raw'
import { ROUTE_TUTORIAL_PATTERNS, TUTORIAL_IDS, tutorialIdForPath, tutorials } from './index'

/** Every .tsx in the app, as source text — used to prove tour anchors exist. */
const sources = import.meta.glob('../../**/*.tsx', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

const allSource = Object.values(sources).join('\n')

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
