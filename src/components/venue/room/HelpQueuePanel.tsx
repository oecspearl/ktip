import { useState } from 'react'
import { Hand, LifeBuoy } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { useContentLanguage } from '../../../i18n/useContentLanguage'
import { useTranslatedContent } from '../../../hooks/useTranslatedContent'
import { useHelpQueue, type HelpRequest } from '../../../hooks/useHelpQueue'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import { Button } from '../../ui/Button'
import type { VenueOccupant, VenueRole, VenueRoom } from '../../../types'

/** A rough wait per person ahead. Honest enough for "about six minutes". */
const MINUTES_EACH = 3

/**
 * The Help Desk's line (migration 211).
 *
 * Your place is the first thing you see, with what you asked and a way out.
 * Beside it, everyone in line and who is being helped. Mentors and organisers
 * get the button that picks a request up, and the one that closes it.
 */
export function HelpQueuePanel({
  room,
  viewerRole,
  isHost,
  canPost,
  occupants,
}: {
  room: VenueRoom
  viewerRole: VenueRole
  isHost: boolean
  /** Spectators and closed rooms read only. */
  canPost: boolean
  /** Everyone in the venue, for the count of mentors on duty. */
  occupants: VenueOccupant[]
}) {
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const { lang } = useContentLanguage()
  const { requests, loading, available, ask, withdraw, pick, close } = useHelpQueue(room.id)
  const [body, setBody] = useState('')
  const [tagText, setTagText] = useState('')

  const fail = (err: any) => toast.error(err?.message || t`Could not save that`)
  const canHelp = isHost || viewerRole === 'mentor' || viewerRole === 'organizer'
  const me = auth.user?.id
  const mine = requests.find((r) => r.user_id === me) ?? null
  const waiting = requests.filter((r) => r.status === 'waiting')
  const myPlace = mine ? requests.findIndex((r) => r.id === mine.id) + 1 : 0
  const ahead = mine ? waiting.filter((r) => r.created_at < mine.created_at).length : 0
  const mentorsOn = occupants.filter((o) => o.role === 'mentor' && o.availability !== 'offline').length
  // Named for the catalog: "{waitingCount} waiting", not "{0} waiting".
  const waitingCount = waiting.length
  const minutes = Math.max(1, ahead * MINUTES_EACH)
  const helperName = mine?.mentor?.display_name || t`A mentor`

  const submit = () => {
    const text = body.trim()
    if (text.length < 3) return
    const tags = tagText
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 4)
    ask.mutate(
      { body: text, tags, lang },
      {
        onSuccess: () => {
          setBody('')
          setTagText('')
        },
        onError: fail,
      }
    )
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-surface border border-ktip-sand-100 bg-ktip-cream shadow-card" aria-label={t`Help line`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ktip-sand-100 px-4 py-3">
        <LifeBuoy size={20} className="shrink-0 text-ktip-sun-700" aria-hidden="true" />
        <h2 className="text-sm font-extrabold text-ktip-sand-900">
          <Trans>Your place in line</Trans>
        </h2>
        {available && (
          <span className="text-xs text-ktip-sand-500">
            <Trans>{waitingCount} waiting</Trans> · <Trans>{mentorsOn} mentors on duty</Trans>
          </span>
        )}
      </header>

      {!available ? (
        <p className="px-4 py-6 text-sm text-ktip-sand-500">
          <Trans>The help line is not switched on for this venue yet.</Trans>
        </p>
      ) : loading ? (
        <div className="space-y-2 p-4">
          <div className="h-16 rounded-control bg-ktip-sand-100 animate-pulse-soft" />
          <div className="h-10 w-3/4 rounded-control bg-ktip-sand-100 animate-pulse-soft" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
          {/* ---- me ---- */}
          {mine ? (
            <div className="flex min-w-0 flex-col gap-3 rounded-surface bg-ktip-sun-50 p-4">
              <span className="text-micro font-extrabold uppercase tracking-[0.08em] text-ktip-sun-800">
                {mine.status === 'helping' ? <Trans>You are being helped</Trans> : <Trans>You are</Trans>}
              </span>
              {mine.status === 'waiting' && (
                <span className="font-display text-5xl font-bold leading-none text-ktip-sand-900">
                  {ahead === 0 ? <Trans>Next</Trans> : <Trans>No. {myPlace}</Trans>}
                </span>
              )}
              <p className="text-sm text-ktip-sand-700">
                {mine.status === 'helping' ? (
                  <Trans>{helperName} is with you. Talk in the call above.</Trans>
                ) : ahead === 0 ? (
                  <Trans>A mentor will join you here in the call.</Trans>
                ) : (
                  <Trans>About {minutes} minutes. A mentor will join you here in the call.</Trans>
                )}
              </p>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-xs font-bold text-ktip-sand-700">
                  <Trans>What you asked</Trans>
                </span>
                <p className="break-words rounded-control bg-ktip-cream px-3 py-2.5 text-sm text-ktip-sand-800">{mine.body}</p>
              </div>
              {mine.tags.length > 0 && <Tags tags={mine.tags} />}
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                loading={withdraw.isPending}
                onClick={() => withdraw.mutate(mine.id, { onError: fail })}
              >
                <Trans>Withdraw my request</Trans>
              </Button>
            </div>
          ) : canPost ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
              className="flex min-w-0 flex-col gap-3 rounded-surface bg-ktip-sun-50 p-4"
            >
              <label htmlFor={`help-body-${room.id}`} className="text-sm font-bold text-ktip-sand-900">
                <Trans>What do you need help with?</Trans>
              </label>
              <textarea
                id={`help-body-${room.id}`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder={t`If something fails, paste the first error line.`}
                className="w-full rounded-control border border-ktip-sand-200 bg-ktip-cream px-3 py-2 text-sm pointer-coarse:text-body text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-400 focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-200"
              />
              <label htmlFor={`help-tags-${room.id}`} className="text-xs font-bold text-ktip-sand-700">
                <Trans>Topics, separated by commas (optional)</Trans>
              </label>
              <input
                id={`help-tags-${room.id}`}
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                maxLength={100}
                placeholder={t`API, JavaScript`}
                className="w-full rounded-control border border-ktip-sand-200 bg-ktip-cream px-3 py-2 text-sm pointer-coarse:text-body text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-400 focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-200"
              />
              <Button
                type="submit"
                className="self-start"
                loading={ask.isPending}
                disabled={body.trim().length < 3}
                icon={<Hand size={15} aria-hidden="true" />}
              >
                <Trans>Ask for help</Trans>
              </Button>
            </form>
          ) : (
            <p className="rounded-surface bg-ktip-sand-50 p-4 text-sm text-ktip-sand-600">
              <Trans>You are watching this room. Spectators can see the line but not join it.</Trans>
            </p>
          )}

          {/* ---- the line ---- */}
          <div className="min-w-0">
            <span className="text-micro font-extrabold uppercase tracking-[0.08em] text-ktip-sand-500">
              <Trans>In line</Trans>
            </span>
            {requests.length === 0 ? (
              <p className="py-4 text-sm text-ktip-sand-500">
                <Trans>Nobody is waiting.</Trans>
              </p>
            ) : (
              <ol className="mt-1.5 divide-y divide-ktip-sand-100">
                {requests.map((r, i) => (
                  <QueueRow
                    key={r.id}
                    request={r}
                    index={i + 1}
                    isMe={r.user_id === me}
                    canPick={canHelp && r.status === 'waiting' && r.user_id !== me}
                    canClose={r.status === 'helping' && (r.mentor_id === me || isHost)}
                    onPick={() => pick.mutate(r.id, { onError: fail })}
                    onClose={() => close.mutate(r.id, { onError: fail })}
                  />
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-ktip-sand-200 bg-ktip-cream px-2 py-0.5 text-micro font-extrabold text-ktip-sand-700"
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

function QueueRow({
  request,
  index,
  isMe,
  canPick,
  canClose,
  onPick,
  onClose,
}: {
  request: HelpRequest
  index: number
  isMe: boolean
  canPick: boolean
  canClose: boolean
  onPick: () => void
  onClose: () => void
}) {
  const { t } = useLingui()
  // A mentor reads the request in their own language, like chat.
  const { text } = useTranslatedContent(request.body, request.lang, {
    meter: { surface: 'chat', roomId: request.room_id },
  })
  const name = isMe ? t`You` : request.asker?.display_name || t`Member`
  const mentorName = request.mentor?.display_name || t`a mentor`

  return (
    <li className={cn('flex items-center gap-3 px-2 py-2.5', isMe && 'rounded-control bg-ktip-ocean-50')}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ktip-sand-100 text-xs font-extrabold tabular-nums text-ktip-sand-700">
        {index}
      </span>
      <DiamondAvatar src={request.asker?.avatar_url} name={name} size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ktip-sand-900">{name}</p>
        <p className="break-words text-xs text-ktip-sand-500">{text}</p>
      </div>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-micro font-extrabold',
            request.status === 'helping'
              ? 'bg-ktip-sun-50 text-ktip-sun-800'
              : 'border border-ktip-sand-200 bg-ktip-sand-50 text-ktip-sand-700'
          )}
        >
          {request.status === 'helping' ? <Trans>With {mentorName}</Trans> : <Trans>Waiting</Trans>}
        </span>
        {canPick && (
          <Button size="sm" onClick={onPick}>
            <Trans>Help</Trans>
          </Button>
        )}
        {canClose && (
          <Button size="sm" variant="secondary" onClick={onClose}>
            <Trans>Done</Trans>
          </Button>
        )}
      </span>
    </li>
  )
}
