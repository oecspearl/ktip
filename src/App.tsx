import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import {
  createBrowserRouter as createBrowserRouterBase,
  Outlet,
  Link,
  Navigate,
} from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { AchievementProvider } from './contexts/AchievementContext'
import { AchievementUnlockModal } from './components/achievements/AchievementUnlockModal'
import { AnalyticsProvider } from './hooks/useAnalytics'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { PermissionRoute } from './components/PermissionRoute'
import { AppErrorBoundary } from './components/ErrorBoundary'
import { AnalyticsConsentBanner } from './components/AnalyticsConsentBanner'
import { MainLayout } from './components/layout/MainLayout'
import { AdminLayout } from './components/layout/AdminLayout'
import { AppError } from './lib/app-error'
import { captureException } from './lib/monitoring'

// Wrapped so Sentry names transactions after the matched route pattern
// (/projects/:id) instead of the literal URL, which would otherwise create one
// transaction per record and make performance data unaggregatable.
const createBrowserRouter = Sentry.wrapCreateBrowserRouter(createBrowserRouterBase)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// Shown while a page is not yet ported to React (its import fails to compile).
// Once every page is ported this fallback never renders.
function Placeholder() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <p className="text-gray-500">This page is being migrated.</p>
      <Link to="/" className="text-ktip-tropical-700 hover:underline">
        Back to Discover
      </Link>
    </div>
  )
}

function lazyPage(importer: () => Promise<{ default: React.ComponentType }>) {
  return async () => {
    const mod = await importer().catch((error: unknown) => {
      // The Placeholder fallback is kept, but it is no longer silent: after a
      // deploy this is how a stale chunk reference presents, and it looked
      // identical to a page that was never ported.
      captureException(
        new AppError({
          code: 'ROUTE_IMPORT_FAILED',
          area: 'routing',
          operation: 'lazy-import',
          cause: error,
        })
      )
      return { default: Placeholder }
    })
    return { Component: mod.default }
  }
}

function AnalyticsRoot() {
  return (
    <AnalyticsProvider>
      <Outlet />
      {/* Rendered inside the router, not beside it: the popup links to the
          gallery, so it needs router context. AchievementProvider itself sits
          outside, since it only needs auth and the query client. */}
      <AchievementUnlockModal />
    </AnalyticsProvider>
  )
}

const router = createBrowserRouter([
  {
    Component: AnalyticsRoot,
    HydrateFallback: () => null,
    children: [
      // Bare auth routes (no layout)
      { path: '/login', lazy: lazyPage(() => import('./pages/auth/LoginPage')) },
      { path: '/signup', lazy: lazyPage(() => import('./pages/auth/SignupPage')) },
      { path: '/forgot-password', lazy: lazyPage(() => import('./pages/auth/ForgotPasswordPage')) },
      { path: '/reset-password', lazy: lazyPage(() => import('./pages/auth/ResetPasswordPage')) },
      { path: '/auth/callback', lazy: lazyPage(() => import('./pages/auth/AuthCallbackPage')) },
      // OECS Virtual Campus handoff. /auth/vc/callback is NOT here — vercel.json
      // rewrites it to an Edge Function before the SPA sees it (mirrored for
      // `npm run dev` in vite.config.ts). This is where that function lands the
      // browser afterwards, carrying a one-time ticket instead of a session.
      { path: '/auth/vc/land', lazy: lazyPage(() => import('./pages/auth/VcLandingPage')) },
      { path: '/verify-email/:token', lazy: lazyPage(() => import('./pages/auth/VerifyEmailAliasPage')) },
      { path: '/onboarding', lazy: lazyPage(() => import('./pages/onboarding/OnboardingPage')) },

      {
        Component: MainLayout,
        children: [
          // Public browse routes
          { path: '/', lazy: lazyPage(() => import('./pages/discover/DiscoverPage')) },
          { path: '/projects', lazy: lazyPage(() => import('./pages/projects/ProjectsPage')) },
          { path: '/projects/:id', lazy: lazyPage(() => import('./pages/projects/ProjectDetailPage')) },
          { path: '/events', lazy: lazyPage(() => import('./pages/events/EventsPage')) },
          { path: '/events/:id', lazy: lazyPage(() => import('./pages/events/EventDetailPage')) },
          { path: '/grants', lazy: lazyPage(() => import('./pages/grants/GrantsPage')) },
          { path: '/grants/:id', lazy: lazyPage(() => import('./pages/grants/GrantDetailPage')) },
          { path: '/forums', lazy: lazyPage(() => import('./pages/forums/ForumsPage')) },
          { path: '/forums/:slug', lazy: lazyPage(() => import('./pages/forums/BoardPage')) },
          { path: '/forums/:slug/:postId', lazy: lazyPage(() => import('./pages/forums/PostDetailPage')) },
          { path: '/directory', lazy: lazyPage(() => import('./pages/directory/DirectoryPage')) },
          // Public on purpose. A rank is only worth chasing if it can be
          // shown to someone, and a shared /u/ link has to open for a
          // signed-out visitor. Both surfaces exclude students, members who
          // opted out, and suspended accounts — enforced in SQL, not here.
          { path: '/leaderboard', lazy: lazyPage(() => import('./pages/leaderboard/LeaderboardPage')) },
          { path: '/u/:id', lazy: lazyPage(() => import('./pages/profile/PublicProfilePage')) },
          // Public on purpose, like /u/:id — a CV only a signed-in member can
          // open is not one you can send to an employer. public_resume()
          // returns nothing unless the owner published it, so the page 404s
          // itself rather than relying on this route to hide anything.
          { path: '/u/:id/cv', lazy: lazyPage(() => import('./pages/cv/PublicCvPage')) },
          // The organisation's answer to /u/:id, and public for the same
          // reason. public_employer() returns nothing unless the business is
          // Chamber-verified, so an unverified registration cannot masquerade
          // as a credential by having a page at all.
          { path: '/org/:slug', lazy: lazyPage(() => import('./pages/sme/OrgProfilePage')) },
          { path: '/resources', lazy: lazyPage(() => import('./pages/resources/ResourcesPage')) },
          { path: '/resources/:id', lazy: lazyPage(() => import('./pages/resources/ResourceDetailPage')) },
          { path: '/help', lazy: lazyPage(() => import('./pages/help/HelpCenterPage')) },
          { path: '/help/faq', lazy: lazyPage(() => import('./pages/help/FAQPage')) },
          { path: '/integrations', element: <Navigate to="/resources?tab=integrations" replace /> },

          // Authenticated routes
          {
            Component: ProtectedRoute,
            children: [
              // The one personal page. Everything that used to live on
              // /profile/me is a tab under here — see dashboard-tabs.ts.
              {
                path: '/dashboard',
                lazy: lazyPage(() => import('./pages/dashboard/DashboardLayout')),
                // Absolute child paths — legal because they extend the parent,
                // and site-search.test.ts matches route paths literally.
                children: [
                  { index: true, lazy: lazyPage(() => import('./pages/dashboard/tabs/OverviewTab')) },
                  { path: '/dashboard/profile', lazy: lazyPage(() => import('./pages/dashboard/tabs/ProfileTab')) },
                  { path: '/dashboard/progress', lazy: lazyPage(() => import('./pages/dashboard/tabs/ProgressTab')) },
                  { path: '/dashboard/achievements', lazy: lazyPage(() => import('./pages/dashboard/tabs/AchievementsTab')) },
                  { path: '/dashboard/projects', lazy: lazyPage(() => import('./pages/dashboard/tabs/ProjectsTab')) },
                  { path: '/dashboard/events', lazy: lazyPage(() => import('./pages/dashboard/tabs/EventsTab')) },
                  { path: '/dashboard/connections', lazy: lazyPage(() => import('./pages/dashboard/tabs/ConnectionsTab')) },
                  { path: '/dashboard/submissions', lazy: lazyPage(() => import('./pages/dashboard/tabs/SubmissionsTab')) },
                  // Role-gated; each stub bounces to /dashboard without the role.
                  { path: '/dashboard/funding', lazy: lazyPage(() => import('./pages/dashboard/tabs/FundingTab')) },
                  { path: '/dashboard/mentees', lazy: lazyPage(() => import('./pages/dashboard/tabs/MenteesTab')) },
                  { path: '/dashboard/research', lazy: lazyPage(() => import('./pages/dashboard/tabs/ResearchTab')) },
                ],
              },
              // Full-page receipt, deliberately outside the tab shell
              { path: '/dashboard/submissions/:id', lazy: lazyPage(() => import('./pages/dashboard/SubmissionReceiptPage')) },
              // Creating a project needs project:create (migration 064 put that
              // check in the INSERT policy). Gated here so a role without it —
              // investor, say — gets told why instead of filling in the whole
              // form and collecting a 403 from RLS on submit.
              {
                element: <PermissionRoute require="project:create" />,
                children: [
                  { path: '/projects/new', lazy: lazyPage(() => import('./pages/projects/CreateProjectPage')) },
                ],
              },
              { path: '/projects/:id/edit', lazy: lazyPage(() => import('./pages/projects/EditProjectPage')) },
              { path: '/events/new', lazy: lazyPage(() => import('./pages/events/CreateEventPage')) },
              { path: '/events/:id/edit', lazy: lazyPage(() => import('./pages/events/EditEventPage')) },
              // Virtual Hackathon (migration 070). Absolute literal paths —
              // site-search.test.ts matches route paths literally, and only
              // /hackathons is reachable from site-map.ts because a site-map
              // href can never contain a :param.
              { path: '/hackathons', lazy: lazyPage(() => import('./pages/hackathons/HackathonsPage')) },
              { path: '/events/:id/venue', lazy: lazyPage(() => import('./pages/events/EventVenuePage')) },
              {
                path: '/events/:id/venue/room/:roomId',
                lazy: lazyPage(() => import('./pages/events/EventVenueRoomPage')),
              },
              { path: '/grants/my-applications', lazy: lazyPage(() => import('./pages/grants/MyApplicationsPage')) },
              { path: '/grants/:id/apply', lazy: lazyPage(() => import('./pages/grants/GrantApplicationPage')) },
              { path: '/forums/:slug/new', lazy: lazyPage(() => import('./pages/forums/CreatePostPage')) },
              // Your own gallery. Signed-in only — it is built from
              // check_my_achievements(), which has no anonymous meaning.
              { path: '/achievements', lazy: lazyPage(() => import('./pages/achievements/AchievementsPage')) },
              // The CV. Auto-populated for members who arrive from the OECS
              // Virtual Campus, hand-written by everyone else.
              { path: '/cv', lazy: lazyPage(() => import('./pages/cv/CvPage')) },
              { path: '/cv/edit', lazy: lazyPage(() => import('./pages/cv/CvEditPage')) },
              // Member pages came back at /u/:id (066). The drawer over
              // /directory is still the in-app default; the page exists so a
              // profile can be shared outside the app. /profile/* stays as a
              // redirect for old links and for the URLs already stored in
              // notification rows.
              { path: '/profile/me', element: <Navigate to="/dashboard" replace /> },
              { path: '/profile/:id', lazy: lazyPage(() => import('./pages/MemberRedirect')) },
              { path: '/messages', lazy: lazyPage(() => import('./pages/messages/MessagesRedirect')) },
              { path: '/settings', lazy: lazyPage(() => import('./pages/settings/SettingsPage')) },
              { path: '/grievances/report/:userId', lazy: lazyPage(() => import('./pages/grievances/ReportUserPage')) },
              { path: '/grievances/my-reports', lazy: lazyPage(() => import('./pages/grievances/MyGrievancesPage')) },
              { path: '/collaborate', lazy: lazyPage(() => import('./pages/collaborate/CollaborateHubPage')) },
              { path: '/collaborate/whiteboards', lazy: lazyPage(() => import('./pages/collaborate/WhiteboardsListPage')) },
              { path: '/collaborate/whiteboard/new', lazy: lazyPage(() => import('./pages/collaborate/WhiteboardPage')) },
              { path: '/collaborate/whiteboard/:id', lazy: lazyPage(() => import('./pages/collaborate/WhiteboardPage')) },
              { path: '/collaborate/documents', lazy: lazyPage(() => import('./pages/collaborate/DocumentsListPage')) },
              { path: '/collaborate/document/new', lazy: lazyPage(() => import('./pages/collaborate/DocumentEditorPage')) },
              { path: '/collaborate/document/:id', lazy: lazyPage(() => import('./pages/collaborate/DocumentEditorPage')) },
              { path: '/collaborate/snippets', lazy: lazyPage(() => import('./pages/collaborate/SnippetsListPage')) },
              // Bare /collaborate/code kept for old links; snippets are DB-backed now.
              { path: '/collaborate/code', element: <Navigate to="/collaborate/code/new" replace /> },
              { path: '/collaborate/code/new', lazy: lazyPage(() => import('./pages/collaborate/CodeEditorPage')) },
              { path: '/collaborate/code/:id', lazy: lazyPage(() => import('./pages/collaborate/CodeEditorPage')) },
              { path: '/collaborate/video', lazy: lazyPage(() => import('./pages/collaborate/VideoConferencePage')) },
              { path: '/invitations', lazy: lazyPage(() => import('./pages/InvitationsPage')) },
              { path: '/sme/verification', lazy: lazyPage(() => import('./pages/sme/ChamberOnboardingPage')) },
              // Organisation-tier counterpart to /cv/edit.
              { path: '/org/edit', lazy: lazyPage(() => import('./pages/sme/OrgProfileEditPage')) },
            ],
          },

          // Redeeming an emailed invite is public: an unauthenticated visitor
          // gets pointed at signup, and the token is redeemed once they return.
          { path: '/join/:token', lazy: lazyPage(() => import('./pages/JoinInvitePage')) },

          // Admin routes
          {
            Component: AdminRoute,
            children: [
              {
                Component: AdminLayout,
                children: [
                  { path: '/admin', lazy: lazyPage(() => import('./pages/admin/AdminDashboardPage')) },
                  { path: '/admin/projects', lazy: lazyPage(() => import('./pages/admin/projects/AdminProjectsPage')) },
                  { path: '/admin/events', lazy: lazyPage(() => import('./pages/admin/events/AdminEventsPage')) },
                  { path: '/admin/events/:id', lazy: lazyPage(() => import('./pages/admin/events/AdminEventDetailPage')) },
                  { path: '/admin/users', lazy: lazyPage(() => import('./pages/admin/users/AdminUsersPage')) },
                  { path: '/admin/roles', lazy: lazyPage(() => import('./pages/admin/roles/AdminRolesPage')) },
                  { path: '/admin/achievements', lazy: lazyPage(() => import('./pages/admin/achievements/AdminAchievementsPage')) },
                  { path: '/admin/moderation', lazy: lazyPage(() => import('./pages/admin/moderation/AdminModerationPage')) },
                  { path: '/admin/institutions', lazy: lazyPage(() => import('./pages/admin/institutions/AdminInstitutionsPage')) },
                  { path: '/admin/chamber', lazy: lazyPage(() => import('./pages/admin/chamber/AdminChamberPage')) },
                  { path: '/admin/grants', lazy: lazyPage(() => import('./pages/admin/grants/AdminGrantsPage')) },
                  { path: '/admin/forums', lazy: lazyPage(() => import('./pages/admin/forums/AdminForumsPage')) },
                  { path: '/admin/resources', lazy: lazyPage(() => import('./pages/admin/resources/AdminResourcesPage')) },
                  { path: '/admin/grievances', lazy: lazyPage(() => import('./pages/admin/grievances/AdminGrievancesPage')) },
                  { path: '/admin/feedback', lazy: lazyPage(() => import('./pages/admin/feedback/AdminFeedbackPage')) },
                  { path: '/admin/verification', lazy: lazyPage(() => import('./pages/admin/verification/AdminVerificationPage')) },
                  { path: '/admin/integrations', lazy: lazyPage(() => import('./pages/admin/integrations/AdminIntegrationsPage')) },
                  { path: '/admin/employers', lazy: lazyPage(() => import('./pages/admin/employers/AdminEmployersPage')) },
                  { path: '/admin/partner-api', lazy: lazyPage(() => import('./pages/admin/partner-api/AdminPartnerApiPage')) },
                  { path: '/admin/analytics', lazy: lazyPage(() => import('./pages/admin/analytics/AdminAnalyticsPage')) },
                  { path: '/admin/uat', lazy: lazyPage(() => import('./pages/admin/uat/AdminUATPage')) },
                  { path: '/admin/errors', lazy: lazyPage(() => import('./pages/admin/errors/AdminErrorsPage')) },
                  // Sends deliberate events to the live Sentry project, so it is
                  // gated by AdminRoute like every other page here rather than
                  // by a build flag.
                  { path: '/admin/errors/simulate', lazy: lazyPage(() => import('./pages/admin/errors/AdminErrorSimulatorPage')) },
                ],
              },
            ],
          },

          // 404 (inside MainLayout so nav stays visible)
          { path: '*', lazy: lazyPage(() => import('./pages/NotFoundPage')) },
        ],
      },
    ],
  },
])

function App() {
  return (
    <AppErrorBoundary>
      {/* Outside the router: the choice gates analytics and performance tracing
          for the whole app, including the auth pages, and it needs no route
          context of its own. */}
      <AnalyticsConsentBanner />
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <AchievementProvider>
              <RouterProvider router={router} />
            </AchievementProvider>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}

export default App
