import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useCreateProject } from '../../hooks/useProjects'
import { DetailsEditor, cleanDetails } from '../../components/shared/DetailsEditor'
import { TagInput } from '../../components/ui/TagInput'
import { isPermissionDenied, normalizeHashtags } from '../../lib/utils'
import type { DetailEntry } from '../../types'
import { projectSchema } from '../../lib/validation'
import { PROJECT_CATEGORIES, CONTENT_TAG_SUGGESTIONS } from '../../lib/constants'
import { analytics } from '../../hooks/useAnalytics'
import { Save } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { entityPath } from '../../lib/slug'

export default function CreateProjectPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { createProject, loading } = useCreateProject()

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [phase, setPhase] = useState('concept')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(true)
  const [isClimateAction, setIsClimateAction] = useState(false)
  const [details, setDetails] = useState<DetailEntry[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')

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
      } as any)

      analytics.feature('project', 'created', { category })
      toast.success('Project created successfully!')
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
        eyebrow="Create New Project"
        title="New Project"
        imageSeed="projects"
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Projects', href: '/projects' },
          { label: 'Create' },
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
            <Input
              label="Project Title"
              placeholder="Enter a catchy title for your project"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
              fullWidth
              required
            />

            {/* Summary */}
            <Input
              label="Summary"
              placeholder="One short sentence shown on the homepage hero (optional)"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={180}
              fullWidth
            />

            {/* Description */}
            <Textarea
              label="Description"
              placeholder="Describe your project, its goals, and potential impact..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={errors.description}
              rows={6}
              fullWidth
            />

            {/* Additional Details */}
            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                Additional Details
              </label>
              <p className="text-xs text-ktip-sand-500 mb-2">
                Optional extra metadata shown under the description — add standalone fields or groups of items
              </p>
              <DetailsEditor value={details} onChange={setDetails} />
            </div>

            {/* Category */}
            <div data-tutorial="project-form-category">
              <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                required
              >
                <option value="">Select a category</option>
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
                Current Phase <span className="text-red-500">*</span>
              </label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                className="w-full px-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
              >
                <option value="concept">Concept - Just an idea</option>
                <option value="prototype">Prototype - Building MVP</option>
                <option value="funding">Funding - Seeking investment</option>
                <option value="launch">Launch - Ready to go!</option>
              </select>
            </div>

            {/* Hashtags */}
            <div data-tutorial="project-form-tags">
              <TagInput
                label="Hashtags (Max 10)"
                description="Topics people can filter and search projects by."
                placeholder="Add a hashtag"
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
                  This project addresses climate change solutions
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
                  Make this project public (visible to everyone)
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <div className="flex items-center gap-4">
              <Button type="submit" loading={loading} icon={<Save size={20} />} fullWidth>
                Create Project
              </Button>
              <button
                type="button"
                onClick={() => navigate('/projects')}
                disabled={loading}
                className="text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
