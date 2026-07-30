import { useState } from 'react'
import { BadgeCheck, Building2, Filter, GraduationCap, Users, X } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Modal } from '../../../components/ui/Modal'
import { PageHero } from '../../../components/layout/PageHero'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { useToast } from '../../../contexts/ToastContext'
import { useAuth } from '../../../contexts/AuthContext'
import {
  useInstitutionMembers,
  useInstitutions,
  useReviewInstitution,
  useReviewInstitutionMember,
} from '../../../hooks/useInstitutions'
import { formatDate } from '../../../lib/utils'
import type { Institution, InstitutionKind, InstitutionStatus } from '../../../types'

const KIND_LABELS: Record<InstitutionKind, string> = {
  school: 'School',
  university: 'University',
  tvet: 'TVET',
  chamber: 'Chamber of Commerce',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  verified: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  rejected: 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200',
}

export default function AdminInstitutionsPage() {
  const toast = useToast()
  const auth = useAuth()

  usePageTitle('Institutions')

  const [kindFilter, setKindFilter] = useState<InstitutionKind | ''>('')
  const [statusFilter, setStatusFilter] = useState<InstitutionStatus | ''>('pending')

  const { institutions, loading, refetch } = useInstitutions({
    kind: kindFilter || undefined,
    status: statusFilter || undefined,
  })
  const { reviewInstitution, loading: reviewing } = useReviewInstitution()
  const { reviewMember } = useReviewInstitutionMember()

  const [selected, setSelected] = useState<Institution | null>(null)
  const [domainsDraft, setDomainsDraft] = useState('')
  const [note, setNote] = useState('')
  const [rosterFor, setRosterFor] = useState<Institution | null>(null)

  const { members, refetch: refetchMembers } = useInstitutionMembers(rosterFor?.id, 'pending')

  const canVerify = auth.can('institution:verify')

  const openReview = (institution: Institution) => {
    setSelected(institution)
    setDomainsDraft((institution.email_domains || []).join(', '))
    setNote(institution.review_note || '')
  }

  const handleReview = async (approve: boolean) => {
    if (!selected || !auth.user) return
    try {
      await reviewInstitution({
        institutionId: selected.id,
        approve,
        reviewerId: auth.user.id,
        note: note || undefined,
        emailDomains: domainsDraft
          .split(',')
          .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
          .filter(Boolean),
      })
      toast.success(approve ? 'Institution verified' : 'Institution rejected')
      setSelected(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to review institution')
    }
  }

  const handleMemberReview = async (memberId: string, approve: boolean) => {
    try {
      await reviewMember({ memberId, approve })
      toast.success(approve ? 'Member approved' : 'Member rejected')
      refetchMembers()
    } catch (err: any) {
      toast.error(err.message || 'Failed to review member')
    }
  }

  return (
    <div>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Institutions"
        subtitle="Verify schools, universities and Chambers of Commerce, and the email domains they own"
        imageSeed="admin-institutions"
      />

      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={16} className="text-ktip-sand-400" />
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as InstitutionKind | '')}
            className="border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
          >
            <option value="">All kinds</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InstitutionStatus | '')}
            className="border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          {(kindFilter || statusFilter) && (
            <button
              type="button"
              onClick={() => {
                setKindFilter('')
                setStatusFilter('')
              }}
              className="inline-flex items-center gap-1 text-sm text-ktip-sand-500 hover:text-ktip-sand-800"
            >
              <X size={14} /> Clear all
            </button>
          )}
        </div>
      </div>

      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
        {loading && <p className="p-8 text-center text-ktip-sand-500">Loading institutions…</p>}
        {!loading && (institutions?.length ?? 0) === 0 && (
          <p className="p-8 text-center text-ktip-sand-500">No institutions match these filters.</p>
        )}
        <ul className="divide-y divide-ktip-sand-100">
          {institutions?.map((institution) => (
            <li key={institution.id} className="px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {institution.kind === 'chamber' ? (
                      <Building2 size={15} className="text-ktip-sun-600" />
                    ) : (
                      <GraduationCap size={15} className="text-ktip-ocean-600" />
                    )}
                    <span className="font-medium text-ktip-sand-900">{institution.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[institution.status]}`}>
                      {institution.status}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-ktip-sand-100 text-ktip-sand-700 border border-ktip-sand-200">
                      {KIND_LABELS[institution.kind]}
                    </span>
                  </div>
                  <p className="text-sm text-ktip-sand-600">
                    {institution.country?.name || institution.country_code}
                    {institution.email_domains?.length > 0 && (
                      <> · {institution.email_domains.map((d) => `@${d}`).join(', ')}</>
                    )}
                  </p>
                  <p className="text-xs text-ktip-sand-500 mt-0.5">
                    Registered {formatDate(institution.created_at)}
                  </p>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  {institution.status === 'verified' && institution.kind !== 'chamber' && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Users size={14} />}
                      onClick={() => setRosterFor(institution)}
                    >
                      Roster
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canVerify}
                    icon={<BadgeCheck size={14} />}
                    onClick={() => openReview(institution)}
                  >
                    Review
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Review */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Review — ${selected.name}` : ''}
        description="Verifying an institution lets anyone with an email on these domains request student status."
        size="md"
      >
        {selected && (
          <div className="space-y-4">
            <Input
              label="Owned email domains"
              value={domainsDraft}
              onChange={(e) => setDomainsDraft(e.target.value)}
              helperText="Comma separated, without the @ — for example: dsc.edu.dm, salcc.edu.lc"
              fullWidth
            />

            <Textarea
              label="Review note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              fullWidth
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-ktip-sand-100">
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={reviewing}
                onClick={() => handleReview(false)}
              >
                Reject
              </Button>
              <Button size="sm" loading={reviewing} onClick={() => handleReview(true)}>
                Verify institution
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Pending roster */}
      <Modal
        open={!!rosterFor}
        onClose={() => setRosterFor(null)}
        title={rosterFor ? `Pending members — ${rosterFor.name}` : ''}
        size="md"
      >
        {(members?.length ?? 0) === 0 ? (
          <p className="text-sm text-ktip-sand-600">No pending requests.</p>
        ) : (
          <ul className="divide-y divide-ktip-sand-100">
            {members?.map((member) => (
              <li key={member.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ktip-sand-900 truncate">
                    {member.user?.display_name || 'Unnamed'}
                  </p>
                  <p className="text-xs text-ktip-sand-500">
                    Requested {member.role} · {formatDate(member.created_at)}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={() => handleMemberReview(member.id, false)}>
                    Reject
                  </Button>
                  <Button size="sm" onClick={() => handleMemberReview(member.id, true)}>
                    Approve
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  )
}
