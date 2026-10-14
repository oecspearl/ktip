import { isVisible } from '../focus'
import { normalize } from './grammar'

const CLICKABLE =
  'a[href], button, summary, select, textarea, input:not([type="hidden"]), [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [tabindex]:not([tabindex="-1"])'

/** Never number or click the kit's own overlay. */
const OWN = '[data-a11y-voice-ui]'

export function isEnabled(el: Element): boolean {
  return !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true'
}

/** Everything someone could click, visible, enabled, in document order. */
export function collectClickables(
  root: ParentNode = document,
  visible: (el: Element) => boolean = isVisible
): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CLICKABLE)).filter(
    (el) => isEnabled(el) && !el.closest(OWN) && visible(el)
  )
}

/** Only those on screen right now, for numbering. */
export function inViewport(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth
}

/**
 * The name someone would call an element by, roughly as a screen reader
 * computes it: aria-label, aria-labelledby, an associated label, the text,
 * image alt text, title, placeholder.
 */
export function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label')
  if (aria?.trim()) return aria.trim()
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim()
    if (text) return text
  }
  const id = el.getAttribute('id')
  // CSS.escape is missing in some test DOMs; quotes and backslashes are what break the selector
  const escaped = id && (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&'))
  const label = (escaped && document.querySelector(`label[for="${escaped}"]`)) || el.closest('label')
  if (label?.textContent?.trim()) return label.textContent.trim()
  const text = el.textContent?.replace(/\s+/g, ' ').trim()
  if (text) return text
  const alt = el.querySelector('img[alt]')?.getAttribute('alt')
  if (alt?.trim()) return alt.trim()
  return el.getAttribute('title')?.trim() || el.getAttribute('placeholder')?.trim() || (el as HTMLInputElement).value || ''
}

/**
 * Elements whose name matches what was said: exact first, then starts-with,
 * then contains. Returns the best tier that has any match.
 */
export function matchByLabel(spoken: string, list: HTMLElement[]): HTMLElement[] {
  const s = normalize(spoken)
  if (!s) return []
  const named = list.map((el) => ({ el, n: normalize(accessibleName(el)) })).filter((x) => x.n)
  const tiers = [
    named.filter((x) => x.n === s),
    named.filter((x) => x.n.startsWith(s + ' ') || x.n.startsWith(s)),
    named.filter((x) => x.n.includes(s)),
  ]
  return (tiers.find((t) => t.length) ?? []).map((x) => x.el)
}

/** Activate an element the way a click would, focusing it first. */
export function activate(el: HTMLElement) {
  el.focus({ preventScroll: false })
  if (el instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(el.type)) return
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return
  el.click()
}
