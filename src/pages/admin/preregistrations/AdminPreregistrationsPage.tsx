import { createSignal, Show, For, Suspense } from 'solid-js'
import { AdminLayout } from '../../../components/layout/AdminLayout'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { useAdminPreregistrations, useAdminPreregistrationActions } from '../../../hooks/usePreregistrations'
import type { Preregistration } from '../../../hooks/usePreregistrations'
import { useToast } from '../../../contexts/ToastContext'
import { ROLE_LABELS, ROLE_COLORS } from '../../../lib/constants'
import {
  Users,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  MessageSquare,
  FileText,
  UserPlus,
  Briefcase,
  MapPin,
  Link as LinkIcon,
  Mail,
} from 'lucide-solid'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  info_requested: 'Info Requested',
}

const STATUS_VARIANTS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  info_requested: 'bg-blue-100 text-blue-700',
}

const ALL_PREREG_ROLES = ['student', 'mentor', 'investor', 'entrepreneur', 'private_sector']

function AdminPreregistrationsContent() {
  const toast = useToast()

  const [statusFilter, setStatusFilter] = createSignal('')
  const [roleFilter, setRoleFilter] = createSignal('')

  const { preregistrations, refetch } = useAdminPreregistrations({
    get status() { return statusFilter() || undefined },
    get role() { return roleFilter() || undefined },
  })

  const { updateStatus, approve, loading: actionLoading } = useAdminPreregistrationActions()

  // Detail modal
  const [detailPrereg, setDetailPrereg] = createSignal<Preregistration | null>(null)

  // Approve modal
  const [approvePrereg, setApprovePrereg] = createSignal<Preregistration | null>(null)
  const [approvePassword, setApprovePassword] = createSignal('')
  const [showPassword, setShowPassword] = createSignal(false)

  // Reject confirm
  const [rejectPrereg, setRejectPrereg] = createSignal<Preregistration | null>(null)
  const [rejectNotes, setRejectNotes] = createSignal('')

  // Request info modal
  const [infoRequestPrereg, setInfoRequestPrereg] = createSignal<Preregistration | null>(null)
  const [infoMessage, setInfoMessage] = createSignal('')

  // Admin notes edit
  const [editNotes, setEditNotes] = createSignal('')

  const handleApprove = async () => {
    const prereg = approvePrereg()
    if (!prereg || !approvePassword()) return

    try {
      await approve(prereg.id, approvePassword())
      toast.success(`Application approved! Account created for ${prereg.email}`)
      setApprovePrereg(null)
      setApprovePassword('')
      setShowPassword(false)
      setDetailPrereg(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve application')
    }
  }

  const handleReject = async () => {
    const prereg = rejectPrereg()
    if (!prereg) return

    try {
      await updateStatus(prereg.id, {
        status: 'rejected',
        admin_notes: rejectNotes() || undefined,
      })
      toast.success(`Application from ${prereg.display_name} has been rejected`)
      setRejectPrereg(null)
      setRejectNotes('')
      setDetailPrereg(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject application')
    }
  }

  const handleRequestInfo = async () => {
    const prereg = infoRequestPrereg()
    if (!prereg || !infoMessage()) return

    try {
      await updateStatus(prereg.id, {
        status: 'info_requested',
        info_request_message: infoMessage(),
      })
      toast.success(`Information requested from ${prereg.display_name}`)
      setInfoRequestPrereg(null)
      setInfoMessage('')
      setDetailPrereg(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to request information')
    }
  }

  const handleSaveNotes = async () => {
    const prereg = detailPrereg()
    if (!prereg) return

    try {
      await updateStatus(prereg.id, { admin_notes: editNotes() })
      toast.success('Notes saved')
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save notes')
    }
  }

  const openDetail = (prereg: Preregistration) => {
    setDetailPrereg(prereg)
    setEditNotes(prereg.admin_notes || '')
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const pendingCount = () => {
    const all = preregistrations()
    if (!all) return 0
    return all.filter(p => p.status === 'pending').length
  }

  return (
    <div>
      {/* Dark Header Band */}
      <div class="bg-gray-800 rounded-lg p-6 mb-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p class="text-gray-400 text-xs uppercase tracking-widest mb-1">Administration</p>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold text-white">Pre-Registrations</h1>
              <Suspense>
                <Show when={preregistrations()}>
                  <Badge size="sm" variant="primary">
                    {preregistrations()!.length} total
                  </Badge>
                  <Show when={!statusFilter() && pendingCount() > 0}>
                    <Badge size="sm" class="bg-amber-100 text-amber-700">
                      {pendingCount()} pending
                    </Badge>
                  </Show>
                </Show>
              </Suspense>
            </div>
            <p class="mt-1 text-gray-400 text-sm">
              Review and approve pre-registration applications
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div class="mb-6">
        <div class="flex flex-col sm:flex-row gap-3">
          <select
            value={statusFilter()}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
            class="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="info_requested">Info Requested</option>
          </select>
          <select
            value={roleFilter()}
            onChange={(e) => setRoleFilter(e.currentTarget.value)}
            class="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
          >
            <option value="">All Roles</option>
            <For each={ALL_PREREG_ROLES}>
              {(role) => <option value={role}>{ROLE_LABELS[role]}</option>}
            </For>
          </select>
          <Show when={statusFilter() || roleFilter()}>
            <button
              type="button"
              onClick={() => { setStatusFilter(''); setRoleFilter('') }}
              class="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium whitespace-nowrap"
            >
              Clear filters
            </button>
          </Show>
        </div>
      </div>

      {/* Applications Table */}
      <div class="overflow-hidden">
        <Suspense
          fallback={<div class="p-12 text-center text-gray-500">Loading applications...</div>}
        >
          <Show
            when={preregistrations()?.length}
            fallback={
              <div class="p-12 text-center">
                <Users size={48} class="mx-auto text-gray-300 mb-4" />
                <h3 class="text-lg font-semibold text-gray-700 mb-1">No applications found</h3>
                <p class="text-gray-500 text-sm">
                  {statusFilter() || roleFilter()
                    ? 'Try adjusting your filters'
                    : 'No pre-registration applications have been submitted yet'}
                </p>
              </div>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-gray-200">
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Applicant</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Country</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <For each={preregistrations()}>
                    {(prereg) => (
                      <tr class="hover:bg-gray-50 transition-colors">
                        <td class="px-4 py-3">
                          <div>
                            <p class="font-medium text-gray-900 text-sm">{prereg.display_name}</p>
                            <p class="text-xs text-gray-500">{prereg.email}</p>
                          </div>
                        </td>
                        <td class="px-4 py-3">
                          <Badge size="sm" class={ROLE_COLORS[prereg.role] || ''}>
                            {ROLE_LABELS[prereg.role] || prereg.role}
                          </Badge>
                        </td>
                        <td class="px-4 py-3">
                          <span class="text-sm text-gray-700">{prereg.country || '--'}</span>
                        </td>
                        <td class="px-4 py-3">
                          <span class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_VARIANTS[prereg.status] || ''}`}>
                            {STATUS_LABELS[prereg.status]}
                          </span>
                        </td>
                        <td class="px-4 py-3">
                          <span class="text-sm text-gray-500">{formatDate(prereg.created_at)}</span>
                        </td>
                        <td class="px-4 py-3">
                          <div class="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openDetail(prereg)}
                              class="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors"
                              title="View details"
                            >
                              <FileText size={16} />
                            </button>
                            <Show when={prereg.status === 'pending' || prereg.status === 'info_requested'}>
                              <button
                                type="button"
                                onClick={() => { setApprovePrereg(prereg); setApprovePassword(''); setShowPassword(false) }}
                                class="p-1.5 text-gray-400 hover:text-ktip-tropical-600 transition-colors"
                                title="Approve"
                              >
                                <CheckCircle size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => { setInfoRequestPrereg(prereg); setInfoMessage('') }}
                                class="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Request more info"
                              >
                                <MessageSquare size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => { setRejectPrereg(prereg); setRejectNotes('') }}
                                class="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                                title="Reject"
                              >
                                <XCircle size={16} />
                              </button>
                            </Show>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Suspense>
      </div>

      {/* Detail Modal */}
      <Modal
        open={!!detailPrereg()}
        onClose={() => setDetailPrereg(null)}
        title={`Application — ${detailPrereg()?.display_name || ''}`}
        size="lg"
      >
        <Show when={detailPrereg()}>
          {(prereg) => (
            <div class="space-y-5">
              {/* Status */}
              <div class="flex items-center gap-3">
                <span class={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${STATUS_VARIANTS[prereg().status]}`}>
                  {STATUS_LABELS[prereg().status]}
                </span>
                <span class="text-sm text-gray-500">Applied {formatDate(prereg().created_at)}</span>
              </div>

              {/* Info grid */}
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="flex items-start gap-2">
                  <Mail size={16} class="text-ktip-sand-400 mt-0.5 shrink-0" />
                  <div>
                    <p class="text-xs text-ktip-sand-500 font-medium">Email</p>
                    <p class="text-sm text-ktip-sand-900">{prereg().email}</p>
                  </div>
                </div>
                <div class="flex items-start gap-2">
                  <MapPin size={16} class="text-ktip-sand-400 mt-0.5 shrink-0" />
                  <div>
                    <p class="text-xs text-ktip-sand-500 font-medium">Country</p>
                    <p class="text-sm text-ktip-sand-900">{prereg().country || 'Not specified'}</p>
                  </div>
                </div>
                <div class="flex items-start gap-2">
                  <UserPlus size={16} class="text-ktip-sand-400 mt-0.5 shrink-0" />
                  <div>
                    <p class="text-xs text-ktip-sand-500 font-medium">Requested Role</p>
                    <Badge size="sm" class={ROLE_COLORS[prereg().role] || ''}>
                      {ROLE_LABELS[prereg().role] || prereg().role}
                    </Badge>
                  </div>
                </div>
                <Show when={prereg().organization}>
                  <div class="flex items-start gap-2">
                    <Briefcase size={16} class="text-ktip-sand-400 mt-0.5 shrink-0" />
                    <div>
                      <p class="text-xs text-ktip-sand-500 font-medium">Organization</p>
                      <p class="text-sm text-ktip-sand-900">{prereg().organization}</p>
                    </div>
                  </div>
                </Show>
                <Show when={prereg().linkedin_url}>
                  <div class="flex items-start gap-2">
                    <LinkIcon size={16} class="text-ktip-sand-400 mt-0.5 shrink-0" />
                    <div>
                      <p class="text-xs text-ktip-sand-500 font-medium">LinkedIn</p>
                      <a
                        href={prereg().linkedin_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700"
                      >
                        View Profile
                      </a>
                    </div>
                  </div>
                </Show>
              </div>

              {/* Bio */}
              <Show when={prereg().bio}>
                <div>
                  <p class="text-xs text-ktip-sand-500 font-medium mb-1">About</p>
                  <p class="text-sm text-ktip-sand-800 bg-ktip-sand-50 rounded-lg p-3 whitespace-pre-wrap">
                    {prereg().bio}
                  </p>
                </div>
              </Show>

              {/* Skills */}
              <Show when={prereg().skills && prereg().skills.length > 0}>
                <div>
                  <p class="text-xs text-ktip-sand-500 font-medium mb-1.5">Skills</p>
                  <div class="flex flex-wrap gap-1.5">
                    <For each={prereg().skills}>
                      {(skill) => (
                        <span class="px-2.5 py-1 bg-ktip-ocean-50 text-ktip-ocean-700 rounded-full text-xs font-medium">
                          {skill}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Info request message (if any) */}
              <Show when={prereg().info_request_message}>
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p class="text-xs text-blue-600 font-medium mb-1">Information Requested</p>
                  <p class="text-sm text-blue-800">{prereg().info_request_message}</p>
                </div>
              </Show>

              {/* Admin notes */}
              <div>
                <p class="text-xs text-ktip-sand-500 font-medium mb-1">Admin Notes</p>
                <textarea
                  value={editNotes()}
                  onInput={(e) => setEditNotes(e.currentTarget.value)}
                  placeholder="Add internal notes about this application..."
                  rows={3}
                  class="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none resize-none"
                />
                <div class="flex justify-end mt-1">
                  <Button variant="outline" size="sm" onClick={handleSaveNotes} loading={actionLoading()}>
                    Save Notes
                  </Button>
                </div>
              </div>

              {/* Action buttons */}
              <Show when={prereg().status === 'pending' || prereg().status === 'info_requested'}>
                <div class="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                  <Button
                    size="sm"
                    onClick={() => { setApprovePrereg(prereg()); setApprovePassword(''); setShowPassword(false) }}
                  >
                    <CheckCircle size={14} />
                    Approve & Create Account
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setInfoRequestPrereg(prereg()); setInfoMessage('') }}
                  >
                    <MessageSquare size={14} />
                    Request Info
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setRejectPrereg(prereg()); setRejectNotes('') }}
                    class="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    <XCircle size={14} />
                    Reject
                  </Button>
                </div>
              </Show>
            </div>
          )}
        </Show>
      </Modal>

      {/* Approve Modal */}
      <Modal
        open={!!approvePrereg()}
        onClose={() => { setApprovePrereg(null); setApprovePassword(''); setShowPassword(false) }}
        title={`Approve — ${approvePrereg()?.display_name || ''}`}
        size="sm"
      >
        <div class="space-y-4">
          <p class="text-sm text-gray-600">
            This will create a user account for <strong>{approvePrereg()?.email}</strong> with the role
            <Badge size="sm" class={`ml-1 ${ROLE_COLORS[approvePrereg()?.role || ''] || ''}`}>
              {ROLE_LABELS[approvePrereg()?.role || ''] || ''}
            </Badge>.
            Set an initial password for the user.
          </p>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Initial Password</label>
            <div class="relative">
              <input
                type={showPassword() ? 'text' : 'password'}
                value={approvePassword()}
                onInput={(e) => setApprovePassword(e.currentTarget.value)}
                placeholder="Minimum 8 characters"
                class="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword())}
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <Show when={showPassword()} fallback={<Eye size={16} />}>
                  <EyeOff size={16} />
                </Show>
              </button>
            </div>
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setApprovePrereg(null)} disabled={actionLoading()}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              loading={actionLoading()}
              disabled={!approvePassword() || approvePassword().length < 8}
            >
              <CheckCircle size={14} />
              Approve & Create Account
            </Button>
          </div>
        </div>
      </Modal>

      {/* Request Info Modal */}
      <Modal
        open={!!infoRequestPrereg()}
        onClose={() => setInfoRequestPrereg(null)}
        title={`Request Information — ${infoRequestPrereg()?.display_name || ''}`}
        size="sm"
      >
        <div class="space-y-4">
          <p class="text-sm text-gray-600">
            Describe what additional information you need from this applicant. This message will be stored with their application.
          </p>
          <textarea
            value={infoMessage()}
            onInput={(e) => setInfoMessage(e.currentTarget.value)}
            placeholder="e.g., Please provide more details about your experience in..."
            rows={4}
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none resize-none"
          />
          <div class="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setInfoRequestPrereg(null)} disabled={actionLoading()}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRequestInfo}
              loading={actionLoading()}
              disabled={!infoMessage().trim()}
            >
              <MessageSquare size={14} />
              Send Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Confirm Modal */}
      <ConfirmModal
        open={!!rejectPrereg()}
        title="Reject Application"
        message={`Are you sure you want to reject the application from "${rejectPrereg()?.display_name}"? This cannot be undone.`}
        confirmLabel="Reject Application"
        confirmVariant="danger"
        loading={actionLoading()}
        onConfirm={handleReject}
        onCancel={() => setRejectPrereg(null)}
      />
    </div>
  )
}

export default function AdminPreregistrationsPage() {
  return (
    <AdminLayout>
      <AdminPreregistrationsContent />
    </AdminLayout>
  )
}
