import { Link } from 'react-router'
import { ArrowRight, Inbox } from 'lucide-react'
import { SubmissionKindBadge } from '../shared/SubmissionKindBadge'
import { useSubmissionReceipts } from '../../hooks/useSubmissionReceipts'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate } from '../../lib/utils'
import { Trans } from '@lingui/react/macro'

/** The applicant's most recent submitted copies, surfaced on the dashboard. */
export function RecentSubmissions({ limit = 5 }: { limit?: number }) {
  const auth = useAuth()
  const { receipts, loading } = useSubmissionReceipts(auth.user?.id, limit)

  if (loading) {
    return (
      <div className="bg-ktip-cream border border-ktip-sand-200 rounded-lg px-6 py-8 text-center text-sm text-ktip-sand-500">
        <Trans>Loading submissions...</Trans>
      </div>
    )
  }

  if (!receipts || receipts.length === 0) {
    return (
      <div className="bg-ktip-cream border border-ktip-sand-200 rounded-lg px-6 py-8 text-center">
        <Inbox size={24} className="text-ktip-sand-400 mx-auto mb-2" />
        <p className="text-sm text-ktip-sand-600">
          <Trans>Nothing submitted yet. Applications and registrations you send will appear here with a full copy of your answers.</Trans>
        </p>
      </div>
    )
  }

  return (
    <div className="bg-ktip-cream border border-ktip-sand-200 rounded-lg">
      {receipts.map((receipt, index) => (
        <Link
          key={receipt.id}
          to={`/dashboard/submissions/${receipt.id}`}
          className={`flex items-center justify-between gap-4 px-5 py-4 hover:bg-ktip-sand-50 transition-colors ${
            index < receipts.length - 1 ? 'border-b border-ktip-sand-200' : ''
          }`}
        >
          <div className="min-w-0">
            <div className="mb-1">
              <SubmissionKindBadge kind={receipt.kind} />
            </div>
            <p className="font-medium text-ktip-sand-900 truncate">{receipt.title}</p>
            <p className="text-xs text-ktip-sand-500 mt-0.5">
              Submitted {formatDate(receipt.submitted_at)}
            </p>
          </div>
          <ArrowRight size={16} className="text-ktip-sand-400 shrink-0" />
        </Link>
      ))}
    </div>
  )
}
