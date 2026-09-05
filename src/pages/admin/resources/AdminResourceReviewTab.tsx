import { useState } from 'react'
import { BookOpen, Check, Download, ExternalLink, ShieldAlert, X } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { useResourceSubmissions, useReviewResourceSubmission, useResourceFileUrl } from '../../../hooks/useResources'
import { useToast } from '../../../contexts/ToastContext'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPE_COLORS,
  RESOURCE_CATEGORY_LABELS,
} from '../../../lib/constants'
import { formatDate } from '../../../lib/utils'
import { formatFileSize } from '../../../lib/document-extract'
import type { Resource } from '../../../types'

/**
 * The member-submission review queue (migration 135).
 *
 * A tab inside AdminResourcesPage rather than a route of its own: same person,
 * same `resource:manage` permission, same job. A second route would mean a
 * second PermissionRoute, a second sidebar row and a second thing to keep in
 * sync, for no capability the reviewer did not already have.
 *
 * English, not lingui — src/pages/admin/ is excluded in scripts/i18n/config.mjs.
 */
export function AdminResourceReviewTab() {
  const toast = useToast()
  const { submissions, loading, refetch } = useResourceSubmissions()
  const { reviewSubmission, loading: deciding } = useReviewResourceSubmission()

  const [rejecting, setRejecting] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const decide = async (resource: Resource, approve: boolean) => {
    try {
      await reviewSubmission({
        resourceId: resource.id,
        approve,
        note: approve ? null : note.trim() || null,
      })
      toast.success(approve ? 'Resource published' : 'Submission returned to its author')
      setRejecting(null)
      setNote('')
      refetch()
    } catch (error: any) {
      toast.error(error.message || 'Could not record the decision')
    }
  }

  if (loading) {
    return (
      <div className="border border-ktip-sand-200 rounded-lg p-6 space-y-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-24 bg-ktip-sand-50 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (!submissions?.length) {
    return (
      <div className="border border-ktip-sand-200 rounded-lg text-center py-16">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <BookOpen size={32} className="text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Nothing waiting</h3>
        <p className="text-gray-600 text-sm">
          Member submissions land here before they reach the library.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {submissions.map((resource) => (
        <SubmissionCard
          key={resource.id}
          resource={resource}
          deciding={deciding}
          rejecting={rejecting === resource.id}
          note={note}
          onNote={setNote}
          onStartReject={() => {
            setRejecting(resource.id)
            setNote('')
          }}
          onCancelReject={() => {
            setRejecting(null)
            setNote('')
          }}
          onDecide={(approve) => decide(resource, approve)}
        />
      ))}
    </div>
  )
}

interface SubmissionCardProps {
  resource: Resource
  deciding: boolean
  rejecting: boolean
  note: string
  onNote: (value: string) => void
  onStartReject: () => void
  onCancelReject: () => void
  onDecide: (approve: boolean) => void
}

function SubmissionCard({
  resource,
  deciding,
  rejecting,
  note,
  onNote,
  onStartReject,
  onCancelReject,
  onDecide,
}: SubmissionCardProps) {
  const { url: fileUrl } = useResourceFileUrl(resource.file_path)

  return (
    <div className="border border-ktip-sand-200 rounded-lg p-5 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900">{resource.title}</h3>
            <Badge size="sm" className={RESOURCE_TYPE_COLORS[resource.resource_type] || ''}>
              {RESOURCE_TYPE_LABELS[resource.resource_type] || resource.resource_type}
            </Badge>
            {resource.category && (
              <span className="text-xs text-gray-500">
                {RESOURCE_CATEGORY_LABELS[resource.category] || resource.category}
              </span>
            )}
            {/* The queue does not filter on status — see useResourceSubmissions.
                A quarantined row is the one that most needs a human, so it is
                surfaced here rather than hidden. */}
            {resource.status === 'quarantined' && (
              <Badge size="sm" variant="warning">
                <ShieldAlert size={12} />
                Flagged by the filter
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {resource.author?.display_name || 'Unknown member'}
            {' · '}
            {formatDate(resource.submitted_at || resource.created_at)}
          </p>
        </div>
      </div>

      {resource.summary && <p className="text-sm text-gray-700 mb-2">{resource.summary}</p>}
      {resource.description && (
        <p className="text-sm text-gray-600 whitespace-pre-wrap mb-3">{resource.description}</p>
      )}

      {/* What the reviewer is actually deciding about. A submission with neither
          is refused by the form, so one of these always renders. */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {resource.file_path && (
          <a
            href={fileUrl || undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!fileUrl}
            className={`inline-flex items-center gap-1.5 text-sm rounded-lg border px-3 py-1.5 transition-colors ${
              fileUrl
                ? 'border-ktip-sand-300 text-ktip-ocean-700 hover:bg-ktip-sand-50'
                : 'border-ktip-sand-200 text-gray-400 pointer-events-none'
            }`}
          >
            <Download size={14} />
            {resource.file_name || 'Download file'}
            {resource.file_size ? ` (${formatFileSize(resource.file_size)})` : ''}
          </a>
        )}
        {resource.download_url && (
          <a
            href={resource.download_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm rounded-lg border border-ktip-sand-300 px-3 py-1.5 text-ktip-ocean-700 hover:bg-ktip-sand-50 transition-colors"
          >
            <ExternalLink size={14} />
            Open link
          </a>
        )}
      </div>

      {rejecting ? (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Why are you returning it?
          </label>
          {/* This text becomes the body of the member's notification, which is
              the only thing they have to act on. */}
          <textarea
            value={note}
            onChange={(e) => onNote(e.target.value)}
            rows={3}
            placeholder="Shown to the author, so say what would make it publishable."
            className="w-full rounded-lg border-2 border-ktip-sand-200 px-3 py-2 text-sm focus:border-ktip-ocean-500 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="danger" loading={deciding} onClick={() => onDecide(false)}>
              Send it back
            </Button>
            <button
              type="button"
              onClick={onCancelReject}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" icon={<Check size={14} />} loading={deciding} onClick={() => onDecide(true)}>
            Approve &amp; publish
          </Button>
          <Button size="sm" variant="secondary" icon={<X size={14} />} onClick={onStartReject}>
            Reject
          </Button>
        </div>
      )}
    </div>
  )
}
