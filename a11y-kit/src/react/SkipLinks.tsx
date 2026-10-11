import type { MouseEvent } from 'react'
import { openAccessibilityPanel } from '../core/events'
import { focusElement } from '../core/focus'
import { useA11yContext } from './context'

/**
 * The first things a keyboard reaches on every page: skip to the content, to
 * the menu, to search, to the accessibility settings. Hidden until focused.
 * Styled by `.ak-skip` (css/modes.css) unless `linkClassName` replaces it.
 */
export function SkipLinks({ linkClassName }: { linkClassName?: string }) {
  const { options, messages: m } = useA11yContext()

  const jump = (selector: string, first: boolean) => (e: MouseEvent) => {
    const target = document.querySelector<HTMLElement>(selector)
    if (!target) return
    e.preventDefault()
    const inner = first ? target.querySelector<HTMLElement>('a[href], button:not([disabled])') : null
    focusElement(inner ?? target, { scroll: !first })
  }
  const act = (fn: () => void) => (e: MouseEvent) => {
    e.preventDefault()
    fn()
  }

  const links = [
    { label: m.skipToMain, onClick: jump(options.targets.main, false), href: '#main-content' },
    { label: m.skipToNav, onClick: jump(options.targets.nav, true), href: '#' },
    ...(options.onSearch ? [{ label: m.skipToSearch, onClick: act(options.onSearch), href: '#' }] : []),
    { label: m.skipToSettings, onClick: act(openAccessibilityPanel), href: '#' },
  ]

  return (
    <div className="ak-skip-links">
      {links.map((l) => (
        <a key={l.label} href={l.href} className={linkClassName ?? 'ak-skip'} onClick={l.onClick}>
          {l.label}
        </a>
      ))}
    </div>
  )
}
