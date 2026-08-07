import { lazy, Suspense, useLayoutEffect } from 'react'
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

import { Trans } from '@lingui/react/macro'

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
import { useOrientationTransition } from '../../hooks/useOrientationTransition'
import { shellKey } from '../../lib/routeTransitions'

export function MainLayout() {
  const auth = useAuth()
  const { pathname } = useLocation()

  // The venue floorplan is a full-viewport map; a footer below it would make
  // the page scrollable, so wheel-over-map would scroll the page instead of
  // staying on the floor. Room and setup pages keep the footer.
  const immersiveVenue = /^\/events\/(virtual-hackathon|virtual-conference)\/[^/]+\/?$/.test(pathname)

  // Tab routes inside a persistent shell (dashboard, admin) share one key, so
  // a tab change swaps only the shell's <Outlet/> pane — hero and rail stay
  // mounted, and only the shell's own keyed pane wrapper animates.
  const shell = shellKey(pathname)

  // Always land at the top when navigating between pages.
  //
  // Layout effect, not passive: react-router commits a view-transitioned
  // navigation inside flushSync, and the browser captures the *new* snapshot
  // in the same frame. A passive effect still runs in time, but anything that
  // only learns about the jump from the scroll event does not — the scroll
  // event fires in "run the scroll steps", React schedules the resulting
  // re-render on a task, and the snapshot is taken in "run the view
  // transition steps" of that same frame, before the task can run. Scrolling
  // here lets Navbar reset its own scroll state in the same commit instead.
  // Keyed on the shell, not the pathname: intra-shell tab changes keep their
  // scroll position (the shell clamps it itself, see DashboardLayout).
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [shell])

  // Rotating the device swaps every breakpoint in one frame; this puts a short
  // fade over the swap so the new layout arrives instead of snapping.
  useOrientationTransition()

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
        <Trans>Skip to main content</Trans>
      </a>
      <Navbar />
      {/* profileLoading has to be in the guard: auth.loading flips false as soon
          as Supabase reports the session, while the profile query is still in
          flight, so without it the banner flashes on every load. */}
      {auth.user && !auth.profile && !auth.loading && !auth.profileLoading && (
        <SessionRecoveryBanner />
      )}
      <main id="main-content" className="flex-1">
        <div key={shell} className="contents page-reveal">
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
      {!immersiveVenue && <Footer />}
    </div>
    </StickyNotesProvider>
    </TutorialProvider>
    </MemberPanelProvider>
    </MessagingPanelProvider>
  )
}
