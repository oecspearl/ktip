import { Link } from 'react-router'
import { CalendarDays, Inbox } from 'lucide-react'
import { DashboardCalendar } from '../../../components/calendar/DashboardCalendar'
import { RecentSubmissions } from '../../../components/dashboard/RecentSubmissions'
import { ForYouRail } from '../../../components/personalization/ForYouRail'
import { usePageTitle } from '../../../hooks/usePageTitle'

export default function OverviewTab() {
  usePageTitle('Dashboard')

  return (
    <>
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
