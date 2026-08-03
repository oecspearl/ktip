import { useEffect } from 'react'
import { useLingui } from '@lingui/react/macro'
import { APP_NAME } from '../lib/constants'

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

export function usePageTitle(title?: string, description?: string) {
  const { t, i18n } = useLingui()
  useEffect(() => {
    const fullTitle = title ? `${title} | ${APP_NAME}` : APP_NAME
    document.title = fullTitle

    setMeta('og:title', fullTitle)
    setMeta('og:site_name', APP_NAME)
    setMeta('og:type', 'website')

    const desc =
      description ||
      t`KTIP - Knowledge, Technology and Innovation Platform for Caribbean innovators to collaborate, connect, and grow.`
    setMeta('og:description', desc)
    setMeta('description', desc)
    setMeta('twitter:card', 'summary')
    setMeta('twitter:title', fullTitle)
    setMeta('twitter:description', desc)

    return () => {
      document.title = APP_NAME
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- i18n.locale re-runs the effect on language switch
  }, [title, description, i18n.locale])
}
