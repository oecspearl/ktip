import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'

export interface SpyStep {
  id: string
  label: string
  /** From `data-spy-hide`: the rail stays hidden while this step is the active
   *  one. Used on full-bleed heroes, where the rail would sit over artwork. */
  hide: boolean
}

/** Root the scan is scoped to — the <main> in MainLayout. */
const ROOT_ID = 'main-content'

/**
 * Rail steps derived from the DOM instead of a per-page array: any element
 * inside <main> carrying `data-spy="Label"` becomes a step, in document order.
 * Adding `data-spy-hide` marks a band the rail should stay hidden over.
 *
 * Pages opt in with one attribute per section, so there is nothing to import
 * and nothing to keep in sync. Elements without an `id` get `spy-<n>` assigned
 * so the rail has a scroll target.
 *
 * Re-derives on route change and on DOM mutation — KTIP sections arrive from
 * React Query and the settings/dashboard pages swap their whole body on tab
 * change, both of which happen after this hook first runs.
 */
export function useSpySteps(): SpyStep[] {
  const { pathname } = useLocation()
  const [steps, setSteps] = useState<SpyStep[]>([])
  // Serialized last result: mutations fire constantly (hover states, query
  // refetches), and the consumer's scroll effect re-subscribes on every new
  // array identity, so only publish when the steps actually changed.
  const lastKey = useRef('')

  const derive = useCallback(() => {
    const root = document.getElementById(ROOT_ID)
    const found: SpyStep[] = []
    if (root) {
      const els = root.querySelectorAll<HTMLElement>('[data-spy]')
      els.forEach((el, i) => {
        const label = el.dataset.spy?.trim()
        if (!label) return
        if (!el.id) el.id = `spy-${i}`
        found.push({ id: el.id, label, hide: el.hasAttribute('data-spy-hide') })
      })
    }
    const key = found.map((s) => [s.id, s.label, s.hide].join('~')).join('|')
    if (key === lastKey.current) return
    lastKey.current = key
    setSteps(found)
  }, [])

  useEffect(() => {
    // A route change can leave identical markers standing (e.g. two grant
    // detail pages), which the key check would swallow — reset so the new
    // page's steps always publish.
    lastKey.current = ''

    let raf = 0
    const schedule = () => {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0
          derive()
        })
      }
    }

    derive()

    const root = document.getElementById(ROOT_ID)
    const observer = new MutationObserver(schedule)
    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-spy', 'data-spy-hide'],
      })
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [derive, pathname])

  return steps
}
