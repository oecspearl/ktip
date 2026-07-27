import { createSignal, createEffect, Show, For, Suspense } from 'solid-js'
import { A, useParams, useNavigate } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useProject, useUpdateProject } from '../../hooks/useProjects'
import { projectSchema } from '../../lib/validation'
import { PROJECT_CATEGORIES } from '../../lib/constants'
import { Save, ChevronRight } from 'lucide-solid'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function EditProjectPage() {
  const params = useParams()
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { project } = useProject(() => params.id)
  const { updateProject, loading: updating } = useUpdateProject()

  usePageTitle(() => project()?.title ? `Edit: ${project()!.title}` : 'Edit Project')

  const [initialized, setInitialized] = createSignal(false)
  const [title, setTitle] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [category, setCategory] = createSignal('')
  const [phase, setPhase] = createSignal('concept')
  const [hashtagInput, setHashtagInput] = createSignal('')
  const [hashtags, setHashtags] = createSignal<string[]>([])
  const [isPublic, setIsPublic] = createSignal(true)
  const [isClimateAction, setIsClimateAction] = createSignal(false)
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = createSignal('')

  createEffect(() => {
    const p = project()
    if (p && !initialized()) {
      setTitle(p.title || '')
      setDescription(p.description || '')
      setCategory(p.category || '')
      setPhase(p.phase || 'concept')
      setHashtags(p.hashtags || [])
      setIsPublic(p.is_public ?? true)
      setIsClimateAction(p.is_climate_action ?? false)
      setInitialized(true)
    }
  })

  const isOwner = () => project()?.owner_id === auth.user()?.id

  const addHashtag = () => {
    const tag = hashtagInput().trim().replace(/^#/, '')
    if (tag && !hashtags().includes(tag) && hashtags().length < 10) {
      setHashtags([...hashtags(), tag])
      setHashtagInput('')
    }
  }

  const removeHashtag = (tag: string) => {
    setHashtags(hashtags().filter((t) => t !== tag))
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    const result = projectSchema.safeParse({
      title: title(),
      description: description(),
      category: category(),
      phase: phase(),
      hashtags: hashtags(),
      is_public: isPublic(),
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
        title: title(),
        description: description(),
        category: category(),
        phase: phase() as any,
        hashtags: hashtags(),
        is_public: isPublic(),
        is_climate_action: isClimateAction(),
      } as any)

      toast.success('Project updated successfully!')
      navigate(`/projects/${params.id}`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to update project')
      setErrorMessage(error.message || 'Failed to update project')
    }
  }

  return (
    <MainLayout>
      <Suspense
        fallback={
          <div class="container mx-auto px-4 py-12 text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
            <p class="mt-4 text-ktip-sand-600">Loading project...</p>
          </div>
        }
      >
        <Show
          when={!project.loading && project()}
          fallback={
            <div class="container mx-auto px-4 py-12 text-center">
              <div class="text-6xl mb-4">📭</div>
              <h2 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                Project not found
              </h2>
              <Button onClick={() => navigate('/projects')}>
                Back to Projects
              </Button>
            </div>
          }
        >
          <Show
            when={isOwner()}
            fallback={
              <div class="container mx-auto px-4 py-12 text-center">
                <h2 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                  Not authorized
                </h2>
                <p class="text-ktip-sand-600 mb-6">You can only edit your own projects.</p>
                <Button onClick={() => navigate(`/projects/${params.id}`)}>
                  Back to Project
                </Button>
              </div>
            }
          >
            {/* Dark Hero */}
            <div class="bg-gray-800 min-h-[180px] flex items-center">
              <div class="container mx-auto px-4 flex items-center justify-between w-full">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Edit Project</p>
                  <h1 class="text-3xl font-display font-bold text-white">Edit Project</h1>
                </div>
                <nav class="hidden sm:flex items-center gap-1 text-sm text-gray-400">
                  <A href="/" class="hover:text-white transition-colors">Home</A>
                  <ChevronRight size={14} />
                  <A href="/projects" class="hover:text-white transition-colors">Projects</A>
                  <ChevronRight size={14} />
                  <span class="text-gray-200">Edit</span>
                </nav>
              </div>
            </div>

            {/* White Form Area */}
            <div class="bg-white py-12">
              <div class="max-w-3xl mx-auto px-4">
                <form onSubmit={handleSubmit} class="space-y-6">
                  {errorMessage() && (
                    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                      {errorMessage()}
                    </div>
                  )}

                  <Input
                    label="Project Title"
                    placeholder="Enter a catchy title for your project"
                    value={title()}
                    onInput={(e) => setTitle(e.currentTarget.value)}
                    error={errors().title}
                    fullWidth
                    required
                  />

                  <Textarea
                    label="Description"
                    placeholder="Describe your project, its goals, and potential impact..."
                    value={description()}
                    onInput={(e) => setDescription(e.currentTarget.value)}
                    error={errors().description}
                    rows={6}
                    fullWidth
                  />

                  <div>
                    <label class="block text-sm font-medium text-ktip-sand-700 mb-2">
                      Category <span class="text-red-500">*</span>
                    </label>
                    <select
                      value={category()}
                      onChange={(e) => setCategory(e.currentTarget.value)}
                      class="w-full px-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                      required
                    >
                      <option value="">Select a category</option>
                      <For each={PROJECT_CATEGORIES}>
                        {(cat) => (
                          <option value={cat.value}>
                            {cat.icon} {cat.label}
                          </option>
                        )}
                      </For>
                    </select>
                    {errors().category && (
                      <p class="mt-1 text-sm text-red-600">{errors().category}</p>
                    )}
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-ktip-sand-700 mb-2">
                      Current Phase <span class="text-red-500">*</span>
                    </label>
                    <select
                      value={phase()}
                      onChange={(e) => setPhase(e.currentTarget.value)}
                      class="w-full px-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                    >
                      <option value="concept">Concept - Just an idea</option>
                      <option value="prototype">Prototype - Building MVP</option>
                      <option value="funding">Funding - Seeking investment</option>
                      <option value="launch">Launch - Ready to go!</option>
                    </select>
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-ktip-sand-700 mb-2">
                      Hashtags (Max 10)
                    </label>
                    <div class="flex gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Add a hashtag"
                        value={hashtagInput()}
                        onInput={(e) => setHashtagInput(e.currentTarget.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
                        class="flex-1 px-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={addHashtag}
                        disabled={hashtags().length >= 10}
                      >
                        Add
                      </Button>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <For each={hashtags()}>
                        {(tag) => (
                          <span class="inline-flex items-center gap-2 px-3 py-1 bg-ktip-ocean-50 text-ktip-ocean-700 rounded-full text-sm">
                            #{tag}
                            <button
                              type="button"
                              onClick={() => removeHashtag(tag)}
                              class="hover:text-ktip-ocean-900"
                            >
                              ×
                            </button>
                          </span>
                        )}
                      </For>
                    </div>
                    {errors().hashtags && (
                      <p class="mt-1 text-sm text-red-600">{errors().hashtags}</p>
                    )}
                  </div>

                  {/* Climate Action */}
                  <div>
                    <label class="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isClimateAction()}
                        onChange={(e) => setIsClimateAction(e.currentTarget.checked)}
                        class="w-5 h-5 text-emerald-600 border-ktip-sand-300 rounded focus:ring-emerald-500"
                      />
                      <span class="text-sm text-ktip-sand-700">
                        This project addresses climate change solutions
                      </span>
                    </label>
                  </div>

                  <div>
                    <label class="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPublic()}
                        onChange={(e) => setIsPublic(e.currentTarget.checked)}
                        class="w-5 h-5 text-ktip-ocean-600 border-ktip-sand-300 rounded focus:ring-ktip-ocean-500"
                      />
                      <span class="text-sm text-ktip-sand-700">
                        Make this project public (visible to everyone)
                      </span>
                    </label>
                  </div>

                  <div class="flex items-center gap-4">
                    <Button type="submit" loading={updating()} icon={<Save size={20} />} fullWidth>
                      Save Changes
                    </Button>
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${params.id}`)}
                      disabled={updating()}
                      class="text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </Show>
        </Show>
      </Suspense>
    </MainLayout>
  )
}
