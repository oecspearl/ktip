import { useCallback } from 'react'
import { setA11ySettings, useA11ySettings } from '../a11y/viridion'

/**
 * Accessibility "readable font" mode: Atkinson Hyperlegible across the site
 * (html.readable, see index.css). A view over the accessibility service's
 * `font` setting, which also loads the webfont the first time it is chosen.
 */
export function useReadableMode(): [boolean, (on: boolean) => void] {
  const enabled = useA11ySettings().font === 'atkinson'
  const setReadable = useCallback((on: boolean) => {
    setA11ySettings({ font: on ? 'atkinson' : 'default' })
  }, [])
  return [enabled, setReadable]
}
