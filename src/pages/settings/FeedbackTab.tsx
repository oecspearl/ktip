import { Link } from 'react-router'
import { CornerDownRight, MessageCircle } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import { useAuth } from '../../contexts/AuthContext'
import { useMyFeedback } from '../../hooks/useFeedback'
import { formatDate } from '../../lib/utils'
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_COLORS,
  FEEDBACK_STATUS_LABELS,
} from '../../lib/feedback-labels'

/**
 * What became of the feedback you sent.
 *
 * The channel used to be one-way: a report went in and the only way to learn it
 * had been dealt with was to hit the same page again and notice. This is the
 * other end of migration 127 — the reply an admin sends lands here, and stays
 * here after the notification has been cleared from the bell.
 *
 * Rows arrive through the my_feedback() RPC, not the table: the reporter has no
 * SELECT on `feedback` precisely so the internal triage note cannot reach them.
 */
export function FeedbackTab() {
  const auth = useAuth()
  const { feedback, loading } = useMyFeedback(auth.user?.id)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-ktip-sand-100 rounded-2xl animate-pulse-soft" />
        <div className="h-24 bg-ktip-sand-100 rounded-2xl animate-pulse-soft" />
      </div>
    )
  }

  if (!feedback || feedback.length === 0) {
    return (
      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 text-center py-16 px-4">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <MessageCircle size={32} className="text-ktip-sand-400" />
        </div>
        <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">
          <Trans>You have not sent us any feedback yet</Trans>
        </h3>
        <p className="text-ktip-sand-500 text-sm max-w-sm mx-auto">
          <Trans>
            Use the feedback button in the corner of any page to report a bug, ask for
            something, or tell us what is working. Replies appear here.
          </Trans>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ktip-sand-500">
        <Trans>Everything you have sent us, and what came of it.</Trans>
      </p>

      {feedback.map((item) => (
        <div
          key={item.id}
          className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-ktip-sand-900">{item.subject}</h3>
              <p className="text-xs text-ktip-sand-500 mt-0.5">
                {formatDate(item.created_at)}
                {item.page_path && <> · {item.page_path}</>}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                  FEEDBACK_STATUS_COLORS[item.status] ?? FEEDBACK_STATUS_COLORS.new
                }`}
              >
                {FEEDBACK_STATUS_LABELS[item.status] ?? item.status}
              </span>
              <span className="text-xs text-ktip-sand-400">
                {FEEDBACK_CATEGORY_LABELS[item.category] ?? item.category}
              </span>
            </div>
          </div>

          <p className="text-sm text-ktip-sand-700 whitespace-pre-wrap mt-3">{item.message}</p>

          {item.admin_reply && (
            <div className="mt-4 rounded-xl border border-ktip-tropical-200 bg-ktip-tropical-50 p-4">
              <p className="text-xs font-medium text-ktip-tropical-800 flex items-center gap-1.5">
                <CornerDownRight size={12} />
                <Trans>Our reply</Trans>
                {item.replied_at && <span className="font-normal">· {formatDate(item.replied_at)}</span>}
              </p>
              <p className="text-sm text-ktip-sand-800 whitespace-pre-wrap mt-1.5">
                {item.admin_reply}
              </p>
            </div>
          )}
        </div>
      ))}

      <p className="text-xs text-ktip-sand-500">
        <Trans>
          Something else to report? Use the feedback button in the corner of any page, or{' '}
          <Link to="/help" className="text-ktip-ocean-600 hover:underline">
            visit the help centre
          </Link>
          .
        </Trans>
      </p>
    </div>
  )
}
