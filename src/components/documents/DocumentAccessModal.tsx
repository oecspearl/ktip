import { Check, X, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { VISIBILITY_OPTIONS } from './DocumentUploadModal'
import { useToast } from '../../contexts/ToastContext'
import {
  useDocumentAccessMutations,
  useDocumentAccessRequests,
  useDocumentGrants,
} from '../../hooks/useDocumentAccess'
import { formatRelativeTime } from '../../lib/utils'
import type { DocumentEntityType, DocumentVisibility, EntityDocumentSummary } from '../../types'
import { DiamondAvatar } from '../ui/DiamondAvatar'

interface DocumentAccessModalProps {
  open: boolean
  onClose: () => void
  document: EntityDocumentSummary
  entityType: DocumentEntityType
  entityId: string
}

function Avatar({ name, url }: { name: string; url: string | null | undefined }) {
  return <DiamondAvatar src={url} name={name} size={32} />
}

/**
 * Owner-side controls for one document: who can open it at all, who has been
 * let in individually, and who is currently knocking.
 */
export function DocumentAccessModal({
  open,
  onClose,
  document,
  entityType,
  entityId,
}: DocumentAccessModalProps) {
  const toast = useToast()
  const { pendingRequests, loading: loadingRequests } = useDocumentAccessRequests(document.id, open)
  const { grants, loading: loadingGrants } = useDocumentGrants(document.id, open)
  const {
    decideRequest,
    decidingRequest,
    setVisibility,
    settingVisibility,
    updateGrantRole,
    revokeAccess,
  } = useDocumentAccessMutations()

  const handleVisibility = async (visibility: DocumentVisibility) => {
    try {
      await setVisibility({ documentId: document.id, visibility })
      toast.success('Visibility updated')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update visibility')
    }
  }

  const handleDecision = async (
    requestId: string,
    requesterId: string,
    approve: boolean,
    role?: 'viewer' | 'editor'
  ) => {
    try {
      await decideRequest({
        requestId,
        approve,
        role,
        requesterId,
        documentTitle: document.title,
        entityType,
        entityId,
      })
      toast.success(approve ? 'Access granted' : 'Request declined')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to decide the request')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage access"
      description={document.title}
      size="xl"
      className="max-w-2xl"
    >
      <div className="space-y-6">
        {/* Visibility */}
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-ktip-sand-700">General access</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {VISIBILITY_OPTIONS.map((option) => {
              const Icon = option.icon
              const selected = document.visibility === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={settingVisibility}
                  onClick={() => handleVisibility(option.value)}
                  className={`flex items-start gap-2 p-3 text-left border rounded-xl transition-colors disabled:opacity-60 ${
                    selected
                      ? 'border-ktip-ocean-500 bg-ktip-ocean-50'
                      : 'border-ktip-sand-200 hover:border-ktip-sand-300'
                  }`}
                >
                  <Icon
                    size={16}
                    className={selected ? 'text-ktip-ocean-600 mt-0.5' : 'text-ktip-sand-400 mt-0.5'}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ktip-sand-900">{option.label}</span>
                    <span className="block text-xs text-ktip-sand-500">{option.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Pending requests */}
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-ktip-sand-700">
            Requests {pendingRequests.length > 0 && `(${pendingRequests.length})`}
          </h3>

          {loadingRequests ? (
            <p className="text-sm text-ktip-sand-500 py-2">Loading…</p>
          ) : pendingRequests.length === 0 ? (
            <p className="text-sm text-ktip-sand-500 py-2">No one is waiting on access.</p>
          ) : (
            <ul className="space-y-2">
              {pendingRequests.map((request) => {
                const name = request.requester?.display_name || 'A member'
                return (
                  <li
                    key={request.id}
                    className="p-3 border border-ktip-sand-200 rounded-xl space-y-2"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={name} url={request.requester?.avatar_url} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ktip-sand-900 truncate">{name}</p>
                        <p className="text-xs text-ktip-sand-500">
                          {formatRelativeTime(request.created_at)}
                        </p>
                      </div>
                    </div>

                    {request.message && (
                      <p className="text-sm text-ktip-sand-600 italic break-words">
                        “{request.message}”
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        icon={<Check size={14} />}
                        disabled={decidingRequest}
                        onClick={() => handleDecision(request.id, request.requester_id, true, 'viewer')}
                      >
                        Grant view
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={decidingRequest}
                        onClick={() => handleDecision(request.id, request.requester_id, true, 'editor')}
                      >
                        Grant edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<X size={14} />}
                        disabled={decidingRequest}
                        onClick={() => handleDecision(request.id, request.requester_id, false)}
                      >
                        Decline
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* People with access */}
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-ktip-sand-700">People with access</h3>

          {loadingGrants ? (
            <p className="text-sm text-ktip-sand-500 py-2">Loading…</p>
          ) : !grants || grants.length === 0 ? (
            <p className="text-sm text-ktip-sand-500 py-2">
              Only you, unless the general access setting says otherwise.
            </p>
          ) : (
            <ul className="space-y-2">
              {grants.map((grant) => {
                const name = grant.user?.display_name || 'Member'
                return (
                  <li key={grant.id} className="flex items-center gap-3 p-3 border border-ktip-sand-200 rounded-xl">
                    <Avatar name={name} url={grant.user?.avatar_url} />
                    <p className="flex-1 min-w-0 text-sm font-medium text-ktip-sand-900 truncate">
                      {name}
                    </p>

                    <select
                      value={grant.role}
                      onChange={(e) =>
                        updateGrantRole({
                          grantId: grant.id,
                          role: e.target.value as 'viewer' | 'editor',
                        }).catch((err: any) => toast.error(err?.message || 'Failed to update the role'))
                      }
                      className="text-sm border border-ktip-sand-200 rounded-lg px-2 py-1 bg-ktip-cream"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        revokeAccess(grant.id).catch((err: any) =>
                          toast.error(err?.message || 'Failed to revoke access')
                        )
                      }
                      className="p-1.5 rounded-lg text-ktip-sand-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                      aria-label={`Remove ${name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}
