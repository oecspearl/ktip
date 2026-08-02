import { lazy, Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { SessionRecoveryBanner } from '../SessionRecoveryBanner'
import { FloatingActionButton } from '../ui/FloatingActionButton'
import { SpyRail } from '../ui/SpyRail'
import { MessagingPanelProvider } from '../../contexts/MessagingPanelContext'
import { MemberPanelProvider } from '../../contexts/MemberPanelContext'

// Overlay panels: closed on first paint, so their code (and the messaging /
// directory trees behind them) stays out of the entry chunk.
const MessagingPanel = lazy(() =>
  import('../messages/MessagingPanel').then((m) => ({ default: m.MessagingPanel }))
)
const MemberPanel = lazy(() =>
  import('../directory/MemberPanel').then((m) => ({ default: m.MemberPanel }))
)
// Renders nothing until there is a note to draw, so the editor, the folder
// graphics and the drag handling stay out of the entry chunk for everyone else.
const StickyNoteOverlay = lazy(() =>
  import('../notes/StickyNoteOverlay').then((m) => ({ default: m.StickyNoteOverlay }))
)
import { StickyNotesProvider } from '../../contexts/StickyNotesContext'
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
    {/* Holds the notes, so the FAB can create one and the layer can draw it */}
    <StickyNotesProvider>
    <div className="min-h-screen flex flex-col bg-ktip-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-max focus:px-4 focus:py-2 focus:bg-ktip-ocean-600 dark:focus:bg-ktip-ocean-200 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
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
      {/* Page-scroll affordance: builds itself from the current page's
          data-spy markers, renders nothing when a page has none */}
      <SpyRail />
      <FloatingActionButton />
      <Suspense fallback={null}>
        <MessagingPanel />
        <MemberPanel />
        <StickyNoteOverlay />
      </Suspense>
      <Footer />
    </div>
    </StickyNotesProvider>
    </TutorialProvider>
    </MemberPanelProvider>
    </MessagingPanelProvider>
  )
}
