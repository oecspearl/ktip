import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { SessionRecoveryBanner } from '../SessionRecoveryBanner'
import { FloatingActionButton } from '../ui/FloatingActionButton'
import { MessagingPanel } from '../messages/MessagingPanel'
import { MessagingPanelProvider } from '../../contexts/MessagingPanelContext'
import { MemberPanel } from '../directory/MemberPanel'
import { MemberPanelProvider } from '../../contexts/MemberPanelContext'
import { TutorialProvider } from '../../contexts/TutorialContext'
import { useAuth } from '../../contexts/AuthContext'

export function MainLayout() {
  const auth = useAuth()
  const { pathname } = useLocation()

  // Always land at the top when navigating between pages
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <MessagingPanelProvider>
    {/* Nested inside: MemberPanel's "Message" action calls useMessagingPanel */}
    <MemberPanelProvider>
    {/* Renders the walkthrough overlay itself; must sit above the FAB, which
        is one of its entry points */}
    <TutorialProvider>
    <div className="min-h-screen flex flex-col bg-ktip-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-ktip-ocean-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      <Navbar />
      {auth.user && !auth.profile && !auth.loading && <SessionRecoveryBanner />}
      <main id="main-content" className="flex-1">
        <div key={pathname} className="contents page-reveal">
          <Outlet />
        </div>
      </main>
      <FloatingActionButton />
      <MessagingPanel />
      <MemberPanel />
      <Footer />
    </div>
    </TutorialProvider>
    </MemberPanelProvider>
    </MessagingPanelProvider>
  )
}
