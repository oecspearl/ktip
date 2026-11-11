import { useState } from 'react'
import { Check, ChevronUp, Send, Trash2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { useContentLanguage } from '../../../i18n/useContentLanguage'
import { useTranslatedContent } from '../../../hooks/useTranslatedContent'
import { useRoomQuestions, type RoomQuestion } from '../../../hooks/useRoomQuestions'
import { RoomPanel, RoomPanelEmpty, panelShell } from './RoomPanel'
import type { VenueRoom } from '../../../types'

/**
 * Questions for the speaker (migration 210): ask one, upvote the ones you want
 * answered, and a host marks them answered. Its own dock tab in a hall or on a
 * stage, so questions stop scrolling away in chat.
 */
export function RoomQuestionsPanel({
  room,
  canPost,
  isHost,
  fill,
}: {
  room: VenueRoom
  /** Spectators and closed rooms read only. */
  canPost: boolean
  isHost: boolean
  fill?: boolean
}) {
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const { lang } = useContentLanguage()
  const { questions, loading, available, ask, vote, setAnswered, remove } = useRoomQuestions(room.id, auth.user?.id)
  const [draft, setDraft] = useState('')

  const fail = (err: any) => toast.error(err?.message || t`Could not save that`)

  const submit = () => {
    const body = draft.trim()
    if (body.length < 3) return
    setDraft('')
    ask.mutate(
      { body, lang },
      {
        onError: (err) => {
          setDraft(body)
          fail(err)
        },
      }
    )
  }

  return (
    <RoomPanel title={t`Q&A`} meta={questions.length || undefined} className={cn('flex flex-col', panelShell(fill))}>
      {!available ? (
        <RoomPanelEmpty>
          <Trans>Q&A is not switched on for this venue yet.</Trans>
        </RoomPanelEmpty>
      ) : loading ? (
        <div className="space-y-2 p-4">
          <div className="h-10 rounded-control bg-ktip-sand-100 animate-pulse-soft" />
          <div className="h-10 w-3/4 rounded-control bg-ktip-sand-100 animate-pulse-soft" />
        </div>
      ) : questions.length === 0 ? (
        <RoomPanelEmpty>
          <Trans>No questions yet. Ask the first one.</Trans>
        </RoomPanelEmpty>
      ) : (
        <ul className={cn('divide-y divide-ktip-sand-100 overflow-y-auto', fill ? 'min-h-0 flex-1' : 'max-h-[24rem]')}>
          {questions.map((q) => (
            <QuestionRow
              key={q.id}
              question={q}
              canVote={canPost}
              canRemove={isHost || q.author_id === auth.user?.id}
              isHost={isHost}
              onVote={() => vote.mutate({ id: q.id, on: !q.mine }, { onError: fail })}
              onAnswered={() => setAnswered.mutate({ id: q.id, answered: !q.answered_at }, { onError: fail })}
              onRemove={() => remove.mutate(q.id, { onError: fail })}
            />
          ))}
        </ul>
      )}

      {available && canPost && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className={cn('flex items-center gap-2 border-t border-ktip-sand-100 px-3 py-2.5', fill && 'mt-auto')}
        >
          <label htmlFor={`room-qa-${room.id}`} className="sr-only">
            <Trans>Your question</Trans>
          </label>
          <input
            id={`room-qa-${room.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t`Ask the speaker`}
            maxLength={300}
            // 16px on touch: iOS zooms the page into any smaller field on focus.
            className="min-w-0 flex-1 rounded-lg border border-ktip-sand-200 bg-ktip-cream px-3 py-2 text-sm pointer-coarse:text-body text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-400 focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-200"
          />
          <button
            type="submit"
            disabled={ask.isPending || draft.trim().length < 3}
            aria-label={t`Send`}
            className="shrink-0 rounded-lg bg-brand-navy p-2 text-white transition-colors hover:bg-brand-green hover:text-brand-navy disabled:opacity-50 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-navy dark:hover:text-brand-green"
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
      )}
    </RoomPanel>
  )
}

function QuestionRow({
  question,
  canVote,
  canRemove,
  isHost,
  onVote,
  onAnswered,
  onRemove,
}: {
  question: RoomQuestion
  canVote: boolean
  canRemove: boolean
  isHost: boolean
  onVote: () => void
  onAnswered: () => void
  onRemove: () => void
}) {
  const { t } = useLingui()
  // Read in the reader's language, like chat.
  const { text } = useTranslatedContent(question.body, question.lang, {
    meter: { surface: 'chat', roomId: question.room_id },
  })
  const name = question.author?.display_name || t`Member`
  const answered = !!question.answered_at
  const votes = question.votes

  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <button
        type="button"
        onClick={onVote}
        disabled={!canVote}
        aria-pressed={question.mine}
        aria-label={question.mine ? t`Remove your upvote, ${votes} so far` : t`Upvote, ${votes} so far`}
        className={cn(
          'flex h-11 w-10 shrink-0 flex-col items-center justify-center rounded-control border text-micro font-bold tabular-nums transition-colors disabled:opacity-60',
          question.mine
            ? 'border-ktip-tropical-600 bg-ktip-tropical-50 text-ktip-tropical-700'
            : 'border-ktip-sand-200 text-ktip-sand-700 hover:border-ktip-ocean-400'
        )}
      >
        <ChevronUp size={13} aria-hidden="true" />
        {votes}
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn('break-words text-sm font-bold', answered ? 'text-ktip-sand-600' : 'text-ktip-sand-900')}>{text}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ktip-sand-500">
          <span className="min-w-0 truncate">{name}</span>
          {answered && (
            <span className="inline-flex rounded-full bg-ktip-tropical-50 px-2 py-0.5 text-micro font-extrabold text-ktip-tropical-700">
              <Trans>Answered</Trans>
            </span>
          )}
        </p>
      </div>

      {(isHost || canRemove) && (
        <span className="flex shrink-0 items-center gap-0.5">
          {isHost && (
            <button
              type="button"
              onClick={onAnswered}
              aria-pressed={answered}
              aria-label={answered ? t`Mark as not answered` : t`Mark as answered`}
              title={answered ? t`Mark as not answered` : t`Mark as answered`}
              className="icon-hit rounded-lg p-1.5 text-ktip-sand-500 hover:bg-ktip-sand-100 hover:text-ktip-tropical-700 aria-pressed:text-ktip-tropical-700"
            >
              <Check size={15} aria-hidden="true" />
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={t`Remove question`}
              title={t`Remove`}
              className="icon-hit rounded-lg p-1.5 text-ktip-sand-400 hover:bg-ktip-sand-100 hover:text-red-600"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </span>
      )}
    </li>
  )
}
