import { useState, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useForumBoard, useCreateForumPost } from '../../hooks/useForums'
import { useAuth } from '../../contexts/AuthContext'
import { forumPostSchema } from '../../lib/validation'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PageHero } from '../../components/layout/PageHero'

export default function CreatePostPage() {
  usePageTitle('New Post')
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const { board, loading: boardLoading } = useForumBoard(params.slug)
  const { createPost, loading } = useCreateForumPost()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    const input = { title, content }
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

    if (!board || !auth.user) return

    try {
      const post = await createPost({
        board_id: board.id,
        author_id: auth.user.id,
        title,
        content,
      })
      if (post) {
        navigate(`/forums/${params.slug}/${(post as any).id}`)
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create post')
    }
  }

  if (boardLoading) {
    return (
      <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
      </div>
    )
  }

  if (!board) {
    return (
      <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 py-12 text-center">
        <p className="text-ktip-sand-600">Board not found.</p>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow="New Forum Post"
        title="New Post"
        subtitle={
          <>
            Posting in <span className="text-white font-medium">{board.name}</span>
          </>
        }
        imageSeed="forums"
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Forums', href: '/forums' },
          { label: board.name, href: `/forums/${params.slug}` },
          { label: 'New Post' },
        ]}
      />

      {/* Form Area */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-[calc(50vw+24rem)] mx-auto px-4">
          <form data-tutorial="post-form" onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's on your mind?"
              error={errors.title}
              fullWidth
            />

            <Textarea
              label="Content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share your thoughts, questions, or ideas..."
              rows={10}
              error={errors.content}
              fullWidth
            />

            {errorMessage && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}

            <div className="flex items-center gap-4">
              <Button type="submit" loading={loading} fullWidth>
                Publish Post
              </Button>
              <button
                type="button"
                onClick={() => navigate(`/forums/${params.slug}`)}
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
