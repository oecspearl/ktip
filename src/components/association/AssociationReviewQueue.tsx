import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Building2, Filter, Globe2, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg, plural } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { Modal } from '../ui/Modal'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  useAdminEmployerDecision,
  useAssociationReviewQueue,
  useChamberVerifyEmployer,
  useCountries,
  type AssociationQueueRow,
} from '../../hooks/useInstitutions'
import { supabase } from '../../lib/supabase'
import { keys } from '../../queries/keys'
import { formatDate } from '../../lib/utils'
import type { Employer } from '../../types'

type Decision = 'verified' | 'rejected' | 'revoked'

const STATUS_LABELS: Record<string, MessageDescriptor> = {
  unverified: msg`Unverified`,
  pending: msg`Pending review`,
  verified: msg`Verified`,
  rejected: msg`Not accepted`,
  revoked: msg`Revoked`,
}

const STATUS_COLORS: Record<string, string> = {
  unverified: 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200',
  pending: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  verified: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  revoked: 'bg-red-100 text-red-700 border-red-200',
}

const SELECT_CLASS =
  'border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500'

const DAY_MS = 86_400_000

/** Same rule as association_review_queue(): whole days since submission. */
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS))
}

/** The association's own rows come from the table; shape them like the RPC's. */
function fromEmployer(e: Employer): AssociationQueueRow {
  return {
    id: e.id,
    slug: e.slug,
    legal_name: e.legal_name,
    trading_name: e.trading_name ?? null,
    industry: e.industry ?? null,
    description: e.description ?? null,
    website_url: e.website_url ?? null,
    country_code: e.country_code,
    country_name: null,
    contact_email: e.contact_email,
    contact_phone: e.contact_phone ?? null,
    registration_number: e.registration_number ?? null,
    verification_status: e.verification_status,
    verification_method: e.verification_method ?? null,
    verification_note: e.verification_note ?? null,
    verified_at: e.verified_at ?? null,
    created_by: e.created_by ?? null,
    owner_name: null,
    created_at: e.created_at,
    updated_at: e.updated_at,
    submitted_at: e.created_at,
    waiting_days: e.verification_status === 'pending' ? daysSince(e.created_at) : null,
    assigned_institution_id: null,
    assigned_institution_name: null,
    reviewer_count: 0,
    reviewed_by_institution_name: null,
    chamber_reviewed_at: null,
  }
}

function waitingTone(days: number): string {
  if (days >= 14) return 'text-red-700'
  if (days >= 7) return 'text-ktip-sun-800'
  return 'text-ktip-sand-600'
}

interface AssociationReviewQueueProps {
  /**
   * association — the reviewer's own countries, decisions through
   * set_employer_verification_by_chamber. admin — every country, with waiting
   * time and the assigned association; decisions through
   * set_employer_verification (employer:manage).
   */
  mode: 'association' | 'admin'
  /** Association mode only: the countries chamber_countries() returned. */
  jurisdiction?: string[]
}

export function AssociationReviewQueue({ mode, jurisdiction = [] }: AssociationReviewQueueProps) {
  const { t, i18n } = useLingui()
  const toast = useToast()
  const auth = useAuth()
  const isAdmin = mode === 'admin'

  const [statusFilter, setStatusFilter] = useState('pending')
  const [countryFilter, setCountryFilter] = useState('')
  const [unassignedOnly, setUnassignedOnly] = useState(false)

  const { countries } = useCountries(true)

  // Admin: the RPC, which sees every country and adds waiting time and the
  // assigned association.
  const adminQueue = useAssociationReviewQueue(
    { status: statusFilter, country: countryFilter },
    isAdmin
  )

  // Association: RLS already limits employers to the reviewer's countries.
  // The country filter drops businesses they see for another reason (their
  // own, as a member), which are not theirs to review.
  const associationQueue = useQuery({
    queryKey: keys.list('employers', { scope: 'association-review', statusFilter, jurisdiction }),
    queryFn: async (): Promise<AssociationQueueRow[]> => {
      let request = (supabase as any)
        .from('employers')
        .select('*')
        .in('country_code', jurisdiction)
        .order('created_at', { ascending: statusFilter === 'pending' })
        .limit(200)
      if (statusFilter) request = request.eq('verification_status', statusFilter)
      const { data, error } = await request
      if (error) throw error
      return ((data as Employer[]) || []).map(fromEmployer)
    },
    enabled: !isAdmin && jurisdiction.length > 0,
  })

  const loading = isAdmin ? adminQueue.loading : associationQueue.isPending
  const loadError = isAdmin ? adminQueue.error : associationQueue.error
  const refetch = isAdmin ? adminQueue.refetch : associationQueue.refetch

  const rows = useMemo(() => {
    const all = (isAdmin ? adminQueue.rows : associationQueue.data) ?? []
    return isAdmin && unassignedOnly
      ? all.filter((row) => !row.assigned_institution_id || row.reviewer_count === 0)
      : all
  }, [isAdmin, adminQueue.rows, associationQueue.data, unassignedOnly])

  const { verifyEmployer, loading: associationDeciding } = useChamberVerifyEmployer()
  const { decide: adminDecide, loading: adminDeciding } = useAdminEmployerDecision()
  const deciding = isAdmin ? adminDeciding : associationDeciding
  // The override needs employer:manage. A People & Trust supervisor holds
  // sme:verify and sees the queue, but decides nothing from here.
  const canDecide = isAdmin ? auth.can('employer:manage') : true

  const [selected, setSelected] = useState<AssociationQueueRow | null>(null)
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [note, setNote] = useState('')

  const openReview = (row: AssociationQueueRow) => {
    setSelected(row)
    setRegistrationNumber(row.registration_number || '')
    setNote('')
  }

  const handleDecision = async (status: Decision) => {
    if (!selected) return
    const params = {
      employerId: selected.id,
      status,
      registrationNumber: registrationNumber.trim() || undefined,
      note: note.trim() || undefined,
    }
    try {
      if (isAdmin) await adminDecide(params)
      else await verifyEmployer(params)
      toast.success(
        status === 'verified'
          ? t`Business verified`
          : status === 'rejected'
            ? t`Business not accepted`
            : t`Verification revoked`
      )
      setSelected(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || t`Could not record the decision`)
    }
  }

  const statusChip = (status: string) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[status] ?? ''}`}>
      {STATUS_LABELS[status] ? i18n._(STATUS_LABELS[status]) : status}
    </span>
  )

  const waiting = (row: AssociationQueueRow) =>
    row.waiting_days === null ? (
      <span className="text-ktip-sand-400">—</span>
    ) : (
      <span className={`font-medium ${waitingTone(row.waiting_days)}`}>
        {plural(row.waiting_days, { one: '# day', other: '# days' })}
      </span>
    )

  const association = (row: AssociationQueueRow) =>
    row.assigned_institution_id ? (
      <span>
        {row.assigned_institution_name}
        {row.reviewer_count === 0 && (
          <span className="block text-xs text-ktip-sun-800"><Trans>No reviewer linked</Trans></span>
        )}
      </span>
    ) : (
      <span className="text-red-700 font-medium"><Trans>Unassigned</Trans></span>
    )

  return (
    <>
      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin ? (
            <Filter size={16} className="text-ktip-sand-400" />
          ) : (
            <>
              <Globe2 size={16} className="text-ktip-sand-400" />
              <span className="text-sm text-ktip-sand-700">
                <Trans>Your countries: <strong>{jurisdiction.join(', ')}</strong></Trans>
              </span>
            </>
          )}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t`Status`}
            className={`${SELECT_CLASS} ${isAdmin ? '' : 'ml-auto'}`}
          >
            <option value="">{t`All statuses`}</option>
            <option value="pending">{t`Pending review`}</option>
            <option value="verified">{t`Verified`}</option>
            <option value="rejected">{t`Not accepted`}</option>
            <option value="revoked">{t`Revoked`}</option>
          </select>
          {isAdmin && (
            <>
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                aria-label={t`Country`}
                className={SELECT_CLASS}
              >
                <option value="">{t`All countries`}</option>
                {countries?.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 text-sm text-ktip-sand-700">
                <input
                  type="checkbox"
                  checked={unassignedOnly}
                  onChange={(e) => setUnassignedOnly(e.target.checked)}
                  className="rounded border-ktip-sand-300"
                />
                <Trans>No association yet</Trans>
              </label>
              {(statusFilter !== 'pending' || countryFilter || unassignedOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('pending')
                    setCountryFilter('')
                    setUnassignedOnly(false)
                  }}
                  className="inline-flex items-center gap-1 text-sm text-ktip-sand-500 hover:text-ktip-sand-800"
                >
                  <X size={14} /> <Trans>Reset</Trans>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
        {loading && <p className="p-8 text-center text-ktip-sand-500"><Trans>Loading submissions…</Trans></p>}
        {!loading && loadError && (
          <p className="p-8 text-center text-red-700"><Trans>The queue could not be loaded.</Trans></p>
        )}
        {!loading && !loadError && rows.length === 0 && (
          <p className="p-8 text-center text-ktip-sand-500"><Trans>Nothing to review.</Trans></p>
        )}

        {isAdmin && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ktip-sand-50 text-left text-xs uppercase tracking-wide text-ktip-sand-500">
                <tr>
                  <th className="px-4 py-3 font-medium"><Trans>Business</Trans></th>
                  <th className="px-4 py-3 font-medium"><Trans>Country</Trans></th>
                  <th className="px-4 py-3 font-medium"><Trans>Submitted</Trans></th>
                  <th className="px-4 py-3 font-medium"><Trans>Waiting</Trans></th>
                  <th className="px-4 py-3 font-medium"><Trans>Association</Trans></th>
                  <th className="px-4 py-3 font-medium"><Trans>Status</Trans></th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ktip-sand-100">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ktip-sand-900">{row.legal_name}</p>
                      <p className="text-xs text-ktip-sand-500">
                        {row.owner_name || row.contact_email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-ktip-sand-700">{row.country_name || row.country_code}</td>
                    <td className="px-4 py-3 text-ktip-sand-700 whitespace-nowrap">{formatDate(row.submitted_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{waiting(row)}</td>
                    <td className="px-4 py-3 text-ktip-sand-700">{association(row)}</td>
                    <td className="px-4 py-3">{statusChip(row.verification_status)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<BadgeCheck size={14} />}
                        onClick={() => openReview(row)}
                      >
                        <Trans>Review</Trans>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isAdmin && rows.length > 0 && (
          <ul className="divide-y divide-ktip-sand-100">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Building2 size={15} className="text-ktip-ocean-600" />
                    <span className="font-medium text-ktip-sand-900">{row.legal_name}</span>
                    {statusChip(row.verification_status)}
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-ktip-sand-100 text-ktip-sand-700 border border-ktip-sand-200">
                      {row.country_code}
                    </span>
                  </div>
                  <p className="text-sm text-ktip-sand-600">
                    {row.industry || t`Industry not stated`}
                    {row.registration_number && <> · {t`Reg. ${row.registration_number}`}</>}
                  </p>
                  <p className="text-xs text-ktip-sand-500 mt-0.5">
                    <Trans>Submitted {formatDate(row.submitted_at)}</Trans>
                    {row.waiting_days !== null && <> · {waiting(row)}</>}
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  icon={<BadgeCheck size={14} />}
                  onClick={() => openReview(row)}
                >
                  <Trans>Review</Trans>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? t`Review: ${selected.legal_name}` : ''}
        description={t`Check the details against the national company registry before you verify.`}
        size="md"
      >
        {selected && (
          <div className="space-y-4">
            <dl className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ktip-sand-500"><Trans>Trading name</Trans></dt>
                <dd className="text-ktip-sand-900">{selected.trading_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-ktip-sand-500"><Trans>Contact</Trans></dt>
                <dd className="text-ktip-sand-900 break-all">{selected.contact_email}</dd>
              </div>
              {isAdmin && (
                <>
                  <div>
                    <dt className="text-ktip-sand-500"><Trans>Association</Trans></dt>
                    <dd className="text-ktip-sand-900">{association(selected)}</dd>
                  </div>
                  <div>
                    <dt className="text-ktip-sand-500"><Trans>Waiting</Trans></dt>
                    <dd className="text-ktip-sand-900">{waiting(selected)}</dd>
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <dt className="text-ktip-sand-500"><Trans>Description</Trans></dt>
                <dd className="text-ktip-sand-900">{selected.description || '—'}</dd>
              </div>
            </dl>

            {isAdmin && canDecide && (
              <p className="text-xs text-ktip-sun-800 bg-ktip-sun-50 border border-ktip-sun-200 rounded-lg px-3 py-2">
                <Trans>You are deciding for OECS, not for the association. The owner is told KTIP made the decision.</Trans>
              </p>
            )}

            {canDecide ? (
              <>
                <Input
                  label={t`Registry number confirmed`}
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  helperText={t`Kept as the evidence for this decision.`}
                  fullWidth
                />

                <Textarea
                  label={t`Note to the business (optional)`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  helperText={t`If you turn the business down or revoke it, the owner sees this note.`}
                  rows={3}
                  fullWidth
                />
              </>
            ) : (
              <p className="text-sm text-ktip-sand-600">
                <Trans>Only accounts with the Administer employers permission can decide from here.</Trans>
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-ktip-sand-100">
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                <Trans>Cancel</Trans>
              </Button>
              {canDecide &&
                (selected.verification_status === 'verified' ? (
                  <Button
                    variant="danger"
                    size="sm"
                    loading={deciding}
                    onClick={() => handleDecision('revoked')}
                  >
                    <Trans>Revoke verification</Trans>
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      loading={deciding}
                      onClick={() => handleDecision('rejected')}
                    >
                      <Trans>Do not accept</Trans>
                    </Button>
                    <Button size="sm" loading={deciding} onClick={() => handleDecision('verified')}>
                      <Trans>Verify business</Trans>
                    </Button>
                  </>
                ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
