import { Link } from 'react-router'
import { Card } from '../../components/ui/Card'
import { useMyGrievances } from '../../hooks/useGrievances'
import { useAuth } from '../../contexts/AuthContext'
import {
  GRIEVANCE_CATEGORY_LABELS,
  GRIEVANCE_CATEGORY_COLORS,
  GRIEVANCE_STATUS_LABELS,
  GRIEVANCE_STATUS_COLORS,
} from '../../lib/constants'
import { formatDate, getInitials, generateAvatarColor } from '../../lib/utils'
import { ChevronRight, ShieldAlert, Clock, HelpCircle, ArrowLeft } from 'lucide-react'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function MyGrievancesPage() {
  const auth = useAuth()
  const { grievances, loading } = useMyGrievances(auth.user?.id)

  usePageTitle('My Reports')

  return (
    <>
      {/* Dark Hero */}
      <div className="bg-gray-800">
        <div className="container mx-auto px-4 py-6">
          <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-4">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={14} className="text-gray-500" />
            <span className="text-gray-200">My Reports</span>
          </nav>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-ktip-ocean-500/20 flex items-center justify-center">
              <ShieldAlert size={20} className="text-ktip-ocean-400" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-white">My Reports</h1>
              <p className="text-gray-400 text-sm">Track the status of your submitted reports</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Navigation helpers — back to home / on to help center */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-ktip-sand-600 hover:text-ktip-sand-900 font-medium transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Home
          </Link>
          <Link
            to="/help"
            className="inline-flex items-center gap-1.5 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium transition-colors"
          >
            <HelpCircle size={16} />
            Visit Help Center
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-card border border-ktip-sand-100 p-6 animate-pulse-soft h-32" />
            <div className="bg-white rounded-2xl shadow-card border border-ktip-sand-100 p-6 animate-pulse-soft h-32" />
          </div>
        ) : grievances && grievances.length > 0 ? (
          <div className="space-y-4">
            {grievances.map((grievance) => {
              const reportedName = grievance.reported_user?.display_name || 'Unknown User'

              return (
                <Card key={grievance.id}>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Reported User Avatar */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${generateAvatarColor(reportedName)}`}
                    >
                      {getInitials(reportedName)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="font-semibold text-ktip-sand-900">{reportedName}</span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${GRIEVANCE_CATEGORY_COLORS[grievance.category] || 'bg-gray-100 text-gray-700 border-gray-200'}`}
                        >
                          {GRIEVANCE_CATEGORY_LABELS[grievance.category] || grievance.category}
                        </span>
                      </div>

                      <p className="text-ktip-sand-600 text-sm line-clamp-3 mb-3">
                        {grievance.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-ktip-sand-500">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-medium border ${GRIEVANCE_STATUS_COLORS[grievance.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}
                        >
                          {GRIEVANCE_STATUS_LABELS[grievance.status] || grievance.status}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatDate(grievance.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert size={32} className="text-ktip-sand-400" />
            </div>
            <h2 className="text-xl font-display font-bold text-ktip-sand-900 mb-2">No reports submitted</h2>
            <p className="text-ktip-sand-600">You haven't submitted any reports yet. If you encounter inappropriate behavior, you can report a user from their profile page.</p>
          </div>
        )}
      </div>
    </>
  )
}
