import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import {
  createBrowserRouter as createBrowserRouterBase,
  Outlet,
  Link,
  Navigate,
  useParams,
} from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { AchievementProvider } from './contexts/AchievementContext'
import { LanguageProvider } from './i18n/LanguageProvider'
import { LanguageProfileSync } from './i18n/LanguageProfileSync'
import { AchievementUnlockModal } from './components/achievements/AchievementUnlockModal'
import { AnalyticsProvider } from './hooks/useAnalytics'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { PermissionRoute } from './components/PermissionRoute'
import { AppErrorBoundary } from './components/ErrorBoundary'
import { AnalyticsConsentBanner } from './components/AnalyticsConsentBanner'
import { InstallPrompt } from './components/InstallPrompt'
import { WelcomePanel } from './components/WelcomePanel'
import { MainLayout } from './components/layout/MainLayout'
import { RouteSplash } from './components/RouteSplash'
import { AppError } from './lib/app-error'
import { captureException } from './lib/monitoring'
import { enableCardShuffle } from './lib/routeTransitions'

// Wrapped so Sentry names transactions after the matched route pattern
// (/projects/:id) instead of the literal URL, which would otherwise create one
// transaction per record and make performance data unaggregatable.
const createBrowserRouter = Sentry.wrapCreateBrowserRouter(createBrowserRouterBase)

/**
 * Defaults tuned for a phone on a mobile network.
 *
 * `staleTime: 30_000` with react-query's own defaults meant
 * `refetchOnWindowFocus`, `refetchOnReconnect` and `refetchOnMount` were all
 * on against a 30-second freshness window. Every one of those fires constantly
 * on a phone — switching apps, walking between cells, navigating back — and on
 * the dashboard, where ~30 queries are mounted at once, each event refetched
 * essentially all of them. That is a self-inflicted request storm at exactly
 * the moment the radio is least available.
 *
 * Raising staleTime is what fixes it, not disabling the triggers: the refetch
 * hooks only act on data that is already stale, so a 5-minute window turns a
 * storm into a handful of genuinely-expired queries. Anything that has to be
 * fresher says so at its own call site (useAchievements, useVenue and friends
 * already set their own staleTime and refetchInterval).
 *
 * refetchOnWindowFocus is off outright — returning to a tab is not evidence
 * that server state moved, and it is the one trigger with no upper bound on
 * how often a distracted phone user can fire it. refetchOnReconnect stays on:
 * coming back from a dead connection genuinely does mean data may have moved.
 *
 * gcTime doubles the default so a back-navigation inside the 10 minutes a
 * session usually spans renders from cache instead of re-fetching a page the
 * reader just left.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
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

/** /events/:id/edit → /events/:id/manage — the edit page folded into the workspace. */
function EventEditRedirect() {
  const { id } = useParams()
  return <Navigate to={`/events/${id}/manage`} replace />
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
    // Splash instead of a blank screen while a route chunk downloads.
    HydrateFallback: RouteSplash,
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

      // Responsive preview harness. Bare (it iframes the app, so it must not
      // sit inside a layout) and dev-only — spreading an empty array leaves no
      // route and no dynamic import for Rollup to follow, so the page is not
      // in the production bundle at all.
      ...(import.meta.env.DEV
        ? [{ path: '/design', lazy: lazyPage(() => import('./pages/design/ResponsivePreviewPage')) }]
        : []),
      { path: '/onboarding', lazy: lazyPage(() => import('./pages/onboarding/OnboardingPage')) },

      // Two-factor (118). Bare, beside /onboarding and for the identical reason:
      // these are what ProtectedRoute redirects TO, so putting them inside its
      // subtree is a redirect loop. Each page guards itself instead.
      { path: '/security/set-up', lazy: lazyPage(() => import('./pages/security/MfaSetupPage')) },
      { path: '/security/verify', lazy: lazyPage(() => import('./pages/security/MfaChallengePage')) },
      { path: '/security/recover', lazy: lazyPage(() => import('./pages/security/MfaRecoverPage')) },

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
          // The list stays open — being findable is the point of a directory,
          // and it is how a signed-out visitor decides the platform is worth
          // joining. The member behind a card is not: /user/:id and the drawer
          // both require a session (083).
          { path: '/directory', lazy: lazyPage(() => import('./pages/directory/DirectoryPage')) },
          // Public on purpose. A rank is only worth chasing if it can be
          // shown to someone. Excludes students, members who opted out, and
          // suspended accounts — enforced in SQL, not here.
          { path: '/leaderboard', lazy: lazyPage(() => import('./pages/leaderboard/LeaderboardPage')) },
          // Public on purpose, unlike /user/:id — a CV only a signed-in member
          // can open is not one you can send to an employer. public_resume()
          // returns nothing unless the owner published it and their profile is
          // public, so the page 404s itself rather than relying on this route.
          { path: '/user/:id/cv', lazy: lazyPage(() => import('./pages/cv/PublicCvPage')) },
          // The member page and CV lived at /u/:id until the URLs were made
          // readable. Both spellings are in bookmarks and chat logs.
          { path: '/u/:id/cv', lazy: lazyPage(() => import('./pages/MemberRedirect')) },
          // The organisation's answer to /user/:id, and public for the same
          // reason. public_employer() returns nothing unless the business is
          // Chamber-verified, so an unverified registration cannot masquerade
          // as a credential by having a page at all.
          { path: '/org/:slug', lazy: lazyPage(() => import('./pages/sme/OrgProfilePage')) },
          { path: '/resources', lazy: lazyPage(() => import('./pages/resources/ResourcesPage')) },
          { path: '/resources/:id', lazy: lazyPage(() => import('./pages/resources/ResourceDetailPage')) },
          { path: '/help', lazy: lazyPage(() => import('./pages/help/HelpCenterPage')) },
          { path: '/help/faq', lazy: lazyPage(() => import('./pages/help/FAQPage')) },
          { path: '/integrations', element: <Navigate to="/resources?tab=integrations" replace /> },

          // Legal. Public on purpose, and above ProtectedRoute for a reason: a
          // policy you must sign in to read is not a published policy, and the
          // infringement form has to be usable by a rightsholder who has no
          // account at all.
          //
          // Fourteen literal paths rather than /legal/:key, because
          // site-search.test.ts matches route paths as source literals and a
          // site-map href can never carry a :param. Each page file is three
          // lines around LegalDocumentPage: `lazy` has no props channel, and
          // `element:` would pull all fourteen documents into the entry chunk.
          { path: '/legal', lazy: lazyPage(() => import('./pages/legal/LegalIndexPage')) },
          { path: '/legal/terms', lazy: lazyPage(() => import('./pages/legal/TermsPage')) },
          { path: '/legal/privacy', lazy: lazyPage(() => import('./pages/legal/PrivacyPage')) },
          { path: '/legal/cookies', lazy: lazyPage(() => import('./pages/legal/CookiesPage')) },
          { path: '/legal/content-licence', lazy: lazyPage(() => import('./pages/legal/ContentLicencePage')) },
          { path: '/legal/acceptable-use', lazy: lazyPage(() => import('./pages/legal/AcceptableUsePage')) },
          { path: '/legal/ai-disclosure', lazy: lazyPage(() => import('./pages/legal/AiDisclosurePage')) },
          { path: '/legal/copyright', lazy: lazyPage(() => import('./pages/legal/CopyrightPage')) },
          { path: '/legal/copyright/report', lazy: lazyPage(() => import('./pages/legal/CopyrightReportPage')) },
          { path: '/legal/safeguarding', lazy: lazyPage(() => import('./pages/legal/SafeguardingPage')) },
          { path: '/legal/funding-disclaimer', lazy: lazyPage(() => import('./pages/legal/FundingDisclaimerPage')) },
          { path: '/legal/competition-ip', lazy: lazyPage(() => import('./pages/legal/CompetitionIpPage')) },
          { path: '/legal/application-confidentiality', lazy: lazyPage(() => import('./pages/legal/ApplicationConfidentialityPage')) },
          { path: '/legal/trademark', lazy: lazyPage(() => import('./pages/legal/TrademarkPage')) },
          { path: '/legal/code-contribution', lazy: lazyPage(() => import('./pages/legal/CodeContributionPage')) },
          { path: '/legal/partner-api', lazy: lazyPage(() => import('./pages/legal/PartnerApiPage')) },
          // The bare spellings are what people type, what gets printed on a
          // slide, and what docs/PRIVACY-AND-TERMS.md's checklist asked for.
          { path: '/terms', element: <Navigate to="/legal/terms" replace /> },
          { path: '/privacy', element: <Navigate to="/legal/privacy" replace /> },

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
                  { path: '/dashboard/my-profile', lazy: lazyPage(() => import('./pages/dashboard/tabs/MyProfileTab')) },
                  { path: '/dashboard/profile', lazy: lazyPage(() => import('./pages/dashboard/tabs/ProfileTab')) },
                  // Editing is a mode of the CV tab, not a departure from it:
                  // same shell, only the pane swaps. /cv/edit still resolves
                  // and redirects here for old links.
                  { path: '/dashboard/profile/edit', lazy: lazyPage(() => import('./pages/dashboard/tabs/CvEditTab')) },
                  { path: '/dashboard/progress', lazy: lazyPage(() => import('./pages/dashboard/tabs/ProgressTab')) },
                  { path: '/dashboard/achievements', lazy: lazyPage(() => import('./pages/dashboard/tabs/AchievementsTab')) },
                  // Reached from the Achievements tab's Leaderboard button;
                  // stays inside the tab shell so only the pane swaps.
                  { path: '/dashboard/leaderboard', lazy: lazyPage(() => import('./pages/dashboard/tabs/LeaderboardTab')) },
                  { path: '/dashboard/projects', lazy: lazyPage(() => import('./pages/dashboard/tabs/ProjectsTab')) },
                  { path: '/dashboard/events', lazy: lazyPage(() => import('./pages/dashboard/tabs/EventsTab')) },
                  { path: '/dashboard/connections', lazy: lazyPage(() => import('./pages/dashboard/tabs/ConnectionsTab')) },
                  { path: '/dashboard/submissions', lazy: lazyPage(() => import('./pages/dashboard/tabs/SubmissionsTab')) },
                  // The reporter's end of the feedback loop (127). Renders the
                  // same panel as /settings?tab=feedback, which still resolves —
                  // every reply notification ever sent links to that address.
                  { path: '/dashboard/feedback', lazy: lazyPage(() => import('./pages/dashboard/tabs/FeedbackTab')) },
                  // Organisation-tier counterpart to the profile (CV) tab.
                  { path: '/dashboard/business', lazy: lazyPage(() => import('./pages/dashboard/tabs/BusinessTab')) },
                  { path: '/dashboard/team', lazy: lazyPage(() => import('./pages/dashboard/tabs/TeamTab')) },
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
              // Same treatment as /projects/new: migration 090 put an
              // event:create check on the events INSERT policy, so the guard is
              // here too rather than letting a role without it fill in the
              // whole form and collect a 403 from RLS on submit.
              {
                element: <PermissionRoute require="event:create" />,
                children: [
                  { path: '/events/new', lazy: lazyPage(() => import('./pages/events/CreateEventPage')) },
                ],
              },
              // The standalone edit page is gone — event fields are edited on
              // the management workspace's Details tab. The old URL redirects
              // so bookmarks and stale links keep working.
              { path: '/events/:id/edit', element: <EventEditRedirect /> },
              // The event management workspace, for the event's organizer.
              // Same page the admin console mounts at /admin/events/:id — the
              // gate is is_venue_host-shaped (organizer or platform admin),
              // enforced inside the page and again by RLS on every write.
              {
                path: '/events/:id/manage',
                lazy: lazyPage(() => import('./pages/admin/events/AdminEventDetailPage')),
              },
              // Virtual Hackathon (migration 070). Absolute literal paths —
              // site-search.test.ts matches route paths literally, and only
              // /hackathons is reachable from site-map.ts because a site-map
              // href can never contain a :param.
              { path: '/hackathons', lazy: lazyPage(() => import('./pages/hackathons/HackathonsPage')) },
              // Readable venue URLs. The slug is derived from the event title
              // (src/lib/event-slug.ts) and the room segment is venue_rooms.key,
              // so a venue link reads as a place rather than as two uuids.
              // The layout owns the presence channel (VenuePresenceContext),
              // so moving between the floorplan and a room re-tracks on a live
              // socket instead of rebuilding the subscription from zero.
              // One route set per public segment (virtual-hackathon and
              // virtual-conference) — same pages behind both doors; the
              // canonical segment for an event is picked by venuePath().
              // Spelled out literally rather than looped: tutorials.test.ts
              // and site-search.test.ts match route paths as source literals.
              {
                path: '/events/virtual-hackathon/:slug',
                lazy: lazyPage(() => import('./pages/events/EventVenueLayout')),
                children: [
                  { index: true, lazy: lazyPage(() => import('./pages/events/EventVenuePage')) },
                  {
                    path: '/events/virtual-hackathon/:slug/room/:roomKey',
                    lazy: lazyPage(() => import('./pages/events/EventVenueRoomPage')),
                  },
                ],
              },
              {
                path: '/events/virtual-conference/:slug',
                lazy: lazyPage(() => import('./pages/events/EventVenueLayout')),
                children: [
                  { index: true, lazy: lazyPage(() => import('./pages/events/EventVenuePage')) },
                  {
                    path: '/events/virtual-conference/:slug/room/:roomKey',
                    lazy: lazyPage(() => import('./pages/events/EventVenueRoomPage')),
                  },
                ],
              },
              // Setting an event up happens on the management console now, as a
              // stepper over its own tabs. These three addresses were the two
              // standalone setup pages (089, 092); they redirect to the tab
              // they used to be.
              {
                path: '/events/virtual-hackathon/:slug/setup',
                lazy: lazyPage(() => import('./pages/events/EventSetupRedirectPage')),
              },
              {
                path: '/events/virtual-conference/:slug/setup',
                lazy: lazyPage(() => import('./pages/events/EventSetupRedirectPage')),
              },
              {
                path: '/events/:slug/setup',
                lazy: lazyPage(() => import('./pages/events/EventSetupRedirectPage')),
              },
              // The id-shaped originals, kept as redirects for old links.
              {
                path: '/events/:id/venue',
                lazy: lazyPage(() => import('./pages/events/VenueRedirectPage')),
              },
              {
                path: '/events/:id/venue/room/:roomId',
                lazy: lazyPage(() => import('./pages/events/VenueRedirectPage')),
              },
              { path: '/grants/my-applications', lazy: lazyPage(() => import('./pages/grants/MyApplicationsPage')) },
              { path: '/grants/:id/apply', lazy: lazyPage(() => import('./pages/grants/GrantApplicationPage')) },
              // The funder's half of /grants. grant:post has been on the grants
              // INSERT policy since 064 with no member-facing form to reach it;
              // 129 is where the form lands. Guarded here for the same reason
              // /projects/new is — a role without the key is told so before it
              // fills in a funding call.
              {
                element: <PermissionRoute require="grant:post" />,
                children: [
                  { path: '/grants/new', lazy: lazyPage(() => import('./pages/grants/GrantFormPage')) },
                  { path: '/grants/my-grants', lazy: lazyPage(() => import('./pages/grants/MyGrantsPage')) },
                ],
              },
              {
                element: <PermissionRoute require={['grant:post', 'grant:manage']} />,
                children: [
                  { path: '/grants/:id/edit', lazy: lazyPage(() => import('./pages/grants/GrantFormPage')) },
                ],
              },
              { path: '/forums/:slug/new', lazy: lazyPage(() => import('./pages/forums/CreatePostPage')) },
              // Boards, unlike posts, are permission-gated: migration 129 put a
              // forum:board check on the forum_boards INSERT policy, so the
              // guard is here for the same reason it is on /projects/new —
              // otherwise a role without the key fills in the form and collects
              // a 403 from RLS on submit. Editing admits forum:manage as well,
              // which is how a moderator reaches the six boards seeded by 005.
              {
                element: <PermissionRoute require="forum:board" />,
                children: [
                  { path: '/forums/new', lazy: lazyPage(() => import('./pages/forums/BoardFormPage')) },
                ],
              },
              {
                element: <PermissionRoute require={['forum:board', 'forum:manage']} />,
                children: [
                  { path: '/forums/:slug/edit', lazy: lazyPage(() => import('./pages/forums/BoardFormPage')) },
                ],
              },
              // The gallery lives in the dashboard now (AchievementsTab); the
              // old page address keeps resolving for bookmarks and the
              // notification links stored by 066_achievements_engine.sql.
              { path: '/achievements', element: <Navigate to="/dashboard/achievements" replace /> },
              // The CV lives in the dashboard now (ProfileTab); the old page
              // address keeps resolving for bookmarks and stored links.
              { path: '/cv', element: <Navigate to="/dashboard/profile" replace /> },
              { path: '/cv/edit', element: <Navigate to="/dashboard/profile/edit" replace /> },
              // Member pages came back at /user/:id (066). The drawer over
              // /directory is still the in-app default; the page exists so a
              // profile can be shared outside the app. /profile/* stays as a
              // redirect for old links and for the URLs already stored in
              // notification rows.
              // Signed-in only since 083. A member page is a person, not a
              // brochure: you have to have an account before you can read one,
              // and ProtectedRoute carries `state.from` so a shared /u/ link
              // still lands on the profile once you have signed in.
              { path: '/user/:id', lazy: lazyPage(() => import('./pages/profile/PublicProfilePage')) },
              { path: '/profile/me', element: <Navigate to="/dashboard" replace /> },
              { path: '/profile/:id', lazy: lazyPage(() => import('./pages/MemberRedirect')) },
              { path: '/u/:id', lazy: lazyPage(() => import('./pages/MemberRedirect')) },
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
              // The business profile lives in the dashboard now (BusinessTab);
              // the old page address keeps resolving for bookmarks.
              { path: '/org/edit', element: <Navigate to="/dashboard/business" replace /> },
              { path: '/org/members', element: <Navigate to="/dashboard/team" replace /> },
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
                // Router-level lazy: the admin shell never loads for non-admin
                // visitors and stays out of the public entry chunk.
                lazy: async () => {
                  const m = await import('./components/layout/AdminLayout')
                  return { Component: m.AdminLayout }
                },
                children: [
                  // The console index. Deliberately ungated: everyone AdminRoute
                  // admits has to land somewhere, and the page filters its own
                  // tiles by permission.
                  { path: '/admin', lazy: lazyPage(() => import('./pages/admin/AdminDashboardPage')) },

                  // Every other page carries the same key as its sidebar entry
                  // in AdminLayout. Until 116 only three of them did, so an
                  // administrator who typed a URL outside their remit got an
                  // empty screen or a silent 403 — which reads as a broken
                  // console rather than a closed door. The server refuses them
                  // regardless; this only turns the refusal into a stated one.
                  {
                    element: <PermissionRoute require="project:manage_all" />,
                    children: [
                      { path: '/admin/projects', lazy: lazyPage(() => import('./pages/admin/projects/AdminProjectsPage')) },
                    ],
                  },
                  {
                    // /admin/events/:id is also mounted at /events/:id/manage for
                    // organizers, so it is gated in-page and by RLS rather than
                    // here — an organizer holds no event:manage.
                    element: <PermissionRoute require="event:manage" />,
                    children: [
                      { path: '/admin/events', lazy: lazyPage(() => import('./pages/admin/events/AdminEventsPage')) },
                    ],
                  },
                  { path: '/admin/events/:id', lazy: lazyPage(() => import('./pages/admin/events/AdminEventDetailPage')) },
                  {
                    // Reading the member list, not editing it. The Create User,
                    // Reset Password and Delete controls on the page check
                    // members:manage separately, and api/admin/* refuses without
                    // it.
                    element: <PermissionRoute require="members:view" />,
                    children: [
                      { path: '/admin/users', lazy: lazyPage(() => import('./pages/admin/users/AdminUsersPage')) },
                    ],
                  },
                  {
                    element: <PermissionRoute require="role:manage" />,
                    children: [
                      { path: '/admin/roles', lazy: lazyPage(() => import('./pages/admin/roles/AdminRolesPage')) },
                    ],
                  },
                  {
                    element: <PermissionRoute require="achievement:manage" />,
                    children: [
                      { path: '/admin/achievements', lazy: lazyPage(() => import('./pages/admin/achievements/AdminAchievementsPage')) },
                    ],
                  },
                  {
                    // Grievances and moderation are the same job seen from two
                    // directions.
                    element: <PermissionRoute require="moderation:view" />,
                    children: [
                      { path: '/admin/moderation', lazy: lazyPage(() => import('./pages/admin/moderation/AdminModerationPage')) },
                      { path: '/admin/grievances', lazy: lazyPage(() => import('./pages/admin/grievances/AdminGrievancesPage')) },
                    ],
                  },
                  {
                    element: <PermissionRoute require="institution:verify" />,
                    children: [
                      { path: '/admin/institutions', lazy: lazyPage(() => import('./pages/admin/institutions/AdminInstitutionsPage')) },
                    ],
                  },
                  {
                    element: <PermissionRoute require="sme:verify" />,
                    children: [
                      { path: '/admin/chamber', lazy: lazyPage(() => import('./pages/admin/chamber/AdminChamberPage')) },
                    ],
                  },
                  {
                    element: <PermissionRoute require="grant:manage" />,
                    children: [
                      { path: '/admin/grants', lazy: lazyPage(() => import('./pages/admin/grants/AdminGrantsPage')) },
                    ],
                  },
                  {
                    element: <PermissionRoute require="forum:manage" />,
                    children: [
                      { path: '/admin/forums', lazy: lazyPage(() => import('./pages/admin/forums/AdminForumsPage')) },
                    ],
                  },
                  {
                    element: <PermissionRoute require="resource:manage" />,
                    children: [
                      { path: '/admin/resources', lazy: lazyPage(() => import('./pages/admin/resources/AdminResourcesPage')) },
                    ],
                  },
                  {
                    element: <PermissionRoute require="verification:review" />,
                    children: [
                      { path: '/admin/verification', lazy: lazyPage(() => import('./pages/admin/verification/AdminVerificationPage')) },
                    ],
                  },
                  {
                    element: <PermissionRoute require="employer:manage" />,
                    children: [
                      { path: '/admin/employers', lazy: lazyPage(() => import('./pages/admin/employers/AdminEmployersPage')) },
                    ],
                  },
                  {
                    // The residual operator surface. org:manage stopped being
                    // "runs the platform" in 116 and became exactly this list.
                    element: <PermissionRoute require="org:manage" />,
                    children: [
                      { path: '/admin/feedback', lazy: lazyPage(() => import('./pages/admin/feedback/AdminFeedbackPage')) },
                      { path: '/admin/integrations', lazy: lazyPage(() => import('./pages/admin/integrations/AdminIntegrationsPage')) },
                      { path: '/admin/partner-api', lazy: lazyPage(() => import('./pages/admin/partner-api/AdminPartnerApiPage')) },
                      { path: '/admin/analytics', lazy: lazyPage(() => import('./pages/admin/analytics/AdminAnalyticsPage')) },
                      { path: '/admin/uat', lazy: lazyPage(() => import('./pages/admin/uat/AdminUATPage')) },
                      { path: '/admin/errors', lazy: lazyPage(() => import('./pages/admin/errors/AdminErrorsPage')) },
                      // Sends deliberate events to the live Sentry project.
                      { path: '/admin/errors/simulate', lazy: lazyPage(() => import('./pages/admin/errors/AdminErrorSimulatorPage')) },
                    ],
                  },
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

enableCardShuffle(router)

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* Inside QueryClientProvider so the client survives a language switch —
            LanguageProvider remounts everything beneath it, and refetching the
            whole app on a switch would be both slow and pointless, since rows
            are cached in one language and translated at render time.
            Above ToastProvider and AuthProvider because both raise text that
            has to be translated. */}
        <LanguageProvider>
          {/* Outside the router: the choice gates analytics and performance
              tracing for the whole app, including the auth pages, and it needs
              no route context of its own. It must sit INSIDE LanguageProvider:
              its copy is wrapped in <Trans>, and a <Trans> above I18nProvider
              throws — which, caught by a boundary whose fallback also used
              <Trans>, once blanked the entire app. */}
          <AnalyticsConsentBanner />
          {/* Same placement rules as the banner above: <Trans> copy, so inside
              LanguageProvider, and no route context needed. It renders nothing
              at all on desktop, when already installed, or once declined —
              and never at the same time as the consent sheet, because it waits
              for `beforeinstallprompt`, which fires well after first paint. */}
          <InstallPrompt />
          {/* Same two placement rules again, and both are load-bearing here:
              inside LanguageProvider because its copy is <Trans>, and outside
              the router because it must cover whatever URL the reader arrived
              at, auth pages included. Outside the router also means it may not
              touch <Link> or any router hook — that is the bug the banner's
              comment above describes, and it reproduced on a first visit,
              which is the only visit this panel ever has. */}
          <WelcomePanel />
          <ToastProvider>
            <AuthProvider>
              {/* Renders nothing. Carries the language choice between this
                  device and profiles.preferred_language — it must sit inside
                  AuthProvider to see the profile, and it cannot live inside
                  AuthProvider itself because LanguageProvider is above it. */}
              <LanguageProfileSync />
              <AchievementProvider>
                <RouterProvider router={router} />
              </AchievementProvider>
            </AuthProvider>
          </ToastProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}

export default App
