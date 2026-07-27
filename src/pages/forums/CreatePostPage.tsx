import { useState, type FormEvent } from 'react'
import { Link, useParams, useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useForumBoard, useCreateForumPost } from '../../hooks/useForums'
import { useAuth } from '../../contexts/AuthContext'
import { forumPostSchema } from '../../lib/validation'
import { ChevronRight } from 'lucide-react'
import { usePageTitle } from '../../hooks/usePageTitle'

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
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
      </div>
    )
  }

  if (!board) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <p className="text-ktip-sand-600">Board not found.</p>
      </div>
    )
  }

  return (
    <>
      {/* Dark Hero */}
      <div className="bg-gray-800 min-h-[180px] flex items-center">
        <div className="container mx-auto px-4 flex items-center justify-between w-full">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">New Forum Post</p>
            <h1 className="text-3xl font-display font-bold text-white">New Post</h1>
            <p className="text-sm text-gray-400 mt-1">
              Posting in <span className="text-gray-200 font-medium">{board.name}</span>
            </p>
          </div>
          <nav className="hidden sm:flex items-center gap-1 text-sm text-gray-400">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={14} />
            <Link to="/forums" className="hover:text-white transition-colors">Forums</Link>
            <ChevronRight size={14} />
            <Link to={`/forums/${params.slug}`} className="hover:text-white transition-colors">{board.name}</Link>
            <ChevronRight size={14} />
            <span className="text-gray-200">New Post</span>
          </nav>
        </div>
      </div>

      {/* White Form Area */}
      <div className="bg-white py-12">
        <div className="max-w-3xl mx-auto px-4">
          <form onSubmit={handleSubmit} className="space-y-6">
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
