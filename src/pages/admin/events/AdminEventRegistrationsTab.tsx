import { useState, useMemo, Fragment } from 'react'
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
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  RSVP_STATUS_LABELS,
  RSVP_STATUS_COLORS,
} from '../../../lib/constants'
import { format } from 'date-fns'
import { downloadCSV } from '../../../lib/csv-export'
import type { RSVPStatus, RegistrationFieldConfig } from '../../../types'
import { DiamondAvatar } from '../../../components/ui/DiamondAvatar'

interface AdminEventRegistrationsTabProps {
  eventId: string
  eventTitle: string
  registrationFields?: RegistrationFieldConfig[]
}

export default function AdminEventRegistrationsTab(props: AdminEventRegistrationsTabProps) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const hasRegFields = (props.registrationFields || []).length > 0

  const { registrations, loading: registrationsLoading, refetch } = useEventRegistrations(props.eventId)
  const { updateRSVPStatus, bulkCheckIn, loading: actionLoading } = useRegistrationActions()

  const stats = useMemo(() => {
    const list = registrations || []
    return {
      confirmed: list.filter(r => r.status === 'confirmed').length,
      waitlisted: list.filter(r => r.status === 'waitlisted').length,
      checked_in: list.filter(r => r.status === 'checked_in').length,
      cancelled: list.filter(r => r.status === 'cancelled').length,
      total: list.length,
    }
  }, [registrations])

  const filteredRegistrations = useMemo(() => {
    const list = registrations || []
    const q = search.toLowerCase().trim()
    if (!q) return list
    return list.filter(r =>
      (r.user?.display_name || '').toLowerCase().includes(q)
    )
  }, [registrations, search])

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
    const confirmed = (registrations || [])
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
    const list = registrations || []
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
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 p-3 shadow-card">
          <div className="flex items-center gap-2">
            <UserCheck size={16} className="text-ktip-tropical-600" />
            <span className="text-sm text-ktip-sand-600">Confirmed</span>
          </div>
          <p className="text-xl font-bold text-ktip-sand-900 mt-1">{stats.confirmed}</p>
        </div>
        <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 p-3 shadow-card">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-ktip-sun-600" />
            <span className="text-sm text-ktip-sand-600">Waitlisted</span>
          </div>
          <p className="text-xl font-bold text-ktip-sand-900 mt-1">{stats.waitlisted}</p>
        </div>
        <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 p-3 shadow-card">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-ktip-ocean-600" />
            <span className="text-sm text-ktip-sand-600">Checked In</span>
          </div>
          <p className="text-xl font-bold text-ktip-sand-900 mt-1">{stats.checked_in}</p>
        </div>
        <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 p-3 shadow-card">
          <div className="flex items-center gap-2">
            <XCircle size={16} className="text-red-600" />
            <span className="text-sm text-ktip-sand-600">Cancelled</span>
          </div>
          <p className="text-xl font-bold text-ktip-sand-900 mt-1">{stats.cancelled}</p>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
          <input
            type="text"
            placeholder="Search attendees..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            className="w-full pl-9 pr-4 py-2 bg-ktip-cream border border-ktip-sand-200 rounded-lg text-sm text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<CheckCircle size={14} />}
            onClick={handleBulkCheckIn}
            disabled={actionLoading || stats.confirmed === 0}
          >
            Check In All
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleExportCSV}
            disabled={stats.total === 0}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Registrations Table */}
      <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card overflow-hidden">
        {registrationsLoading ? (
          <div className="p-12 text-center text-ktip-sand-500">Loading registrations...</div>
        ) : filteredRegistrations.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ktip-sand-200 bg-ktip-sand-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Attendee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Registered</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ktip-sand-100 stagger-rows">
                {filteredRegistrations.map((reg) => (
                  <Fragment key={reg.id}>
                    <tr className="hover:bg-ktip-sand-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <DiamondAvatar
                            src={reg.user?.avatar_url}
                            name={reg.user?.display_name || 'Attendee'}
                            size={32}
                          />
                          <div>
                            <span className="font-medium text-sm text-ktip-sand-900">
                              {reg.user?.display_name || 'Unknown User'}
                            </span>
                            {hasRegFields && reg.registration_data && Object.keys(reg.registration_data).length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedRow(expandedRow === reg.id ? null : reg.id)}
                                className="ml-2 text-xs text-ktip-ocean-600 hover:text-ktip-ocean-700 inline-flex items-center gap-0.5"
                              >
                                {expandedRow === reg.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                Details
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge size="sm" className={RSVP_STATUS_COLORS[reg.status] || ''}>
                          {RSVP_STATUS_LABELS[reg.status] || reg.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-ktip-sand-600">
                          {format(new Date(reg.created_at), 'MMM d, yyyy')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <select
                            value={reg.status}
                            onChange={(e) => handleStatusChange(reg.id, e.currentTarget.value as RSVPStatus)}
                            disabled={actionLoading}
                            className="text-xs bg-ktip-sand-50 border border-ktip-sand-200 rounded-lg px-2 py-1 focus:border-ktip-ocean-500 focus:outline-none"
                          >
                            <option value="confirmed">Confirmed</option>
                            <option value="waitlisted">Waitlisted</option>
                            <option value="checked_in">Checked In</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                    {expandedRow === reg.id && hasRegFields && (
                      <tr className="bg-ktip-sand-50/50">
                        <td colSpan={4} className="px-4 py-3">
                          <div className="ml-11 grid grid-cols-2 gap-x-6 gap-y-2">
                            {(props.registrationFields || []).map((field) => {
                              const val = reg.registration_data?.[field.id]
                              const displayVal = val === true ? 'Yes' : val === false ? 'No' : val != null ? String(val) : '—'
                              return (
                                <div key={field.id}>
                                  <span className="text-xs text-ktip-sand-500">{field.label}</span>
                                  <p className="text-sm text-ktip-sand-800">{displayVal}</p>
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <Users size={48} className="mx-auto text-ktip-sand-300 mb-4" />
            <h3 className="text-lg font-semibold text-ktip-sand-700 mb-1">No registrations</h3>
            <p className="text-ktip-sand-500 text-sm">
              {search ? 'No matches found' : 'No one has registered for this event yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
