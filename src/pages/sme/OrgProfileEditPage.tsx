import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import {
  BadgeCheck,
  Building2,
  Clock,
  ExternalLink,
  Pencil,
  Plus,
  ShieldX,
  Trash2,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Modal } from '../../components/ui/Modal'
import { ImageUpload } from '../../components/ui/ImageUpload'
import { PageHero } from '../../components/layout/PageHero'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  useEmployerPortfolio,
  useEmployerProfileMutations,
  useMyEmployer,
  type PortfolioItemInput,
} from '../../hooks/useEmployerProfile'
import { IMAGE_PRESETS } from '../../lib/constants'
import type { EmployerPortfolioItem } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

const STATUS_COPY: Record<string, { title: MessageDescriptor; body: MessageDescriptor; tone: string }> = {
  unverified: {
    title: msg`Not yet verified`,
    body: msg`Your profile is private until a Chamber of Commerce verifies the business.`,
    tone: 'bg-ktip-sand-50 border-ktip-sand-200 text-ktip-sand-700',
  },
  pending: {
    title: msg`Awaiting Chamber review`,
    body: msg`You can write your profile and portfolio now. Both go public the moment your Chamber approves the registration.`,
    tone: 'bg-ktip-sun-50 border-ktip-sun-200 text-ktip-sun-800',
  },
  verified: {
    title: msg`Verified business`,
    body: msg`Your profile and portfolio are public, and appear on the profile of everyone who belongs to this business.`,
    tone: 'bg-ktip-tropical-50 border-ktip-tropical-200 text-ktip-tropical-800',
  },
  rejected: {
    title: msg`Not accepted`,
    body: msg`Your Chamber did not accept this registration, so nothing here is public. Contact them to resolve it.`,
    tone: 'bg-red-50 border-red-200 text-red-700',
  },
  revoked: {
    title: msg`Verification withdrawn`,
    body: msg`Your verified status has been withdrawn and this profile is no longer public.`,
    tone: 'bg-red-50 border-red-200 text-red-700',
  },
}

const EMPTY_ITEM: PortfolioItemInput = {
  title: '',
  summary: '',
  description: '',
  image_url: '',
  link_url: '',
  client_name: '',
  completed_on: '',
  tags: [],
}

/**
 * The organisation's own page — the counterpart to /cv.
 *
 * A résumé is a person's evidence of work and there is no business version of
 * it, so an SME, investor or educational partner had nothing on KTIP to show
 * for itself: `employers` existed as a verification record and stopped there.
 * This is where a business writes what it does and publishes the work it wants
 * to be judged on.
 *
 * Registration itself still lives on the Chamber page. The identity fields the
 * Chamber checked — legal name, member state, registration number — are not
 * editable here by design (see migration 081).
 *
 * `embedded` renders the same page as a dashboard panel (see BusinessTab):
 * no hero, panel heading instead — /org/edit redirects there.
 */
export default function OrgProfileEditPage({ embedded = false }: { embedded?: boolean }) {
    const { t, i18n } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  usePageTitle(t`Business profile`)

  const { employer, loading } = useMyEmployer(auth.user?.id)
  const { items } = useEmployerPortfolio(employer?.id)
  const {
    updateProfile,
    savingProfile,
    savePortfolioItem,
    savingItem,
    deletePortfolioItem,
  } = useEmployerProfileMutations()

  const [description, setDescription] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [industry, setIndustry] = useState('')
  const [logoUrl, setLogoUrl] = useState('')

  const [editing, setEditing] = useState<EmployerPortfolioItem | null>(null)
  const [itemOpen, setItemOpen] = useState(false)
  const [draft, setDraft] = useState<PortfolioItemInput>(EMPTY_ITEM)

  useEffect(() => {
    if (!employer) return
    setDescription(employer.description || '')
    setWebsiteUrl(employer.website_url || '')
    setIndustry(employer.industry || '')
    setLogoUrl(employer.logo_url || '')
  }, [employer])

  if (!auth.loading && !auth.user) return <Navigate to="/login" replace />

  const handleSaveProfile = async () => {
    if (!employer) return
    try {
      await updateProfile({
        employerId: employer.id,
        description,
        websiteUrl,
        industry,
        logoUrl,
      })
      toast.success(t`Business profile updated`)
    } catch (err: any) {
      toast.error(err?.message || t`Could not save the profile`)
    }
  }

  const openItem = (item: EmployerPortfolioItem | null) => {
    setEditing(item)
    setDraft(
      item
        ? {
            title: item.title,
            summary: item.summary || '',
            description: item.description || '',
            image_url: item.image_url || '',
            link_url: item.link_url || '',
            client_name: item.client_name || '',
            completed_on: item.completed_on || '',
            tags: item.tags,
          }
        : EMPTY_ITEM
    )
    setItemOpen(true)
  }

  const handleSaveItem = async () => {
    if (!employer || !draft.title.trim()) return
    try {
      await savePortfolioItem({ employerId: employer.id, id: editing?.id, item: draft })
      toast.success(editing ? t`Work updated` : t`Work added to your portfolio`)
      setItemOpen(false)
    } catch (err: any) {
      toast.error(err?.message || t`Could not save`)
    }
  }

  const handleDeleteItem = async (item: EmployerPortfolioItem) => {
    const title = item.title
    if (!window.confirm(t`Remove "${title}" from your portfolio?`)) return
    try {
      await deletePortfolioItem(item.id)
      toast.success(t`Removed`)
    } catch (err: any) {
      toast.error(err?.message || t`Could not remove it`)
    }
  }

  const statusCopy = employer ? STATUS_COPY[employer.verification_status] : null

  return (
    <>
      {!embedded && (
        <PageHero
          compact
          eyebrow={t`Your organisation`}
          title={t`Business profile`}
          subtitle={t`What your organisation does, and the work it wants to be judged on.`}
          imageSeed="business-profile"
          breadcrumb={[
            { label: t`Home`, href: '/' },
            { label: t`Dashboard`, href: '/dashboard' },
            { label: t`Business profile` },
          ]}
        />
      )}

      <div className={embedded ? 'max-w-3xl' : 'mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8'}>
        {embedded && (
          <div className="mb-6">
            <h2 className="font-display font-bold text-xl text-ktip-sand-900"><Trans>Business profile</Trans></h2>
            <p className="text-sm text-ktip-sand-600">
              <Trans>What your organisation does, and the work it wants to be judged on.</Trans>
            </p>
          </div>
        )}
        {loading && <p className="text-ktip-sand-500"><Trans>Loading…</Trans></p>}

        {!loading && !employer && (
          <Card>
            <div className="mb-1 flex items-center gap-2">
              <Building2 size={18} className="text-ktip-ocean-600" />
              <h2 className="font-display text-lg font-bold text-ktip-sand-900">
                <Trans>Register your business first</Trans>
              </h2>
            </div>
            <p className="mb-5 text-sm text-ktip-sand-600">
              <Trans>A business profile hangs off a registered organisation, so your Chamber of Commerce has something to verify. Registration takes a few minutes.</Trans>
            </p>
            <Link to="/sme/verification">
              <Button><Trans>Register with your Chamber</Trans></Button>
            </Link>
          </Card>
        )}

        {!loading && employer && (
          <div className="space-y-6">
            {statusCopy && (
              <div className={`flex items-start gap-3 rounded-xl border p-4 ${statusCopy.tone}`}>
                {employer.verification_status === 'verified' ? (
                  <BadgeCheck size={20} className="mt-0.5 shrink-0" />
                ) : employer.verification_status === 'pending' ? (
                  <Clock size={20} className="mt-0.5 shrink-0" />
                ) : (
                  <ShieldX size={20} className="mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium">{i18n._(statusCopy.title)}</p>
                  <p className="mt-1 text-sm">{i18n._(statusCopy.body)}</p>
                  {employer.verification_status === 'verified' && (
                    <Link
                      to={`/org/${employer.slug}`}
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium underline"
                    >
                      <Trans>View your public page</Trans>
                      <ExternalLink size={13} />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Presentation only. Legal name, member state and registration
                number were checked by the Chamber and are not editable here —
                a row that could be rewritten after verification would carry a
                verified badge over unchecked data (see 058 / 081). */}
            <Card>
              <h2 className="mb-1 font-display text-lg font-bold text-ktip-sand-900">
                {employer.trading_name || employer.legal_name}
              </h2>
              <p className="mb-5 text-sm text-ktip-sand-600">
                <Trans>
                  Registered as {employer.legal_name} in {employer.country_code}. Contact your
                  Chamber to correct any of that; everything below is yours to change.
                </Trans>
              </p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ktip-sand-700"><Trans>Logo</Trans></label>
                  <ImageUpload
                    bucket="avatars"
                    path={`${auth.user!.id}/employer-logo`}
                    currentUrl={logoUrl || undefined}
                    onUpload={setLogoUrl}
                    onRemove={() => setLogoUrl('')}
                    preset={IMAGE_PRESETS.AVATAR}
                    placeholder={t`Upload your logo`}
                  />
                </div>

                <Input
                  label={t`Industry`}
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder={t`e.g. Renewable energy`}
                  fullWidth
                />

                <Input
                  label={t`Website`}
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://"
                  fullWidth
                />

                <Textarea
                  label={t`What does the business do?`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder={t`The work you do, who you do it for, and what makes you the right people for it.`}
                  fullWidth
                />

                <div className="flex justify-end border-t border-ktip-sand-100 pt-4">
                  <Button loading={savingProfile} onClick={handleSaveProfile}>
                    <Trans>Save profile</Trans>
                  </Button>
                </div>
              </div>
            </Card>

            {/* Portfolio */}
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-ktip-sand-900"><Trans>Portfolio</Trans></h2>
                  <p className="text-sm text-ktip-sand-600">
                    <Trans>The work you want partners and funders to see.</Trans>
                  </p>
                </div>
                <Button size="sm" icon={<Plus size={14} />} onClick={() => openItem(null)}>
                  <Trans>Add work</Trans>
                </Button>
              </div>

              {!items || items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-ktip-sand-300 py-8 text-center text-sm text-ktip-sand-500">
                  <Trans>Nothing published yet. A portfolio is what turns a verified listing into a case for working with you.</Trans>
                </p>
              ) : (
                <ul className="space-y-3">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl border border-ktip-sand-200 p-4"
                    >
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ktip-sand-900">{item.title}</p>
                        {item.client_name && (
                          <p className="text-xs text-ktip-sand-500">
                            <Trans>for {item.client_name}</Trans>
                          </p>
                        )}
                        {item.summary && (
                          <p className="mt-1 line-clamp-2 text-sm text-ktip-sand-600">
                            {item.summary}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => openItem(item)}
                          aria-label={t`Edit ${item.title}`}
                          className="rounded-lg p-1.5 text-ktip-sand-400 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-ocean-600"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item)}
                          aria-label={t`Remove ${item.title}`}
                          className="rounded-lg p-1.5 text-ktip-sand-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>

      <Modal
        open={itemOpen}
        onClose={() => setItemOpen(false)}
        title={editing ? t`Edit work` : t`Add work`}
        size="xl"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <Input
            label={t`Title`}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder={t`e.g. Solar microgrid for Dennery Village`}
            fullWidth
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t`Client or partner`}
              value={draft.client_name || ''}
              onChange={(e) => setDraft({ ...draft, client_name: e.target.value })}
              fullWidth
            />
            <Input
              label={t`Completed`}
              type="date"
              value={draft.completed_on || ''}
              onChange={(e) => setDraft({ ...draft, completed_on: e.target.value })}
              fullWidth
            />
          </div>

          <Input
            label={t`Link`}
            value={draft.link_url || ''}
            onChange={(e) => setDraft({ ...draft, link_url: e.target.value })}
            placeholder="https://"
            fullWidth
          />

          <Textarea
            label={t`One-line summary`}
            value={draft.summary || ''}
            onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            rows={2}
            fullWidth
          />

          <Textarea
            label={t`Detail`}
            value={draft.description || ''}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            rows={5}
            placeholder={t`What the problem was, what you built, and what changed as a result.`}
            fullWidth
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-ktip-sand-700"><Trans>Image</Trans></label>
            <ImageUpload
              bucket="avatars"
              path={`${auth.user!.id}/portfolio-${editing?.id || 'new'}`}
              currentUrl={draft.image_url || undefined}
              onUpload={(url) => setDraft({ ...draft, image_url: url })}
              onRemove={() => setDraft({ ...draft, image_url: '' })}
              preset={IMAGE_PRESETS.SPEAKER}
              placeholder={t`Upload an image`}
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-ktip-sand-100 pt-4">
            <Button variant="secondary" onClick={() => setItemOpen(false)} disabled={savingItem}>
              <Trans>Cancel</Trans>
            </Button>
            <Button onClick={handleSaveItem} loading={savingItem} disabled={!draft.title.trim()}>
              {editing ? t`Save changes` : t`Add to portfolio`}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
