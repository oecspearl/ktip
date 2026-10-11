/** Focus and page-structure helpers shared by shortcuts, voice and the reader. */

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

export function isVisible(el: Element): boolean {
  const box = (el as HTMLElement).getBoundingClientRect?.()
  if (!box || (box.width === 0 && box.height === 0)) return false
  if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return false
  const style = getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none'
}

/**
 * Focus anything, including a heading or a region: gives it tabindex=-1 if it
 * cannot take focus by itself. Scrolls it into view unless told not to.
 */
export function focusElement(el: HTMLElement, { scroll = true, smooth = false } = {}) {
  if (!el.matches(FOCUSABLE) && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
  if (scroll) el.scrollIntoView?.({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
}

/** h1 to h3 under root, in document order, visible only. */
export function headingsIn(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3')).filter(isVisible)
}

/**
 * The next or previous heading from where the reader is: the focused element
 * if focus is in the page, else the top of the viewport.
 */
export function stepHeading(direction: 1 | -1, root: ParentNode = document): HTMLElement | null {
  const all = headingsIn(root)
  if (!all.length) return null
  const active = document.activeElement as HTMLElement | null
  const anchored = active && active !== document.body && root.contains?.(active)
  if (anchored) {
    const before = all.filter(
      (h) => h !== active && h.compareDocumentPosition(active!) & Node.DOCUMENT_POSITION_FOLLOWING
    )
    const after = all.filter(
      (h) => h !== active && h.compareDocumentPosition(active!) & Node.DOCUMENT_POSITION_PRECEDING
    )
    return direction === 1 ? after[0] ?? null : before[before.length - 1] ?? null
  }
  const tops = all.map((h) => h.getBoundingClientRect().top)
  if (direction === 1) return all[tops.findIndex((t) => t > 8)] ?? null
  const above = tops.map((t, i) => (t < -8 ? i : -1)).filter((i) => i >= 0)
  return above.length ? all[above[above.length - 1]] : null
}

export interface Landmark {
  el: HTMLElement
  /** The role, e.g. "main", "navigation" */
  role: string
  /** aria-label or aria-labelledby text, when the page gave one */
  name: string
}

const LANDMARK_SELECTOR =
  'main, [role="main"], nav, [role="navigation"], header, [role="banner"], footer, [role="contentinfo"], aside, [role="complementary"], [role="search"], section[aria-label], section[aria-labelledby]'

const ROLE_OF: Record<string, string> = {
  MAIN: 'main',
  NAV: 'navigation',
  HEADER: 'banner',
  FOOTER: 'contentinfo',
  ASIDE: 'complementary',
  SECTION: 'region',
}

export function landmarksIn(root: ParentNode = document): Landmark[] {
  return Array.from(root.querySelectorAll<HTMLElement>(LANDMARK_SELECTOR))
    .filter(isVisible)
    .map((el) => {
      const labelledBy = el.getAttribute('aria-labelledby')
      const name =
        el.getAttribute('aria-label') ??
        (labelledBy ? document.getElementById(labelledBy)?.textContent?.trim() ?? '' : '')
      return { el, role: el.getAttribute('role') ?? ROLE_OF[el.tagName] ?? 'region', name }
    })
}

export interface LandOptions {
  smooth?: boolean
  /** Move keyboard focus to the target too */
  focus?: boolean
  /** How long to wait for the target to render, in ms */
  timeout?: number
  /** How long to keep it in place while content above it loads, in ms */
  settle?: number
}

const TAKEOVER_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * Land on a #fragment the way a full page load would. A single-page router
 * does not, and the target often sits in a lazy chunk that renders after the
 * route does. Waits for the element, scrolls to it (its scroll-margin clears a
 * sticky header) and can focus it. Then, while content above it is still
 * arriving, it keeps the target in place, until the person scrolls, taps or
 * types. Returns a cancel function.
 */
export function landOnHash(
  hash: string,
  { smooth = false, focus = false, timeout = 5000, settle = 1500 }: LandOptions = {}
): () => void {
  let id = ''
  try {
    id = decodeURIComponent(hash.replace(/^#/, ''))
  } catch {
    // a malformed fragment names nothing
  }
  if (!id) return () => {}

  const cleanups: (() => void)[] = []
  const cancel = () => cleanups.splice(0).forEach((fn) => fn())

  const hold = (el: HTMLElement) => {
    const reland = () => {
      if (el.isConnected) el.scrollIntoView?.({ block: 'start' })
    }
    // A layout that scrolls to the top on every route change can run after
    // the landing; nobody scrolls themselves to exactly 0 without the input
    // that ends the hold first
    const onScroll = () => {
      if (window.scrollY === 0 && el.getBoundingClientRect().top > window.innerHeight / 2) reland()
    }
    let first = true
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            // The first call is the observe itself, and would cut a smooth scroll short
            if (first) return void (first = false)
            reland()
          })
    ro?.observe(document.body)
    window.addEventListener('scroll', onScroll, { passive: true })
    TAKEOVER_EVENTS.forEach((type) => window.addEventListener(type, cancel, { passive: true }))
    const timer = window.setTimeout(cancel, settle)
    cleanups.push(() => {
      ro?.disconnect()
      window.removeEventListener('scroll', onScroll)
      TAKEOVER_EVENTS.forEach((type) => window.removeEventListener(type, cancel))
      clearTimeout(timer)
    })
  }

  const land = () => {
    const el = document.getElementById(id)
    if (!el) return false
    cancel()
    if (focus) focusElement(el, { scroll: false })
    el.scrollIntoView?.({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
    hold(el)
    return true
  }

  if (land()) return cancel
  const mo = new MutationObserver(() => void land())
  mo.observe(document.body, { childList: true, subtree: true })
  const timer = window.setTimeout(cancel, timeout)
  cleanups.push(() => {
    mo.disconnect()
    clearTimeout(timer)
  })
  return cancel
}
