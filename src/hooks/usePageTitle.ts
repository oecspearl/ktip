import { createEffect, onCleanup } from 'solid-js'
import { APP_NAME } from '../lib/constants'

const DEFAULT_DESCRIPTION = 'KTIP - Knowledge, Technology and Innovation Platform for Caribbean innovators to collaborate, connect, and grow.'

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    if (name.startsWith('og:')) {
      el.setAttribute('property', name)
    } else {
      el.setAttribute('name', name)
    }
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export function usePageTitle(title: () => string | undefined, description?: () => string | undefined) {
  createEffect(() => {
    const pageTitle = title()
    const fullTitle = pageTitle ? `${pageTitle} | ${APP_NAME}` : APP_NAME
    document.title = fullTitle

    setMeta('og:title', fullTitle)
    setMeta('og:site_name', APP_NAME)
    setMeta('og:type', 'website')

    const desc = description?.() || DEFAULT_DESCRIPTION
    setMeta('og:description', desc)
    setMeta('description', desc)
    setMeta('twitter:card', 'summary')
    setMeta('twitter:title', fullTitle)
    setMeta('twitter:description', desc)
  })

  onCleanup(() => {
    document.title = APP_NAME
  })
}
