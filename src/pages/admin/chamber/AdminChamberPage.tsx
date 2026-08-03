import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Building2, Globe2, ShieldX } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Modal } from '../../../components/ui/Modal'
import { PageHero } from '../../../components/layout/PageHero'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { useToast } from '../../../contexts/ToastContext'
import { useAuth } from '../../../contexts/AuthContext'
import { useChamberCountries, useChamberVerifyEmployer } from '../../../hooks/useInstitutions'
import { supabase } from '../../../lib/supabase'
import { keys } from '../../../queries/keys'
import { formatDate } from '../../../lib/utils'
import type { Employer } from '../../../types'

const STATUS_LABELS: Record<string, string> = {
  unverified: 'Unverified',
  pending: 'Pending review',
  verified: 'Verified',
  rejected: 'Not accepted',
  revoked: 'Revoked',
}

const STATUS_COLORS: Record<string, string> = {
  unverified: 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200',
  pending: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  verified: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  revoked: 'bg-red-100 text-red-700 border-red-200',
}

export default function AdminChamberPage() {
  const auth = useAuth()
  const toast = useToast()

  usePageTitle('Chamber verification')

  const { countries: jurisdiction, loading: jurisdictionLoading } = useChamberCountries(auth.user?.id)
  const { verifyEmployer, loading: verifying } = useChamberVerifyEmployer()

  const [statusFilter, setStatusFilter] = useState('pending')

  // RLS already restricts this to the caller's chamber countries; the filter
  // here is for the reviewer's convenience, not for access control.
  const { data: employers, isPending, refetch } = useQuery({
    queryKey: keys.list('chamber-employers', { statusFilter }),
    queryFn: async (): Promise<Employer[]> => {
      let request = (supabase as any)
        .from('employers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (statusFilter) request = request.eq('verification_status', statusFilter)

      const { data, error } = await request
      if (error) throw error
      return (data as Employer[]) || []
    },
    enabled: jurisdiction.length > 0,
  })

  const [selected, setSelected] = useState<Employer | null>(null)
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [note, setNote] = useState('')

  const openReview = (employer: Employer) => {
    setSelected(employer)
    setRegistrationNumber(employer.registration_number || '')
    setNote('')
  }

  const handleDecision = async (status: 'verified' | 'rejected' | 'revoked') => {
    if (!selected) return
    try {
      await verifyEmployer({
        employerId: selected.id,
        status,
        registrationNumber: registrationNumber.trim() || undefined,
        note: note.trim() || undefined,
      })
      toast.success(
        status === 'verified'
          ? 'Business verified as an SME'
          : `Business ${(STATUS_LABELS[status] ?? status).toLowerCase()}`
      )
      setSelected(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to record decision')
    }
  }

  if (!jurisdictionLoading && jurisdiction.length === 0) {
    return (
      <div>
        <PageHero
          inset
          compact
          eyebrow="Chamber of Commerce"
          title="SME verification"
          subtitle="Vet and onboard businesses in your member state"
          imageSeed="admin-chamber"
        />
        <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-8 text-center">
          <ShieldX size={28} className="text-ktip-sand-400 mx-auto mb-3" />
          <p className="text-ktip-sand-700 font-medium">No Chamber jurisdiction</p>
          <p className="text-sm text-ktip-sand-600 mt-1">
            Your account is not an approved member of a verified Chamber of Commerce, so there is no
            member state you can vet businesses for.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHero
        inset
        compact
        eyebrow="Chamber of Commerce"
        title="SME verification"
        subtitle="Vet and onboard businesses in your member state"
        imageSeed="admin-chamber"
      />

      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Globe2 size={16} className="text-ktip-sand-400" />
          <span className="text-sm text-ktip-sand-700">
            Jurisdiction: <strong>{jurisdiction.join(', ')}</strong>
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 ml-auto"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Not accepted</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
      </div>

      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
        {isPending && <p className="p-8 text-center text-ktip-sand-500">Loading submissions…</p>}
        {!isPending && (employers?.length ?? 0) === 0 && (
          <p className="p-8 text-center text-ktip-sand-500">Nothing to review.</p>
        )}
        <ul className="divide-y divide-ktip-sand-100">
          {employers?.map((employer) => (
            <li key={employer.id} className="px-4 py-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Building2 size={15} className="text-ktip-ocean-600" />
                  <span className="font-medium text-ktip-sand-900">{employer.legal_name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[employer.verification_status]}`}>
                    {STATUS_LABELS[employer.verification_status] ?? employer.verification_status}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-ktip-sand-100 text-ktip-sand-700 border border-ktip-sand-200">
                    {employer.country_code}
                  </span>
                </div>
                <p className="text-sm text-ktip-sand-600">
                  {employer.industry || 'Industry not stated'}
                  {employer.registration_number && <> · Reg. {employer.registration_number}</>}
                </p>
                <p className="text-xs text-ktip-sand-500 mt-0.5">
                  Submitted {formatDate(employer.created_at)}
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                icon={<BadgeCheck size={14} />}
                onClick={() => openReview(employer)}
              >
                Review
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Review — ${selected.legal_name}` : ''}
        description="Check the submission against your national corporate registry before verifying."
        size="md"
      >
        {selected && (
          <div className="space-y-4">
            <dl className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ktip-sand-500">Trading name</dt>
                <dd className="text-ktip-sand-900">{selected.trading_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-ktip-sand-500">Contact</dt>
                <dd className="text-ktip-sand-900 break-all">{selected.contact_email}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-ktip-sand-500">Description</dt>
                <dd className="text-ktip-sand-900">{selected.description || '—'}</dd>
              </div>
            </dl>

            <Input
              label="Registry number confirmed"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              helperText="Recorded as the evidence for this verification."
              fullWidth
            />

            <Textarea
              label="Internal note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              fullWidth
            />

            <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-ktip-sand-100">
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              {selected.verification_status === 'verified' ? (
                <Button
                  variant="danger"
                  size="sm"
                  loading={verifying}
                  onClick={() => handleDecision('revoked')}
                >
                  Revoke verification
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={verifying}
                    onClick={() => handleDecision('rejected')}
                  >
                    Do not accept
                  </Button>
                  <Button size="sm" loading={verifying} onClick={() => handleDecision('verified')}>
                    Verify SME
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
