import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { ModeratedInput, ModeratedTextarea } from '../../components/moderation/ModeratedField'
import { ContentWarningModal } from '../../components/moderation/ContentWarningModal'
import { useContentModeration } from '../../hooks/useContentModeration'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useCreateProject } from '../../hooks/useProjects'
import { DetailsEditor, cleanDetails } from '../../components/shared/DetailsEditor'
import { OrgEngagementFields } from '../../components/shared/OrgEngagementFields'
import { useManagedEmployers } from '../../hooks/useEngagement'
import { TagInput } from '../../components/ui/TagInput'
import { isPermissionDenied, normalizeHashtags } from '../../lib/utils'
import type { DetailEntry } from '../../types'
import { projectSchema } from '../../lib/validation'
import { PROJECT_CATEGORIES, CONTENT_TAG_SUGGESTIONS } from '../../lib/constants'
import { analytics } from '../../hooks/useAnalytics'
import { Save } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { useAgreementGate } from '../../hooks/useAgreementGate'
import { AgreementGateModal, AgreementNotice } from '../../components/legal/AgreementGate'
import { entityPath } from '../../lib/slug'
import { useWarmTranslations } from '../../hooks/useTranslated'
import { Trans, useLingui } from '@lingui/react/macro'

export default function CreateProjectPage() {
    const { t } = useLingui()
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { createProject, loading } = useCreateProject()
  const warmTranslations = useWarmTranslations()

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [phase, setPhase] = useState('concept')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(true)
  const [isClimateAction, setIsClimateAction] = useState(false)
  const [details, setDetails] = useState<DetailEntry[]>([])
  const [employerId, setEmployerId] = useState<string | null>(null)
  const [allowMemberEngagement, setAllowMemberEngagement] = useState<boolean | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')

  const gate = useAgreementGate('publishing')
  const [gateOpen, setGateOpen] = useState(false)
  // Without this the member accepts the agreement, the modal closes, and their
  // project is not created — so they press Create a second time and read the
  // whole thing as a bug.
  const resumeAfterGate = useRef(false)

  const managedEmployers = useManagedEmployers()

  const moderation = useContentModeration(
    [
      { name: 'title', value: title, label: t`Project Title` },
      { name: 'summary', value: summary, label: t`Summary` },
      { name: 'description', value: description, label: t`Description`, ai: true },
    ],
    {
      surface: 'project',
      onChange: (field, next) => {
        if (field === 'title') setTitle(next)
        else if (field === 'summary') setSummary(next)
        else setDescription(next)
      },
    }
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    // Validate form
    const result = projectSchema.safeParse({
      title,
      description,
      category,
      phase,
      hashtags,
      is_public: isPublic,
    })

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.issues.forEach((error: any) => {
        if (error.path[0]) {
          fieldErrors[error.path[0] as string] = error.message
        }
      })
      setErrors(fieldErrors)
      return
    }

    // After zod and before the licensing gate: there is no point asking a
    // member to accept publishing terms for a project that cannot be posted.
    const moderationResult = await moderation.checkBeforeSubmit()
    if (!moderationResult.ok) {
      setErrors((prev) => ({ ...prev, ...moderationResult.errors }))
      return
    }

    // After validation, never before: opening a licensing agreement over a form
    // that is going to be rejected for a missing title wastes the one moment
    // the member is actually willing to read it.
    if (gate.needsAgreement) {
      resumeAfterGate.current = true
      setGateOpen(true)
      return
    }

    await createProjectNow()
  }

  const createProjectNow = async () => {
    try {
      const project = await createProject({
        title,
        summary: summary.trim() || null,
        description,
        category,
        phase: phase as any,
        hashtags,
        is_public: isPublic,
        is_climate_action: isClimateAction,
        details: cleanDetails(details),
        owner_id: auth.user!.id,
        employer_id: employerId,
        allow_member_engagement: employerId ? allowMemberEngagement : null,
      } as any)

      analytics.feature('project', 'created', { category })

      // Warm the shared translation cache from the author's own browser, before
      // any reader arrives. It costs roughly a thousand characters once, and it
      // is what turns the first French visitor's experience from "English, then
      // a swap ~350 ms later" into "French on the first paint" — because their
      // request becomes a cache hit rather than a provider call. Fire-and-forget
      // on purpose: the author must never wait on, or be told about, work done
      // for somebody else's benefit.
      warmTranslations([title, summary.trim(), description])

      toast.success(t`Project created successfully!`)
      navigate(entityPath('project', project))
    } catch (error: any) {
      // /projects/new is gated on project:create, so RLS should never be the
      // one to refuse. It still can if the permission was revoked mid-session,
      // and "new row violates row-level security policy" tells a member
      // nothing — least of all that their role, not their input, is the problem.
      const message = isPermissionDenied(error)
        ? 'Your role does not include permission to publish projects. Contact your organization if this looks wrong.'
        : error.message || 'Failed to create project'
      toast.error(message)
      setErrorMessage(message)
    }
  }

  return (
    <>
      <PageHero
        eyebrow={t`Create New Project`}
        title={t`New Project`}
        imageSeed="projects"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Projects`, href: '/projects' },
          { label: t`Create` },
        ]}
      />

      {/* Form Area */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-page-tight mx-auto px-4">
          <form data-tutorial="project-form" onSubmit={handleSubmit} className="space-y-6">
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {errorMessage}
              </div>
            )}

            {/* Title */}
            <ModeratedInput
              label={t`Project Title`}
              placeholder={t`Enter a catchy title for your project`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
              moderation={moderation.fields.title}
              fullWidth
              required
            />

            {/* Summary */}
            <ModeratedInput
              label={t`Summary`}
              placeholder={t`One short sentence shown on the homepage hero (optional)`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={180}
              moderation={moderation.fields.summary}
              fullWidth
            />

            {/* Description */}
            <ModeratedTextarea
              label={t`Description`}
              placeholder={t`Describe your project, its goals, and potential impact...`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={errors.description}
              rows={6}
              moderation={moderation.fields.description}
              fullWidth
            />

            {/* Additional Details */}
            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                <Trans>Additional Details</Trans>
              </label>
              <p className="text-xs text-ktip-sand-500 mb-2">
                <Trans>Optional extra metadata shown under the description — add standalone fields or groups of items</Trans>
              </p>
              <DetailsEditor value={details} onChange={setDetails} />
            </div>

            {/* Category */}
            <div data-tutorial="project-form-category">
              <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                <Trans>Category</Trans> <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                required
              >
                <option value=""><Trans>Select a category</Trans></option>
                {PROJECT_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1 text-sm text-red-600">{errors.category}</p>
              )}
            </div>

            {/* Phase */}
            <div data-tutorial="project-form-phase">
              <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                <Trans>Current Phase</Trans> <span className="text-red-500">*</span>
              </label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                className="w-full px-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
              >
                <option value="concept"><Trans>Concept - Just an idea</Trans></option>
                <option value="prototype"><Trans>Prototype - Building MVP</Trans></option>
                <option value="funding"><Trans>Funding - Seeking investment</Trans></option>
                <option value="launch"><Trans>Launch - Ready to go!</Trans></option>
              </select>
            </div>

            {/* Hashtags */}
            <div data-tutorial="project-form-tags">
              <TagInput
                label={t`Hashtags (Max 10)`}
                description={t`Topics people can filter and search projects by.`}
                placeholder={t`Add a hashtag`}
                values={hashtags}
                onChange={(next) => setHashtags(normalizeHashtags(next))}
                suggestions={CONTENT_TAG_SUGGESTIONS}
                max={10}
              />
              {errors.hashtags && (
                <p className="mt-1 text-sm text-red-600">{errors.hashtags}</p>
              )}
            </div>

            {/* Climate Action */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isClimateAction}
                  onChange={(e) => setIsClimateAction(e.target.checked)}
                  className="w-5 h-5 text-ktip-tropical-700 border-ktip-sand-300 rounded focus:ring-ktip-tropical-500"
                />
                <span className="text-sm text-ktip-sand-700">
                  <Trans>This project addresses climate change solutions</Trans>
                </span>
              </label>
            </div>

            {/* Visibility */}
            <div data-tutorial="project-form-visibility">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-5 h-5 text-ktip-ocean-600 border-ktip-sand-300 rounded focus:ring-ktip-ocean-500"
                />
                <span className="text-sm text-ktip-sand-700">
                  <Trans>Make this project public (visible to everyone)</Trans>
                </span>
              </label>
            </div>

            <OrgEngagementFields
              options={managedEmployers}
              employerId={employerId}
              onEmployerChange={setEmployerId}
              override={allowMemberEngagement}
              onOverrideChange={setAllowMemberEngagement}
              itemNoun={t`project`}
            />

            {/* Submit Button */}
            <div className="space-y-3">
              {/* Rendered always, not only when the gate is outstanding — the
                  licence applies to every project, not just the first. */}
              <AgreementNotice bundle="publishing" />

              <div className="flex items-center gap-4">
                <Button
                  type="submit"
                  loading={loading || moderation.checking}
                  disabled={moderation.blocked}
                  icon={<Save size={20} />}
                  fullWidth
                >
                  <Trans>Create Project</Trans>
                </Button>
                <button
                  type="button"
                  onClick={() => navigate('/projects')}
                  disabled={loading}
                  className="text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors whitespace-nowrap"
                >
                  <Trans>Cancel</Trans>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <ContentWarningModal state={moderation.warning} onClose={moderation.dismissWarning} />

      <AgreementGateModal
        gate={gate}
        bundle="publishing"
        open={gateOpen}
        context="project"
        onClose={() => {
          setGateOpen(false)
          resumeAfterGate.current = false
        }}
        onAccepted={async () => {
          setGateOpen(false)
          if (resumeAfterGate.current) {
            resumeAfterGate.current = false
            await createProjectNow()
          }
        }}
      />
    </>
  )
}
