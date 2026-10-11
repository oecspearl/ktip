import type { ReactNode } from 'react'
import { A11yProvider } from '@a11y-kit'
import { A11yQuickButton } from './A11yQuickButton'
import { useKtipA11yMessages } from './messages'
import { a11yStore } from './store'
import { useKtipA11ySync } from './sync'
import { ktipTheme } from './theme'

/**
 * KTIP's mount of the accessibility kit. Inside AuthProvider to see the
 * profile, and around the router so every route has it, auth pages included.
 * Theme, text size, fonts and every other display setting travel between the
 * device and profiles.display_prefs (155) as one blob.
 */
export function A11yHost({ children }: { children: ReactNode }) {
  const sync = useKtipA11ySync()
  const messages = useKtipA11yMessages()
  return (
    <A11yProvider store={a11yStore} theme={ktipTheme} sync={sync} messages={messages}>
      {children}
      {/* Outside the router on purpose: it only shows where there is no FAB,
          which is every page that is not inside MainLayout */}
      <A11yQuickButton />
    </A11yProvider>
  )
}
