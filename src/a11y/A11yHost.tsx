import { useEffect, useMemo, type ReactNode } from 'react'
import { useLingui } from '@lingui/react/macro'
import { useAuth } from '../contexts/AuthContext'
import { analytics } from '../hooks/useAnalytics'
import { A11yQuickButton } from './A11yQuickButton'
import { ktipNavigation } from './navigation'
import { useKtipRoutes } from './routes'
import { useKtipJourney, useKtipSetupGate } from './setup'
import { useKtipA11ySync } from './sync'
import { ktipTheme } from './theme'
import { configureA11y, type ConfigureInput } from './viridion'

/** Navbar's search box opens on this event (Navbar.tsx, beside its Ctrl+K handler) */
export const OPEN_SEARCH_EVENT = 'ktip:open-search'
/** The FAB opens its feedback form on this event (the accessibility statement's report link) */
export const OPEN_FEEDBACK_EVENT = 'ktip:open-feedback'

const TARGETS = { main: '#main-content', nav: '#site-nav' }
const openSearch = (query?: string) => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT, { detail: { query } }))
// A tour owns the plain keys while it runs; single-key shortcuts wait for it
const tourRunning = () => !!document.querySelector('[data-tutorial-overlay]')
// A venue call is on screen (LiveKitRoom's container): other people's voices
// would be heard as commands, so voice listens only on a press
const inLiveCall = () => !!document.querySelector('.lk-room-container, [data-live-call]')
// How setup ended and how far the tour got, behind the analytics consent
// (analytics.feature checks it). Never the needs: they are health information
const reportSetup: ConfigureInput['onEvent'] = (event, props) => analytics.feature('accessibility', event, props)
const SETTINGS_PATH = '/dashboard/preferences#accessibility'

/**
 * KTIP as a customer of the hosted accessibility service (Viridion
 * Accessibility). index.html loads the service; this tells it about KTIP:
 * the router, the theme, the pages, the setup tour, the member's saved
 * settings (profiles.display_prefs, 155) and the language. Around the router,
 * inside AuthProvider, so it sees the profile and covers the auth pages.
 */
export function A11yHost({ children }: { children: ReactNode }) {
  const { t, i18n } = useLingui()
  const { user } = useAuth()
  const sync = useKtipA11ySync()
  const routes = useKtipRoutes()
  const journey = useKtipJourney()
  const setup = useKtipSetupGate()
  const locale = i18n.locale.split('-')[0]

  // What never changes for the life of the page
  useEffect(() => {
    configureA11y({
      ...ktipNavigation,
      theme: ktipTheme,
      targets: TARGETS,
      onSearch: openSearch,
      isBlocked: tourRunning,
      voiceRestricted: inLiveCall,
      onEvent: reportSetup,
      onAction: (id) => id === 'all-settings' && ktipNavigation.navigate(SETTINGS_PATH),
    })
  }, [])

  // The shortcuts KTIP had before the service, listed in its help dialog
  const extraShortcuts = useMemo(
    () => [
      { keys: 'Ctrl+K', label: t`Search the site` },
      { keys: '/', label: t`Search the help centre, on the Help page` },
    ],
    [t]
  )
  const panelActions = useMemo(() => (user ? [{ id: 'all-settings', label: t`All settings` }] : []), [user, t])

  useEffect(() => {
    configureA11y({ routes, journey, setup, extraShortcuts, panelActions, locale })
  }, [routes, journey, setup, extraShortcuts, panelActions, locale])

  useEffect(() => {
    configureA11y({ sync })
  }, [sync])

  return (
    <>
      {children}
      {/* Outside the router on purpose: it only shows where there is no FAB,
          which is every page that is not inside MainLayout */}
      <A11yQuickButton />
    </>
  )
}
