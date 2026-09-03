import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { ModeratedInput, ModeratedTextarea } from '../../components/moderation/ModeratedField'
import { ContentWarningModal } from '../../components/moderation/ContentWarningModal'
import { DeleteEntityControl } from '../../components/shared/DeleteEntityControl'
import { useContentModeration } from '../../hooks/useContentModeration'
import {
  useForumBoard,
  useForumBoardPostCount,
  useCreateForumBoard,
  useUpdateForumBoard,
  useDeleteForumBoard,
} from '../../hooks/useForums'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { forumBoardSchema } from '../../lib/validation'
import { describeForumBoardDeletion } from '../../lib/delete-guard'
import { BOARD_ICONS } from '../../lib/forum-board-icons'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PageHero } from '../../components/layout/PageHero'
import { useAgreementGate } from '../../hooks/useAgreementGate'
import { AgreementGateModal, AgreementNotice } from '../../components/legal/AgreementGate'
import { cn } from '../../lib/utils'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * Open a discussion board, or edit one you opened (migration 129).
 *
 * One page for both, mounted at /forums/new and /forums/:slug/edit, because the
 * two forms are the same three fields and a board has no draft state to make
 * them diverge. The route guard checks `forum:board`; who may edit *this* board
 * is checked below and again by RLS, which is the real boundary.
 */
export default function BoardFormPage() {
  const { t, i18n } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const toast = useToast()

  const isEditing = !!params.slug
  usePageTitle(isEditing ? t`Edit Board` : t`New Board`)

  const { board, loading: boardLoading } = useForumBoard(params.slug)
  const { postCount } = useForumBoardPostCount(isEditing ? board?.id : undefined)

  const { createBoard, loading: creating } = useCreateForumBoard()
  const { updateBoard, loading: updating } = useUpdateForumBoard()
  const { deleteBoard } = useDeleteForumBoard()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('MessageSquare')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')

  const gate = useAgreementGate('publishing')
  const [gateOpen, setGateOpen] = useState(false)
  const resumeAfterGate = useRef(false)

  // Populated once the board arrives; keyed on the id so a slug change or a
  // navigation between two boards refills rather than keeping the old values.
  useEffect(() => {
    if (!board) return
    setName(board.name)
    setDescription(board.description || '')
    setIcon(board.icon || 'MessageSquare')
  }, [board?.id])

  const moderation = useContentModeration(
    [
      { name: 'name', value: name, label: t`Board name` },
      { name: 'description', value: description, label: t`Description` },
    ],
    {
      surface: 'forum_board',
      onChange: (field, next) => (field === 'name' ? setName(next) : setDescription(next)),
    }
  )

  // Mirrors migration 129's UPDATE policy: the creator keeps their own board,
  // forum:manage covers everyone else's — including the six boards seeded by
  // 005, which have no creator at all.
  const ownsBoard = !!board && !!auth.user && board.created_by === auth.user.id
  const canEditThisBoard = ownsBoard ? auth.can('forum:board') : auth.can('forum:manage')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    const result = forumBoardSchema.safeParse({ name, description })
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    const moderationResult = await moderation.checkBeforeSubmit()
    if (!moderationResult.ok) {
      setErrors((prev) => ({ ...prev, ...moderationResult.errors }))
      return
    }

    if (gate.needsAgreement) {
      resumeAfterGate.current = true
      setGateOpen(true)
      return
    }

    await saveNow()
  }

  const saveNow = async () => {
    try {
      if (isEditing) {
        if (!board) return
        await updateBoard(board.id, {
          name,
          description: description || null,
          icon,
        })
        toast.success(t`Board updated`)
        navigate(`/forums/${board.slug}`)
        return
      }

      // The slug comes back from the database, not from here — 129 assigns it
      // with the same unique_slug() every other listing uses.
      const created = await createBoard({ name, description: description || null, icon })
      toast.success(t`Board created`)
      navigate(`/forums/${created.slug}`)
    } catch (err: any) {
      setErrorMessage(err.message || t`Failed to save this board`)
    }
  }

  if (isEditing && boardLoading) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
      </div>
    )
  }

  if (isEditing && !board) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <p className="text-ktip-sand-600"><Trans>Board not found.</Trans></p>
      </div>
    )
  }

  if (isEditing && !canEditThisBoard) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          <Trans>Not your board</Trans>
        </h2>
        <p className="text-gray-500 mb-6">
          <Trans>Only the person who opened this board, or a forum administrator, can edit it.</Trans>
        </p>
        <Button onClick={() => navigate(`/forums/${params.slug}`)}>
          <Trans>Back to the board</Trans>
        </Button>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow={isEditing ? t`Edit Discussion Board` : t`New Discussion Board`}
        title={isEditing ? t`Edit Board` : t`Start a Board`}
        subtitle={
          isEditing
            ? t`Rename this board, change what it is for, or retire it.`
            : t`A board is a place for discussions to gather — name it for the subject, not for a single question.`
        }
        imageSeed="forums"
        breadcrumb={
          isEditing && board
            ? [
                { label: t`Home`, href: '/' },
                { label: t`Forums`, href: '/forums' },
                { label: board.name, href: `/forums/${board.slug}` },
                { label: t`Edit` },
              ]
            : [
                { label: t`Home`, href: '/' },
                { label: t`Forums`, href: '/forums' },
                { label: t`New Board` },
              ]
        }
      />

      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-page-tight mx-auto px-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            <ModeratedInput
              label={t`Board name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t`Climate Innovation`}
              error={errors.name}
              moderation={moderation.fields.name}
              fullWidth
            />

            <ModeratedTextarea
              label={t`Description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t`What belongs on this board, and who it is for.`}
              rows={4}
              error={errors.description}
              moderation={moderation.fields.description}
              fullWidth
            />

            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                <Trans>Icon</Trans>
              </label>
              <div className="flex flex-wrap gap-2">
                {BOARD_ICONS.map((entry) => {
                  const Icon = entry.icon
                  const selected = icon === entry.value
                  return (
                    <button
                      key={entry.value}
                      type="button"
                      onClick={() => setIcon(entry.value)}
                      aria-pressed={selected}
                      title={i18n._(entry.label)}
                      className={cn(
                        'w-12 h-12 rounded-xl border flex items-center justify-center transition-colors',
                        selected
                          ? 'border-ktip-ocean-500 bg-ktip-ocean-100 text-ktip-ocean-600'
                          : 'border-ktip-sand-200 bg-ktip-cream text-ktip-sand-500 hover:border-ktip-sand-300'
                      )}
                    >
                      <Icon size={20} />
                    </button>
                  )
                })}
              </div>
            </div>

            {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

            <div className="space-y-3">
              <AgreementNotice bundle="publishing" />

              <div className="flex items-center gap-4">
                <Button
                  type="submit"
                  loading={creating || updating || moderation.checking}
                  disabled={moderation.blocked}
                  fullWidth
                >
                  {isEditing ? <Trans>Save Board</Trans> : <Trans>Create Board</Trans>}
                </Button>
                <button
                  type="button"
                  onClick={() => navigate(isEditing && board ? `/forums/${board.slug}` : '/forums')}
                  className="text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors whitespace-nowrap"
                >
                  <Trans>Cancel</Trans>
                </button>
              </div>
            </div>
          </form>

          {isEditing && board && (
            <div className="mt-10">
              <DeleteEntityControl
                noun={t`board`}
                title={board.name}
                impact={describeForumBoardDeletion({ postCount })}
                onDelete={() => deleteBoard(board.id)}
                redirectTo="/forums"
                variant="zone"
                zoneDescription={t`Deleting a board takes every discussion on it, and every reply, with it. There is no undo.`}
              />
            </div>
          )}
        </div>
      </div>

      <ContentWarningModal state={moderation.warning} onClose={moderation.dismissWarning} />

      <AgreementGateModal
        gate={gate}
        bundle="publishing"
        open={gateOpen}
        // The consent contexts are a fixed vocabulary (115); opening a board is
        // publishing on the forum, so it is recorded under the forum context
        // rather than adding a value the database would refuse.
        context="forum_post"
        onClose={() => {
          setGateOpen(false)
          resumeAfterGate.current = false
        }}
        onAccepted={async () => {
          setGateOpen(false)
          if (resumeAfterGate.current) {
            resumeAfterGate.current = false
            await saveNow()
          }
        }}
      />
    </>
  )
}
