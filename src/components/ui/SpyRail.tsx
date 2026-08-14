import { useEffect, useState, type CSSProperties } from 'react'
import { cn } from '../../lib/utils'
import { useSpySteps } from '../../hooks/useSpySteps'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useLingui } from '@lingui/react/macro'

/**
 * Scrollspy rail — the page-scroll affordance that replaced the old
 * `#overlay-scrollbar` thumb. A fixed dash column on the right edge, one dash
 * per section; the dash for the section nearest the viewport centre widens and
 * takes the accent, its label slides in, and a click scrolls there.
 *
 * Mounted once in MainLayout. Steps come from `data-spy` markers in the page
 * (see useSpySteps), so it self-hides on pages that declare fewer than two —
 * editors, venue rooms and the auth screens get no rail and need no opt-out.
 * A band marked `data-spy-hide` (Discover's full-bleed hero) keeps the rail
 * faded out while it is the active step, so it never sits over the artwork.
 * Pages that do declare two but want no rail — the listings, where the steps
 * would be "the filter bar" and "the grid" — carry `data-spy-off`, and a
 * single section can drop off the rail with `data-spy-skip`; both keep the
 * marker itself, which the tutorials use as an anchor.
 *
 * Sections should carry `scroll-mt-24` so the click target lands below the
 * fixed navbar.
 */

/**
 * Distance from the top of the document to `el`, in static layout coordinates.
 *
 * Deliberately not `getBoundingClientRect().top + scrollY`: DiscoverPage's hero
 * is `sticky top-0 h-screen`, so its rect stays pinned to the viewport and its
 * centre would sit exactly on the viewport centre at every scroll position —
 * winning the nearest-centre test forever. The offsetParent chain reports where
 * the element *lives*, which is what the rail should track.
 */
function layoutTop(el: HTMLElement): number {
  let top = 0
  let node: HTMLElement | null = el
  while (node) {
    top += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return top
}

export function SpyRail({
  /** Override the active/hover colour; defaults to the brand green ramp. */
  accent,
}: {
  accent?: string
} = {}) {
  const { t } = useLingui()
  /**
   * The rail is `hidden sm:flex`, so below 640px it is not painted — but the
   * effect below is not conditional on that, and it was the most expensive
   * thing running during a phone scroll: once per frame, for every step, a
   * `getElementById` plus a `layoutTop()` walk up the offsetParent chain plus
   * an `offsetHeight` read. All of them force layout, all of them to light a
   * dash nobody can see. `useSpySteps` adds a subtree MutationObserver over
   * the whole <main> on top.
   *
   * Gated on the same 640px boundary as the class, so the two cannot drift.
   */
  const visible = useMediaQuery('(min-width: 640px)')
  const steps = useSpySteps()
  const [active, setActive] = useState('')

  useEffect(() => {
    if (!visible) return
    // Active = the section whose centre is nearest the viewport centre. Driven
    // by scroll rather than IntersectionObserver so the right dash is lit on
    // first paint — an observer only fires once a section *crosses*, leaving
    // nothing active on load. rAF-throttled to one measure per frame.
    let raf = 0
    const measure = () => {
      raf = 0
      const mid = window.scrollY + window.innerHeight / 2
      let best = steps[0]?.id ?? ''
      let bestDist = Infinity
      for (const s of steps) {
        const el = document.getElementById(s.id)
        if (!el) continue
        const dist = Math.abs(layoutTop(el) + el.offsetHeight / 2 - mid)
        if (dist < bestDist) {
          bestDist = dist
          best = s.id
        }
      }
      setActive(best)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [steps, visible])

  if (!visible) return null
  if (steps.length <= 1) return null

  // Hero bands opt out of showing the rail at all; the dashes still track, they
  // just fade in once the reader is past the artwork. Falling back to steps[0]
  // (not `false`) matters for the first paint, before measure() has run: on
  // Discover that is the hero, so the rail never flashes over it.
  const hidden = (steps.find((s) => s.id === active) ?? steps[0]).hide

  const jump = (id: string) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <nav
      aria-label={t`Page sections`}
      data-spy-rail
      style={{ '--rail-accent': accent ?? 'var(--color-ktip-tropical-600)' } as CSSProperties}
      className={cn(
        'fixed right-3 top-1/2 z-rail hidden -translate-y-1/2 flex-col items-end gap-3 transition-opacity duration-300 sm:flex lg:right-6 lg:gap-3.5',
        hidden ? 'pointer-events-none opacity-0' : 'opacity-100',
      )}
    >
      {steps.map((s) => {
        const on = active === s.id
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            aria-current={on ? 'true' : undefined}
            className="group/item flex origin-right items-center justify-end gap-2.5 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.25]"
            title={s.label}
          >
            <span
              className={cn(
                // rounded-lg to match Button's sm size, not a pill
                'whitespace-nowrap rounded-lg bg-ktip-cream/90 px-2 py-0.5 text-[11px] font-medium text-ktip-sand-800 shadow-soft backdrop-blur transition-all duration-200 ease-out',
                on
                  ? 'opacity-100'
                  : 'translate-x-2 opacity-0 group-hover/item:translate-x-0 group-hover/item:opacity-100',
              )}
            >
              {s.label}
            </span>
            <span
              className={cn(
                'h-[3px] rounded-full transition-all duration-300 ease-out',
                on
                  ? 'w-7 bg-[var(--rail-accent)]'
                  : 'w-4 bg-ktip-sand-400/60 group-hover/item:w-6 group-hover/item:bg-[var(--rail-accent)]',
              )}
            />
          </button>
        )
      })}
    </nav>
  )
}
