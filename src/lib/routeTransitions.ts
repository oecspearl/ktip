import { createPath, type DataRouter, type RouterNavigateOptions, type To } from 'react-router'

const VENUE_RE = /^\/events\/virtual-hackathon\/([^/]+)/

/** Same venue on both sides of the navigation: a 500ms frozen snapshot over
 *  live video/chat reads as a hang, so those swaps stay instant. */
function sameVenue(from: string, to: string): boolean {
  const a = VENUE_RE.exec(from)
  const b = VENUE_RE.exec(to)
  return a !== null && b !== null && a[1] === b[1]
}

/** Path without query or hash — a filter or anchor change is the same page. */
function pathOnly(to: string): string {
  return to.split('?')[0].split('#')[0]
}

/**
 * Turns every route change into a view-transition "card shuffle" (CSS lives in
 * index.css under html.route-shuffle).
 *
 * react-router has no router-level switch for view transitions — the option is
 * per Link/navigate call, and ~110 files would need the prop — so the one
 * funnel they all share, router.navigate, is wrapped instead. Link click
 * handlers always pass `viewTransition: undefined` when the prop is absent,
 * which is why the default is applied with ?? rather than an option spread.
 *
 * The subscriber (not the wrapper) toggles the scoping class because POP and
 * redirect transitions never go through navigate(); it also has to exist
 * before RouterProvider subscribes so the class is on <html> when the old
 * frame is captured. The class keeps the shuffle rules away from the venue
 * bento-grid transitions, whose CSS deliberately disables the root animation.
 */
export function enableCardShuffle(router: DataRouter) {
  // Version beacon for stale-tab debugging: an SPA tab keeps navigating on old
  // JS long after the dev server restarts, which makes "the fix didn't work"
  // reports ambiguous. Bump the number when the shuffle behaviour changes.
  console.info('[route-shuffle] v14 — leaving home fades the old card to navy')

  // Debug flags, read once from the URL that opened the tab:
  //   ?noshuffle — disable transitions entirely (is an artifact even ours?)
  //   ?slowmo    — run at 4s so an artifact can be pointed at
  const flags = new URLSearchParams(window.location.search)
  const disabled = flags.has('noshuffle')
  const slowmo = flags.has('slowmo')
  if (disabled) console.info('[route-shuffle] disabled via ?noshuffle')
  if (slowmo) {
    console.info('[route-shuffle] 4s slow motion via ?slowmo')
    document.documentElement.classList.add('route-shuffle-slowmo')
  }

  const original = router.navigate.bind(router)

  router.navigate = (to: To | number | null, opts?: RouterNavigateOptions) => {
    if (typeof to === 'number') return original(to)
    const from = router.state.location.pathname
    const target = to == null ? from : typeof to === 'string' ? to : createPath(to)
    // Dealing a card for a page you are already on reads as a glitch: clicking
    // the active nav link, or changing a filter that only rewrites the query.
    const samePage = pathOnly(target) === pathOnly(from)
    const viewTransition = disabled
      ? false
      : (opts?.viewTransition ?? (!samePage && !sameVenue(from, target)))
    // Fired BEFORE the router starts loading the route chunk, i.e. before the
    // old frame can be captured. The home hero carousel listens: a slide swap
    // caught mid-flight by the capture freezes a half-swapped hero (new slide's
    // text over the old slide's photo) on the outgoing card for the whole
    // 500ms — the "flicker before the navy fade". The carousel stops rotating
    // and snaps any in-flight swap to its end state, so the capture is clean.
    if (viewTransition) window.dispatchEvent(new Event('ktip:route-shuffle-start'))
    return original(to, { ...opts, viewTransition })
  }

  /**
   * The scoping class has to be OFF again by the time the next unrelated
   * transition (the venue bento) runs, but taking it off on a wall clock is
   * what made the shuffle flicker.
   *
   * The class is added here, in the subscriber, because the old frame is
   * captured before RouterProvider ever calls startViewTransition. Removal
   * used to be a 700ms timer started at that same moment — but the animations
   * do not begin at `startViewTransition()`, they begin at `ready`, and every
   * route on this router is a lazy() import, so `ready` lands one chunk
   * download later: measured at 114ms to 972ms after the call. Whenever that
   * lag exceeded 200ms the class came off mid-animation, `animation-name` on
   * ::view-transition-old(root) stopped resolving, and the browser CANCELLED
   * the running animation — both cards snapping from a part-played
   * `scale(0.94) translateY(12px)` / `translateX(…)` straight back to their
   * base style for the frame before the pseudo tree was torn down. Measured
   * over ten navigations, 8 were cut short (70/129/233/248/351/396/445/516ms
   * of a 500ms animation) and only 2 ran to completion.
   *
   * So the lifetime is tied to the transition itself. `finished` settles after
   * the animations end (and rejects if the transition is skipped), which is
   * exactly when the class stops being needed. The timer stays only as a
   * backstop for a transition that never settles.
   */
  const root = document.documentElement
  let live = 0

  const release = () => {
    live = Math.max(0, live - 1)
    if (live === 0) root.classList.remove('route-shuffle', 'route-shuffle-from-home')
  }

  /**
   * ::view-transition-new(root) is not a snapshot — it is a live view of the
   * incoming page, held on screen for the whole 500ms slide. The router's
   * flushSync commit is the page's *loading* paint: the hero <img> has mounted
   * but its network fetch has only just started (`decoding="sync"` blocks on
   * decode, not fetch), so the card slides in showing the bare navy band, the
   * bottom fade's upward gradient cut off at the band edge, and no frost —
   * then repaints mid-slide when the photo lands. That repaint was the flash.
   *
   * Rendering is already suppressed between capture and `ready`; keeping the
   * update callback pending extends that window, so the first frame the card
   * ever shows has the photo in it. Capped: a suppressed document is a frozen
   * screen, so a slow fetch gets 250ms and then the old flash, not a hang.
   */
  const heroPhotoReady = async () => {
    const img = document.querySelector<HTMLImageElement>('#page-top img')
    if (!img || img.complete) return
    await Promise.race([
      img.decode().catch(() => {}), // a 404 flashes either way; don't hang on it
      new Promise((resolve) => setTimeout(resolve, 250)),
    ])
  }

  const nativeStart = document.startViewTransition?.bind(document)
  if (nativeStart) {
    document.startViewTransition = ((cb: () => unknown) => {
      const shuffling = root.classList.contains('route-shuffle')
      const transition = nativeStart(
        shuffling
          ? async () => {
              await cb()
              await heroPhotoReady()
            }
          : cb
      )
      if (shuffling) {
        live++
        // Overlapping navigations each hold their own claim, so a second
        // transition starting mid-shuffle cannot strand the class on.
        transition.finished.then(release, release)
      }
      return transition
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  }

  let timer: number | undefined
  router.subscribe((_state, { viewTransitionOpts }) => {
    if (!viewTransitionOpts) return
    root.classList.add('route-shuffle')
    // Leaving home only: the old card fades to brand navy under the incoming
    // card (CSS scoped to this class in index.css). Set from currentLocation,
    // not a wrapper-side capture, so POP/redirect transitions get it too.
    root.classList.toggle(
      'route-shuffle-from-home',
      viewTransitionOpts.currentLocation.pathname === '/'
    )
    window.clearTimeout(timer)
    // Backstop only. Generous on purpose: `finished` is what normally clears
    // the class, and this firing early is the bug described above.
    timer = window.setTimeout(() => {
      live = 0
      root.classList.remove('route-shuffle', 'route-shuffle-from-home')
    }, slowmo ? 15000 : 5000)
  })
}
