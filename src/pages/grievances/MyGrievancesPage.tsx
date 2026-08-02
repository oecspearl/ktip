import { Link } from 'react-router'
import { Card } from '../../components/ui/Card'
import { useMyGrievances } from '../../hooks/useGrievances'
import { useSubmissionReceipts } from '../../hooks/useSubmissionReceipts'
import { useAuth } from '../../contexts/AuthContext'
import {
  GRIEVANCE_CATEGORY_LABELS,
  GRIEVANCE_CATEGORY_COLORS,
  GRIEVANCE_STATUS_LABELS,
  GRIEVANCE_STATUS_COLORS,
} from '../../lib/constants'
import { formatDate } from '../../lib/utils'
import { ShieldAlert, Clock, HelpCircle, ArrowLeft, Receipt } from 'lucide-react'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PageHero } from '../../components/layout/PageHero'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'

export default function MyGrievancesPage() {
  const auth = useAuth()
  const { grievances, loading } = useMyGrievances(auth.user?.id)
  const { receipts } = useSubmissionReceipts(auth.user?.id)

  // grievance id -> receipt id, for the "submitted copy" link
  const receiptByGrievance = new Map(
    (receipts || [])
      .filter((r) => r.source_table === 'grievances')
      .map((r) => [r.source_id, r.id])
  )

  usePageTitle('My Reports')

  return (
    <>
      <PageHero
        eyebrow="Community Safety"
        title="My Reports"
        subtitle="Track the status of your submitted reports"
        imageSeed="grievances"
        compact
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'My Reports' }]}
      />

      <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 py-8">
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
            <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-6 animate-pulse-soft h-32" />
            <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-6 animate-pulse-soft h-32" />
          </div>
        ) : grievances && grievances.length > 0 ? (
          <div data-tutorial="grievances-list" className="space-y-4">
            {grievances.map((grievance) => {
              const reportedName = grievance.reported_user?.display_name || 'Unknown User'

              return (
                <Card key={grievance.id}>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Reported User Avatar */}
                    <DiamondAvatar name={reportedName} size={40} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="font-semibold text-ktip-sand-900">{reportedName}</span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${GRIEVANCE_CATEGORY_COLORS[grievance.category] || 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200'}`}
                        >
                          {GRIEVANCE_CATEGORY_LABELS[grievance.category] || grievance.category}
                        </span>
                      </div>

                      <p className="text-ktip-sand-600 text-sm line-clamp-3 mb-3">
                        {grievance.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-ktip-sand-500">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-medium border ${GRIEVANCE_STATUS_COLORS[grievance.status] || 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200'}`}
                        >
                          {GRIEVANCE_STATUS_LABELS[grievance.status] || grievance.status}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatDate(grievance.created_at)}
                        </span>
                        {receiptByGrievance.has(grievance.id) && (
                          <Link
                            to={`/dashboard/submissions/${receiptByGrievance.get(grievance.id)}`}
                            className="inline-flex items-center gap-1 font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
                          >
                            <Receipt size={12} />
                            View submitted copy
                          </Link>
                        )}
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
