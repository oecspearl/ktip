import { useState, useEffect, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useProject, useUpdateProject, useDeleteProject } from '../../hooks/useProjects'
import { DeleteEntityControl } from '../../components/shared/DeleteEntityControl'
import { describeProjectDeletion } from '../../lib/delete-guard'
import { useProjectMembers } from '../../hooks/useProjectMembers'
import { DetailsEditor, cleanDetails } from '../../components/shared/DetailsEditor'
import { OrgEngagementFields } from '../../components/shared/OrgEngagementFields'
import { useManagedEmployers } from '../../hooks/useEngagement'
import { TagInput } from '../../components/ui/TagInput'
import { normalizeHashtags } from '../../lib/utils'
import type { DetailEntry } from '../../types'
import { projectSchema } from '../../lib/validation'
import { PROJECT_CATEGORIES, CONTENT_TAG_SUGGESTIONS } from '../../lib/constants'
import { Save } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Trans, useLingui } from '@lingui/react/macro'

export default function EditProjectPage() {
    const { t } = useLingui()
  const params = useParams()
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { project, loading: projectLoading } = useProject(params.id)
  const { updateProject, loading: updating } = useUpdateProject()
  const { deleteProject } = useDeleteProject()

  usePageTitle(project?.title ? `Edit: ${project.title}` : 'Edit Project')

  const [initialized, setInitialized] = useState(false)
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

  const managedEmployers = useManagedEmployers()

  useEffect(() => {
    if (project && !initialized) {
      setTitle(project.title || '')
      setSummary(project.summary || '')
      setDescription(project.description || '')
      setCategory(project.category || '')
      setPhase(project.phase || 'concept')
      setHashtags(project.hashtags || [])
      setIsPublic(project.is_public ?? true)
      setIsClimateAction(project.is_climate_action ?? false)
      setDetails(project.details || [])
      setEmployerId(project.employer_id ?? null)
      setAllowMemberEngagement(project.allow_member_engagement ?? null)
      setInitialized(true)
    }
  }, [project, initialized])

  const { members } = useProjectMembers(params.id)
  const isOwner = project?.owner_id === auth.user?.id
  const isEditorMember = (members || []).some(
    (m) => m.user_id === auth.user?.id && m.status === 'accepted' && m.role === 'editor'
  )
  const canEdit = isOwner || isEditorMember

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

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

    try {
      await updateProject(params.id!, {
        title,
        summary: summary.trim() || null,
        description,
        category,
        phase: phase as any,
        hashtags,
        is_public: isPublic,
        is_climate_action: isClimateAction,
        details: cleanDetails(details),
        employer_id: employerId,
        allow_member_engagement: employerId ? allowMemberEngagement : null,
      } as any)

      toast.success(t`Project updated successfully!`)
      navigate(`/projects/${params.id}`)
    } catch (error: any) {
      toast.error(error.message || t`Failed to update project`)
      setErrorMessage(error.message || 'Failed to update project')
    }
  }

  if (projectLoading || !project) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
        <p className="mt-4 text-ktip-sand-600"><Trans>Loading project...</Trans></p>
      </div>
    )
  }

  if (!canEdit) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
          <Trans>Not authorized</Trans>
        </h2>
        <p className="text-ktip-sand-600 mb-6"><Trans>Only the owner or team editors can edit this project.</Trans></p>
        <Button onClick={() => navigate(`/projects/${params.id}`)}>
          <Trans>Back to Project</Trans>
        </Button>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow={t`Project Workspace`}
        title={t`Edit Project`}
        imageSeed="projects"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Projects`, href: '/projects' },
          { label: t`Edit` },
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

            <Input
              label={t`Project Title`}
              placeholder={t`Enter a catchy title for your project`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
              fullWidth
              required
            />

            <Input
              label={t`Summary`}
              placeholder={t`One short sentence shown on the homepage hero (optional)`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={180}
              fullWidth
            />

            <Textarea
              label={t`Description`}
              placeholder={t`Describe your project, its goals, and potential impact...`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={errors.description}
              rows={6}
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

            {/* Owner only. An editor member can edit the content but must not
                reassign who published it — the claim trigger would refuse them
                anyway, and the state above preserves the existing value. */}
            {isOwner && (
              <OrgEngagementFields
                options={managedEmployers}
                employerId={employerId}
                onEmployerChange={setEmployerId}
                override={allowMemberEngagement}
                onOverrideChange={setAllowMemberEngagement}
                itemNoun={t`project`}
              />
            )}

            <div className="flex items-center gap-4">
              <Button type="submit" loading={updating} icon={<Save size={20} />} fullWidth>
                <Trans>Save Changes</Trans>
              </Button>
              <button
                type="button"
                onClick={() => navigate(`/projects/${params.id}`)}
                disabled={updating}
                className="text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors whitespace-nowrap"
              >
                <Trans>Cancel</Trans>
              </button>
            </div>
          </form>

          {/* Owner only — an editor member reaches this page but the delete RLS
              policy is owner-only, so the affordance would only ever refuse.
              Outside the form so Enter in a text field cannot reach it. */}
          {isOwner && (
            <div className="mt-10">
              <DeleteEntityControl
                variant="zone"
                noun="project"
                title={project.title}
                impact={describeProjectDeletion({
                  isPublic: project.is_public,
                  memberCount: (members || []).filter(
                    (m) => m.status === 'accepted' && m.user_id !== project.owner_id
                  ).length,
                })}
                onDelete={() => deleteProject(project.id)}
                redirectTo="/projects"
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
