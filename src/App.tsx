import { lazy } from 'solid-js'
import { Router, Route } from '@solidjs/router'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { AnalyticsProvider } from './hooks/useAnalytics'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { AppErrorBoundary } from './components/ErrorBoundary'

// Lazy-loaded pages
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const SignupPage = lazy(() => import('./pages/auth/SignupPage'))
const DiscoverPage = lazy(() => import('./pages/discover/DiscoverPage'))
const ProjectsPage = lazy(() => import('./pages/projects/ProjectsPage'))
const ProjectDetailPage = lazy(() => import('./pages/projects/ProjectDetailPage'))
const CreateProjectPage = lazy(() => import('./pages/projects/CreateProjectPage'))
const EditProjectPage = lazy(() => import('./pages/projects/EditProjectPage'))
const EventsPage = lazy(() => import('./pages/events/EventsPage'))
const EventDetailPage = lazy(() => import('./pages/events/EventDetailPage'))
const CreateEventPage = lazy(() => import('./pages/events/CreateEventPage'))
const EditEventPage = lazy(() => import('./pages/events/EditEventPage'))
const GrantsPage = lazy(() => import('./pages/grants/GrantsPage'))
const GrantDetailPage = lazy(() => import('./pages/grants/GrantDetailPage'))
const MyApplicationsPage = lazy(() => import('./pages/grants/MyApplicationsPage'))
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'))
const MessagesPage = lazy(() => import('./pages/messages/MessagesPage'))
const ForumsPage = lazy(() => import('./pages/forums/ForumsPage'))
const BoardPage = lazy(() => import('./pages/forums/BoardPage'))
const CreatePostPage = lazy(() => import('./pages/forums/CreatePostPage'))
const PostDetailPage = lazy(() => import('./pages/forums/PostDetailPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'))
const ProposalsPage = lazy(() => import('./pages/proposals/ProposalsPage'))
const CreateProposalPage = lazy(() => import('./pages/proposals/CreateProposalPage'))
const ProposalDetailPage = lazy(() => import('./pages/proposals/ProposalDetailPage'))
const SharedProposalPage = lazy(() => import('./pages/proposals/SharedProposalPage'))
const CollaborateHubPage = lazy(() => import('./pages/collaborate/CollaborateHubPage'))
const WhiteboardPage = lazy(() => import('./pages/collaborate/WhiteboardPage'))
const WhiteboardsListPage = lazy(() => import('./pages/collaborate/WhiteboardsListPage'))
const DocumentsListPage = lazy(() => import('./pages/collaborate/DocumentsListPage'))
const DocumentEditorPage = lazy(() => import('./pages/collaborate/DocumentEditorPage'))
const CodeEditorPage = lazy(() => import('./pages/collaborate/CodeEditorPage'))
const VideoConferencePage = lazy(() => import('./pages/collaborate/VideoConferencePage'))
const HelpCenterPage = lazy(() => import('./pages/help/HelpCenterPage'))
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'))
const AdminEventsPage = lazy(() => import('./pages/admin/events/AdminEventsPage'))
const AdminEventDetailPage = lazy(() => import('./pages/admin/events/AdminEventDetailPage'))
const AdminUsersPage = lazy(() => import('./pages/admin/users/AdminUsersPage'))
const AdminGrantsPage = lazy(() => import('./pages/admin/grants/AdminGrantsPage'))
const AdminForumsPage = lazy(() => import('./pages/admin/forums/AdminForumsPage'))
const DirectoryPage = lazy(() => import('./pages/directory/DirectoryPage'))
const ResourcesPage = lazy(() => import('./pages/resources/ResourcesPage'))
const ResourceDetailPage = lazy(() => import('./pages/resources/ResourceDetailPage'))
const AdminResourcesPage = lazy(() => import('./pages/admin/resources/AdminResourcesPage'))
const ReportUserPage = lazy(() => import('./pages/grievances/ReportUserPage'))
const MyGrievancesPage = lazy(() => import('./pages/grievances/MyGrievancesPage'))
const AdminGrievancesPage = lazy(() => import('./pages/admin/grievances/AdminGrievancesPage'))
const AdminPreregistrationsPage = lazy(() => import('./pages/admin/preregistrations/AdminPreregistrationsPage'))
const AdminAnalyticsPage = lazy(() => import('./pages/admin/analytics/AdminAnalyticsPage'))
const AdminUATPage = lazy(() => import('./pages/admin/uat/AdminUATPage'))

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function App() {
  return (
    <AppErrorBoundary>
    <ToastProvider>
    <AnalyticsProvider>
    <AuthProvider>
      <Router>
        {/* Public Routes */}
        <Route path="/login" component={LoginPage} />
        <Route path="/signup" component={SignupPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />

        {/* Public Browse Routes */}
        <Route path="/" component={DiscoverPage} />
        <Route path="/projects" component={ProjectsPage} />
        <Route path="/projects/:id" component={ProjectDetailPage} />
        <Route path="/events" component={EventsPage} />
        <Route path="/events/:id" component={EventDetailPage} />
        <Route path="/grants" component={GrantsPage} />
        <Route path="/grants/:id" component={GrantDetailPage} />
        <Route path="/forums" component={ForumsPage} />
        <Route path="/forums/:slug" component={BoardPage} />
        <Route path="/forums/:slug/:postId" component={PostDetailPage} />
        <Route path="/proposals/shared/:token" component={SharedProposalPage} />
        <Route path="/directory" component={DirectoryPage} />
        <Route path="/resources" component={ResourcesPage} />
        <Route path="/resources/:id" component={ResourceDetailPage} />
        <Route path="/help" component={HelpCenterPage} />

        {/* Protected Routes (require login) */}
        <Route
          path="/projects/new"
          component={() => (
            <ProtectedRoute>
              <CreateProjectPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/projects/:id/edit"
          component={() => (
            <ProtectedRoute>
              <EditProjectPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/events/new"
          component={() => (
            <ProtectedRoute>
              <CreateEventPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/events/:id/edit"
          component={() => (
            <ProtectedRoute>
              <EditEventPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/grants/my-applications"
          component={() => (
            <ProtectedRoute>
              <MyApplicationsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/profile/me"
          component={() => (
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/profile/:id"
          component={() => (
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/messages"
          component={() => (
            <ProtectedRoute>
              <MessagesPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/forums/:slug/new"
          component={() => (
            <ProtectedRoute>
              <CreatePostPage />
            </ProtectedRoute>
          )}
        />

        {/* Proposal Routes (Protected) */}
        <Route
          path="/proposals"
          component={() => (
            <ProtectedRoute>
              <ProposalsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/proposals/new"
          component={() => (
            <ProtectedRoute>
              <CreateProposalPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/proposals/:id"
          component={() => (
            <ProtectedRoute>
              <ProposalDetailPage />
            </ProtectedRoute>
          )}
        />

        {/* Grievance Routes (Protected) */}
        <Route
          path="/grievances/report/:userId"
          component={() => (
            <ProtectedRoute>
              <ReportUserPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/grievances/my-reports"
          component={() => (
            <ProtectedRoute>
              <MyGrievancesPage />
            </ProtectedRoute>
          )}
        />

        {/* Settings Route (Protected) */}
        <Route
          path="/settings"
          component={() => (
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          )}
        />

        {/* Collaboration Routes (Protected) */}
        <Route
          path="/collaborate"
          component={() => (
            <ProtectedRoute>
              <CollaborateHubPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/collaborate/whiteboards"
          component={() => (
            <ProtectedRoute>
              <WhiteboardsListPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/collaborate/whiteboard/new"
          component={() => (
            <ProtectedRoute>
              <WhiteboardPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/collaborate/whiteboard/:id"
          component={() => (
            <ProtectedRoute>
              <WhiteboardPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/collaborate/documents"
          component={() => (
            <ProtectedRoute>
              <DocumentsListPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/collaborate/document/new"
          component={() => (
            <ProtectedRoute>
              <DocumentEditorPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/collaborate/document/:id"
          component={() => (
            <ProtectedRoute>
              <DocumentEditorPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/collaborate/code"
          component={() => (
            <ProtectedRoute>
              <CodeEditorPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/collaborate/video"
          component={() => (
            <ProtectedRoute>
              <VideoConferencePage />
            </ProtectedRoute>
          )}
        />

        {/* Admin Routes (OECS only) */}
        <Route
          path="/admin"
          component={() => (
            <AdminRoute>
              <AdminDashboardPage />
            </AdminRoute>
          )}
        />
        <Route
          path="/admin/events"
          component={() => (
            <AdminRoute>
              <AdminEventsPage />
            </AdminRoute>
          )}
        />
        <Route
          path="/admin/events/:id"
          component={() => (
            <AdminRoute>
              <AdminEventDetailPage />
            </AdminRoute>
          )}
        />
        <Route
          path="/admin/users"
          component={() => (
            <AdminRoute>
              <AdminUsersPage />
            </AdminRoute>
          )}
        />
        <Route
          path="/admin/grants"
          component={() => (
            <AdminRoute>
              <AdminGrantsPage />
            </AdminRoute>
          )}
        />
        <Route
          path="/admin/forums"
          component={() => (
            <AdminRoute>
              <AdminForumsPage />
            </AdminRoute>
          )}
        />
        <Route
          path="/admin/resources"
          component={() => (
            <AdminRoute>
              <AdminResourcesPage />
            </AdminRoute>
          )}
        />

        <Route
          path="/admin/grievances"
          component={() => (
            <AdminRoute>
              <AdminGrievancesPage />
            </AdminRoute>
          )}
        />
        <Route
          path="/admin/preregistrations"
          component={() => (
            <AdminRoute>
              <AdminPreregistrationsPage />
            </AdminRoute>
          )}
        />
        <Route
          path="/admin/analytics"
          component={() => (
            <AdminRoute>
              <AdminAnalyticsPage />
            </AdminRoute>
          )}
        />
        <Route
          path="/admin/uat"
          component={() => (
            <AdminRoute>
              <AdminUATPage />
            </AdminRoute>
          )}
        />
        {/* 404 Catch-all */}
        <Route path="*" component={NotFoundPage} />
      </Router>
    </AuthProvider>
    </AnalyticsProvider>
    </ToastProvider>
    </AppErrorBoundary>
  )
}

export default App
