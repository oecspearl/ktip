import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { ModeratedInput, ModeratedTextarea } from '../../components/moderation/ModeratedField'
import { ContentWarningModal } from '../../components/moderation/ContentWarningModal'
import { DeleteEntityControl } from '../../components/shared/DeleteEntityControl'
import { DetailsEditor, cleanDetails } from '../../components/shared/DetailsEditor'
import { OrgEngagementFields } from '../../components/shared/OrgEngagementFields'
import { ApplicationPipelinePreview } from '../../components/grants/ApplicationPipelinePreview'
import {
  RequiredDocumentsEditor,
  cleanRequiredDocuments,
} from '../../components/grants/RequiredDocumentsEditor'
import { TagInput } from '../../components/ui/TagInput'
import { useContentModeration } from '../../hooks/useContentModeration'
import { useManagedEmployers } from '../../hooks/useEngagement'
import { useGrant, useCreateGrant, useUpdateGrant, useDeleteGrant } from '../../hooks/useGrants'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { describeGrantDeletion } from '../../lib/delete-guard'
import { CONTENT_TAG_SUGGESTIONS } from '../../lib/constants'
import { FUNDING_TYPES } from '../../lib/funding-types'
import { DEFAULT_REQUIRED_DOCUMENTS } from '../../lib/grant-application-template'
import { sanitizeTag } from '../../lib/utils'
import { entityPath } from '../../lib/slug'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PageHero } from '../../components/layout/PageHero'
import { useAgreementGate } from '../../hooks/useAgreementGate'
import { AgreementGateModal, AgreementNotice } from '../../components/legal/AgreementGate'
import type { DetailEntry, RequiredDocument } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'

// The focus area (migration 003), not the instrument — FUNDING_TYPES is that.
const GRANT_TYPES = [
  { value: 'startup', label: msg`Startup` },
  { value: 'research', label: msg`Research` },
  { value: 'innovation', label: msg`Innovation` },
  { value: 'development', label: msg`Development` },
  { value: 'education', label: msg`Education` },
]

const inputClass =
  'w-full px-3 py-2.5 border border-ktip-sand-200 bg-ktip-cream rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors'

const labelClass = 'block text-sm font-medium text-ktip-sand-700 mb-1'

/**
 * Post a funding call, or edit one you posted.
 *
 * `grant:post` has existed since 063 and the INSERT policy has honoured it
 * since 064 — what was missing until 129 was any way for a funder to reach it
 * without an admin account, which is what the feedback queue reported. The
 * admin console keeps its own modal: OECS posts on behalf of any organisation
 * and this page only offers the ones the member actually manages.
 */
export default function GrantFormPage() {
  const { t, i18n } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const toast = useToast()

  const isEditing = !!params.id
  usePageTitle(isEditing ? t`Edit Funding` : t`Add Funding`)

  const { grant, loading: grantLoading } = useGrant(params.id)
  const { createGrant, loading: creating } = useCreateGrant()
  const { updateGrant, loading: updating } = useUpdateGrant()
  const { deleteGrant } = useDeleteGrant()

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [fundingType, setFundingType] = useState('grant')
  const [grantType, setGrantType] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [deadline, setDeadline] = useState('')
  const [eligibility, setEligibility] = useState('')
  const [applicationUrl, setApplicationUrl] = useState('')
  const [isClimateAction, setIsClimateAction] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [tags, setTags] = useState<string[]>([])
  const [details, setDetails] = useState<DetailEntry[]>([])
  // Seeded on a new call: migration 080's column default is '[]', so a call
  // posted without this reaches the wizard's upload step asking for nothing.
  const [requiredDocuments, setRequiredDocuments] = useState<RequiredDocument[]>(() =>
    DEFAULT_REQUIRED_DOCUMENTS.map((d) => ({ ...d }))
  )
  const [employerId, setEmployerId] = useState<string | null>(null)
  const [allowMemberEngagement, setAllowMemberEngagement] = useState<boolean | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')

  const gate = useAgreementGate('publishing')
  const [gateOpen, setGateOpen] = useState(false)
  const resumeAfterGate = useRef(false)

  // Only the organisations this member manages — guard_item_employer_claim()
  // (111) raises on any other, so offering more would be offering a failure.
  const managedEmployers = useManagedEmployers()

  useEffect(() => {
    if (!grant) return
    setTitle(grant.title)
    setSummary(grant.summary || '')
    setDescription(grant.description || '')
    setFundingType(grant.funding_type || 'grant')
    setGrantType(grant.grant_type || '')
    setAmountMin(grant.amount_min != null ? String(grant.amount_min) : '')
    setAmountMax(grant.amount_max != null ? String(grant.amount_max) : '')
    setCurrency(grant.currency || 'USD')
    setDeadline(grant.deadline ? grant.deadline.split('T')[0] : '')
    setEligibility(grant.eligibility || '')
    setApplicationUrl(grant.application_url || '')
    setIsClimateAction(grant.is_climate_action ?? false)
    setIsActive(grant.is_active ?? true)
    setTags(grant.tags || [])
    setDetails(grant.details || [])
    setRequiredDocuments(grant.required_documents || [])
    setEmployerId(grant.employer_id ?? null)
    setAllowMemberEngagement(grant.allow_member_engagement ?? null)
  }, [grant?.id])

  const moderation = useContentModeration(
    [
      { name: 'title', value: title, label: t`Title` },
      { name: 'description', value: description, label: t`Description`, ai: true },
      { name: 'eligibility', value: eligibility, label: t`Eligibility` },
    ],
    {
      surface: 'grant',
      onChange: (field, next) => {
        if (field === 'title') setTitle(next)
        else if (field === 'description') setDescription(next)
        else setEligibility(next)
      },
    }
  )

  // Mirrors 077's owner arm, kept by 116: the creator edits their own call, and
  // grant:manage covers the rest — including rows posted before 077, which have
  // no creator to match.
  const ownsGrant = !!grant && !!auth.user && grant.created_by === auth.user.id
  const canEditThisGrant = ownsGrant ? auth.can('grant:post') : auth.can('grant:manage')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    if (!title.trim()) {
      setErrors({ title: t`A funding call needs a title` })
      return
    }

    const min = amountMin ? Number(amountMin) : null
    const max = amountMax ? Number(amountMax) : null
    if (min !== null && max !== null && min > max) {
      setErrors({ amountMax: t`The maximum cannot be smaller than the minimum` })
      return
    }

    const moderationResult = await moderation.checkBeforeSubmit()
    if (!moderationResult.ok) {
      setErrors((prev) => ({ ...prev, ...moderationResult.errors }))
      return
    }

    if (gate.needsAgreement) {
      resumeAfterGate.current = true
      setGateOpen(true)
      return
    }

    await saveNow()
  }

  const saveNow = async () => {
    const payload: Record<string, any> = {
      title: title.trim(),
      summary: summary.trim() || null,
      description: description.trim() || null,
      funding_type: fundingType || 'grant',
      grant_type: grantType || null,
      amount_min: amountMin ? Number(amountMin) : null,
      amount_max: amountMax ? Number(amountMax) : null,
      currency: currency.trim() || 'USD',
      deadline: deadline || null,
      eligibility: eligibility.trim() || null,
      application_url: applicationUrl.trim() || null,
      is_climate_action: isClimateAction,
      tags: tags.map(sanitizeTag).filter(Boolean),
      details: cleanDetails(details),
      required_documents: cleanRequiredDocuments(requiredDocuments),
      employer_id: employerId,
      // A CHECK constraint refuses an override that names no organisation.
      allow_member_engagement: employerId ? allowMemberEngagement : null,
    }

    try {
      if (isEditing) {
        if (!grant) return
        await updateGrant(grant.id, { ...payload, is_active: isActive } as any)
        toast.success(t`Funding call updated`)
        navigate(entityPath('grant', grant))
        return
      }

      const created = await createGrant(payload as any)
      toast.success(t`Funding call posted`)
      navigate(entityPath('grant', created as any))
    } catch (err: any) {
      setErrorMessage(err.message || t`Failed to save this funding call`)
    }
  }

  if (isEditing && grantLoading) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
      </div>
    )
  }

  if (isEditing && !grant) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <p className="text-ktip-sand-600"><Trans>Funding call not found.</Trans></p>
      </div>
    )
  }

  if (isEditing && !canEditThisGrant) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          <Trans>Not your funding call</Trans>
        </h2>
        <p className="text-gray-500 mb-6">
          <Trans>Only the organisation that posted this funding call, or a funding administrator, can edit it.</Trans>
        </p>
        <Button onClick={() => navigate('/grants')}>
          <Trans>Back to funding</Trans>
        </Button>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow={isEditing ? t`Edit Funding Call` : t`New Funding Call`}
        title={isEditing ? t`Edit Funding` : t`Add Funding`}
        subtitle={
          isEditing
            ? t`Change the terms, extend the deadline, or close the call.`
            : t`Publish a funding opportunity of any kind — grant, venture, angel, debt. Applicants see it as soon as you post it.`
        }
        image="/grants/grant-startup.webp"
        imageSeed="grants"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Grants`, href: '/grants' },
          { label: isEditing ? t`Edit` : t`Add Funding` },
        ]}
      />

      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-page-tight mx-auto px-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            <ModeratedInput
              label={t`Title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t`Blue Economy Innovation Fund 2027`}
              error={errors.title}
              moderation={moderation.fields.title}
              fullWidth
            />

            <div>
              <label className={labelClass}><Trans>Summary</Trans></label>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.currentTarget.value)}
                placeholder={t`One line, shown on the card and the homepage`}
                maxLength={180}
                className={inputClass}
              />
            </div>

            <ModeratedTextarea
              label={t`Description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t`What the fund is for, what it will pay for, and how decisions are made.`}
              rows={6}
              error={errors.description}
              moderation={moderation.fields.description}
              fullWidth
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}><Trans>Type of funding</Trans></label>
                <select
                  value={fundingType}
                  onChange={(e) => setFundingType(e.currentTarget.value)}
                  className={inputClass}
                >
                  {FUNDING_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{i18n._(type.label)}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ktip-sand-500">
                  <Trans>What is actually on offer. Applicants filter on this first.</Trans>
                </p>
              </div>

              <div>
                <label className={labelClass}><Trans>Focus area</Trans></label>
                <select
                  value={grantType}
                  onChange={(e) => setGrantType(e.currentTarget.value)}
                  className={inputClass}
                >
                  <option value="">{t`Select a focus area`}</option>
                  {GRANT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{i18n._(type.label)}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ktip-sand-500">
                  <Trans>What the money is for. Optional.</Trans>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}><Trans>Minimum amount</Trans></label>
                <input
                  type="number"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.currentTarget.value)}
                  placeholder="1000"
                  min="0"
                  step="any"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}><Trans>Maximum amount</Trans></label>
                <input
                  type="number"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.currentTarget.value)}
                  placeholder="50000"
                  min="0"
                  step="any"
                  className={inputClass}
                />
                {errors.amountMax && <p className="mt-1 text-sm text-red-600">{errors.amountMax}</p>}
              </div>
              <div>
                <label className={labelClass}><Trans>Currency</Trans></label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.currentTarget.value)}
                  placeholder="USD"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}><Trans>Application deadline</Trans></label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.currentTarget.value)}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-ktip-sand-500">
                <Trans>Leave empty for a rolling call. A passed deadline moves it to the closed list.</Trans>
              </p>
            </div>

            <ModeratedTextarea
              label={t`Eligibility`}
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value)}
              placeholder={t`Who may apply — country, sector, stage, anything an applicant should check first.`}
              rows={4}
              error={errors.eligibility}
              moderation={moderation.fields.eligibility}
              fullWidth
            />

            <div>
              <label className={labelClass}><Trans>External application link</Trans></label>
              <input
                type="url"
                value={applicationUrl}
                onChange={(e) => setApplicationUrl(e.currentTarget.value)}
                placeholder="https://example.org/apply"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-ktip-sand-500">
                <Trans>Only if applications are handled off-platform. Otherwise members apply here.</Trans>
              </p>
            </div>

            {/* The other half of the feedback: applicants were being walked
                through a documents step the funder had no way to define. */}
            <div className="space-y-3 border-t border-ktip-sand-200 pt-6">
              <div>
                <h2 className="text-sm font-semibold text-ktip-sand-900 uppercase tracking-wide">
                  <Trans>Application requirements</Trans>
                </h2>
                <p className="mt-1 text-xs text-ktip-sand-500">
                  {applicationUrl.trim() ? (
                    <Trans>
                      This call sends applicants to an external link, so nothing below is shown to
                      them. Clear the link above to take applications here.
                    </Trans>
                  ) : (
                    <Trans>What applicants must attach before they can submit.</Trans>
                  )}
                </p>
              </div>

              <ApplicationPipelinePreview />

              <div>
                <label className={labelClass}><Trans>Supporting documents checklist</Trans></label>
                <RequiredDocumentsEditor
                  value={requiredDocuments}
                  onChange={setRequiredDocuments}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}><Trans>Additional details</Trans></label>
              <p className="text-xs text-ktip-sand-500 mb-2">
                <Trans>Optional fields shown under the description — reporting terms, contact, panel dates.</Trans>
              </p>
              <DetailsEditor value={details} onChange={setDetails} />
            </div>

            <TagInput
              label={t`Tags`}
              description={t`Topics applicants filter and search by — also what the personalized ranking matches on.`}
              values={tags}
              onChange={setTags}
              suggestions={CONTENT_TAG_SUGGESTIONS}
              max={10}
            />

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isClimateAction}
                onChange={(e) => setIsClimateAction(e.currentTarget.checked)}
                className="w-5 h-5 text-ktip-tropical-700 border-ktip-sand-300 rounded focus:ring-ktip-tropical-500"
              />
              <span className="text-sm text-ktip-sand-700"><Trans>Climate action funding</Trans></span>
            </label>

            {/* Closing a call is the reversible alternative to deleting it, so
                it sits in the form rather than beside the delete zone. */}
            {isEditing && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.currentTarget.checked)}
                  className="w-5 h-5 text-ktip-ocean-600 border-ktip-sand-300 rounded focus:ring-ktip-ocean-500"
                />
                <span className="text-sm text-ktip-sand-700">
                  <Trans>Open for applications</Trans>
                </span>
              </label>
            )}

            <OrgEngagementFields
              options={managedEmployers}
              employerId={employerId}
              onEmployerChange={setEmployerId}
              override={allowMemberEngagement}
              onOverrideChange={setAllowMemberEngagement}
              itemNoun={t`funding call`}
            />

            {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

            <div className="space-y-3">
              <AgreementNotice bundle="publishing" />

              <div className="flex items-center gap-4">
                <Button
                  type="submit"
                  loading={creating || updating || moderation.checking}
                  disabled={moderation.blocked}
                  fullWidth
                >
                  {isEditing ? <Trans>Save Funding</Trans> : <Trans>Add Funding</Trans>}
                </Button>
                <button
                  type="button"
                  onClick={() => navigate(isEditing ? '/grants/my-grants' : '/grants')}
                  className="text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors whitespace-nowrap"
                >
                  <Trans>Cancel</Trans>
                </button>
              </div>
            </div>
          </form>

          {isEditing && grant && (
            <div className="mt-10">
              <DeleteEntityControl
                noun={t`funding call`}
                title={grant.title}
                // The count is deliberately unknown here: applications are
                // readable by their own author and by grant:manage (116), so a
                // funder cannot count them. describeGrantDeletion() treats null
                // as "there may be some" and asks for the title back.
                impact={describeGrantDeletion({ isActive: grant.is_active, applicationCount: null })}
                onDelete={() => deleteGrant(grant.id)}
                redirectTo="/grants/my-grants"
                variant="zone"
                zoneDescription={t`Closing the call keeps the record and the applications. Deleting destroys both.`}
              />
            </div>
          )}
        </div>
      </div>

      <ContentWarningModal state={moderation.warning} onClose={moderation.dismissWarning} />

      <AgreementGateModal
        gate={gate}
        bundle="publishing"
        open={gateOpen}
        context="grant_post"
        onClose={() => {
          setGateOpen(false)
          resumeAfterGate.current = false
        }}
        onAccepted={async () => {
          setGateOpen(false)
          if (resumeAfterGate.current) {
            resumeAfterGate.current = false
            await saveNow()
          }
        }}
      />
    </>
  )
}
