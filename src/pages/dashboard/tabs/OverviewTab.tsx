import { Link } from 'react-router'
import { CalendarDays, Users, UserPlus, ChevronRight, Inbox } from 'lucide-react'
import { DashboardCalendar } from '../../../components/calendar/DashboardCalendar'
import { RecentSubmissions } from '../../../components/dashboard/RecentSubmissions'
import { ForYouRail } from '../../../components/personalization/ForYouRail'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { useAuth } from '../../../contexts/AuthContext'
import { useConnectionCount, usePendingRequests } from '../../../hooks/useConnections'
import { useMyCollabInvites } from '../../../hooks/useCollabInvites'
import { useMyProjectInvites } from '../../../hooks/useProjectMembers'
import { CONNECTION_VISIBILITY_LABELS } from '../../../lib/constants'

export default function OverviewTab() {
  usePageTitle('Dashboard')
  const auth = useAuth()
  // Own count is always visible to the owner, so this is never null here
  const { count: connectionCount, loading: countLoading } = useConnectionCount(auth.user?.id)
  const { requests } = usePendingRequests(auth.user?.id)
  const { invites: collabInvites } = useMyCollabInvites(auth.user?.id)
  const { invites: projectInvites } = useMyProjectInvites(auth.user?.id)
  // Everything /invitations can act on, not just connection requests.
  const pendingCount =
    (requests?.length || 0) + (collabInvites?.length || 0) + (projectInvites?.length || 0)
  const visibility = auth.profile?.connection_count_visibility || 'public'

  return (
    <>
      {/* Network summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="group flex items-center gap-4 bg-ktip-cream border border-gray-200 rounded-2xl p-5 hover:border-ktip-ocean-300 transition-colors">
          <div className="w-12 h-12 bg-ktip-ocean-100 rounded-xl flex items-center justify-center shrink-0">
            <Users size={22} className="text-ktip-ocean-600" />
          </div>
          <div className="min-w-0 flex-1">
            <Link to="/dashboard/connections" className="block">
              <p className="text-2xl font-display font-bold text-ktip-sand-900 leading-tight">
                {countLoading ? '—' : connectionCount ?? 0}
              </p>
              <p className="text-sm text-ktip-sand-600">
                {connectionCount === 1 ? 'Connection' : 'Connections'}
              </p>
            </Link>
            <p className="text-xs text-ktip-sand-400 mt-0.5">
              Visible to: {CONNECTION_VISIBILITY_LABELS[visibility] || 'Everyone'}
              {' · '}
              <Link to="/settings?tab=preferences" className="text-ktip-ocean-600 hover:underline">
                Change
              </Link>
            </p>
          </div>
          <ChevronRight size={18} className="text-ktip-sand-300 group-hover:text-ktip-ocean-500 shrink-0" />
        </div>

        <Link
          to="/invitations"
          className="group flex items-center gap-4 bg-ktip-cream border border-gray-200 rounded-2xl p-5 hover:border-ktip-ocean-300 transition-colors"
        >
          <div className="w-12 h-12 bg-ktip-tropical-100 rounded-xl flex items-center justify-center shrink-0">
            <UserPlus size={22} className="text-ktip-tropical-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-display font-bold text-ktip-sand-900 leading-tight">
              {pendingCount}
            </p>
            <p className="text-sm text-ktip-sand-600">
              Pending {pendingCount === 1 ? 'invitation' : 'invitations'}
            </p>
            <p className="text-xs text-ktip-sand-400 mt-0.5">
              Collaboration, project and connection requests
            </p>
          </div>
          <ChevronRight size={18} className="text-ktip-sand-300 group-hover:text-ktip-ocean-500 shrink-0" />
        </Link>
      </div>

      {/* Renders nothing when personalization is off or there is no signal */}
      <ForYouRail limit={6} title="For You" />

      {/* Copies of everything the member has submitted */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Inbox size={18} className="text-ktip-ocean-600" />
          <h2 className="font-display font-bold text-xl text-ktip-sand-900">My Submissions</h2>
        </div>
        <Link
          to="/dashboard/submissions"
          className="text-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
        >
          View all
        </Link>
      </div>
      <div className="mb-8">
        <RecentSubmissions />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={18} className="text-ktip-ocean-600" />
        <h2 className="font-display font-bold text-xl text-ktip-sand-900">My Calendar</h2>
      </div>
      <DashboardCalendar scope="personal" />
    </>
  )
}
