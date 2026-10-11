import type { MouseEvent } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { OPEN_SEARCH_EVENT } from '../../a11y/A11yHost'

/** Move keyboard focus to an element that is not focusable by itself */
function focusTarget(el: HTMLElement | null) {
  if (!el) return
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus()
}

/**
 * The first things a keyboard reaches on every page: the content, the menu,
 * search, and the accessibility settings (opened by the hosted service from
 * any element marked data-viridion-a11y="open").
 */
export function SkipLinks({ linkClassName }: { linkClassName: string }) {
  const { t } = useLingui()
  const toMenu = (e: MouseEvent) => {
    e.preventDefault()
    const nav = document.getElementById('site-nav')
    focusTarget(nav?.querySelector<HTMLElement>('a[href], button:not([disabled])') ?? nav)
  }
  const toSearch = (e: MouseEvent) => {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT, { detail: {} }))
  }
  return (
    <nav aria-label={t`Skip links`}>
      <a href="#main-content" className={linkClassName}>
        <Trans>Skip to main content</Trans>
      </a>
      <a href="#site-nav" className={linkClassName} onClick={toMenu}>
        <Trans>Skip to the site menu</Trans>
      </a>
      <a href="#" className={linkClassName} onClick={toSearch}>
        <Trans>Skip to search</Trans>
      </a>
      <a href="#" className={linkClassName} data-viridion-a11y="open">
        <Trans>Accessibility settings</Trans>
      </a>
    </nav>
  )
}
