import { createSignal, Show, For, Suspense, createMemo } from 'solid-js'
import { useEventRegistrations, useRegistrationActions } from '../../../hooks/useAdminEvents'
import { useToast } from '../../../contexts/ToastContext'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import {
  Download,
  CheckCircle,
  Search,
  Users,
  UserCheck,
  Clock,
  XCircle,
} from 'lucide-solid'
import {
  RSVP_STATUS_LABELS,
  RSVP_STATUS_COLORS,
} from '../../../lib/constants'
import { format } from 'date-fns'
import { downloadCSV } from '../../../lib/csv-export'
import { ChevronDown, ChevronUp } from 'lucide-solid'
import type { RSVPStatus, RegistrationFieldConfig } from '../../../types'

interface AdminEventRegistrationsTabProps {
  eventId: string
  eventTitle: string
  registrationFields?: RegistrationFieldConfig[]
}

export default function AdminEventRegistrationsTab(props: AdminEventRegistrationsTabProps) {
  const toast = useToast()
  const [search, setSearch] = createSignal('')
  const [expandedRow, setExpandedRow] = createSignal<string | null>(null)

  const hasRegFields = () => (props.registrationFields || []).length > 0

  const { registrations, refetch } = useEventRegistrations(() => props.eventId)
  const { updateRSVPStatus, bulkCheckIn, loading: actionLoading } = useRegistrationActions()

  const stats = createMemo(() => {
    const list = registrations() || []
    return {
      confirmed: list.filter(r => r.status === 'confirmed').length,
      waitlisted: list.filter(r => r.status === 'waitlisted').length,
      checked_in: list.filter(r => r.status === 'checked_in').length,
      cancelled: list.filter(r => r.status === 'cancelled').length,
      total: list.length,
    }
  })

  const filteredRegistrations = createMemo(() => {
    const list = registrations() || []
    const q = search().toLowerCase().trim()
    if (!q) return list
    return list.filter(r =>
      (r.user?.display_name || '').toLowerCase().includes(q)
    )
  })

  const handleStatusChange = async (rsvpId: string, status: RSVPStatus) => {
    try {
      await updateRSVPStatus(rsvpId, status)
      toast.success(`Registration ${RSVP_STATUS_LABELS[status].toLowerCase()}`)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update registration')
    }
  }

  const handleBulkCheckIn = async () => {
    const confirmed = (registrations() || [])
      .filter(r => r.status === 'confirmed')
      .map(r => r.id)

    if (confirmed.length === 0) {
      toast.info('No confirmed registrations to check in')
      return
    }

    try {
      await bulkCheckIn(confirmed)
      toast.success(`Checked in ${confirmed.length} attendee${confirmed.length !== 1 ? 's' : ''}`)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to bulk check in')
    }
  }

  const handleExportCSV = () => {
    const list = registrations() || []
    if (list.length === 0) {
      toast.info('No registrations to export')
      return
    }

    const regFields = props.registrationFields || []
    const headers = [
      'Name',
      'Status',
      'Registered On',
      ...regFields.map(f => f.label),
    ]
    const rows = list.map(r => [
      r.user?.display_name || 'Unknown',
      RSVP_STATUS_LABELS[r.status] || r.status,
      format(new Date(r.created_at), 'yyyy-MM-dd HH:mm'),
      ...regFields.map(f => {
        const val = r.registration_data?.[f.id]
        if (val === true) return 'Yes'
        if (val === false) return 'No'
        return val != null ? String(val) : ''
      }),
    ])

    const filename = `${props.eventTitle.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-attendees.csv`
    downloadCSV(filename, headers, rows)
    toast.success('CSV exported successfully')
  }

  return (
    <div class="space-y-6">
      {/* Stats Row */}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-white rounded-xl border border-ktip-sand-200 p-3 shadow-card">
          <div class="flex items-center gap-2">
            <UserCheck size={16} class="text-ktip-tropical-600" />
            <span class="text-sm text-ktip-sand-600">Confirmed</span>
          </div>
          <p class="text-xl font-bold text-ktip-sand-900 mt-1">{stats().confirmed}</p>
        </div>
        <div class="bg-white rounded-xl border border-ktip-sand-200 p-3 shadow-card">
          <div class="flex items-center gap-2">
            <Clock size={16} class="text-yellow-600" />
            <span class="text-sm text-ktip-sand-600">Waitlisted</span>
          </div>
          <p class="text-xl font-bold text-ktip-sand-900 mt-1">{stats().waitlisted}</p>
        </div>
        <div class="bg-white rounded-xl border border-ktip-sand-200 p-3 shadow-card">
          <div class="flex items-center gap-2">
            <CheckCircle size={16} class="text-blue-600" />
            <span class="text-sm text-ktip-sand-600">Checked In</span>
          </div>
          <p class="text-xl font-bold text-ktip-sand-900 mt-1">{stats().checked_in}</p>
        </div>
        <div class="bg-white rounded-xl border border-ktip-sand-200 p-3 shadow-card">
          <div class="flex items-center gap-2">
            <XCircle size={16} class="text-red-600" />
            <span class="text-sm text-ktip-sand-600">Cancelled</span>
          </div>
          <p class="text-xl font-bold text-ktip-sand-900 mt-1">{stats().cancelled}</p>
        </div>
      </div>

      {/* Actions Bar */}
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="relative flex-1">
          <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
          <input
            type="text"
            placeholder="Search attendees..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            class="w-full pl-9 pr-4 py-2 bg-white border border-ktip-sand-200 rounded-lg text-sm text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
          />
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<CheckCircle size={14} />}
            onClick={handleBulkCheckIn}
            disabled={actionLoading() || stats().confirmed === 0}
          >
            Check In All
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleExportCSV}
            disabled={stats().total === 0}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Registrations Table */}
      <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card overflow-hidden">
        <Suspense
          fallback={
            <div class="p-12 text-center text-ktip-sand-500">Loading registrations...</div>
          }
        >
          <Show
            when={filteredRegistrations().length}
            fallback={
              <div class="p-12 text-center">
                <Users size={48} class="mx-auto text-ktip-sand-300 mb-4" />
                <h3 class="text-lg font-semibold text-ktip-sand-700 mb-1">No registrations</h3>
                <p class="text-ktip-sand-500 text-sm">
                  {search() ? 'No matches found' : 'No one has registered for this event yet'}
                </p>
              </div>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-ktip-sand-200 bg-ktip-sand-50">
                    <th class="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Attendee</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Status</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Registered</th>
                    <th class="text-right px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-ktip-sand-100">
                  <For each={filteredRegistrations()}>
                    {(reg) => (
                      <>
                        <tr class="hover:bg-ktip-sand-50 transition-colors">
                          <td class="px-4 py-3">
                            <div class="flex items-center gap-3">
                              <div class="w-8 h-8 rounded-full bg-ktip-ocean-100 flex items-center justify-center text-xs font-medium text-ktip-ocean-700">
                                {(reg.user?.display_name || '?')[0].toUpperCase()}
                              </div>
                              <div>
                                <span class="font-medium text-sm text-ktip-sand-900">
                                  {reg.user?.display_name || 'Unknown User'}
                                </span>
                                <Show when={hasRegFields() && reg.registration_data && Object.keys(reg.registration_data).length > 0}>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedRow(expandedRow() === reg.id ? null : reg.id)}
                                    class="ml-2 text-xs text-ktip-ocean-600 hover:text-ktip-ocean-700 inline-flex items-center gap-0.5"
                                  >
                                    {expandedRow() === reg.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    Details
                                  </button>
                                </Show>
                              </div>
                            </div>
                          </td>
                          <td class="px-4 py-3">
                            <Badge size="sm" class={RSVP_STATUS_COLORS[reg.status] || ''}>
                              {RSVP_STATUS_LABELS[reg.status] || reg.status}
                            </Badge>
                          </td>
                          <td class="px-4 py-3">
                            <span class="text-sm text-ktip-sand-600">
                              {format(new Date(reg.created_at), 'MMM d, yyyy')}
                            </span>
                          </td>
                          <td class="px-4 py-3">
                            <div class="flex items-center justify-end">
                              <select
                                value={reg.status}
                                onChange={(e) => handleStatusChange(reg.id, e.currentTarget.value as RSVPStatus)}
                                disabled={actionLoading()}
                                class="text-xs bg-ktip-sand-50 border border-ktip-sand-200 rounded-lg px-2 py-1 focus:border-ktip-ocean-500 focus:outline-none"
                              >
                                <option value="confirmed">Confirmed</option>
                                <option value="waitlisted">Waitlisted</option>
                                <option value="checked_in">Checked In</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </div>
                          </td>
                        </tr>
                        <Show when={expandedRow() === reg.id && hasRegFields()}>
                          <tr class="bg-ktip-sand-50/50">
                            <td colspan="4" class="px-4 py-3">
                              <div class="ml-11 grid grid-cols-2 gap-x-6 gap-y-2">
                                <For each={props.registrationFields || []}>
                                  {(field) => {
                                    const val = reg.registration_data?.[field.id]
                                    const displayVal = val === true ? 'Yes' : val === false ? 'No' : val != null ? String(val) : '—'
                                    return (
                                      <div>
                                        <span class="text-xs text-ktip-sand-500">{field.label}</span>
                                        <p class="text-sm text-ktip-sand-800">{displayVal}</p>
                                      </div>
                                    )
                                  }}
                                </For>
                              </div>
                            </td>
                          </tr>
                        </Show>
                      </>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Suspense>
      </div>
    </div>
  )
}
