/**
 * Say something to a screen reader without moving focus: "Text size 120%",
 * "Reading 3 of 14". Two visually hidden live regions, created on first use.
 */
const regions: Partial<Record<'polite' | 'assertive', HTMLElement>> = {}

function region(politeness: 'polite' | 'assertive'): HTMLElement {
  const existing = regions[politeness]
  if (existing?.isConnected) return existing
  const el = document.createElement('div')
  el.setAttribute('aria-live', politeness)
  el.setAttribute('aria-atomic', 'true')
  el.setAttribute('data-a11y-announcer', politeness)
  Object.assign(el.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: '0',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: '0',
  })
  document.body.appendChild(el)
  regions[politeness] = el
  return el
}

export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite') {
  if (typeof document === 'undefined') return
  const el = region(politeness)
  // Clear first: the same text twice in a row is otherwise not re-announced
  el.textContent = ''
  setTimeout(() => {
    el.textContent = message
  }, 50)
}
