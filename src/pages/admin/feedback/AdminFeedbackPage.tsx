import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Textarea } from '../../../components/ui/Textarea'
import { Modal } from '../../../components/ui/Modal'
import { useAdminFeedback, useUpdateFeedback, type FeedbackTriageUpdate } from '../../../hooks/useFeedback'
import { useToast } from '../../../contexts/ToastContext'
import { useAuth } from '../../../contexts/AuthContext'
import { supabase } from '../../../lib/supabase'
import { announceFeedbackReply } from '../../../lib/feedback-reply'
import {
  FEEDBACK_CATEGORY_COLORS,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_CATEGORY_RANK,
  FEEDBACK_RANK_FALLBACK,
  FEEDBACK_STATUS_COLORS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_RANK,
  feedbackStatusLabel,
  isFeedbackCompleted,
} from '../../../lib/feedback-labels'
import { formatDate } from '../../../lib/utils'
import type { Feedback, FeedbackStatus } from '../../../types'
import {
  MessageCircle,
  Filter,
  X,
  Clock,
  FileText,
  Star,
  Send,
  CornerDownRight,
  Check,
  ChevronRight,
  ChevronDown,
  MailOpen,
} from 'lucide-react'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { PageHero } from '../../../components/layout/PageHero'
import { DiamondAvatar } from '../../../components/ui/DiamondAvatar'

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

/** Offered when a report is marked Resolved and nothing has been written yet.
 *  A starting point, never a send — every reply leaves through the button. */
const RESOLVED_REPLY_SUGGESTION =
  'Thanks for reporting this — it has been fixed and is live now.'

type ReadFilter = '' | 'unread' | 'read'
type SortKey = 'newest' | 'oldest' | 'unread' | 'status' | 'category'

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  unread: 'Unread first',
  status: 'By status',
  category: 'By category',
}

const READ_LABELS: Record<Exclude<ReadFilter, ''>, string> = {
  unread: 'Unread only',
  read: 'Read only',
}

const rank = (map: Record<string, number>, key: string) => map[key] ?? FEEDBACK_RANK_FALLBACK

/**
 * Compare two reports for the chosen order.
 *
 * Every branch falls back to 0 rather than to a date tiebreak, because the
 * array being sorted is already `created_at DESC` from the query and
 * `Array.prototype.sort` is stable — so equal-rank rows keep newest-first for
 * free. Re-comparing dates here would be dead code that looked load-bearing.
 */
function compareFeedback(a: Feedback, b: Feedback, sort: SortKey): number {
  switch (sort) {
    case 'oldest':
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    case 'unread':
      return Number(!!a.read_at) - Number(!!b.read_at)
    case 'status':
      return rank(FEEDBACK_STATUS_RANK, a.status) - rank(FEEDBACK_STATUS_RANK, b.status)
    case 'category':
      return rank(FEEDBACK_CATEGORY_RANK, a.category) - rank(FEEDBACK_CATEGORY_RANK, b.category)
    case 'newest':
    default:
      return 0
  }
}

/**
 * One report in the queue.
 *
 * Extracted so the collapsed "completed" group renders identical rows rather
 * than a second, drifting copy of the markup.
 */
function FeedbackRow({
  item,
  busy,
  onOpen,
  onToggleCompleted,
}: {
  item: Feedback
  busy: boolean
  onOpen: (item: Feedback) => void
  onToggleCompleted: (item: Feedback) => void
}) {
  const name = item.user?.display_name || 'Anonymous'
  const unread = !item.read_at
  const done = item.status === 'resolved'
  const doneLabel = feedbackStatusLabel('resolved', item.category)

  return (
    <div className="p-4 hover:bg-ktip-sand-50/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <DiamondAvatar name={name} size={36} />
          <div className="min-w-0">
            <p className="text-sm text-ktip-sand-900 truncate flex items-center gap-2">
              {/* The dot occupies its own box whether or not it is filled, so
                  reading a report does not reflow the row under the cursor. */}
              <span
                aria-hidden
                className={`w-2 h-2 rounded-full shrink-0 ${unread ? 'bg-ktip-ocean-500' : 'bg-transparent'}`}
              />
              <span className={unread ? 'font-bold' : 'font-medium'}>{item.subject}</span>
              {unread && <span className="sr-only">Unread</span>}
            </p>
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
              {item.replied_at && (
                <span className="text-xs text-ktip-tropical-700 flex items-center gap-1 shrink-0">
                  <CornerDownRight size={10} />
                  Replied
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${FEEDBACK_STATUS_COLORS[item.status]}`}
          >
            {feedbackStatusLabel(item.status, item.category)}
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${FEEDBACK_CATEGORY_COLORS[item.category]}`}
          >
            {FEEDBACK_CATEGORY_LABELS[item.category]}
          </span>
          <div className="flex items-center gap-1">
            {/* One click to close a report, without opening the modal — the
                whole point of the control. aria-pressed rather than a checkbox
                because it is a toggle button, not a form field. */}
            <button
              type="button"
              onClick={() => onToggleCompleted(item)}
              disabled={busy}
              aria-pressed={done}
              title={done ? `Marked ${doneLabel} — click to reopen` : `Mark ${doneLabel}`}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                done
                  ? 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-300'
                  : 'bg-ktip-cream text-ktip-sand-500 border-ktip-sand-200 hover:border-ktip-tropical-300 hover:text-ktip-tropical-700'
              }`}
            >
              <Check size={12} />
              {doneLabel}
            </button>
            <Button size="sm" variant="ghost" onClick={() => onOpen(item)} icon={<FileText size={14} />}>
              Details
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminFeedbackPage() {
  const toast = useToast()
  const auth = useAuth()

  usePageTitle('User Feedback')

  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [readFilter, setReadFilter] = useState<ReadFilter>('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [showCompleted, setShowCompleted] = useState(false)

  // Unfiltered: the whole queue arrives once and everything below is done in
  // memory, so switching a dropdown costs nothing and the unread count means
  // "unread", not "unread among whatever the last query fetched".
  const { feedback, loading, refetch } = useAdminFeedback()
  const { updateFeedback, loading: updating } = useUpdateFeedback()

  const [selected, setSelected] = useState<Feedback | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [reply, setReply] = useState('')
  const [detailStatus, setDetailStatus] = useState<FeedbackStatus>('new')

  const unreadCount = useMemo(
    () => (feedback ?? []).filter((item) => !item.read_at).length,
    [feedback]
  )

  const visible = useMemo(() => {
    const rows = (feedback ?? []).filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false
      if (categoryFilter && item.category !== categoryFilter) return false
      if (readFilter === 'unread' && item.read_at) return false
      if (readFilter === 'read' && !item.read_at) return false
      return true
    })
    // Sorting a copy: the source array is React Query's cached value, and
    // sorting in place would mutate the cache other renders read from.
    return [...rows].sort((a, b) => compareFeedback(a, b, sort))
  }, [feedback, statusFilter, categoryFilter, readFilter, sort])

  // Asking for a completed status IS asking to see completed reports, so the
  // collapse steps aside rather than leaving the page blank with no reason given.
  const statusFilterIsCompleted = !!statusFilter && isFeedbackCompleted(statusFilter)
  const open = statusFilterIsCompleted ? visible : visible.filter((i) => !isFeedbackCompleted(i.status))
  const completed = statusFilterIsCompleted ? [] : visible.filter((i) => isFeedbackCompleted(i.status))

  /** Marks a report seen. Shared state — see migration 128 — so this clears it
   *  from every admin's queue, which is the intent for a shared work queue. */
  const markRead = async (item: Feedback, read: boolean) => {
    await updateFeedback(item.id, {
      read_at: read ? new Date().toISOString() : null,
      read_by: read ? auth.user?.id ?? null : null,
    })
    refetch()
  }

  const openDetail = (item: Feedback) => {
    setSelected(item)
    setAdminNote(item.admin_note || '')
    setReply(item.admin_reply || '')
    setDetailStatus(item.status)

    // Fired here rather than from an effect on `selected`: an effect would
    // re-stamp read_at on every re-render while the modal is open.
    if (!item.read_at) void markRead(item, true).catch(() => {})
  }

  /**
   * The one-click close. "Fixed" on a bug, "Resolved" on anything else — same
   * stored status either way.
   *
   * Un-toggling returns the report to In Review, not New: it has demonstrably
   * been seen by the time anyone can click this, and New would contradict the
   * read marker sitting next to it.
   */
  const toggleCompleted = async (item: Feedback) => {
    const next: FeedbackStatus = item.status === 'resolved' ? 'in_review' : 'resolved'
    try {
      await updateFeedback(item.id, {
        status: next,
        read_at: item.read_at ?? new Date().toISOString(),
        read_by: item.read_at ? undefined : auth.user?.id ?? null,
      })
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update feedback')
    }
  }

  // An anonymous report carries no user_id, so there is nobody to answer.
  const canReply = !!selected?.user_id
  const trimmedReply = reply.trim()

  /** Marking something Resolved is the moment a reply is worth offering. Only
   *  ever prefills an empty box — it must not overwrite what was typed, or
   *  resurrect a reply the admin deliberately cleared. */
  const handleStatusChange = (next: FeedbackStatus) => {
    setDetailStatus(next)
    if (next === 'resolved' && canReply && !reply && !selected?.admin_reply) {
      setReply(RESOLVED_REPLY_SUGGESTION)
    }
  }

  const save = async (sendReply: boolean) => {
    if (!selected) return

    const updates: FeedbackTriageUpdate = {
      status: detailStatus,
      admin_note: adminNote || undefined,
    }

    // The reply and its two stamps move together: a reply the reporter can see
    // with no date on it cannot be presented honestly.
    if (sendReply) {
      updates.admin_reply = trimmedReply
      updates.replied_at = new Date().toISOString()
      if (auth.user?.id) updates.replied_by = auth.user.id
    }

    try {
      await updateFeedback(selected.id, updates)

      // Announced only after the row is committed — the notification and the
      // email both claim a reply exists, and the endpoint re-reads it.
      if (sendReply && selected.user_id) {
        announceFeedbackReply({
          reporterId: selected.user_id,
          feedbackId: selected.id,
          subject: selected.subject,
          reply: trimmedReply,
        })
      }

      toast.success(sendReply ? 'Reply sent' : 'Feedback updated')
      setSelected(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update feedback')
    }
  }

  const hasFilters = !!(statusFilter || categoryFilter || readFilter) || sort !== 'newest'

  const clearFilters = () => {
    setStatusFilter('')
    setCategoryFilter('')
    setReadFilter('')
    setSort('newest')
  }

  const selectClasses =
    'border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500'

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
            className={selectClasses}
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            {Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.currentTarget.value)}
            className={selectClasses}
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {Object.entries(FEEDBACK_CATEGORY_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
          <select
            value={readFilter}
            onChange={(e) => setReadFilter(e.currentTarget.value as ReadFilter)}
            className={selectClasses}
            aria-label="Filter by read state"
          >
            <option value="">Read &amp; unread</option>
            {Object.entries(READ_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.currentTarget.value as SortKey)}
            className={selectClasses}
            aria-label="Sort order"
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>

          {unreadCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-ktip-ocean-100 text-ktip-ocean-700 border border-ktip-ocean-200">
              <span className="w-1.5 h-1.5 rounded-full bg-ktip-ocean-500" />
              {unreadCount} unread
            </span>
          )}

          {hasFilters && (
            <button
              onClick={clearFilters}
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
        ) : visible.length > 0 ? (
          <>
            {open.length > 0 && (
              <div className="divide-y divide-ktip-sand-100 stagger-children">
                {open.map((item) => (
                  <FeedbackRow
                    key={item.id}
                    item={item}
                    busy={updating}
                    onOpen={openDetail}
                    onToggleCompleted={toggleCompleted}
                  />
                ))}
              </div>
            )}

            {/* Completed reports, folded away.
                Collapsed by default — the open queue is what the page is for,
                and finished reports otherwise accumulate at full height until
                they outnumber the work. */}
            {completed.length > 0 && (
              <div className={open.length > 0 ? 'border-t border-ktip-sand-200' : ''}>
                <button
                  type="button"
                  onClick={() => setShowCompleted((v) => !v)}
                  aria-expanded={showCompleted}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-ktip-sand-600 hover:bg-ktip-sand-50/50 transition-colors"
                >
                  {showCompleted ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="font-medium">{completed.length} completed</span>
                  <span className="text-ktip-sand-400 text-xs">
                    {showCompleted ? 'Hide' : 'Show'}
                  </span>
                </button>

                {showCompleted && (
                  <div className="divide-y divide-ktip-sand-100 border-t border-ktip-sand-100">
                    {completed.map((item) => (
                      <FeedbackRow
                        key={item.id}
                        item={item}
                        busy={updating}
                        onOpen={openDetail}
                        onToggleCompleted={toggleCompleted}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
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
                onChange={(e) => handleStatusChange(e.currentTarget.value as FeedbackStatus)}
                className="w-full border border-ktip-sand-200 rounded-xl px-3 py-2.5 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
              >
                {Object.keys(FEEDBACK_STATUS_LABELS).map((value) => (
                  <option value={value} key={value}>
                    {feedbackStatusLabel(value, selected.category)}
                  </option>
                ))}
              </select>
            </div>

            <Textarea
              label="Admin notes"
              placeholder="Internal notes about this feedback..."
              helperText="Internal only — the reporter never sees this."
              value={adminNote}
              onChange={(e) => setAdminNote(e.currentTarget.value)}
              rows={3}
              fullWidth
            />

            {/* The reply half. Separate box, separate button — closing a
                duplicate quietly has to stay possible. */}
            <div className="border-t border-ktip-sand-100 pt-5">
              {selected.admin_reply && selected.replied_at && (
                <div className="mb-3 rounded-lg border border-ktip-tropical-200 bg-ktip-tropical-50 p-3">
                  <p className="text-xs font-medium text-ktip-tropical-800 flex items-center gap-1.5">
                    <CornerDownRight size={12} />
                    Replied {formatDate(selected.replied_at)}
                  </p>
                  <p className="text-sm text-ktip-sand-800 whitespace-pre-wrap mt-1">
                    {selected.admin_reply}
                  </p>
                </div>
              )}

              <Textarea
                label="Reply to the reporter"
                placeholder={
                  canReply
                    ? 'Let them know what came of it...'
                    : 'This report was filed anonymously.'
                }
                helperText={
                  canReply
                    ? selected.admin_reply
                      ? 'Sending again replaces the reply they can see, and notifies them afresh.'
                      : 'Sent to them in the app and by email.'
                    : 'Filed anonymously, so there is nobody to reply to.'
                }
                value={reply}
                onChange={(e) => setReply(e.currentTarget.value)}
                rows={3}
                disabled={!canReply}
                fullWidth
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              {/* Opening the report marked it read; this puts it back on the
                  pile. Shared state, so it returns for the whole team. */}
              <Button
                variant="ghost"
                icon={<MailOpen size={14} />}
                loading={updating}
                onClick={async () => {
                  try {
                    await markRead(selected, false)
                    toast.success('Marked unread')
                    setSelected(null)
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to mark unread')
                  }
                }}
              >
                Mark unread
              </Button>
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={() => save(false)} loading={updating}>
                Save changes
              </Button>
              <Button
                variant="primary"
                onClick={() => save(true)}
                loading={updating}
                disabled={!canReply || !trimmedReply}
                icon={<Send size={14} />}
              >
                Send reply
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
