import { useState } from 'react'
import { History, KeyRound, ShieldOff } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { RevokeVerificationModal } from '../../../components/admin/RevokeVerificationModal'
import {
  useAllVerificationCodes,
  useVerificationEvents,
  type CodeStatus,
  type VerificationEventRow,
} from '../../../hooks/useVerificationLifecycle'
import { formatDate } from '../../../lib/utils'

const SELECT_CLASS =
  'border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500'

const EVENT_LABELS: Record<string, string> = {
  granted: 'Verified',
  renewed: 'Renewed',
  track_changed: 'Route changed',
  rejected: 'Document not accepted',
  revoked: 'Revoked',
  expired: 'Expired',
  reminder_sent: 'Reminder sent',
  code_issued: 'Code issued',
  code_redeemed: 'Code used',
  code_revoked: 'Code cancelled',
  code_withdrawn: 'Withdrawn by organisation',
  hold_set: 'Hold set',
  hold_cleared: 'Hold lifted',
}

const VIA_LABELS: Record<string, string> = {
  document: 'Document',
  domain: 'Email domain',
  institution: 'Institution',
  roster: 'Institution list',
  admin: 'Administrator',
  grandfathered: 'Pilot',
  org_code: 'Organisation code',
  association: 'Verified business',
}

const EVENT_TONE: Record<string, string> = {
  granted: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  renewed: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  code_redeemed: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  revoked: 'bg-red-100 text-red-700 border-red-200',
  code_withdrawn: 'bg-red-100 text-red-700 border-red-200',
  hold_set: 'bg-red-100 text-red-700 border-red-200',
  rejected: 'bg-ktip-sun-100 text-ktip-sun-700 border-ktip-sun-200',
  expired: 'bg-ktip-sun-100 text-ktip-sun-700 border-ktip-sun-200',
}

function evidenceSummary(e: VerificationEventRow): string | null {
  const ev = e.evidence || {}
  const parts: string[] = []
  if (typeof ev.label === 'string') parts.push(ev.label)
  else if (typeof ev.org_name === 'string') parts.push(ev.org_name)
  if (typeof ev.domain === 'string') parts.push(`@${ev.domain}`)
  if (typeof ev.code_label === 'string') parts.push(`for ${ev.code_label}`)
  if (ev.backfill === true) parts.push('recorded at launch of the log')
  if (ev.hold === true) parts.push('hold set')
  return parts.length ? parts.join(' · ') : null
}

/**
 * Every verification decision (174), newest first, and the codes issued
 * across the platform (176). Renders nothing until those migrations are live.
 */
export function VerificationHistoryPanel() {
  const [eventFilter, setEventFilter] = useState('')
  const { events, loading, refetch } = useVerificationEvents({ event: eventFilter || undefined })
  const [holdTarget, setHoldTarget] = useState<{ userId: string; userName: string } | null>(null)

  if (events === null && !loading) return null

  return (
    <section className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-ktip-sand-100">
        <div className="flex items-center gap-2">
          <History size={18} className="text-ktip-ocean-600" />
          <h2 className="text-base font-semibold text-ktip-sand-900">Verification history</h2>
        </div>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.currentTarget.value)}
          className={SELECT_CLASS}
          aria-label="Filter by event"
        >
          <option value="">All events</option>
          {Object.entries(EVENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="p-6"><div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" /></div>
      ) : !events || events.length === 0 ? (
        <p className="p-6 text-sm text-ktip-sand-500">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y divide-ktip-sand-100 max-h-[32rem] overflow-y-auto">
          {events.map((e) => {
            const name = e.user?.display_name || 'Unknown member'
            // A revoke that set a hold says so in its evidence. If the hold was
            // lifted since, the server answers not_on_hold and nothing changes.
            const onHold = e.evidence?.hold === true
            const detail = evidenceSummary(e)
            return (
              <li key={e.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${EVENT_TONE[e.event] || 'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200'}`}>
                      {EVENT_LABELS[e.event] || e.event}
                    </span>
                    <span className="text-sm font-medium text-ktip-sand-900">{name}</span>
                    {e.via && <span className="text-xs text-ktip-sand-500">{VIA_LABELS[e.via] || e.via}</span>}
                  </div>
                  {detail && <p className="text-xs text-ktip-sand-600 mt-1">{detail}</p>}
                  {e.reason && <p className="text-xs text-ktip-sand-700 mt-1 whitespace-pre-wrap">“{e.reason}”</p>}
                  <p className="text-xs text-ktip-sand-500 mt-1">
                    {formatDate(e.created_at)}
                    {e.actor?.display_name ? ` · by ${e.actor.display_name}` : e.actor_id ? '' : ' · automatic'}
                  </p>
                </div>
                {onHold && (e.event === 'revoked' || e.event === 'hold_set') && (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<ShieldOff size={14} />}
                    onClick={() => setHoldTarget({ userId: e.user_id, userName: name })}
                  >
                    Lift hold
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <RevokeVerificationModal
        target={holdTarget}
        mode="clear_hold"
        onClose={() => setHoldTarget(null)}
        onDone={() => refetch()}
      />
    </section>
  )
}

const CODE_STATUS_LABELS: Record<CodeStatus, string> = {
  unused: 'Unused',
  redeemed: 'Used',
  expired: 'Expired',
  revoked: 'Cancelled',
}

export function VerificationCodesAdminPanel() {
  const [status, setStatus] = useState<CodeStatus | ''>('')
  const { codes, loading } = useAllVerificationCodes(status)

  if (codes === null && !loading) return null

  return (
    <section className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-ktip-sand-100">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-ktip-ocean-600" />
          <div>
            <h2 className="text-base font-semibold text-ktip-sand-900">Organisation codes</h2>
            <p className="text-xs text-ktip-sand-500">
              Issued by verified businesses, schools and colleges. Spot-check who issues many.
            </p>
          </div>
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.currentTarget.value as CodeStatus | '')}
          className={SELECT_CLASS}
          aria-label="Filter by status"
        >
          <option value="">All codes</option>
          {Object.entries(CODE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="p-6"><div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" /></div>
      ) : !codes || codes.length === 0 ? (
        <p className="p-6 text-sm text-ktip-sand-500">No codes issued yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ktip-sand-500 border-b border-ktip-sand-100">
                <th className="px-4 py-2 font-medium">Organisation</th>
                <th className="px-4 py-2 font-medium">For</th>
                <th className="px-4 py-2 font-medium">Issued by</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Dates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ktip-sand-100">
              {codes.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-ktip-sand-900">{c.org_name ?? '—'}</td>
                  <td className="px-4 py-2 text-ktip-sand-700">
                    {c.label}
                    <span className="ml-1 font-mono text-xs text-ktip-sand-500">…{c.code_hint}</span>
                    {c.grants_role && <span className="ml-1 text-xs text-ktip-sand-500">({c.grants_role})</span>}
                  </td>
                  <td className="px-4 py-2 text-ktip-sand-700">{c.issued_by_name ?? '—'}</td>
                  <td className="px-4 py-2">
                    {CODE_STATUS_LABELS[c.status]}
                    {c.redeemed_by_name ? <span className="text-xs text-ktip-sand-500"> by {c.redeemed_by_name}</span> : null}
                  </td>
                  <td className="px-4 py-2 text-xs text-ktip-sand-500">
                    {formatDate(c.issued_at)} → {formatDate(c.redeemed_at ?? c.expires_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
