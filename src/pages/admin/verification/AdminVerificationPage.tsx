import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Textarea } from '../../../components/ui/Textarea'
import { Modal } from '../../../components/ui/Modal'
import {
  useAdminVerificationRequests,
  useReviewVerification,
  getVerificationDocumentUrl,
} from '../../../hooks/useVerification'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { formatDate } from '../../../lib/utils'
import type { VerificationRequest } from '../../../types'
import { BadgeCheck, CheckCircle, XCircle, ExternalLink, Filter, X, FileText } from 'lucide-react'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { PageHero } from '../../../components/layout/PageHero'
import { DiamondAvatar } from '../../../components/ui/DiamondAvatar'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Not accepted',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-ktip-sun-100 text-ktip-sun-700 border-ktip-sun-200',
  approved: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
}

export default function AdminVerificationPage() {
  const auth = useAuth()
  const toast = useToast()

  usePageTitle('Verification Requests')

  const [statusFilter, setStatusFilter] = useState('pending')
  const { requests, loading, refetch } = useAdminVerificationRequests({ status: statusFilter })
  const { reviewRequest, loading: reviewing } = useReviewVerification()

  const [selected, setSelected] = useState<VerificationRequest | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [docUrls, setDocUrls] = useState<Record<string, string>>({})

  const openDetail = async (request: VerificationRequest) => {
    setSelected(request)
    setAdminNote(request.admin_note || '')
    const urls: Record<string, string> = {}
    for (const path of request.document_paths) {
      const url = await getVerificationDocumentUrl(path)
      if (url) urls[path] = url
    }
    setDocUrls(urls)
  }

  const handleReview = async (approve: boolean) => {
    if (!selected || !auth.user) return
    try {
      await reviewRequest({
        requestId: selected.id,
        userId: selected.user_id,
        approve,
        reviewerId: auth.user.id,
        adminNote: adminNote.trim() || undefined,
      })
      toast.success(approve ? 'Request approved — user is now verified' : 'Request not accepted')
      setSelected(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to review request')
    }
  }

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Verification Requests"
        subtitle="Review identity documents and verify members"
        imageSeed="admin-verification"
      />

      {/* Filter */}
      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={16} className="text-ktip-sand-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
            className="border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
          {statusFilter && (
            <button
              onClick={() => setStatusFilter('')}
              className="flex items-center gap-1 text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors"
            >
              <X size={14} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Requests */}
      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
          </div>
        ) : requests && requests.length > 0 ? (
          <div className="divide-y divide-ktip-sand-100 stagger-children">
            {requests.map((request) => {
              const name = request.user?.display_name || 'Unknown'
              return (
                <div key={request.id} className="flex items-center justify-between gap-3 p-4 hover:bg-ktip-sand-50/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <DiamondAvatar name={name} size={40} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ktip-sand-900 truncate">{name}</p>
                      <p className="text-xs text-ktip-sand-500">
                        {request.document_paths.length} document{request.document_paths.length !== 1 ? 's' : ''} · {formatDate(request.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[request.status]}`}
                    >
                      {STATUS_LABELS[request.status]}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => openDetail(request)}>
                      Review
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BadgeCheck size={32} className="text-ktip-sand-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">No requests found</h3>
            <p className="text-ktip-sand-500 text-sm">
              {statusFilter ? 'Try a different status filter.' : 'No verification requests yet.'}
            </p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title="Review Verification" size="lg">
          <div className="space-y-5">
            <div>
              <p className="text-xs text-ktip-sand-500 mb-1">Member</p>
              <p className="text-sm font-medium text-ktip-sand-900">
                {selected.user?.display_name || 'Unknown'}
              </p>
              <p className="text-xs text-ktip-sand-500">Submitted {formatDate(selected.created_at)}</p>
            </div>

            {selected.user_note && (
              <div>
                <p className="text-xs font-medium text-ktip-sand-500 mb-1">User note</p>
                <p className="text-sm text-ktip-sand-800 whitespace-pre-wrap bg-ktip-sand-50 rounded-lg p-3">
                  {selected.user_note}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-ktip-sand-500 mb-2">Documents</p>
              <div className="space-y-2">
                {selected.document_paths.map((path) => (
                  <a
                    key={path}
                    href={docUrls[path] || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm transition-colors ${
                      docUrls[path]
                        ? 'text-ktip-ocean-600 hover:bg-ktip-ocean-50'
                        : 'text-ktip-sand-400 pointer-events-none'
                    }`}
                  >
                    <FileText size={16} />
                    <span className="truncate flex-1">{path.split('/').pop()}</span>
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
            </div>

            <Textarea
              label="Admin note"
              placeholder="Reason for the decision (shared with the user when not accepted)..."
              value={adminNote}
              onChange={(e) => setAdminNote(e.currentTarget.value)}
              rows={3}
              fullWidth
            />

            {selected.status === 'pending' ? (
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => handleReview(false)}
                  loading={reviewing}
                  icon={<XCircle size={16} />}
                >
                  Do not accept
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleReview(true)}
                  loading={reviewing}
                  icon={<CheckCircle size={16} />}
                >
                  Approve & Verify
                </Button>
              </div>
            ) : (
              <p className="text-sm text-ktip-sand-500">
                This request was already {STATUS_LABELS[selected.status]?.toLowerCase()}.
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
