import { createSignal, Show, Suspense } from 'solid-js'
import { A, useParams, useNavigate } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useForumBoard, useCreateForumPost } from '../../hooks/useForums'
import { useAuth } from '../../contexts/AuthContext'
import { forumPostSchema } from '../../lib/validation'
import { ChevronRight } from 'lucide-solid'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function CreatePostPage() {
  usePageTitle(() => 'New Post')
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const { board } = useForumBoard(() => params.slug)
  const { createPost, loading } = useCreateForumPost()

  const [title, setTitle] = createSignal('')
  const [content, setContent] = createSignal('')
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = createSignal('')

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    const input = { title: title(), content: content() }
    const result = forumPostSchema.safeParse(input)

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    if (!board() || !auth.user()) return

    try {
      const post = await createPost({
        board_id: board()!.id,
        author_id: auth.user()!.id,
        title: title(),
        content: content(),
      })
      if (post) {
        navigate(`/forums/${params.slug}/${(post as any).id}`)
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create post')
    }
  }

  return (
    <MainLayout>
      <Suspense
        fallback={
          <div class="container mx-auto px-4 py-12 text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
          </div>
        }
      >
        <Show
          when={!board.loading && board()}
          fallback={
            <div class="container mx-auto px-4 py-12 text-center">
              <p class="text-ktip-sand-600">Board not found.</p>
            </div>
          }
        >
          {/* Dark Hero */}
          <div class="bg-gray-800 min-h-[180px] flex items-center">
            <div class="container mx-auto px-4 flex items-center justify-between w-full">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">New Forum Post</p>
                <h1 class="text-3xl font-display font-bold text-white">New Post</h1>
                <p class="text-sm text-gray-400 mt-1">
                  Posting in <span class="text-gray-200 font-medium">{board()!.name}</span>
                </p>
              </div>
              <nav class="hidden sm:flex items-center gap-1 text-sm text-gray-400">
                <A href="/" class="hover:text-white transition-colors">Home</A>
                <ChevronRight size={14} />
                <A href="/forums" class="hover:text-white transition-colors">Forums</A>
                <ChevronRight size={14} />
                <A href={`/forums/${params.slug}`} class="hover:text-white transition-colors">{board()!.name}</A>
                <ChevronRight size={14} />
                <span class="text-gray-200">New Post</span>
              </nav>
            </div>
          </div>

          {/* White Form Area */}
          <div class="bg-white py-12">
            <div class="max-w-3xl mx-auto px-4">
              <form onSubmit={handleSubmit} class="space-y-6">
                <Input
                  label="Title"
                  value={title()}
                  onInput={(e) => setTitle(e.currentTarget.value)}
                  placeholder="What's on your mind?"
                  error={errors().title}
                  fullWidth
                />

                <Textarea
                  label="Content"
                  value={content()}
                  onInput={(e) => setContent(e.currentTarget.value)}
                  placeholder="Share your thoughts, questions, or ideas..."
                  rows={10}
                  error={errors().content}
                  fullWidth
                />

                <Show when={errorMessage()}>
                  <p class="text-sm text-red-600">{errorMessage()}</p>
                </Show>

                <div class="flex items-center gap-4">
                  <Button type="submit" loading={loading()} fullWidth>
                    Publish Post
                  </Button>
                  <button
                    type="button"
                    onClick={() => navigate(`/forums/${params.slug}`)}
                    class="text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Show>
      </Suspense>
    </MainLayout>
  )
}
