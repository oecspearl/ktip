import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, Pencil, Plus, Smile, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { ROOM_REACTIONS } from '../../../hooks/useRoomSignals'
import { useMyReactions } from '../../../hooks/useMyReactions'
import { reactionArt } from '../../../lib/reaction-emoji'
import { MAX_OWN_REACTIONS, isReactionEmoji } from '../../../lib/own-reactions'
import { EmojiPanel } from '../../ui/EmojiPicker'

/**
 * One reaction button. Pressed, it fans upward the way the site's quick-actions
 * button does: the room's six reactions, then up to three the member picked
 * for themselves, then a + to choose those. It stays open after a reaction, so
 * clapping twice is two taps, not four.
 */
export function ReactionFan({
  onReact,
  buttonClassName,
}: {
  onReact: (emoji: string) => void
  buttonClassName?: string
}) {
  const { t, i18n } = useLingui()
  const { mine, add, remove, full } = useMyReactions()
  const [open, setOpen] = useState<null | 'fan' | 'pick'>(null)
  const [refused, setRefused] = useState(false)
  // Named so the catalog reads "{count} of {max}", not "{0} of {1}".
  const count = mine.length
  const max = MAX_OWN_REACTIONS
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(null)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(null)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  let index = 0
  const stagger = (): CSSProperties => ({ animationDelay: `${index++ * 32}ms` })

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-expanded={open !== null}
        aria-haspopup="menu"
        aria-label={open ? t`Close reactions` : t`React`}
        onClick={() => {
          setRefused(false)
          setOpen((current) => (current ? null : 'fan'))
        }}
        className={cn(buttonClassName, open && 'border-ktip-cream bg-ktip-cream text-ktip-sand-900 hover:bg-ktip-cream')}
      >
        {open ? <X size={18} aria-hidden="true" /> : <Smile size={18} aria-hidden="true" />}
      </button>

      {open === 'fan' && (
        <div
          role="menu"
          aria-label={t`Reactions`}
          className="absolute bottom-full left-1/2 z-dropdown mb-2 flex -translate-x-1/2 flex-col-reverse items-center gap-1.5"
        >
          {ROOM_REACTIONS.map((emoji) => {
            const art = reactionArt(emoji)
            const label = art ? i18n._(art.label) : emoji
            return (
              <FanButton key={emoji} label={label} style={stagger()} onClick={() => onReact(emoji)}>
                {art ? <img src={art.src} alt="" width={24} height={24} className="h-6 w-6" draggable={false} /> : emoji}
              </FanButton>
            )
          })}
          {mine.length > 0 && (
            <span aria-hidden="true" style={stagger()} className="my-0.5 h-0.5 w-4 animate-fan-pop rounded-full bg-white/50" />
          )}
          {mine.map((emoji) => (
            <FanButton key={emoji} label={t`One of yours`} style={stagger()} mine onClick={() => onReact(emoji)}>
              <span className="text-xl leading-none">{emoji}</span>
            </FanButton>
          ))}
          <FanButton
            label={full ? t`Change your reactions` : t`Add your own · ${count} of ${max}`}
            style={stagger()}
            dashed
            onClick={() => setOpen('pick')}
          >
            {full ? <Pencil size={15} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          </FanButton>
        </div>
      )}

      {open === 'pick' && (
        <div
          role="dialog"
          aria-label={t`Your reactions`}
          className="absolute bottom-full left-1/2 z-dropdown mb-2 flex w-[19rem] -translate-x-1/2 flex-col gap-3 rounded-surface border border-ktip-sand-200 bg-ktip-cream p-3 text-ktip-sand-900 shadow-card animate-scale-in max-sm:fixed max-sm:inset-x-4 max-sm:bottom-24 max-sm:w-auto max-sm:translate-x-0"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen('fan')}
              aria-label={t`Back to reactions`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-ktip-sand-200 text-ktip-sand-700 hover:bg-ktip-sand-100"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="text-label font-bold">
              <Trans>Your reactions</Trans>
            </span>
            <span className="ml-auto text-micro font-semibold text-ktip-sand-500">
              {t`${count} of ${max}`}
            </span>
          </div>

          <div className="flex gap-2">
            {Array.from({ length: MAX_OWN_REACTIONS }, (_, slot) => {
              const emoji = mine[slot]
              return emoji ? (
                <span
                  key={emoji}
                  className="relative grid h-12 w-12 place-items-center rounded-control border-2 border-ktip-tropical-500 bg-ktip-sand-50 text-2xl"
                >
                  {emoji}
                  <button
                    type="button"
                    onClick={() => remove(emoji)}
                    aria-label={t`Remove ${emoji}`}
                    className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-ktip-sand-900 text-ktip-cream"
                  >
                    <X size={11} aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <span
                  key={`empty-${slot}`}
                  className="grid h-12 w-12 place-items-center rounded-control border border-dashed border-ktip-sand-300 text-micro text-ktip-sand-400"
                >
                  <Trans>Empty</Trans>
                </span>
              )
            })}
          </div>

          {full ? (
            <p className="text-caption text-ktip-sand-600">
              <Trans>Remove one to pick another.</Trans>
            </p>
          ) : (
            <EmojiPanel
              align="left"
              onPick={(emoji) => {
                const usable = isReactionEmoji(emoji) && !(ROOM_REACTIONS as readonly string[]).includes(emoji)
                setRefused(!usable)
                if (usable) add(emoji)
              }}
              className="static mb-0 w-full rounded-control border-ktip-sand-100 shadow-none animate-none"
            />
          )}
          {refused && (
            <p className="text-micro text-ktip-sun-700">
              <Trans>That one is already in the standard set, or cannot be a reaction. Pick another.</Trans>
            </p>
          )}
          <p className="text-micro text-ktip-sand-500">
            <Trans>Saved to your profile, so they follow you into every call.</Trans>
          </p>
        </div>
      )}
    </div>
  )
}

function FanButton({
  children,
  label,
  style,
  mine,
  dashed,
  onClick,
}: {
  children: ReactNode
  label: string
  style: CSSProperties
  mine?: boolean
  dashed?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={label}
      onClick={onClick}
      style={style}
      className={cn(
        'group relative grid h-10 w-10 animate-fan-pop place-items-center rounded-full border bg-ktip-cream text-ktip-sand-700 shadow-card transition-transform duration-150 hover:scale-110 active:scale-95',
        mine ? 'border-2 border-ktip-tropical-500' : 'border-ktip-sand-200',
        dashed && 'border-dashed border-ktip-sand-400'
      )}
    >
      {children}
      <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-control bg-ktip-ink px-2 py-1 text-micro font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    </button>
  )
}
