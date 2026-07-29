import { useMemo, useState, type FormEvent } from 'react'
import { Building2, Plus, Pencil, Trash2, ShieldCheck, ShieldX, Globe, GlobeLock, History } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Modal } from '../../../components/ui/Modal'
import { PageHero } from '../../../components/layout/PageHero'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { useToast } from '../../../contexts/ToastContext'
import {
  useAdminEmployers,
  useCountries,
  useEmployerMutations,
  useEmployerVerificationHistory,
  type EmployerFormValues,
} from '../../../hooks/useEmployers'
import { INDUSTRIES, INDUSTRY_OTHER } from '../../../lib/constants'
import type { Employer, EmployerVerificationMethod, EmployerVerificationStatus } from '../../../types'

const STATUS_LABELS: Record<EmployerVerificationStatus, string> = {
  unverified: 'Unverified',
  pending: 'Pending review',
  verified: 'Verified',
  rejected: 'Rejected',
  revoked: 'Revoked',
}

const STATUS_STYLES: Record<EmployerVerificationStatus, string> = {
  unverified: 'bg-ktip-sand-100 text-ktip-sand-600',
  pending: 'bg-amber-100 text-amber-700',
  verified: 'bg-ktip-tropical-50 text-ktip-tropical-700',
  rejected: 'bg-red-50 text-red-600',
  revoked: 'bg-red-50 text-red-600',
}

const METHOD_LABELS: Record<EmployerVerificationMethod, string> = {
  document_review: 'Document review',
  registry_lookup: 'Business registry lookup',
  manual_attestation: 'Manual attestation',
}

const EMPTY_FORM: EmployerFormValues = {
  slug: '',
  legal_name: '',
  trading_name: '',
  industry: '',
  website_url: '',
  logo_url: '',
  description: '',
  country_code: '',
  administrative_area: '',
  locality: '',
  address_line1: '',
  address_line2: '',
  postal_code: '',
  contact_email: '',
  contact_phone: '',
}

/** Matches the employers_slug_shape CHECK constraint in migration 058. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

/** Empty strings become NULL — the CHECK constraints treat '' as a real value. */
const orNull = (v: string | null | undefined) => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export default function AdminEmployersPage() {
  const toast = useToast()
  usePageTitle('Employers')

  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const { employers, loading, refetch } = useAdminEmployers({ status: statusFilter, search })
  const { countries } = useCountries()
  const {
    createEmployer,
    updateEmployer,
    setVerification,
    setSharing,
    deleteEmployer,
    loading: mutating,
  } = useEmployerMutations()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Employer | null>(null)
  const [form, setForm] = useState<EmployerFormValues>({ ...EMPTY_FORM })
  const [slugTouched, setSlugTouched] = useState(false)

  const [reviewing, setReviewing] = useState<Employer | null>(null)
  const [reviewMethod, setReviewMethod] = useState<EmployerVerificationMethod>('document_review')
  const [reviewNote, setReviewNote] = useState('')
  const [reviewRegistration, setReviewRegistration] = useState('')

  const [historyFor, setHistoryFor] = useState<Employer | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Employer | null>(null)

  const industryOptions = useMemo(() => [...INDUSTRIES, INDUSTRY_OTHER], [])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setSlugTouched(false)
    setShowForm(true)
  }

  const openEdit = (employer: Employer) => {
    setEditing(employer)
    setForm({
      slug: employer.slug,
      legal_name: employer.legal_name,
      trading_name: employer.trading_name ?? '',
      industry: employer.industry ?? '',
      website_url: employer.website_url ?? '',
      logo_url: employer.logo_url ?? '',
      description: employer.description ?? '',
      country_code: employer.country_code,
      administrative_area: employer.administrative_area ?? '',
      locality: employer.locality ?? '',
      address_line1: employer.address_line1 ?? '',
      address_line2: employer.address_line2 ?? '',
      postal_code: employer.postal_code ?? '',
      contact_email: employer.contact_email,
      contact_phone: employer.contact_phone ?? '',
    })
    setSlugTouched(true)
    setShowForm(true)
  }

  const handleLegalNameChange = (value: string) => {
    setForm((f) => ({
      ...f,
      legal_name: value,
      slug: slugTouched ? f.slug : slugify(value),
    }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.legal_name.trim() || !form.country_code || !form.contact_email.trim()) return

    const payload: EmployerFormValues = {
      slug: form.slug.trim() || slugify(form.legal_name),
      legal_name: form.legal_name.trim(),
      trading_name: orNull(form.trading_name),
      industry: orNull(form.industry),
      website_url: orNull(form.website_url),
      logo_url: orNull(form.logo_url),
      description: orNull(form.description),
      country_code: form.country_code,
      administrative_area: orNull(form.administrative_area),
      locality: orNull(form.locality),
      address_line1: orNull(form.address_line1),
      address_line2: orNull(form.address_line2),
      postal_code: orNull(form.postal_code),
      contact_email: form.contact_email.trim().toLowerCase(),
      contact_phone: orNull(form.contact_phone),
    }

    try {
      if (editing) {
        await updateEmployer(editing.id, payload)
        toast.success('Employer updated')
      } else {
        await createEmployer(payload)
        toast.success('Employer created — unverified and not shared')
      }
      setShowForm(false)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save employer')
    }
  }

  const openReview = (employer: Employer) => {
    setReviewing(employer)
    setReviewMethod(employer.verification_method ?? 'document_review')
    setReviewNote('')
    setReviewRegistration(employer.registration_number ?? '')
  }

  const submitVerification = async (status: EmployerVerificationStatus) => {
    if (!reviewing) return
    try {
      await setVerification({
        id: reviewing.id,
        status,
        method: status === 'verified' ? reviewMethod : null,
        note: orNull(reviewNote),
        registration_number: orNull(reviewRegistration),
      })
      toast.success(`Employer marked ${STATUS_LABELS[status].toLowerCase()}`)
      setReviewing(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update verification')
    }
  }

  const toggleSharing = async (employer: Employer) => {
    try {
      await setSharing(employer, !employer.share_externally)
      toast.success(
        employer.share_externally
          ? 'Withdrawn from the partner feed'
          : 'Shared with the partner feed'
      )
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update sharing')
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteEmployer(confirmDelete.id)
      toast.success('Employer deleted')
      setConfirmDelete(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete employer')
    }
  }

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Employers"
        subtitle="Verify employers and choose which ones the partner API may publish"
        imageSeed="admin-employers"
        actions={
          <Button onClick={openCreate} icon={<Plus size={16} />}>
            Add Employer
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-ktip-sand-200 rounded-xl px-3 py-2.5 bg-ktip-sand-50/50 text-sm focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="min-w-[220px]"
        />
      </div>

      {/* List */}
      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
          </div>
        ) : employers && employers.length > 0 ? (
          <div className="divide-y divide-ktip-sand-100 stagger-children">
            {employers.map((employer) => (
              <div
                key={employer.id}
                className="flex items-center justify-between gap-3 p-4 hover:bg-ktip-sand-50/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {employer.logo_url ? (
                    <img
                      src={employer.logo_url}
                      alt=""
                      className="w-10 h-10 rounded-lg object-contain bg-ktip-sand-50 border border-ktip-sand-100 p-0.5 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-ktip-ocean-100 rounded-lg flex items-center justify-center shrink-0">
                      <Building2 size={18} className="text-ktip-ocean-600" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ktip-sand-900 truncate">
                      {employer.legal_name}
                      {employer.trading_name && (
                        <span className="text-ktip-sand-500 font-normal"> · {employer.trading_name}</span>
                      )}
                    </p>
                    <p className="text-xs text-ktip-sand-500 truncate">
                      {[employer.locality, employer.administrative_area, employer.country?.name || employer.country_code]
                        .filter(Boolean)
                        .join(', ')}
                      {employer.industry ? ` · ${employer.industry}` : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[employer.verification_status]}`}
                      >
                        {STATUS_LABELS[employer.verification_status]}
                      </span>
                      {employer.share_externally && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-ktip-ocean-50 text-ktip-ocean-700">
                          In partner feed
                        </span>
                      )}
                      {!employer.contact_email_verified_at && (
                        <span className="text-[11px] text-ktip-sand-400">contact email unconfirmed</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleSharing(employer)}
                    disabled={mutating || employer.verification_status !== 'verified'}
                    className={`p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      employer.share_externally
                        ? 'text-ktip-ocean-600 hover:bg-ktip-ocean-50'
                        : 'text-ktip-sand-400 hover:bg-ktip-sand-100'
                    }`}
                    title={
                      employer.verification_status !== 'verified'
                        ? 'Verify before sharing externally'
                        : employer.share_externally
                          ? 'Withdraw from partner feed'
                          : 'Share with partner feed'
                    }
                  >
                    {employer.share_externally ? <Globe size={16} /> : <GlobeLock size={16} />}
                  </button>
                  <button
                    onClick={() => openReview(employer)}
                    className="p-2 text-ktip-tropical-700 hover:bg-ktip-tropical-50 rounded-lg transition-colors"
                    title="Review verification"
                  >
                    <ShieldCheck size={16} />
                  </button>
                  <button
                    onClick={() => setHistoryFor(employer)}
                    className="p-2 text-ktip-sand-500 hover:bg-ktip-sand-100 rounded-lg transition-colors"
                    title="Verification history"
                  >
                    <History size={16} />
                  </button>
                  <button
                    onClick={() => openEdit(employer)}
                    className="p-2 text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(employer)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 size={32} className="text-ktip-sand-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">No employers yet</h3>
            <p className="text-ktip-sand-500 text-sm">
              Employers are curated here, not imported from profile text.
            </p>
          </div>
        )}
      </div>

      {/* Create / edit */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Edit Employer' : 'Add Employer'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label="Legal name"
              value={form.legal_name}
              onChange={(e) => handleLegalNameChange(e.target.value)}
              fullWidth
            />
            <Input
              label="Trading name (optional)"
              value={form.trading_name ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, trading_name: e.target.value }))}
              fullWidth
            />
          </div>

          <Input
            label="Slug"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true)
              setForm((f) => ({ ...f, slug: e.target.value }))
            }}
            helperText="Stable identifier sent to partners. Lowercase letters, numbers and hyphens."
            fullWidth
          />

          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ktip-sand-700">Industry</label>
              <select
                value={form.industry ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                className="border border-ktip-sand-200 rounded-xl px-3 py-3 bg-ktip-sand-50/50 text-sm focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20"
              >
                <option value="">Not specified</option>
                {industryOptions.map((industry) => (
                  <option key={industry} value={industry}>{industry}</option>
                ))}
              </select>
            </div>
            <Input
              label="Website URL"
              type="url"
              value={form.website_url ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
              placeholder="https://…"
              fullWidth
            />
          </div>

          <Textarea
            label="Description"
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            fullWidth
          />

          {/* Address, coarse -> fine */}
          <fieldset className="border border-ktip-sand-100 rounded-xl p-4 space-y-4">
            <legend className="text-sm font-medium text-ktip-sand-700 px-1">Address</legend>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-ktip-sand-700">Country</label>
                <select
                  value={form.country_code}
                  onChange={(e) => setForm((f) => ({ ...f, country_code: e.target.value }))}
                  className="border border-ktip-sand-200 rounded-xl px-3 py-3 bg-ktip-sand-50/50 text-sm focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20"
                >
                  <option value="">Select a country</option>
                  {countries?.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}{c.is_oecs_member ? ' (OECS)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Parish / state / region"
                value={form.administrative_area ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, administrative_area: e.target.value }))}
                fullWidth
              />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="City / town"
                value={form.locality ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, locality: e.target.value }))}
                fullWidth
              />
              <Input
                label="Postal code"
                value={form.postal_code ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                fullWidth
              />
            </div>
            <Input
              label="Address line 1"
              value={form.address_line1 ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
              fullWidth
            />
            <Input
              label="Address line 2"
              value={form.address_line2 ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, address_line2: e.target.value }))}
              fullWidth
            />
          </fieldset>

          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label="Contact email"
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
              helperText="Only sent to partners once confirmed."
              fullWidth
            />
            <Input
              label="Contact phone (internal)"
              value={form.contact_phone ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
              helperText="Never leaves KTIP."
              fullWidth
            />
          </div>

          <Input
            label="Logo URL (optional)"
            type="url"
            value={form.logo_url ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
            placeholder="https://…"
            fullWidth
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutating}>
              {editing ? 'Save Changes' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Verification review */}
      {reviewing && (
        <Modal open onClose={() => setReviewing(null)} title={`Verify ${reviewing.legal_name}`} size="md">
          <div className="space-y-4">
            <p className="text-sm text-ktip-sand-600">
              Verifying an employer is what makes it eligible for the partner API. Record how the
              check was carried out — the reason and the reviewer are stored in the audit trail.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ktip-sand-700">Method</label>
              <select
                value={reviewMethod}
                onChange={(e) => setReviewMethod(e.target.value as EmployerVerificationMethod)}
                className="border border-ktip-sand-200 rounded-xl px-3 py-3 bg-ktip-sand-50/50 text-sm focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20"
              >
                {Object.entries(METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <Input
              label="Business registration number"
              value={reviewRegistration}
              onChange={(e) => setReviewRegistration(e.target.value)}
              helperText="Shared with partners as verification evidence."
              fullWidth
            />

            <Textarea
              label="Internal note"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
              helperText="Stays inside KTIP. Never sent to partners."
              fullWidth
            />

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setReviewing(null)}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={() => submitVerification('rejected')}
                loading={mutating}
                icon={<ShieldX size={16} />}
              >
                Reject
              </Button>
              {reviewing.verification_status === 'verified' && (
                <Button variant="secondary" onClick={() => submitVerification('revoked')} loading={mutating}>
                  Revoke
                </Button>
              )}
              <Button onClick={() => submitVerification('verified')} loading={mutating} icon={<ShieldCheck size={16} />}>
                Verify
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {historyFor && <VerificationHistoryModal employer={historyFor} onClose={() => setHistoryFor(null)} />}

      {confirmDelete && (
        <Modal open onClose={() => setConfirmDelete(null)} title="Delete Employer" size="sm">
          <p className="text-sm text-ktip-sand-600 mb-6">
            Delete "{confirmDelete.legal_name}"? Its verification history goes with it, and partners
            who already pulled this record will not be told it is gone. Revoking verification is
            usually the right action instead.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleDelete} loading={mutating}>
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

function VerificationHistoryModal({ employer, onClose }: { employer: Employer; onClose: () => void }) {
  const { events, loading } = useEmployerVerificationHistory(employer.id)

  return (
    <Modal open onClose={onClose} title={`History — ${employer.legal_name}`} size="md">
      {loading ? (
        <div className="h-24 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
      ) : events && events.length > 0 ? (
        <ul className="divide-y divide-ktip-sand-100">
          {events.map((event) => (
            <li key={event.id} className="py-3">
              <p className="text-sm text-ktip-sand-900">
                {event.from_status ? `${STATUS_LABELS[event.from_status]} → ` : ''}
                <span className="font-semibold">{STATUS_LABELS[event.to_status]}</span>
                {event.method ? ` · ${METHOD_LABELS[event.method]}` : ''}
              </p>
              <p className="text-xs text-ktip-sand-500">{new Date(event.created_at).toLocaleString()}</p>
              {event.note && <p className="text-xs text-ktip-sand-600 mt-1">{event.note}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ktip-sand-500">No verification activity recorded yet.</p>
      )}
    </Modal>
  )
}
