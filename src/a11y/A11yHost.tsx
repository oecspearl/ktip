import { useMemo, type ReactNode } from 'react'
import { useLingui } from '@lingui/react/macro'
import { A11yProvider } from '@a11y-kit'
import { A11yQuickButton } from './A11yQuickButton'
import { useKtipA11yMessages } from './messages'
import { ktipNavigation } from './navigation'
import { useKtipRoutes } from './routes'
import { a11yStore } from './store'
import { useKtipA11ySync } from './sync'
import { ktipTheme } from './theme'

/** Navbar's search box opens on this event (Navbar.tsx, beside its Ctrl+K handler) */
export const OPEN_SEARCH_EVENT = 'ktip:open-search'

const TARGETS = { main: '#main-content', nav: '#site-nav' }
const openSearch = (query?: string) => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT, { detail: { query } }))
// A tour owns the plain keys while it runs; single-key shortcuts wait for it
const tourRunning = () => !!document.querySelector('[data-tutorial-overlay]')
// A venue call is on screen (LiveKitRoom's container): other people's voices
// would be heard as commands, so voice listens only on a press
const inLiveCall = () => !!document.querySelector('.lk-room-container, [data-live-call]')

/**
 * KTIP's mount of the accessibility kit. Inside AuthProvider to see the
 * profile, and around the router so every route has it, auth pages included.
 * Theme, text size, fonts and every other display setting travel between the
 * device and profiles.display_prefs (155) as one blob.
 */
export function A11yHost({ children }: { children: ReactNode }) {
  const { t } = useLingui()
  const sync = useKtipA11ySync()
  const messages = useKtipA11yMessages()
  const routes = useKtipRoutes()
  // The shortcuts KTIP had before the kit, listed in its help dialog
  const extraShortcuts = useMemo(
    () => [
      { keys: 'Ctrl+K', label: t`Search the site` },
      { keys: '/', label: t`Search the help centre, on the Help page` },
    ],
    [t]
  )

  return (
    <A11yProvider
      store={a11yStore}
      theme={ktipTheme}
      sync={sync}
      messages={messages}
      routes={routes}
      navigation={ktipNavigation}
      targets={TARGETS}
      onSearch={openSearch}
      extraShortcuts={extraShortcuts}
      isBlocked={tourRunning}
      voiceRestricted={inLiveCall}
    >
      {children}
      {/* Outside the router on purpose: it only shows where there is no FAB,
          which is every page that is not inside MainLayout */}
      <A11yQuickButton />
    </A11yProvider>
  )
}
