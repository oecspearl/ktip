import { useEffect, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Textarea } from '../../../components/ui/Textarea'
import { Modal } from '../../../components/ui/Modal'
import { useAdminFeedback, useUpdateFeedback } from '../../../hooks/useFeedback'
import { useToast } from '../../../contexts/ToastContext'
import { supabase } from '../../../lib/supabase'
import { formatDate } from '../../../lib/utils'
import type { Feedback, FeedbackStatus } from '../../../types'
import { MessageCircle, Filter, X, Clock, FileText, Star } from 'lucide-react'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { PageHero } from '../../../components/layout/PageHero'
import { DiamondAvatar } from '../../../components/ui/DiamondAvatar'

export const FEEDBACK_CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug Report',
  feature_request: 'Feature Request',
  general: 'General',
  content: 'Content',
  praise: 'Praise',
}

const FEEDBACK_CATEGORY_COLORS: Record<string, string> = {
  bug: 'bg-red-100 text-red-700 border-red-200',
  feature_request: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  general: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  content: 'bg-ktip-sun-100 text-ktip-sun-700 border-ktip-sun-200',
  praise: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
}

/** Compact read-only rating. Absent on most rows — a report with no stars is
 *  the common case, so nothing is rendered rather than five empty outlines. */
function Rating({ value, size = 12 }: { value?: number | null; size?: number }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= value ? 'text-ktip-sun-500 fill-ktip-sun-500' : 'text-ktip-sand-300'}
        />
      ))}
    </span>
  )
}

/**
 * The screenshot lives in a private bucket, so it is fetched through a
 * short-lived signed URL rather than a public link — the image routinely shows
 * another member's data, and a public URL would outlive the triage session.
 */
function FeedbackScreenshot({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.storage
      .from('feedback-screenshots')
      .createSignedUrl(path, 300)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) setFailed(true)
        else setUrl(data.signedUrl)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  if (failed) {
    return <p className="text-xs text-ktip-sand-500">The screenshot could not be loaded.</p>
  }
  if (!url) {
    return <div className="h-40 rounded-lg bg-ktip-sand-100 animate-pulse-soft" />
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img
        src={url}
        alt="Screenshot attached to this report"
        className="w-full rounded-lg border border-ktip-sand-200"
      />
    </a>
  )
}

export const FEEDBACK_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  in_review: 'In Review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

const FEEDBACK_STATUS_COLORS: Record<string, string> = {
  new: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  in_review: 'bg-ktip-sun-100 text-ktip-sun-700 border-ktip-sun-200',
  resolved: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  dismissed: 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200',
}

export default function AdminFeedbackPage() {
  const toast = useToast()

  usePageTitle('User Feedback')

  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const { feedback, loading, refetch } = useAdminFeedback({
    status: statusFilter,
    category: categoryFilter,
  })
  const { updateFeedback, loading: updating } = useUpdateFeedback()

  const [selected, setSelected] = useState<Feedback | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [detailStatus, setDetailStatus] = useState<FeedbackStatus>('new')

  const openDetail = (item: Feedback) => {
    setSelected(item)
    setAdminNote(item.admin_note || '')
    setDetailStatus(item.status)
  }

  const handleSave = async () => {
    if (!selected) return
    try {
      await updateFeedback(selected.id, { status: detailStatus, admin_note: adminNote || undefined })
      toast.success('Feedback updated')
      setSelected(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update feedback')
    }
  }

  const hasFilters = statusFilter || categoryFilter

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="User Feedback"
        subtitle="Bug reports, feature requests, and general feedback"
        imageSeed="admin-feedback"
      />

      {/* Filter Bar */}
      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={16} className="text-ktip-sand-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
            className="border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
          >
            <option value="">All Statuses</option>
            {Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.currentTarget.value)}
            className="border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
          >
            <option value="">All Categories</option>
            {Object.entries(FEEDBACK_CATEGORY_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={() => {
                setStatusFilter('')
                setCategoryFilter('')
              }}
              className="flex items-center gap-1 text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors"
            >
              <X size={14} />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Feedback list */}
      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
          </div>
        ) : feedback && feedback.length > 0 ? (
          <div className="divide-y divide-ktip-sand-100 stagger-children">
            {feedback.map((item) => {
              const name = item.user?.display_name || 'Anonymous'
              return (
                <div key={item.id} className="p-4 hover:bg-ktip-sand-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <DiamondAvatar name={name} size={36} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ktip-sand-900 truncate">{item.subject}</p>
                        <p className="text-xs text-ktip-sand-500 flex items-center gap-2 mt-0.5">
                          {name}
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {formatDate(item.created_at)}
                          </span>
                        </p>
                        <p className="text-sm text-ktip-sand-600 line-clamp-2 mt-1">{item.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Rating value={item.rating} />
                          {item.page_path && (
                            <span className="text-xs text-ktip-sand-400 truncate">{item.page_path}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${FEEDBACK_STATUS_COLORS[item.status]}`}
                      >
                        {FEEDBACK_STATUS_LABELS[item.status]}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${FEEDBACK_CATEGORY_COLORS[item.category]}`}
                      >
                        {FEEDBACK_CATEGORY_LABELS[item.category]}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => openDetail(item)} icon={<FileText size={14} />}>
                        Details
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageCircle size={32} className="text-ktip-sand-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">No feedback found</h3>
            <p className="text-ktip-sand-500 text-sm">
              {hasFilters ? 'Try adjusting your filters.' : 'No feedback has been submitted yet.'}
            </p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title="Feedback Details" size="lg">
          <div className="space-y-5">
            <div>
              <p className="text-xs text-ktip-sand-500 mb-1">Subject</p>
              <p className="text-sm font-medium text-ktip-sand-900">{selected.subject}</p>
              <p className="text-xs text-ktip-sand-500 mt-1">
                From {selected.user?.display_name || 'Anonymous'} · {formatDate(selected.created_at)}
                {selected.page_path && <> · on <code>{selected.page_path}</code></>}
              </p>
              {selected.rating ? (
                <div className="mt-2">
                  <Rating value={selected.rating} size={16} />
                </div>
              ) : null}
            </div>

            <div>
              <p className="text-xs font-medium text-ktip-sand-500 mb-1">Message</p>
              <p className="text-sm text-ktip-sand-800 whitespace-pre-wrap bg-ktip-sand-50 rounded-lg p-3">
                {selected.message}
              </p>
            </div>

            {selected.screenshot_path && (
              <div>
                <p className="text-xs font-medium text-ktip-sand-500 mb-1">Screenshot</p>
                <FeedbackScreenshot path={selected.screenshot_path} />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-ktip-sand-500 mb-1">Status</label>
              <select
                value={detailStatus}
                onChange={(e) => setDetailStatus(e.currentTarget.value as FeedbackStatus)}
                className="w-full border border-ktip-sand-200 rounded-xl px-3 py-2.5 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
              >
                {Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </div>

            <Textarea
              label="Admin Notes"
              placeholder="Internal notes about this feedback..."
              value={adminNote}
              onChange={(e) => setAdminNote(e.currentTarget.value)}
              rows={3}
              fullWidth
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave} loading={updating}>
                Save Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
