import { isVisible } from '../focus'

/**
 * What the reader reads: the page's paragraphs, headings, list items and the
 * like, in order. A host can mark anything else readable with
 * [data-read-block], or keep something out with [data-read-skip].
 */
const BLOCK =
  'h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, dt, dd, caption, th, td, summary, label, [data-read-block]'

// .sr-only and .visually-hidden hold text written for screen readers; the
// reader is for people listening to what they can see
const SKIP =
  'nav, [role="navigation"], [aria-hidden="true"], [hidden], [inert], [data-read-skip], .sr-only, .visually-hidden, script, style, noscript, template, dialog:not([open])'

/**
 * The text a listener should hear for an element: its words, the alt text of
 * its images, nothing from hidden or decorative parts.
 */
export function blockText(el: Element): string {
  let out = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const e = node as Element
    if (e.matches(SKIP)) return
    if (e.tagName === 'IMG') {
      const alt = e.getAttribute('alt')
      if (alt) out += ` ${alt} `
      return
    }
    if (e.tagName === 'BR') {
      out += ' '
      return
    }
    for (const child of Array.from(e.childNodes)) walk(child)
    // Block-level children should not run their words together
    if (/^(P|DIV|LI|H[1-6]|TD|TH|DT|DD)$/.test(e.tagName)) out += ' '
  }
  walk(el)
  return out.replace(/\s+/g, ' ').trim()
}

/** Readable blocks under root, in document order, innermost only, de-duplicated. */
export function collectReadableBlocks(
  root: ParentNode | null,
  visible: (el: Element) => boolean = isVisible
): HTMLElement[] {
  if (!root) return []
  const all = Array.from(root.querySelectorAll<HTMLElement>(BLOCK)).filter(
    (el) => !el.closest(SKIP) && visible(el)
  )
  // A <li> holding a <p> is read as the <p>: the outer one would repeat it
  const innermost = all.filter((el) => !el.querySelector(BLOCK))
  const out: HTMLElement[] = []
  let previous = ''
  for (const el of innermost) {
    const text = blockText(el)
    if (!text || text === previous) continue
    previous = text
    out.push(el)
  }
  return out
}
