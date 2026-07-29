import { Link } from 'react-router'
import { FileText, Inbox, ArrowRight } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { SubmissionKindBadge } from '../../../components/shared/SubmissionKindBadge'
import { useSubmissionReceipts } from '../../../hooks/useSubmissionReceipts'
import { useAuth } from '../../../contexts/AuthContext'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { formatDate } from '../../../lib/utils'

export default function SubmissionsTab() {
  usePageTitle('My Submissions')
  const auth = useAuth()
  const { receipts, loading } = useSubmissionReceipts(auth.user?.id)

  if (loading || !receipts) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
        <p className="mt-4 text-ktip-sand-600">Loading submissions...</p>
      </div>
    )
  }

  if (!receipts.length) {
    return (
      <div className="bg-ktip-cream border border-gray-200 rounded-lg p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Inbox size={32} className="text-ktip-sand-400" />
          </div>
          <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
            Nothing submitted yet
          </h3>
          <p className="text-ktip-sand-600 mb-6">
            When you apply for a grant or register for an event, your copy of the submission shows
            up here.
          </p>
          <Link to="/grants">
            <Button icon={<FileText size={20} />}>Browse Grants</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-ktip-cream border border-gray-200 rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <p className="text-sm text-ktip-sand-600">
          {receipts.length} submission{receipts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {receipts.map((receipt, index) => (
        <div
          key={receipt.id}
          className={`px-6 py-5 ${index < receipts.length - 1 ? 'border-b border-gray-200' : ''}`}
        >
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              <div className="mb-2">
                <SubmissionKindBadge kind={receipt.kind} />
              </div>
              <Link
                to={`/dashboard/submissions/${receipt.id}`}
                className="text-xl font-display font-bold text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
              >
                {receipt.title}
              </Link>
              {receipt.subtitle && (
                <p className="text-sm text-ktip-sand-600 mt-1">{receipt.subtitle}</p>
              )}
              <p className="text-sm text-ktip-sand-500 mt-2">
                Submitted {formatDate(receipt.submitted_at)}
              </p>
            </div>

            <Link to={`/dashboard/submissions/${receipt.id}`}>
              <Button variant="outline" size="sm" icon={<ArrowRight size={16} />}>
                View copy
              </Button>
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
