import { useRef, useState, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { ModeratedInput, ModeratedTextarea } from '../../components/moderation/ModeratedField'
import { ContentWarningModal } from '../../components/moderation/ContentWarningModal'
import { useContentModeration } from '../../hooks/useContentModeration'
import { useForumBoard, useCreateForumPost } from '../../hooks/useForums'
import { useAuth } from '../../contexts/AuthContext'
import { forumPostSchema } from '../../lib/validation'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PageHero } from '../../components/layout/PageHero'
import { useAgreementGate } from '../../hooks/useAgreementGate'
import { AgreementGateModal, AgreementNotice } from '../../components/legal/AgreementGate'
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

  const gate = useAgreementGate('publishing')
  const [gateOpen, setGateOpen] = useState(false)
  const resumeAfterGate = useRef(false)

  const moderation = useContentModeration(
    [
      { name: 'title', value: title, label: t`Title` },
      { name: 'content', value: content, label: t`Content`, ai: true },
    ],
    {
      surface: 'forum_post',
      onChange: (field, next) => (field === 'title' ? setTitle(next) : setContent(next)),
    }
  )

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

    // After zod, before the agreement gate: there is no point asking someone to
    // accept the publishing terms for a post that cannot be published.
    const moderationResult = await moderation.checkBeforeSubmit()
    if (!moderationResult.ok) {
      setErrors((prev) => ({ ...prev, ...moderationResult.errors }))
      return
    }

    if (!board || !auth.user) return

    // After validation and after the board check, so the gate never opens over
    // a submit that was going to fail anyway.
    if (gate.needsAgreement) {
      resumeAfterGate.current = true
      setGateOpen(true)
      return
    }

    await createPostNow()
  }

  const createPostNow = async () => {
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
            <ModeratedInput
              label={t`Title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t`What's on your mind?`}
              error={errors.title}
              moderation={moderation.fields.title}
              fullWidth
            />

            <ModeratedTextarea
              label={t`Content`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t`Share your thoughts, questions, or ideas...`}
              rows={10}
              error={errors.content}
              moderation={moderation.fields.content}
              fullWidth
            />

            {errorMessage && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}

            <div className="space-y-3">
              <AgreementNotice bundle="publishing" />

              <div className="flex items-center gap-4">
                <Button
                  type="submit"
                  loading={loading || moderation.checking}
                  disabled={moderation.blocked}
                  fullWidth
                >
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
            </div>
          </form>
        </div>
      </div>

      <ContentWarningModal state={moderation.warning} onClose={moderation.dismissWarning} />

      <AgreementGateModal
        gate={gate}
        bundle="publishing"
        open={gateOpen}
        context="forum_post"
        onClose={() => {
          setGateOpen(false)
          resumeAfterGate.current = false
        }}
        onAccepted={async () => {
          setGateOpen(false)
          if (resumeAfterGate.current) {
            resumeAfterGate.current = false
            await createPostNow()
          }
        }}
      />
    </>
  )
}
