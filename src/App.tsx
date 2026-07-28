import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider, Outlet, Link, Navigate } from 'react-router'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { AnalyticsProvider } from './hooks/useAnalytics'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { AppErrorBoundary } from './components/ErrorBoundary'
import { MainLayout } from './components/layout/MainLayout'
import { AdminLayout } from './components/layout/AdminLayout'

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
    const mod = await importer().catch(() => ({ default: Placeholder }))
    return { Component: mod.default }
  }
}

function AnalyticsRoot() {
  return (
    <AnalyticsProvider>
      <Outlet />
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
          { path: '/resources', lazy: lazyPage(() => import('./pages/resources/ResourcesPage')) },
          { path: '/resources/:id', lazy: lazyPage(() => import('./pages/resources/ResourceDetailPage')) },
          { path: '/help', lazy: lazyPage(() => import('./pages/help/HelpCenterPage')) },
          { path: '/help/faq', lazy: lazyPage(() => import('./pages/help/FAQPage')) },
          { path: '/integrations', element: <Navigate to="/resources?tab=integrations" replace /> },

          // Authenticated routes
          {
            Component: ProtectedRoute,
            children: [
              { path: '/projects/new', lazy: lazyPage(() => import('./pages/projects/CreateProjectPage')) },
              { path: '/projects/:id/edit', lazy: lazyPage(() => import('./pages/projects/EditProjectPage')) },
              { path: '/events/new', lazy: lazyPage(() => import('./pages/events/CreateEventPage')) },
              { path: '/events/:id/edit', lazy: lazyPage(() => import('./pages/events/EditEventPage')) },
              { path: '/grants/my-applications', lazy: lazyPage(() => import('./pages/grants/MyApplicationsPage')) },
              { path: '/grants/:id/apply', lazy: lazyPage(() => import('./pages/grants/GrantApplicationPage')) },
              { path: '/forums/:slug/new', lazy: lazyPage(() => import('./pages/forums/CreatePostPage')) },
              { path: '/profile/me', lazy: lazyPage(() => import('./pages/profile/ProfilePage')) },
              { path: '/profile/:id', lazy: lazyPage(() => import('./pages/profile/ProfilePage')) },
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
              { path: '/collaborate/code', lazy: lazyPage(() => import('./pages/collaborate/CodeEditorPage')) },
              { path: '/collaborate/video', lazy: lazyPage(() => import('./pages/collaborate/VideoConferencePage')) },
            ],
          },

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
                  { path: '/admin/grants', lazy: lazyPage(() => import('./pages/admin/grants/AdminGrantsPage')) },
                  { path: '/admin/forums', lazy: lazyPage(() => import('./pages/admin/forums/AdminForumsPage')) },
                  { path: '/admin/resources', lazy: lazyPage(() => import('./pages/admin/resources/AdminResourcesPage')) },
                  { path: '/admin/grievances', lazy: lazyPage(() => import('./pages/admin/grievances/AdminGrievancesPage')) },
                  { path: '/admin/feedback', lazy: lazyPage(() => import('./pages/admin/feedback/AdminFeedbackPage')) },
                  { path: '/admin/verification', lazy: lazyPage(() => import('./pages/admin/verification/AdminVerificationPage')) },
                  { path: '/admin/integrations', lazy: lazyPage(() => import('./pages/admin/integrations/AdminIntegrationsPage')) },
                  { path: '/admin/preregistrations', lazy: lazyPage(() => import('./pages/admin/preregistrations/AdminPreregistrationsPage')) },
                  { path: '/admin/analytics', lazy: lazyPage(() => import('./pages/admin/analytics/AdminAnalyticsPage')) },
                  { path: '/admin/uat', lazy: lazyPage(() => import('./pages/admin/uat/AdminUATPage')) },
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
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}

export default App
