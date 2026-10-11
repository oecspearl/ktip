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
  if (scroll) el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
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
