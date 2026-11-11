import { ChevronUp, Hand, MessageSquare, UserRound } from 'lucide-react'
import { cn } from '../../lib/utils'
import { VENUE_ROLE_LABELS } from '../../lib/constants'
import { canDirectMessage } from '../../lib/venue-actions'
import { useAuth } from '../../contexts/AuthContext'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { AvailabilityDot } from './AvailabilityDot'
import type { VenueOccupant } from '../../types'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { Trans, useLingui } from '@lingui/react/macro'
import { useLanguage } from '../../i18n/LanguageContext'
import { LANGUAGE_NAMES } from '../../i18n/language'

interface RoomOccupantListProps {
  occupants: VenueOccupant[]
  title?: string
  emptyLabel?: string
  className?: string
  /** Grow to the height given rather than to the hand-tuned cap below. */
  fill?: boolean
  /** Set when the list can fold away (the floorplan overlay); adds the control. */
  onCollapse?: () => void
  /** The room dock's rows: smaller faces, bold names, your own row tinted. */
  dense?: boolean
  /** Who has a hand up, by user id. Each gets a chip beside their name. */
  handsUp?: string[]
}

/**
 * Everyone in a room, with the two actions the venue offers on a person.
 *
 * The "Message" button is conditional on `dm:initiate`. That is not a security
 * control — migration 064 enforces it in the database and cannot be overridden
 * from the matrix — it exists so a student never sees a button that would fail.
 * The predicate is in src/lib/venue-actions.ts with its own test, because this
 * is the kind of check that gets silently dropped when a new panel is added.
 */
export function RoomOccupantList({
  occupants,
  title,
  emptyLabel,
  className,
  fill,
  onCollapse,
  dense,
  handsUp,
}: RoomOccupantListProps) {
  const { t } = useLingui()
  const heading = title ?? t`In this room`
  const empty = emptyLabel ?? t`Nobody here yet.`
  const auth = useAuth()
  const { openMember } = useMemberPanel()
  const { openPanel } = useMessagingPanel()

  const canInitiateDm = auth.can('dm:initiate')
  const { uiLang } = useLanguage()

  return (
    <div
      className={cn(
        'rounded-2xl border border-ktip-sand-100 bg-ktip-cream shadow-card',
        fill && 'flex h-full flex-col',
        className
      )}
    >
      <div data-panel-head className="flex items-center justify-between border-b border-ktip-sand-100 px-4 py-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-ktip-sand-700">
          {heading}
        </h2>
        <span className="flex items-center gap-1">
          <span className="text-xs font-medium text-ktip-sand-500">{occupants.length}</span>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label={t`Collapse the list`}
              className="rounded-lg p-1 text-ktip-sand-500 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-ocean-600"
            >
              <ChevronUp size={14} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>

      {occupants.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ktip-sand-500">{empty}</p>
      ) : (
        <ul
          className={cn(
            'divide-y divide-ktip-sand-100 overflow-y-auto',
            fill ? 'min-h-0 flex-1 max-h-[28rem] lg:max-h-none' : 'max-h-[28rem]'
          )}
        >
          {occupants.map((o) => {
            const name = o.display_name || t`Member`
            const isSelf = o.user_id === auth.user?.id
            const showDm = canDirectMessage({
              canInitiateDm,
              isSelf,
              targetRole: o.role,
              targetIsLive: o.is_live,
            })

            return (
              <li
                key={o.user_id}
                className={cn('flex items-center gap-3 px-4 py-2.5', dense && isSelf && 'bg-ktip-ocean-50')}
              >
                <span className="relative shrink-0">
                  <DiamondAvatar src={o.avatar_url} name={name} size={dense ? 28 : 36} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openMember(o.user_id)}
                      className={cn(
                        'truncate text-sm text-ktip-sand-900 hover:text-ktip-ocean-600 hover:underline',
                        dense ? 'font-bold' : 'font-medium'
                      )}
                    >
                      {name}
                    </button>
                    {isSelf && <span className="text-[10px] text-ktip-sand-400"><Trans>(you)</Trans></span>}
                    {dense && o.lang && (
                      <span
                        title={LANGUAGE_NAMES[o.lang as keyof typeof LANGUAGE_NAMES] ?? o.lang}
                        className={cn(
                          'shrink-0 rounded-sm border px-1 text-[10px] font-extrabold uppercase tracking-[0.04em]',
                          o.lang !== uiLang
                            ? 'border-transparent bg-ktip-ocean-50 text-ktip-ocean-700'
                            : 'border-ktip-sand-200 bg-ktip-sand-50 text-ktip-sand-600'
                        )}
                      >
                        {o.lang}
                      </span>
                    )}
                    {handsUp?.includes(o.user_id) && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ktip-sun-50 px-2 py-0.5 text-micro font-extrabold text-ktip-sun-800">
                        <Hand size={11} aria-hidden="true" />
                        <Trans>Hand up</Trans>
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <AvailabilityDot availability={o.availability} size="sm" withLabel />
                    {o.role !== 'participant' && (
                      <span className="text-[10px] font-medium uppercase tracking-wider text-ktip-ocean-600">
                        {VENUE_ROLE_LABELS[o.role] || o.role}
                      </span>
                    )}
                  </span>
                  {dense && !isSelf && o.lang && o.lang !== uiLang && LANGUAGE_NAMES[o.lang as keyof typeof LANGUAGE_NAMES] && (
                    <span className="block truncate text-xs text-ktip-sand-500">
                      <Trans>Reads you in {LANGUAGE_NAMES[o.lang as keyof typeof LANGUAGE_NAMES]}</Trans>
                    </span>
                  )}
                  {o.status_note && (
                    <span className="block truncate text-xs italic text-ktip-sand-500">
                      “{o.status_note}”
                    </span>
                  )}
                </span>

                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openMember(o.user_id)}
                    aria-label={t`View ${name}'s profile`}
                    title={t`View profile`}
                    className="rounded-lg p-1.5 text-ktip-sand-500 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-ocean-600"
                  >
                    <UserRound size={16} aria-hidden="true" />
                  </button>
                  {showDm && (
                    <button
                      type="button"
                      onClick={() => openPanel({ userId: o.user_id })}
                      aria-label={t`Message ${name}`}
                      title={t`Message`}
                      className="rounded-lg p-1.5 text-ktip-sand-500 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-ocean-600"
                    >
                      <MessageSquare size={16} aria-hidden="true" />
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
