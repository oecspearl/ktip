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
import { Trans, useLingui } from '@lingui/react/macro'

export default function CreatePostPage() {
  const { t } = useLingui()
  usePageTitle(t`New Post`)
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
      setErrorMessage(err.message || t`Failed to create post`)
    }
  }

  if (boardLoading) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
      </div>
    )
  }

  if (!board) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <p className="text-ktip-sand-600"><Trans>Board not found.</Trans></p>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow={t`New Forum Post`}
        title={t`New Post`}
        subtitle={
          <Trans>
            Posting in <span className="text-white font-medium">{board.name}</span>
          </Trans>
        }
        imageSeed="forums"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Forums`, href: '/forums' },
          { label: board.name, href: `/forums/${params.slug}` },
          { label: t`New Post` },
        ]}
      />

      {/* Form Area */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-page-tight mx-auto px-4">
          <form data-tutorial="post-form" onSubmit={handleSubmit} className="space-y-6">
            <Input
              label={t`Title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t`What's on your mind?`}
              error={errors.title}
              fullWidth
            />

            <Textarea
              label={t`Content`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t`Share your thoughts, questions, or ideas...`}
              rows={10}
              error={errors.content}
              fullWidth
            />

            {errorMessage && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}

            <div className="flex items-center gap-4">
              <Button type="submit" loading={loading} fullWidth>
                <Trans>Publish Post</Trans>
              </Button>
              <button
                type="button"
                onClick={() => navigate(`/forums/${params.slug}`)}
                className="text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors whitespace-nowrap"
              >
                <Trans>Cancel</Trans>
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
