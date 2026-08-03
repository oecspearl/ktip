import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Smile } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  EMOJI_GROUPS,
  pushRecentEmoji,
  readRecentEmoji,
  searchEmoji,
  type EmojiEntry,
} from '../../lib/emoji-catalog'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * The emoji button that sits in a message box.
 *
 * Self-contained on purpose: a composer should be able to grow one of these by
 * adding a button and a callback, not by learning about popovers, recents or
 * caret positions. `insertAtCaret` below is the other half — it puts the
 * character where the cursor actually is rather than on the end of the line,
 * which is the difference between this and a novelty.
 *
 * The glyphs are the reader's own emoji font, not shipped artwork, and that is
 * deliberate — see the note at the top of src/lib/emoji-catalog.ts.
 */
export function EmojiPickerButton({
  onPick,
  className,
  align = 'left',
  label = 'Add an emoji',
}: {
  onPick: (emoji: string) => void
  className?: string
  /** Which edge of the button the panel lines up with. */
  align?: 'left' | 'right'
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on an outside click or Escape. Both, because a popover that only
  // answers one of them is the kind that gets left open behind a modal.
  useEffect(() => {
    if (!open) return

    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
        className={cn(
          'rounded-lg p-2 text-ktip-sand-500 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-ocean-600',
          open && 'bg-ktip-sand-100 text-ktip-ocean-600'
        )}
      >
        <Smile size={18} aria-hidden="true" />
      </button>

      {open && (
        <EmojiPanel
          align={align}
          onPick={(emoji) => {
            pushRecentEmoji(emoji)
            onPick(emoji)
            // Stays open: picking two in a row is normal, and re-opening the
            // panel for the second one is the thing that makes a picker
            // annoying. Escape, an outside click or the send button close it.
          }}
        />
      )}
    </div>
  )
}

function EmojiPanel({
  onPick,
  align,
}: {
  onPick: (emoji: string) => void
  align: 'left' | 'right'
}) {
  const { t, i18n } = useLingui()
  const [query, setQuery] = useState('')
  const [groupId, setGroupId] = useState(EMOJI_GROUPS[0].id)
  const [recent, setRecent] = useState<string[]>(() => readRecentEmoji())

  const results = useMemo(() => searchEmoji(query), [query])
  const group = EMOJI_GROUPS.find((g) => g.id === groupId) ?? EMOJI_GROUPS[0]
  // Named, not inline: Lingui names an interpolated expression it cannot read
  // `{0}`, and "Nothing matches {0}" is not something a translator can place.
  const term = query.trim()
  const searching = term.length > 0

  const pick = (emoji: string) => {
    onPick(emoji)
    setRecent(readRecentEmoji())
  }

  return (
    <div
      role="dialog"
      aria-label={t`Emoji`}
      className={cn(
        'absolute bottom-full z-dropdown mb-2 w-[19rem] overflow-hidden rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-hard animate-scale-in',
        align === 'right' ? 'right-0' : 'left-0'
      )}
    >
      <div className="border-b border-ktip-sand-100 p-2">
        <label className="relative block">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ktip-sand-400"
            aria-hidden="true"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t`Search emoji`}
            aria-label={t`Search emoji`}
            className="w-full rounded-lg border border-ktip-sand-200 bg-ktip-cream py-1.5 pl-8 pr-2 text-sm focus:border-ktip-ocean-400 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-200"
          />
        </label>
      </div>

      {!searching && recent.length > 0 && (
        <div className="border-b border-ktip-sand-100 px-2 py-1.5">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ktip-sand-400">
            <Trans>Recent</Trans>
          </p>
          <Grid emoji={recent.map((e) => ({ e, k: '' }))} onPick={pick} />
        </div>
      )}

      <div className="max-h-[13.5rem] overflow-y-auto p-2">
        {searching ? (
          results.length ? (
            <Grid emoji={results} onPick={pick} />
          ) : (
            <p className="px-1 py-6 text-center text-xs text-ktip-sand-500">
              <Trans>Nothing matches “{term}”.</Trans>
            </p>
          )
        ) : (
          <Grid emoji={group.emoji} onPick={pick} />
        )}
      </div>

      {!searching && (
        <div className="flex items-center gap-0.5 border-t border-ktip-sand-100 px-1.5 py-1">
          {EMOJI_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroupId(g.id)}
              aria-label={i18n._(g.label)}
              aria-pressed={g.id === group.id}
              title={i18n._(g.label)}
              className={cn(
                'emoji-font flex-1 rounded-lg py-1.5 text-base leading-none transition-colors hover:bg-ktip-sand-100',
                g.id === group.id && 'bg-ktip-sand-100'
              )}
            >
              {g.tab}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Grid({ emoji, onPick }: { emoji: EmojiEntry[]; onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emoji.map((entry, i) => (
        <button
          key={`${entry.e}-${i}`}
          type="button"
          onClick={() => onPick(entry.e)}
          aria-label={entry.k.split(' ')[0] || entry.e}
          className="emoji-font rounded-lg py-1 text-xl leading-none transition-transform duration-100 hover:scale-125 hover:bg-ktip-sand-100 focus-visible:scale-125 focus-visible:bg-ktip-sand-100 focus-visible:outline-none"
        >
          {entry.e}
        </button>
      ))}
    </div>
  )
}

/**
 * Put text where the cursor is, and leave the cursor after it.
 *
 * Appending to the end is the classic wrong version of this: somebody who moved
 * the caret back to fix a typo gets their emoji at the end of a sentence they
 * were not editing. Returns the new value; the caller owns the state.
 */
export function insertAtCaret(
  field: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
  insert: string
): string {
  if (!field) return value + insert

  const start = field.selectionStart ?? value.length
  const end = field.selectionEnd ?? start
  const next = value.slice(0, start) + insert + value.slice(end)
  const caret = start + insert.length

  // After React has written the new value back, or the browser restores the
  // old caret and the next character lands in front of the emoji.
  window.requestAnimationFrame(() => {
    field.focus()
    field.setSelectionRange(caret, caret)
  })

  return next
}
