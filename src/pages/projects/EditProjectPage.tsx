import { useState, useEffect, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useParams, useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useProject, useUpdateProject } from '../../hooks/useProjects'
import { projectSchema } from '../../lib/validation'
import { PROJECT_CATEGORIES } from '../../lib/constants'
import { Save, ChevronRight } from 'lucide-react'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function EditProjectPage() {
  const params = useParams()
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { project, loading: projectLoading } = useProject(params.id)
  const { updateProject, loading: updating } = useUpdateProject()

  usePageTitle(project?.title ? `Edit: ${project.title}` : 'Edit Project')

  const [initialized, setInitialized] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [phase, setPhase] = useState('concept')
  const [hashtagInput, setHashtagInput] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(true)
  const [isClimateAction, setIsClimateAction] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (project && !initialized) {
      setTitle(project.title || '')
      setDescription(project.description || '')
      setCategory(project.category || '')
      setPhase(project.phase || 'concept')
      setHashtags(project.hashtags || [])
      setIsPublic(project.is_public ?? true)
      setIsClimateAction(project.is_climate_action ?? false)
      setInitialized(true)
    }
  }, [project, initialized])

  const isOwner = project?.owner_id === auth.user?.id

  const addHashtag = () => {
    const tag = hashtagInput.trim().replace(/^#/, '')
    if (tag && !hashtags.includes(tag) && hashtags.length < 10) {
      setHashtags([...hashtags, tag])
      setHashtagInput('')
    }
  }

  const removeHashtag = (tag: string) => {
    setHashtags(hashtags.filter((t) => t !== tag))
  }

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
        description,
        category,
        phase: phase as any,
        hashtags,
        is_public: isPublic,
        is_climate_action: isClimateAction,
      } as any)

      toast.success('Project updated successfully!')
      navigate(`/projects/${params.id}`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to update project')
      setErrorMessage(error.message || 'Failed to update project')
    }
  }

  if (projectLoading || !project) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
        <p className="mt-4 text-ktip-sand-600">Loading project...</p>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
          Not authorized
        </h2>
        <p className="text-ktip-sand-600 mb-6">You can only edit your own projects.</p>
        <Button onClick={() => navigate(`/projects/${params.id}`)}>
          Back to Project
        </Button>
      </div>
    )
  }

  return (
    <>
      {/* Dark Hero */}
      <div className="bg-gray-800 min-h-[180px] flex items-center">
        <div className="container mx-auto px-4 flex items-center justify-between w-full">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Edit Project</p>
            <h1 className="text-3xl font-display font-bold text-white">Edit Project</h1>
          </div>
          <nav className="hidden sm:flex items-center gap-1 text-sm text-gray-400">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={14} />
            <Link to="/projects" className="hover:text-white transition-colors">Projects</Link>
            <ChevronRight size={14} />
            <span className="text-gray-200">Edit</span>
          </nav>
        </div>
      </div>

      {/* White Form Area */}
      <div className="bg-white py-12">
        <div className="max-w-3xl mx-auto px-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {errorMessage}
              </div>
            )}

            <Input
              label="Project Title"
              placeholder="Enter a catchy title for your project"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
              fullWidth
              required
            />

            <Textarea
              label="Description"
              placeholder="Describe your project, its goals, and potential impact..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={errors.description}
              rows={6}
              fullWidth
            />

            <div>
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
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1 text-sm text-red-600">{errors.category}</p>
              )}
            </div>

            <div>
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

            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                Hashtags (Max 10)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Add a hashtag"
                  value={hashtagInput}
                  onChange={(e) => setHashtagInput(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
                  className="flex-1 px-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addHashtag}
                  disabled={hashtags.length >= 10}
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {hashtags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-2 px-3 py-1 bg-ktip-ocean-50 text-ktip-ocean-700 rounded-full text-sm">
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeHashtag(tag)}
                      className="hover:text-ktip-ocean-900"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
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
                  className="w-5 h-5 text-emerald-600 border-ktip-sand-300 rounded focus:ring-emerald-500"
                />
                <span className="text-sm text-ktip-sand-700">
                  This project addresses climate change solutions
                </span>
              </label>
            </div>

            <div>
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

            <div className="flex items-center gap-4">
              <Button type="submit" loading={updating} icon={<Save size={20} />} fullWidth>
                Save Changes
              </Button>
              <button
                type="button"
                onClick={() => navigate(`/projects/${params.id}`)}
                disabled={updating}
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
