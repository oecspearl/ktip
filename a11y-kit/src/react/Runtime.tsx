import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { announce } from '../core/announce'
import { onRequest, openAccessibilityPanel, request } from '../core/events'
import { focusElement, landOnHash, stepHeading } from '../core/focus'
import {
  createSequence,
  matchChord,
  routeChord,
  shouldIgnoreSingleKey,
  type ShortcutAction,
} from '../core/shortcuts'
import { prefersReducedMotionNow } from '../core/store'
import { useA11yContext } from './context'
import { useA11ySettings } from './hooks'
import { BROWSER_NAVIGATION } from './options'

const ShortcutsDialog = lazy(() => import('./ShortcutsDialog').then((m) => ({ default: m.ShortcutsDialog })))

/** Something modal owns the keyboard. Any open <dialog> counts: :modal would be
 *  exact but throws in older selector engines */
const modalOpen = () => !!document.querySelector('dialog[open], [aria-modal="true"]')

/**
 * The always-mounted part of the kit: one keydown listener for every
 * shortcut, and focus placement after a route change. Everything it opens
 * (the help dialog, the panel, the reader) loads on demand.
 */
export function Runtime() {
  const ctx = useA11yContext()
  const { store, options } = ctx
  const { shortcuts } = useA11ySettings(store)
  const keysOn = options.features.shortcuts && shortcuts !== 'off'
  const [helpOpen, setHelpOpen] = useState(false)

  // Read through refs so the listener is bound once per mode, not per render
  const live = useRef(ctx)
  live.current = ctx

  useEffect(() => onRequest('help', () => setHelpOpen(true)), [])

  useEffect(() => {
    if (!keysOn) return
    const seq = createSequence()

    const run = (action: ShortcutAction) => {
      const { store: s, options: o, messages: m } = live.current
      const step = (dir: 1 | -1) => {
        const r = s.config.ranges.fontScale
        s.patch({ fontScale: s.getSettings().fontScale + dir * r.step })
        announce(m.textSizeIs(`${Math.round(s.getSettings().fontScale * 100)}%`))
      }
      switch (action) {
        case 'main': {
          const main = document.querySelector<HTMLElement>(o.targets.main)
          if (main) focusElement(main)
          return
        }
        case 'nav': {
          const nav = document.querySelector<HTMLElement>(o.targets.nav)
          const first = nav?.querySelector<HTMLElement>('a[href], button:not([disabled])')
          if (first ?? nav) focusElement((first ?? nav)!, { scroll: false })
          return
        }
        case 'search':
          o.onSearch?.()
          return
        case 'panel':
          openAccessibilityPanel()
          return
        case 'read':
        case 'voice':
          request(action)
          return
        case 'help':
          setHelpOpen(true)
          return
        case 'textUp':
          return step(1)
        case 'textDown':
          return step(-1)
        case 'textReset':
          s.patch({ fontScale: 1 })
          announce(m.textSizeIs('100%'))
          return
        case 'nextHeading':
        case 'prevHeading': {
          const main = document.querySelector(o.targets.main) ?? document
          const h = stepHeading(action === 'nextHeading' ? 1 : -1, main)
          if (h) focusElement(h, { smooth: !prefersReducedMotionNow(s) })
          else announce(m.noMoreHeadings)
          return
        }
      }
    }

    const go = (path: string) => (live.current.options.navigation ?? BROWSER_NAVIGATION).navigate(path)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      const o = live.current.options
      if (modalOpen()) return

      for (const [action, chord] of Object.entries(o.chords) as [ShortcutAction, typeof o.chords.main][]) {
        if (matchChord(e, chord)) {
          e.preventDefault()
          run(action)
          return
        }
      }
      for (const route of o.routes) {
        if (route.digit && matchChord(e, routeChord(route.digit))) {
          e.preventDefault()
          go(route.path)
          return
        }
      }

      // Alt+Shift chords cannot collide with a tour's own plain keys; single
      // letters can, so only they stand down for isBlocked
      if (shortcuts !== 'all' || shouldIgnoreSingleKey(e) || o.isBlocked?.()) return
      if (e.key === '?') {
        e.preventDefault()
        setHelpOpen(true)
        return
      }
      const second = seq.feed(e.key)
      const route = second ? o.routes.find((r) => r.seq === second) : undefined
      if (route) {
        e.preventDefault()
        go(route.path)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shortcuts, keysOn])

  // After a route change, put keyboard focus at the top of the new page, as a
  // full page load would. Only when focus would otherwise be lost (on <body>,
  // on a removed node, or still in the menu that was used), and never over a
  // #hash, which already says where to land
  useEffect(() => {
    const nav = options.navigation
    if (!nav) return
    let last = nav.location.get()
    return nav.location.subscribe(() => {
      const now = nav.location.get()
      if (now === last) return
      const samePage = now.split('#')[0] === last.split('#')[0]
      last = now
      if (samePage || now.includes('#') || !live.current.store.getSettings().focusOnNavigate) return
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null
        const lost = !active || active === document.body || !active.isConnected
        const inMenu = !!active?.closest(live.current.options.targets.nav)
        if (!lost && !inMenu) return
        const main = document.querySelector<HTMLElement>(live.current.options.targets.main)
        const target = main?.querySelector<HTMLElement>('h1') ?? main
        if (target) focusElement(target, { scroll: false })
      }, 120)
    })
  }, [options.navigation])

  // A #fragment, on a link or in the address bar. A full page load would scroll
  // to it; here the router does not, and the target is often in a lazy chunk
  // that renders later. Focus follows only for those who asked for it.
  useEffect(() => {
    if (!options.features.hashLanding) return
    const nav = options.navigation ?? BROWSER_NAVIGATION
    let cancel = () => {}
    const land = (loc: string, smooth: boolean) => {
      cancel()
      const at = loc.indexOf('#')
      if (at < 0) return
      const s = live.current.store
      cancel = landOnHash(loc.slice(at), {
        smooth: smooth && !prefersReducedMotionNow(s),
        focus: s.getSettings().focusOnNavigate,
      })
    }
    let last = nav.location.get()
    // The page opened on a fragment the browser looked for before the app drew it
    land(last, false)
    const unsubscribe = nav.location.subscribe(() => {
      const now = nav.location.get()
      if (now === last) return
      last = now
      land(now, true)
    })
    return () => {
      unsubscribe()
      cancel()
    }
  }, [options.navigation, options.features.hashLanding])

  if (!helpOpen) return null
  return (
    <Suspense fallback={null}>
      <ShortcutsDialog onClose={() => setHelpOpen(false)} />
    </Suspense>
  )
}
